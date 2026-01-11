/**
 * schemaCanvas.ts
 * VueFlow 기반 스키마 캔버스 상태 관리
 * 
 * 데이터 소스:
 * - 'robo': robo-analyzer Neo4j (DDL 분석 결과)
 * - 'text2sql': neo4j-text2sql (PostgreSQL 인제스천)
 */

import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { MarkerType } from '@vue-flow/core'
import type { Edge, Node } from '@vue-flow/core'
import { text2sqlApi, roboSchemaApi } from '@/services/api'
import type { Text2SqlTableInfo, Text2SqlColumnInfo } from '@/types'
import { useSessionStore } from './session'
import { useProjectStore } from './project'
import ELK from 'elkjs/lib/elk.bundled.js'

export type SchemaDataSource = 'robo' | 'text2sql'

export interface TableNodeData {
  tableName: string
  schema: string
  description?: string
  columns: Text2SqlColumnInfo[]
  columnCount: number
  isPrimary?: boolean  // 직접 선택/드래그한 테이블인지 여부
}

export interface RelationshipData {
  from_table: string
  from_schema: string
  from_column: string
  to_table: string
  to_schema: string
  to_column: string
  description?: string
  relationship_type: string
}

export const useSchemaCanvasStore = defineStore('schemaCanvas', () => {
  // Session & Project stores
  const sessionStore = useSessionStore()
  const projectStore = useProjectStore()
  const { sessionId, apiKey: sessionApiKey } = storeToRefs(sessionStore)
  const { projectName } = storeToRefs(projectStore)
  
  // Data source selection
  const dataSource = ref<SchemaDataSource>('robo')
  
  // Canvas state
  const nodes = ref<Node<TableNodeData>[]>([])
  const edges = ref<Edge[]>([])
  
  // 노드가 변경될 때 엣지 자동 업데이트 (debounced)
  let edgeUpdateTimeout: ReturnType<typeof setTimeout> | null = null
  watch(
    () => nodes.value.length,
    (newLen, oldLen) => {
      if (newLen !== oldLen && newLen > 0) {
        // 여러 테이블이 동시에 추가될 때 한 번만 호출하도록 debounce
        if (edgeUpdateTimeout) {
          clearTimeout(edgeUpdateTimeout)
        }
        edgeUpdateTimeout = setTimeout(() => {
          updateEdgesFromRelationships()
          edgeUpdateTimeout = null
        }, 300)
      }
    }
  )
  
  // Table data
  const allTables = ref<Text2SqlTableInfo[]>([])
  const tableColumnsCache = ref<Record<string, Text2SqlColumnInfo[]>>({})
  
  // Relationships
  const userRelationships = ref<RelationshipData[]>([])
  
  // Neo4j에서 가져온 FK_TO_TABLE 관계 (column_pairs 포함)
  interface Neo4jRelationship {
    from_table: string
    to_table: string
    type: string
    source?: 'ddl' | 'procedure' | 'user'  // FK 관계 출처
    column_pairs: Array<{ source: string; target: string }>
  }
  const neo4jRelationships = ref<Neo4jRelationship[]>([])
  
  // UI state
  const selectedNodeId = ref<string | null>(null)
  const selectedTable = ref<Text2SqlTableInfo | null>(null)
  const selectedTableColumns = ref<Text2SqlColumnInfo[]>([])
  const loading = ref(false)
  const isDetailPanelOpen = ref(false)
  
  // Statement 설명 정보
  interface StatementInfo {
    start_line: number
    end_line?: number
    statement_type: string
    summary?: string
    ai_description?: string
  }
  
  // 소스 코드 패널 상태
  interface SourceCodePanelState {
    isOpen: boolean
    fileName: string
    fileDirectory: string
    fileContent: string
    highlightedLine: number
    procedureName: string
    statements: StatementInfo[]  // AI 설명 정보
    isLoadingStatements: boolean
  }
  const sourceCodePanel = ref<SourceCodePanelState>({
    isOpen: false,
    fileName: '',
    fileDirectory: '',
    fileContent: '',
    highlightedLine: 0,
    procedureName: '',
    statements: [],
    isLoadingStatements: false
  })
  
  // 테이블 데이터 조회 패널 상태
  interface TableDataPanelState {
    isOpen: boolean
    tableName: string
    schema: string
    columns: string[]
    rows: any[][]
    rowCount: number
    executionTimeMs: number
    isLoading: boolean
    error: string | null
    limit: number
  }
  const tableDataPanel = ref<TableDataPanelState>({
    isOpen: false,
    tableName: '',
    schema: '',
    columns: [],
    rows: [],
    rowCount: 0,
    executionTimeMs: 0,
    isLoading: false,
    error: null,
    limit: 25
  })
  
  // Search/filter
  const searchQuery = ref('')
  
  // 시멘틱 검색 상태
  const isSemanticSearching = ref(false)
  const semanticSearchResults = ref<Array<{
    name: string
    schema: string
    description: string
    similarity: number
  }>>([])
  const semanticSearchError = ref<string | null>(null)
  
  // FK 관계 유형별 표시 여부 (범례 체크박스용)
  // source: 'ddl' | 'procedure' | 'user'
  const fkVisibility = ref({
    ddl: true,        // DDL에서 추출 (실선, 초록색)
    procedure: true,  // 프로시저 분석 (점선, 하늘색)
    user: true        // 사용자 추가 (실선, 주황색)
  })
  
  // FK 표시 토글 함수
  function toggleFkVisibility(source: 'ddl' | 'procedure' | 'user') {
    fkVisibility.value[source] = !fkVisibility.value[source]
    updateEdgesFromRelationships()
  }
  
  // =========================================================================
  // 실시간 캔버스 업데이트 (인제스천 중 변경사항 반영)
  // =========================================================================
  
  // 전체 테이블 보기 모드 여부
  const isFullViewMode = ref(false)
  
  // 업데이트된 노드 추적 (애니메이션용) - { nodeId: timestamp }
  const updatedNodes = ref<Map<string, number>>(new Map())
  
  // 업데이트된 컬럼 추적 (애니메이션용) - { "tableName:columnName": timestamp }
  const updatedColumns = ref<Map<string, number>>(new Map())
  
  // 새로 추가된 관계 추적 (애니메이션용)
  const newRelationships = ref<Map<string, number>>(new Map())
  
  // 새로 추가된 테이블 추적 (애니메이션용)
  const newlyAddedTables = ref<Map<string, number>>(new Map())
  
  // 새로 추가된 엣지 추적 (애니메이션용)
  const newlyAddedEdges = ref<Map<string, number>>(new Map())
  
  /**
   * 캔버스 업데이트 이벤트 처리
   * 현재 캔버스에 표시된 테이블과 관련된 업데이트만 적용
   * 전체 테이블 보기 모드에서는 새 테이블/릴레이션도 자동 추가
   */
  async function handleCanvasUpdate(event: {
    updateType: string
    tableName: string
    schema?: string
    field?: string
    changes?: Record<string, unknown>
  }) {
    const { updateType, tableName, schema, field, changes } = event
    const nodeId = `table-${tableName}`
    const now = Date.now()
    
    console.log(`[Canvas Update] ${updateType}: ${tableName}`, changes)
    
    // 새 테이블 추가 처리
    if (updateType === 'table_added') {
      // 테이블 목록 새로고침
      await loadAllTables()
      
      const existingNode = nodes.value.find(n => n.data?.tableName === tableName)
      
      if (!existingNode) {
        // 전체 보기 모드: 모든 새 테이블 자동 추가
        if (isFullViewMode.value) {
          const newTable = allTables.value.find(t => t.name === tableName)
          if (newTable) {
            await addTableToCanvasWithAnimation(newTable, schema)
          }
        } else {
          // 부분 보기 모드: 현재 캔버스의 테이블과 FK 관계가 있는 테이블만 추가
          // 현재 캔버스에 있는 테이블들의 이름 목록
          const canvasTableNames = nodes.value
            .filter(n => n.type === 'tableNode')
            .map(n => n.data?.tableName)
            .filter(Boolean) as string[]
          
          // Neo4j 관계에서 현재 캔버스 테이블과 FK 관계가 있는지 확인
          const hasRelationWithCanvas = neo4jRelationships.value.some(rel => {
            if (rel.type !== 'FK_TO_TABLE') return false
            // 새 테이블이 from 또는 to 중 하나이고, 다른 쪽이 캔버스에 있는 경우
            if (rel.from_table === tableName && canvasTableNames.includes(rel.to_table)) return true
            if (rel.to_table === tableName && canvasTableNames.includes(rel.from_table)) return true
            return false
          })
          
          if (hasRelationWithCanvas) {
            const newTable = allTables.value.find(t => t.name === tableName)
            if (newTable) {
              await addTableToCanvasWithAnimation(newTable, schema)
            }
          }
        }
      }
      return
    }
    
    // 현재 캔버스에 없는 테이블 처리
    const node = nodes.value.find(n => n.id === nodeId)
    if (!node) {
      // 전체 테이블 보기 모드에서는 테이블 자동 추가
      if (isFullViewMode.value && (updateType === 'table_description' || updateType === 'column_description')) {
        const tableInfo = allTables.value.find(t => t.name === tableName)
        if (tableInfo) {
          await addTableToCanvasWithAnimation(tableInfo, schema)
          // 추가 후 다시 처리
          setTimeout(() => handleCanvasUpdate(event), 100)
        }
      }
      return
    }
    
    switch (updateType) {
      case 'table_description': {
        // 테이블 설명 업데이트
        if (changes?.description) {
          node.data.description = changes.description as string
        }
        // 업데이트 애니메이션 트리거
        updatedNodes.value.set(nodeId, now)
        break
      }
      
      case 'column_description': {
        // 컬럼 설명 업데이트
        if (field && changes?.description) {
          const column = node.data.columns.find(c => c.name === field)
          if (column) {
            column.description = changes.description as string
          }
        }
        // 업데이트 애니메이션 트리거
        updatedColumns.value.set(`${tableName}:${field}`, now)
        break
      }
      
      case 'column_added': {
        // 새 컬럼 추가
        if (field && changes) {
          const existingCol = node.data.columns.find(c => c.name === field)
          if (!existingCol) {
            const newColumn = {
              name: field,
              table_name: tableName,
              dtype: (changes.dtype as string) || 'unknown',
              nullable: (changes.nullable as boolean) ?? true,
              description: (changes.description as string) || ''
            }
            node.data.columns.push(newColumn)
            node.data.columnCount = node.data.columns.length
          }
        }
        updatedColumns.value.set(`${tableName}:${field}`, now)
        break
      }
      
      case 'relationship_added': {
        // 새 관계 추가
        if (changes?.from_column && changes?.to_table && changes?.to_column) {
          const relKey = `${tableName}.${changes.from_column}->${changes.to_table}.${changes.to_column}`
          newRelationships.value.set(relKey, now)
          newlyAddedEdges.value.set(relKey, now)
          
          // 엣지 애니메이션 타이머
          setTimeout(() => {
            newlyAddedEdges.value.delete(relKey)
          }, 5000)
          
          // 전체 보기 모드가 아닌 경우: 현재 캔버스에 있는 테이블과 FK 관계가 있는 테이블만 추가
          // 소스 테이블이 캔버스에 있으면 타겟 테이블도 추가
          const targetTable = changes.to_table as string
          const sourceNodeExists = nodes.value.some(n => n.data?.tableName === tableName)
          const targetNodeExists = nodes.value.some(n => n.data?.tableName === targetTable)
          
          if (sourceNodeExists && !targetNodeExists) {
            // 타겟 테이블을 찾아서 캔버스에 추가
            const targetTableInfo = allTables.value.find(t => t.name === targetTable)
            if (targetTableInfo) {
              await addTableToCanvasWithAnimation(targetTableInfo, changes.schema as string)
            }
          }
        }
        // Neo4j 관계 다시 로드
        await loadRelatedTablesFromNeo4j(tableName)
        break
      }
    }
    
    // 5초 후 애니메이션 상태 제거
    setTimeout(() => {
      if (updatedNodes.value.get(nodeId) === now) {
        updatedNodes.value.delete(nodeId)
      }
      if (field && updatedColumns.value.get(`${tableName}:${field}`) === now) {
        updatedColumns.value.delete(`${tableName}:${field}`)
      }
    }, 5000)
  }
  
  /**
   * 테이블을 캔버스에 애니메이션과 함께 추가
   */
  async function addTableToCanvasWithAnimation(table: Text2SqlTableInfo, schema?: string) {
    const nodeId = `table-${table.name}`
    
    // 이미 존재하면 무시
    if (nodes.value.some(n => n.id === nodeId)) {
      return
    }
    
    const now = Date.now()
    
    // 새 테이블 애니메이션 상태 설정
    newlyAddedTables.value.set(nodeId, now)
    
    // 테이블 추가
    await addTableToCanvas(table, undefined, { autoLoadRelated: false, isPrimary: false })
    
    // 5초 후 애니메이션 상태 제거
    setTimeout(() => {
      if (newlyAddedTables.value.get(nodeId) === now) {
        newlyAddedTables.value.delete(nodeId)
      }
    }, 5000)
  }
  
  /**
   * 전체 테이블 보기 모드 설정
   */
  function setFullViewMode(enabled: boolean) {
    isFullViewMode.value = enabled
    console.log(`[Canvas] 전체 테이블 보기 모드: ${enabled ? 'ON' : 'OFF'}`)
  }
  
  /**
   * 테이블이 새로 추가되었는지 확인 (애니메이션용)
   */
  function isTableNewlyAdded(nodeId: string): boolean {
    return newlyAddedTables.value.has(nodeId)
  }
  
  /**
   * 엣지가 새로 추가되었는지 확인 (애니메이션용)
   */
  function isEdgeNewlyAdded(edgeId: string): boolean {
    return newlyAddedEdges.value.has(edgeId)
  }
  
  /**
   * 노드가 최근 업데이트되었는지 확인 (애니메이션용)
   */
  function isNodeRecentlyUpdated(nodeId: string): boolean {
    return updatedNodes.value.has(nodeId)
  }
  
  /**
   * 컬럼이 최근 업데이트되었는지 확인 (애니메이션용)
   */
  function isColumnRecentlyUpdated(tableName: string, columnName: string): boolean {
    return updatedColumns.value.has(`${tableName}:${columnName}`)
  }
  
  // Watch data source changes
  watch(dataSource, () => {
    // Clear canvas when data source changes
    clearCanvas()
    loadAllTables()
    loadUserRelationships()
  })
  
  // Computed
  const filteredTables = computed(() => {
    if (!searchQuery.value.trim()) return allTables.value
    const query = searchQuery.value.toLowerCase()
    return allTables.value.filter(t => 
      t.name.toLowerCase().includes(query) ||
      (t.description && t.description.toLowerCase().includes(query))
    )
  })
  
  const tablesOnCanvas = computed(() => {
    return nodes.value.map(n => n.data?.tableName).filter((name): name is string => !!name)
  })
  
  const tablesNotOnCanvas = computed(() => {
    const onCanvas = new Set(tablesOnCanvas.value)
    return filteredTables.value.filter(t => !onCanvas.has(t.name))
  })
  
  // 스키마 목록 (정렬됨)
  const schemas = computed(() => {
    const schemaSet = new Set<string>()
    allTables.value.forEach(table => {
      schemaSet.add(table.schema || 'public')
    })
    return Array.from(schemaSet).sort()
  })
  
  // 스키마별 테이블 그룹화 (캔버스에 없는 테이블만)
  const tablesBySchema = computed(() => {
    const onCanvas = new Set(tablesOnCanvas.value)
    const grouped: Record<string, Text2SqlTableInfo[]> = {}
    
    filteredTables.value.forEach(table => {
      if (onCanvas.has(table.name)) return
      
      const schema = table.schema || 'public'
      if (!grouped[schema]) {
        grouped[schema] = []
      }
      grouped[schema].push(table)
    })
    
    // 각 스키마 내 테이블 정렬
    Object.keys(grouped).forEach(schema => {
      grouped[schema].sort((a, b) => a.name.localeCompare(b.name))
    })
    
    return grouped
  })
  
  // Actions
  async function loadAllTables() {
    loading.value = true
    try {
      if (dataSource.value === 'robo') {
        // Neo4j 직접 조회 (robo-analyzer)
        const tables = await roboSchemaApi.getTables(sessionId.value, {
          projectName: projectName.value,
          limit: 200
        })
        allTables.value = tables.map(t => ({
          name: t.name,
          schema: t.table_schema,  // Backend returns table_schema
          description: t.description,
          description_source: t.description_source,  // 설명 출처
          analyzed_description: t.analyzed_description,
          column_count: t.column_count
        }))
      } else {
        // PostgreSQL 인제스천 (text2sql)
        allTables.value = await text2sqlApi.getTables()
      }
    } catch (error) {
      console.error('Failed to load tables:', error)
      allTables.value = []
    } finally {
      loading.value = false
    }
  }
  
  /**
   * 시멘틱 검색: 테이블 설명의 의미적 유사도 기반 검색
   */
  async function performSemanticSearch(query: string): Promise<void> {
    if (!query.trim() || query.length < 2) {
      semanticSearchResults.value = []
      return
    }
    
    // Neo4j 데이터 소스에서만 시멘틱 검색 가능
    if (dataSource.value !== 'robo') {
      return
    }
    
    // API 키 확인
    const apiKey = sessionApiKey.value
    if (!apiKey) {
      semanticSearchError.value = 'OpenAI API 키가 필요합니다. 설정에서 API 키를 입력해주세요.'
      return
    }
    
    isSemanticSearching.value = true
    semanticSearchError.value = null
    
    try {
      const results = await roboSchemaApi.semanticSearch(
        sessionId.value,
        query,
        { projectName: projectName.value, limit: 10, apiKey }
      )
      
      semanticSearchResults.value = results
    } catch (error) {
      console.error('[SemanticSearch] 실패:', error)
      semanticSearchError.value = error instanceof Error ? error.message : '검색 실패'
      semanticSearchResults.value = []
    } finally {
      isSemanticSearching.value = false
    }
  }
  
  /**
   * 시멘틱 검색 결과 초기화
   */
  function clearSemanticSearch(): void {
    semanticSearchResults.value = []
    semanticSearchError.value = null
    isSemanticSearching.value = false
  }
  
  async function loadTableColumns(tableName: string, schema: string = ''): Promise<Text2SqlColumnInfo[]> {
    if (tableColumnsCache.value[tableName]) {
      return tableColumnsCache.value[tableName]
    }
    
    try {
      let columns: Text2SqlColumnInfo[]
      
      if (dataSource.value === 'robo') {
        const roboColumns = await roboSchemaApi.getTableColumns(sessionId.value, tableName, {
          schema,
          projectName: projectName.value
        })
        columns = roboColumns.map(c => ({
          name: c.name,
          table_name: c.table_name,
          dtype: c.dtype,
          nullable: c.nullable,
          description: c.description,
          description_source: c.description_source,
          analyzed_description: c.analyzed_description
        }))
      } else {
        columns = await text2sqlApi.getTableColumns(tableName, schema || 'public')
      }
      
      tableColumnsCache.value[tableName] = columns
      return columns
    } catch (error) {
      console.error(`Failed to load columns for ${tableName}:`, error)
      return []
    }
  }
  
  async function loadUserRelationships() {
    try {
      let relationships: RelationshipData[]
      
      if (dataSource.value === 'robo') {
        const response = await roboSchemaApi.getRelationships(sessionId.value, projectName.value)
        relationships = (response.relationships || []).map(r => ({
          from_table: r.from_table,
          from_schema: r.from_schema,
          from_column: r.from_column,
          to_table: r.to_table,
          to_schema: r.to_schema,
          to_column: r.to_column,
          relationship_type: r.relationship_type,
          description: r.description
        }))
      } else {
        const response = await text2sqlApi.getUserRelationships()
        relationships = (response.relationships || []) as RelationshipData[]
      }
      
      userRelationships.value = relationships
      updateEdgesFromRelationships()
    } catch (error) {
      console.error('Failed to load relationships:', error)
      userRelationships.value = []
    }
  }
  
  async function addTableToCanvas(
    table: Text2SqlTableInfo, 
    position?: { x: number; y: number },
    options?: { autoLoadRelated?: boolean; isPrimary?: boolean }
  ) {
    // Check if already on canvas
    if (nodes.value.some(n => n.data?.tableName === table.name)) {
      console.log(`[SchemaCanvas] 테이블 ${table.name}은 이미 캔버스에 있습니다`)
      return
    }
    
    console.log(`[SchemaCanvas] 📋 테이블 추가 중: ${table.name} (isPrimary: ${options?.isPrimary ?? true})`)
    
    // Load columns
    const columns = await loadTableColumns(table.name, table.schema)
    
    // Calculate position
    const pos = position || calculateNewNodePosition()
    
    // Create node - 직접 추가한 테이블은 isPrimary=true (기본값)
    const isPrimary = options?.isPrimary !== false
    
    const newNode: Node<TableNodeData> = {
      id: `table-${table.name}`,
      type: 'tableNode',
      position: pos,
      data: {
        tableName: table.name,
        schema: table.schema || 'public',
        description: table.description,
        description_source: table.description_source,  // 설명 출처
        columns: columns,
        columnCount: table.column_count,
        isPrimary: isPrimary  // 직접 선택한 테이블 표시
      }
    }
    
    nodes.value.push(newNode)
    console.log(`[SchemaCanvas] ✅ 테이블 ${table.name} 추가됨`)
    
    // Update edges for this table
    updateEdgesFromRelationships()
    
    // Auto-load related tables (default: true)
    if (options?.autoLoadRelated !== false) {
      await loadRelatedTablesFromNeo4j(table.name)
    }
  }
  
  // Load related tables from Neo4j using Cypher query API
  async function loadRelatedTablesFromNeo4j(tableName: string) {
    try {
      console.log(`[SchemaCanvas] 🔍 Loading related tables for: ${tableName}`)
      console.log(`[SchemaCanvas] Session ID: ${sessionId.value}`)
      
      // Neo4j API를 통해 연결된 테이블 조회
      const result = await roboSchemaApi.getRelatedTables(sessionId.value, tableName)
      
      console.log(`[SchemaCanvas] API Response:`, result)
      
      // FK 관계가 있는 테이블만 필터링 (CO_REFERENCED 제외)
      // CO_REFERENCED는 같은 프로시저에서 참조되는 테이블일 뿐, 실제 FK 관계가 아님
      const fkRelationships = result.relationships.filter(
        rel => rel.type === 'FK_TO_TABLE' || rel.type === 'REFERENCES'
      )
      
      // FK 관계에 있는 테이블 이름 추출
      const fkTableNames = new Set<string>()
      fkRelationships.forEach(rel => {
        if (rel.from_table !== tableName) fkTableNames.add(rel.from_table)
        if (rel.to_table !== tableName) fkTableNames.add(rel.to_table)
      })
      
      console.log(`[SchemaCanvas] FK 관계 테이블: ${Array.from(fkTableNames).join(', ')}`)
      console.log(`[SchemaCanvas] 제외된 CO_REFERENCED 테이블: ${
        result.tables
          .filter(t => !fkTableNames.has(t.name) && t.name !== tableName)
          .map(t => t.name)
          .join(', ') || '없음'
      }`)
      
      if (fkTableNames.size === 0) {
        console.log(`[SchemaCanvas] ⚠️ No FK-related tables found, trying fallback...`)
        // Fallback: FK 컬럼명 패턴 기반 추론
        await loadRelatedTablesByFKPattern(tableName)
        return
      }
      
      // FK 관계가 있는 테이블만 캔버스에 추가
      let addedCount = 0
      const maxRelatedTables = 15
      
      for (const fkTableName of fkTableNames) {
        if (addedCount >= maxRelatedTables) break
        if (nodes.value.some(n => n.data?.tableName === fkTableName)) continue
        
        // allTables에서 찾거나 API 결과에서 찾기
        let tableInfo = allTables.value.find(t => t.name === fkTableName)
        if (!tableInfo) {
          const apiTableInfo = result.tables.find(t => t.name === fkTableName)
          if (apiTableInfo) {
            tableInfo = {
              name: apiTableInfo.name,
              schema: apiTableInfo.schema || 'public',
              description: apiTableInfo.description,
              column_count: 0
            }
          }
        }
        
        if (tableInfo) {
          await addTableToCanvas(tableInfo, undefined, { autoLoadRelated: false, isPrimary: false })
          addedCount++
        }
      }
      
      // Neo4j 관계 저장 (모든 관계 - 엣지 표시에 사용)
      for (const rel of result.relationships) {
        const existingIdx = neo4jRelationships.value.findIndex(
          r => r.from_table === rel.from_table && r.to_table === rel.to_table && r.type === rel.type
        )
        if (existingIdx === -1) {
          neo4jRelationships.value.push({
            from_table: rel.from_table,
            to_table: rel.to_table,
            type: rel.type,
            source: rel.source,  // ddl, procedure, user
            column_pairs: rel.column_pairs || []
          })
        }
      }
      
      console.log(`[SchemaCanvas] ✅ Loaded ${addedCount} FK-related tables (${fkRelationships.length} FK relationships) for ${tableName}`)
      
      // 엣지 업데이트 및 레이아웃 적용
      updateEdgesFromRelationships()
      
      if (addedCount > 0) {
        await applyAutoLayout()
      }
    } catch (error) {
      console.error('[SchemaCanvas] Failed to load related tables via API:', error)
      // Fallback: FK 패턴 기반
      await loadRelatedTablesByFKPattern(tableName)
    }
  }
  
  // Fallback: FK 컬럼명 패턴 기반 관련 테이블 추론
  async function loadRelatedTablesByFKPattern(tableName: string) {
    const relatedTableNames = new Set<string>()
    
    // FK 컬럼명 패턴 (column ending with _id)
    const columns = tableColumnsCache.value[tableName] || []
    for (const col of columns) {
      if (col.name.endsWith('_id') && col.name !== 'id') {
        const baseName = col.name.replace(/_id$/, '')
        const possibleTargets = [baseName, baseName + 's', baseName.replace(/s$/, '')]
        
        const relatedTable = allTables.value.find(t => 
          possibleTargets.includes(t.name.toLowerCase())
        )
        
        if (relatedTable) {
          relatedTableNames.add(relatedTable.name)
        }
      }
    }
    
    // 다른 테이블에서 이 테이블을 참조하는 경우
    for (const otherTable of allTables.value) {
      if (otherTable.name === tableName) continue
      
      const otherColumns = tableColumnsCache.value[otherTable.name]
      if (otherColumns) {
        for (const col of otherColumns) {
          if (col.name.endsWith('_id')) {
            const baseName = col.name.replace(/_id$/, '')
            if (tableName.toLowerCase().includes(baseName) || baseName.includes(tableName.toLowerCase())) {
              relatedTableNames.add(otherTable.name)
              break
            }
          }
        }
      }
    }
    
    // 캔버스에 추가
    let addedCount = 0
    for (const relatedName of relatedTableNames) {
      if (addedCount >= 10) break
      if (nodes.value.some(n => n.data?.tableName === relatedName)) continue
      
      const relatedTable = allTables.value.find(t => t.name === relatedName)
      if (relatedTable) {
        await addTableToCanvas(relatedTable, undefined, { autoLoadRelated: false, isPrimary: false })
        addedCount++
      }
    }
    
    if (addedCount > 0) {
      await applyAutoLayout()
    }
  }
  
  function removeTableFromCanvas(tableName: string) {
    const nodeId = `table-${tableName}`
    nodes.value = nodes.value.filter(n => n.id !== nodeId)
    edges.value = edges.value.filter(e => 
      e.source !== nodeId && e.target !== nodeId
    )
    
    if (selectedNodeId.value === nodeId) {
      selectedNodeId.value = null
      selectedTable.value = null
      isDetailPanelOpen.value = false
    }
  }
  
  function calculateNewNodePosition(): { x: number; y: number } {
    if (nodes.value.length === 0) {
      return { x: 100, y: 100 }
    }
    
    // Find rightmost position
    const maxX = Math.max(...nodes.value.map(n => n.position.x))
    const avgY = nodes.value.reduce((sum, n) => sum + n.position.y, 0) / nodes.value.length
    
    return { x: maxX + 320, y: avgY }
  }
  
  function updateNodePosition(nodeId: string, position: { x: number; y: number }) {
    const node = nodes.value.find(n => n.id === nodeId)
    if (node) {
      node.position = position
    }
  }
  
  function selectNode(nodeId: string) {
    selectedNodeId.value = nodeId
    
    const node = nodes.value.find(n => n.id === nodeId)
    if (node && node.data) {
      const table = allTables.value.find(t => t.name === node.data!.tableName)
      if (table) {
        selectedTable.value = table
        selectedTableColumns.value = node.data.columns
        isDetailPanelOpen.value = true
      }
    }
  }
  
  function clearSelection() {
    selectedNodeId.value = null
  }
  
  function closeDetailPanel() {
    isDetailPanelOpen.value = false
    selectedTable.value = null
    selectedNodeId.value = null
  }
  
  // 소스 코드 패널 열기
  async function openSourceCodePanel(
    fileName: string,
    fileDirectory: string,
    fileContent: string,
    highlightedLine: number,
    procedureName: string
  ) {
    // 먼저 패널 열기
    sourceCodePanel.value = {
      isOpen: true,
      fileName,
      fileDirectory,
      fileContent,
      highlightedLine,
      procedureName,
      statements: [],
      isLoadingStatements: true
    }
    
    // Statement 설명 로드
    try {
      const result = await roboSchemaApi.getProcedureStatements(
        sessionId.value,
        procedureName,
        fileDirectory
      )
      sourceCodePanel.value.statements = result.statements
      console.log('[openSourceCodePanel] Statement 설명 로드:', result.statements.length, '개')
    } catch (error) {
      console.error('[openSourceCodePanel] Statement 설명 로드 실패:', error)
      sourceCodePanel.value.statements = []
    } finally {
      sourceCodePanel.value.isLoadingStatements = false
    }
  }
  
  // 소스 코드 패널 닫기
  function closeSourceCodePanel() {
    sourceCodePanel.value = {
      isOpen: false,
      fileName: '',
      fileDirectory: '',
      fileContent: '',
      highlightedLine: 0,
      procedureName: '',
      statements: [],
      isLoadingStatements: false
    }
  }
  
  // =========================================================================
  // 테이블 데이터 조회 패널
  // =========================================================================
  
  const TEXT2SQL_API_BASE = import.meta.env.VITE_TEXT2SQL_API_URL || 'http://localhost:8000/text2sql'
  
  /**
   * 테이블 데이터 조회 패널 열기 및 데이터 로드
   */
  async function queryTableData(tableName: string, schema: string = 'public', limit: number = 25) {
    // 패널 열기 및 로딩 상태 설정
    tableDataPanel.value = {
      isOpen: true,
      tableName,
      schema,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      isLoading: true,
      error: null,
      limit
    }
    
    // SQL 생성 (PostgreSQL은 따옴표 없으면 소문자로 처리하므로 소문자로 변환)
    const schemaLower = schema?.toLowerCase() || 'public'
    const tableLower = tableName.toLowerCase()
    const fullTableName = schemaLower !== 'public' 
      ? `${schemaLower}.${tableLower}` 
      : tableLower
    const sql = `SELECT * FROM ${fullTableName} LIMIT ${limit}`
    
    try {
      const response = await fetch(`${TEXT2SQL_API_BASE}/direct-sql/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql,
          max_sql_seconds: 30,
          format_with_ai: false
        })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const reader = response.body?.getReader()
      if (!reader) throw new Error('스트림을 읽을 수 없습니다')
      
      const decoder = new TextDecoder()
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const lines = decoder.decode(value).split('\n').filter(l => l.trim())
        
        for (const line of lines) {
          try {
            const event = JSON.parse(line)
            
            switch (event.event) {
              case 'result':
                tableDataPanel.value.columns = event.columns
                tableDataPanel.value.rows = event.rows
                tableDataPanel.value.rowCount = event.row_count
                tableDataPanel.value.executionTimeMs = event.execution_time_ms
                tableDataPanel.value.isLoading = false
                break
              case 'error':
                tableDataPanel.value.error = event.message
                tableDataPanel.value.isLoading = false
                break
              case 'completed':
                tableDataPanel.value.isLoading = false
                break
            }
          } catch (e) {
            // JSON 파싱 실패 무시
          }
        }
      }
    } catch (error) {
      tableDataPanel.value.error = error instanceof Error ? error.message : '알 수 없는 오류'
      tableDataPanel.value.isLoading = false
    }
  }
  
  /**
   * 테이블 데이터 조회 패널 닫기
   */
  function closeTableDataPanel() {
    tableDataPanel.value = {
      isOpen: false,
      tableName: '',
      schema: '',
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      isLoading: false,
      error: null,
      limit: 25
    }
  }
  
  /**
   * 조회 결과 Limit 변경 후 재조회
   */
  function changeTableDataLimit(limit: number) {
    if (tableDataPanel.value.tableName) {
      queryTableData(tableDataPanel.value.tableName, tableDataPanel.value.schema, limit)
    }
  }
  
  function updateEdgesFromRelationships() {
    const newEdges: Edge[] = []
    const tableNamesOnCanvas = new Set(nodes.value.map(n => n.data?.tableName).filter(Boolean))
    
    // Parse cardinality from description or relationship_type
    interface CardinalityInfo {
      label: string
      color: string
      animated: boolean
      markerStart?: string
      markerEnd?: string
    }
    
    function getCardinalityInfo(rel: RelationshipData): CardinalityInfo {
      const desc = rel.description || ''
      const type = rel.relationship_type || ''
      
      // Check for cardinality markers
      // 1:1 - One to One (vertical bars on both ends)
      if (desc.includes('[1:1]') || type === 'ONE_TO_ONE') {
        return { 
          label: '1:1', 
          color: '#40c057', 
          animated: false,
          markerStart: 'url(#erd-one-green)',
          markerEnd: 'url(#erd-one-green)'
        }
      } 
      // 1:N - One to Many (vertical bar on source, crow's foot on target)
      else if (desc.includes('[1:N]') || type === 'ONE_TO_MANY') {
        return { 
          label: '1:N', 
          color: '#228be6', 
          animated: false,
          markerStart: 'url(#erd-one)',
          markerEnd: 'url(#crowfoot-many)'
        }
      } 
      // N:1 - Many to One (crow's foot on source, vertical bar on target)
      else if (desc.includes('[N:1]') || type === 'MANY_TO_ONE') {
        return { 
          label: 'N:1', 
          color: '#228be6', 
          animated: false,
          markerStart: 'url(#crowfoot-many)',
          markerEnd: 'url(#erd-one)'
        }
      } 
      // N:N - Many to Many (crow's foot on both ends)
      else if (desc.includes('[N:N]') || type === 'MANY_TO_MANY') {
        return { 
          label: 'N:N', 
          color: '#be4bdb', 
          animated: false,
          markerStart: 'url(#crowfoot-many-purple)',
          markerEnd: 'url(#crowfoot-many-purple)'
        }
      }
      
      // Default - FK relationship
      return { 
        label: `${rel.from_column} → ${rel.to_column}`, 
        color: '#228be6', 
        animated: true 
      }
    }
    
    // User-defined relationships (사용자 추가 FK - 주황색 실선)
    // fkVisibility.user가 false면 표시하지 않음
    if (fkVisibility.value.user) {
      userRelationships.value.forEach((rel) => {
        if (tableNamesOnCanvas.has(rel.from_table) && tableNamesOnCanvas.has(rel.to_table)) {
          const cardinalityInfo = getCardinalityInfo(rel)
          
          // Clean description for label
          let displayLabel = rel.description || ''
          displayLabel = displayLabel.replace(/\[.*?\]\s*/, '') // Remove cardinality marker from display
          if (!displayLabel.trim()) {
            displayLabel = cardinalityInfo.label
          }
          
          // 사용자 추가 FK는 주황색 실선
          const edge: Edge = {
            id: `rel-${rel.from_table}-${rel.from_column}-${rel.to_table}-${rel.to_column}`,
            source: `table-${rel.from_table}`,
            target: `table-${rel.to_table}`,
            sourceHandle: `fk-${rel.from_column}-source`,
            targetHandle: `pk-${rel.to_column}`,
            type: 'default',  // 베지어 곡선
            animated: false,
            label: displayLabel,
            style: { stroke: '#f59e0b', strokeWidth: 2.5 },  // 주황색 실선
            labelStyle: { fill: '#e9ecef', fontSize: 11, fontWeight: 600 },
            labelBgStyle: { fill: '#1a1b26', fillOpacity: 0.9 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 20, height: 20 }
          }
          
          // Add markers if defined
          if (cardinalityInfo.markerStart) {
            edge.markerStart = cardinalityInfo.markerStart
          }
          if (cardinalityInfo.markerEnd) {
            edge.markerEnd = cardinalityInfo.markerEnd
          }
          
          newEdges.push(edge)
        }
      })
    }
    
    // Neo4j FK_TO_TABLE 관계 (column_pairs 기반)
    // source 속성에 따라 스타일 구분:
    // - 'ddl': 실선, 초록색
    // - 'user': 실선, 주황색
    // - 'procedure': 점선, 하늘색/푸른색
    neo4jRelationships.value.forEach((rel) => {
      if (tableNamesOnCanvas.has(rel.from_table) && tableNamesOnCanvas.has(rel.to_table)) {
        // source에 따른 스타일 결정
        const isProcedure = rel.source === 'procedure' || rel.type === 'CO_REFERENCED'
        const isUser = rel.source === 'user'
        const isDdl = !isProcedure && !isUser  // 기본값은 ddl
        
        // visibility 체크 - 해당 source 유형이 비활성화되어 있으면 스킵
        const sourceType = isProcedure ? 'procedure' : isUser ? 'user' : 'ddl'
        if (!fkVisibility.value[sourceType]) {
          return  // 이 관계는 표시하지 않음
        }
        
        // 색상: procedure=하늘색, ddl=초록, user=주황
        const strokeColor = isProcedure ? '#38bdf8' : isUser ? '#f59e0b' : '#22c55e'
        const strokeDasharray = isProcedure ? '6 3' : undefined  // 프로시저만 점선
        
        // 각 컬럼 페어에 대해 별도의 엣지 생성
        // source와 target 컬럼이 모두 유효한 경우에만 엣지 생성
        if (rel.column_pairs && rel.column_pairs.length > 0) {
          rel.column_pairs.forEach((pair) => {
            // 빈 컬럼명은 건너뛰기 (유효하지 않은 관계)
            if (!pair.source || !pair.target || pair.source.trim() === '' || pair.target.trim() === '') {
              return  // 유효하지 않은 컬럼 페어 스킵
            }
            
            const edgeId = `neo4j-${rel.from_table}-${pair.source}-${rel.to_table}-${pair.target}`
            
            // 중복 체크
            if (!newEdges.some(e => e.id === edgeId)) {
              newEdges.push({
                id: edgeId,
                source: `table-${rel.from_table}`,
                target: `table-${rel.to_table}`,
                sourceHandle: `fk-${pair.source}-source`,
                targetHandle: `pk-${pair.target}`,
                type: 'default',  // 베지어 곡선
                animated: false,
                label: `${pair.source} → ${pair.target}`,
                style: { stroke: strokeColor, strokeWidth: 2.5, strokeDasharray },
                labelStyle: { fill: '#e9ecef', fontSize: 10, fontWeight: 500 },
                labelBgStyle: { fill: '#1a1b26', fillOpacity: 0.9 },
                markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor, width: 20, height: 20 }
              })
            }
          })
        }
        // Note: column_pairs가 없거나 모두 유효하지 않은 경우 기본 엣지를 생성하지 않음
        // 테이블-테이블 간의 모호한 연결은 표시하지 않음
      }
    })
    
    // Note: Auto-detect FK 로직 제거됨
    // 정확한 FK 정보(DDL, 프로시저 분석, 사용자 추가)만 사용
    // 컬럼 이름 기반 추측은 부정확하고 테이블-테이블 간 연결만 생성하므로 제거
    
    edges.value = newEdges
  }
  
  async function addRelationship(relationship: Omit<RelationshipData, 'relationship_type'>) {
    try {
      if (dataSource.value === 'robo') {
        await roboSchemaApi.addRelationship(sessionId.value, {
          ...relationship,
          relationship_type: 'FK_TO_TABLE'
        })
      } else {
        await text2sqlApi.addRelationship({
          ...relationship,
          relationship_type: 'FK_TO_TABLE'
        })
      }
      await loadUserRelationships()
    } catch (error) {
      console.error('Failed to add relationship:', error)
      throw error
    }
  }
  
  type Cardinality = '1:1' | '1:N' | 'N:1' | 'N:N'
  
  async function addRelationshipWithCardinality(relationship: Omit<RelationshipData, 'relationship_type'> & { cardinality: Cardinality }) {
    try {
      // Map cardinality to relationship type
      let relationshipType = 'FK_TO_TABLE'
      switch (relationship.cardinality) {
        case '1:1':
          relationshipType = 'ONE_TO_ONE'
          break
        case '1:N':
          relationshipType = 'ONE_TO_MANY'
          break
        case 'N:1':
          relationshipType = 'MANY_TO_ONE'
          break
        case 'N:N':
          relationshipType = 'MANY_TO_MANY'
          break
      }
      
      const relData = {
        from_table: relationship.from_table,
        from_schema: relationship.from_schema,
        from_column: relationship.from_column,
        to_table: relationship.to_table,
        to_schema: relationship.to_schema,
        to_column: relationship.to_column,
        description: relationship.description,
        relationship_type: relationshipType
      }
      
      if (dataSource.value === 'robo') {
        await roboSchemaApi.addRelationship(sessionId.value, relData)
      } else {
        await text2sqlApi.addRelationship(relData)
      }
      await loadUserRelationships()
    } catch (error) {
      console.error('Failed to add relationship:', error)
      throw error
    }
  }
  
  async function removeRelationship(relationship: RelationshipData) {
    try {
      const params = {
        from_table: relationship.from_table,
        from_column: relationship.from_column,
        to_table: relationship.to_table,
        to_column: relationship.to_column
      }
      
      if (dataSource.value === 'robo') {
        await roboSchemaApi.deleteRelationship(sessionId.value, params)
      } else {
        await text2sqlApi.removeRelationship({
          ...params,
          from_schema: relationship.from_schema,
          to_schema: relationship.to_schema
        })
      }
      await loadUserRelationships()
    } catch (error) {
      console.error('Failed to remove relationship:', error)
      throw error
    }
  }
  
  async function updateTableDescription(tableName: string, description: string) {
    try {
      // 테이블의 실제 스키마 찾기
      const table = allTables.value.find(t => t.name === tableName)
      const schema = table?.schema || selectedTable.value?.schema || 'public'
      
      // 세션 헤더 전달하여 robo-analyzer API 호출
      const headers = sessionStore.getHeaders()
      await text2sqlApi.updateTableDescription(tableName, schema, description, headers)
      
      // Update local data
      if (table) {
        table.description = description
      }
      
      const node = nodes.value.find(n => n.data?.tableName === tableName)
      if (node && node.data) {
        node.data.description = description
      }
    } catch (error) {
      console.error('Failed to update table description:', error)
      throw error
    }
  }
  
  async function updateColumnDescription(tableName: string, columnName: string, description: string) {
    try {
      // 테이블의 실제 스키마 찾기
      const table = allTables.value.find(t => t.name === tableName)
      const schema = table?.schema || selectedTable.value?.schema || 'public'
      
      // 세션 헤더 전달하여 robo-analyzer API 호출
      const headers = sessionStore.getHeaders()
      await text2sqlApi.updateColumnDescription(tableName, columnName, schema, description, headers)
      
      // Update cache
      if (tableColumnsCache.value[tableName]) {
        const col = tableColumnsCache.value[tableName].find(c => c.name === columnName)
        if (col) {
          col.description = description
        }
      }
      
      // Update node
      const node = nodes.value.find(n => n.data?.tableName === tableName)
      if (node && node.data) {
        const col = node.data.columns.find(c => c.name === columnName)
        if (col) {
          col.description = description
        }
      }
      
      // Update selected table columns
      if (selectedTable.value?.name === tableName) {
        const col = selectedTableColumns.value.find(c => c.name === columnName)
        if (col) {
          col.description = description
        }
      }
    } catch (error) {
      console.error('Failed to update column description:', error)
      throw error
    }
  }
  
  function clearCanvas() {
    nodes.value = []
    edges.value = []
    neo4jRelationships.value = []
    selectedNodeId.value = null
    selectedTable.value = null
    isDetailPanelOpen.value = false
  }
  
  /**
   * 모든 테이블을 캔버스에 추가하고 그리드 레이아웃으로 배치
   */
  async function addAllTablesToCanvas() {
    loading.value = true
    try {
      // 기존 노드 초기화
      nodes.value = []
      edges.value = []
      
      const tables = allTables.value
      if (tables.length === 0) return
      
      // 그리드 레이아웃 계산
      const NODE_WIDTH = 280
      const NODE_HEIGHT = 200
      const GAP_X = 50
      const GAP_Y = 50
      const COLS = Math.ceil(Math.sqrt(tables.length))
      
      // 모든 테이블 추가
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i]
        const col = i % COLS
        const row = Math.floor(i / COLS)
        
        const position = {
          x: 50 + col * (NODE_WIDTH + GAP_X),
          y: 50 + row * (NODE_HEIGHT + GAP_Y)
        }
        
        // Load columns
        const columns = await loadTableColumns(table.name, table.schema)
        
        const newNode: Node<TableNodeData> = {
          id: `table-${table.name}`,
          type: 'tableNode',
          position,
          data: {
            tableName: table.name,
            schema: table.schema || 'public',
            description: table.description,
            columns: columns,
            columnCount: table.column_count
          }
        }
        
        nodes.value.push(newNode)
      }
      
      // 관계 업데이트
      updateEdgesFromRelationships()
    } finally {
      loading.value = false
    }
  }
  
  // Auto-load related tables (uses Neo4j relationship data)
  async function loadRelatedTables(tableName: string) {
    await loadRelatedTablesFromNeo4j(tableName)
  }
  
  // ELK 레이아웃 엔진
  const elk = new ELK()
  
  // 자동 레이아웃 적용
  async function applyAutoLayout() {
    if (nodes.value.length === 0) return
    
    try {
      // ELK 그래프 구성
      const elkGraph = {
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.spacing.nodeNode': '80',
          'elk.layered.spacing.nodeNodeBetweenLayers': '100',
          'elk.layered.spacing.edgeNodeBetweenLayers': '50',
          'elk.padding': '[top=50,left=50,bottom=50,right=50]'
        },
        children: nodes.value.map(node => ({
          id: node.id,
          width: 280,  // 노드 너비
          height: 200  // 노드 높이 (평균)
        })),
        edges: edges.value.map(edge => ({
          id: edge.id,
          sources: [edge.source],
          targets: [edge.target]
        }))
      }
      
      // 레이아웃 계산
      const layoutedGraph = await elk.layout(elkGraph)
      
      // 노드 위치 업데이트
      if (layoutedGraph.children) {
        for (const elkNode of layoutedGraph.children) {
          const node = nodes.value.find(n => n.id === elkNode.id)
          if (node && elkNode.x !== undefined && elkNode.y !== undefined) {
            node.position = { x: elkNode.x, y: elkNode.y }
          }
        }
      }
      
      console.log('[SchemaCanvas] Auto layout applied')
    } catch (error) {
      console.error('[SchemaCanvas] Failed to apply layout:', error)
    }
  }
  
  // Set data source
  function setDataSource(source: SchemaDataSource) {
    dataSource.value = source
  }
  
  return {
    // State
    nodes,
    edges,
    allTables,
    tableColumnsCache,
    userRelationships,
    selectedNodeId,
    selectedTable,
    selectedTableColumns,
    loading,
    isDetailPanelOpen,
    searchQuery,
    dataSource,
    fkVisibility,  // FK 관계 유형별 표시 상태
    sourceCodePanel,  // 소스 코드 패널 상태
    tableDataPanel,   // 테이블 데이터 조회 패널 상태
    
    // 시멘틱 검색 상태
    isSemanticSearching,
    semanticSearchResults,
    semanticSearchError,
    
    // Computed
    filteredTables,
    tablesOnCanvas,
    tablesNotOnCanvas,
    schemas,
    tablesBySchema,
    
    // Actions
    loadAllTables,
    loadTableColumns,
    loadUserRelationships,
    addTableToCanvas,
    removeTableFromCanvas,
    updateNodePosition,
    selectNode,
    clearSelection,
    closeDetailPanel,
    openSourceCodePanel,
    closeSourceCodePanel,
    queryTableData,
    closeTableDataPanel,
    changeTableDataLimit,
    updateEdgesFromRelationships,
    addRelationship,
    addRelationshipWithCardinality,
    removeRelationship,
    updateTableDescription,
    updateColumnDescription,
    clearCanvas,
    loadRelatedTables,
    setDataSource,
    addAllTablesToCanvas,
    applyAutoLayout,
    toggleFkVisibility,  // FK 표시 토글 함수
    
    // 시멘틱 검색
    performSemanticSearch,
    clearSemanticSearch,
    
    // 실시간 캔버스 업데이트
    handleCanvasUpdate,
    isNodeRecentlyUpdated,
    isColumnRecentlyUpdated,
    updatedNodes,
    updatedColumns,
    newRelationships,
    
    // 전체 테이블 보기 모드
    isFullViewMode,
    setFullViewMode,
    isTableNewlyAdded,
    isEdgeNewlyAdded,
    newlyAddedTables,
    newlyAddedEdges,
    addTableToCanvasWithAnimation
  }
})

