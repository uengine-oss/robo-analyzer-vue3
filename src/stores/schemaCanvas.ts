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
import type { Edge, Node } from '@vue-flow/core'
import { text2sqlApi, roboSchemaApi } from '@/services/api'
import type { Text2SqlTableInfo, Text2SqlColumnInfo } from '@/types'
import { useSessionStore } from './session'
import { useProjectStore } from './project'

export type SchemaDataSource = 'robo' | 'text2sql'

export interface TableNodeData {
  tableName: string
  schema: string
  description?: string
  columns: Text2SqlColumnInfo[]
  columnCount: number
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
  const { sessionId } = storeToRefs(sessionStore)
  const { projectName } = storeToRefs(projectStore)
  
  // Data source selection
  const dataSource = ref<SchemaDataSource>('robo')
  
  // Canvas state
  const nodes = ref<Node<TableNodeData>[]>([])
  const edges = ref<Edge[]>([])
  
  // Table data
  const allTables = ref<Text2SqlTableInfo[]>([])
  const tableColumnsCache = ref<Record<string, Text2SqlColumnInfo[]>>({})
  
  // Relationships
  const userRelationships = ref<RelationshipData[]>([])
  
  // UI state
  const selectedNodeId = ref<string | null>(null)
  const selectedTable = ref<Text2SqlTableInfo | null>(null)
  const selectedTableColumns = ref<Text2SqlColumnInfo[]>([])
  const loading = ref(false)
  const isDetailPanelOpen = ref(false)
  
  // Search/filter
  const searchQuery = ref('')
  
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
          description: c.description
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
  
  async function addTableToCanvas(table: Text2SqlTableInfo, position?: { x: number; y: number }) {
    // Check if already on canvas
    if (nodes.value.some(n => n.data?.tableName === table.name)) {
      return
    }
    
    // Load columns
    const columns = await loadTableColumns(table.name, table.schema)
    
    // Calculate position
    const pos = position || calculateNewNodePosition()
    
    // Create node
    const newNode: Node<TableNodeData> = {
      id: `table-${table.name}`,
      type: 'tableNode',
      position: pos,
      data: {
        tableName: table.name,
        schema: table.schema || 'public',
        description: table.description,
        columns: columns,
        columnCount: table.column_count
      }
    }
    
    nodes.value.push(newNode)
    
    // Update edges for this table
    updateEdgesFromRelationships()
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
    
    // User-defined relationships
    userRelationships.value.forEach((rel) => {
      if (tableNamesOnCanvas.has(rel.from_table) && tableNamesOnCanvas.has(rel.to_table)) {
        const cardinalityInfo = getCardinalityInfo(rel)
        
        // Clean description for label
        let displayLabel = rel.description || ''
        displayLabel = displayLabel.replace(/\[.*?\]\s*/, '') // Remove cardinality marker from display
        if (!displayLabel.trim()) {
          displayLabel = cardinalityInfo.label
        }
        
        // Create edge with markers
        const edge: Edge = {
          id: `rel-${rel.from_table}-${rel.from_column}-${rel.to_table}-${rel.to_column}`,
          source: `table-${rel.from_table}`,
          target: `table-${rel.to_table}`,
          sourceHandle: `fk-${rel.from_column}-source`,
          targetHandle: `pk-${rel.to_column}`,
          type: 'smoothstep',
          animated: cardinalityInfo.animated,
          label: displayLabel,
          style: { stroke: cardinalityInfo.color, strokeWidth: 2.5 },
          labelStyle: { fill: '#e9ecef', fontSize: 11, fontWeight: 600 },
          labelBgStyle: { fill: '#1a1b26', fillOpacity: 0.9 }
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
    
    // Auto-detect FK relationships from column names (N:1 - Many to One)
    nodes.value.forEach(node => {
      if (!node.data) return
      const columns = node.data.columns || []
      columns.forEach(col => {
        if (col.name.endsWith('_id') && col.name !== 'id') {
          const baseName = col.name.replace(/_id$/, '')
          
          // Find potential target table
          const possibleTargets = [baseName, baseName + 's', baseName.replace(/s$/, '')]
          
          nodes.value.forEach(targetNode => {
            if (!targetNode.data || !node.data) return
            if (targetNode.id !== node.id && 
                possibleTargets.includes(targetNode.data.tableName.toLowerCase())) {
              const edgeId = `fk-${node.data.tableName}-${col.name}-${targetNode.data.tableName}`
              
              // Check if edge already exists (user-defined takes precedence)
              if (!newEdges.some(e => e.id === edgeId || e.id.includes(`${node.data!.tableName}-${col.name}`))) {
                newEdges.push({
                  id: edgeId,
                  source: node.id,
                  target: targetNode.id,
                  sourceHandle: `fk-${col.name}-source`,
                  targetHandle: `pk-id`,
                  type: 'smoothstep',
                  style: { stroke: '#868e96', strokeWidth: 2, strokeDasharray: '8 4' },
                  label: baseName,
                  labelStyle: { fill: '#909296', fontSize: 10 },
                  labelBgStyle: { fill: '#1a1b26' },
                  // Auto-detected FK is typically N:1 (many rows reference one)
                  markerStart: 'url(#crowfoot-many-gray)',
                  markerEnd: 'url(#erd-one-gray)'
                })
              }
            }
          })
        }
      })
    })
    
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
      await text2sqlApi.updateTableDescription(tableName, 'public', description)
      
      // Update local data
      const table = allTables.value.find(t => t.name === tableName)
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
      await text2sqlApi.updateColumnDescription(tableName, columnName, 'public', description)
      
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
    selectedNodeId.value = null
    selectedTable.value = null
    isDetailPanelOpen.value = false
  }
  
  // Auto-load related tables
  async function loadRelatedTables(tableName: string) {
    const columns = tableColumnsCache.value[tableName] || []
    
    for (const col of columns) {
      if (col.name.endsWith('_id') && col.name !== 'id') {
        const baseName = col.name.replace(/_id$/, '')
        const possibleTargets = [baseName, baseName + 's', baseName.replace(/s$/, '')]
        
        const relatedTable = allTables.value.find(t => 
          possibleTargets.includes(t.name.toLowerCase())
        )
        
        if (relatedTable && !nodes.value.some(n => n.data?.tableName === relatedTable.name)) {
          await addTableToCanvas(relatedTable)
        }
      }
    }
    
    // Also find tables that reference this table
    for (const otherTable of allTables.value) {
      if (otherTable.name === tableName) continue
      
      const otherColumns = tableColumnsCache.value[otherTable.name] || await loadTableColumns(otherTable.name)
      
      for (const col of otherColumns) {
        if (col.name.endsWith('_id')) {
          const baseName = col.name.replace(/_id$/, '')
          const possibleTargets = [baseName, baseName + 's', baseName.replace(/s$/, '')]
          
          if (possibleTargets.includes(tableName.toLowerCase())) {
            if (!nodes.value.some(n => n.data?.tableName === otherTable.name)) {
              await addTableToCanvas(otherTable)
            }
            break
          }
        }
      }
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
    
    // Computed
    filteredTables,
    tablesOnCanvas,
    tablesNotOnCanvas,
    
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
    updateEdgesFromRelationships,
    addRelationship,
    addRelationshipWithCardinality,
    removeRelationship,
    updateTableDescription,
    updateColumnDescription,
    clearCanvas,
    loadRelatedTables,
    setDataSource
  }
})

