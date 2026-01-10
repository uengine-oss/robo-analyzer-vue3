<script setup lang="ts">
import { ref, onMounted, provide, computed, markRaw } from 'vue'
import { VueFlow, useVueFlow, type Connection, type NodeChange } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import TableNode from './nodes/TableNode.vue'
import TableDetailPanel from './TableDetailPanel.vue'
import CardinalityModal, { type ConnectionInfo, type Cardinality } from './CardinalityModal.vue'
import { useSchemaCanvasStore } from '@/stores/schemaCanvas'
import type { Text2SqlTableInfo } from '@/types'
import { IconTable, IconSearch, IconRefresh, IconTrash, IconZoomIn, IconZoomOut, IconMaximize, IconLink, IconFolder, IconChevronRight } from '@/components/icons'

const store = useSchemaCanvasStore()
const isDragOver = ref(false)
const searchQuery = ref('')
const isConnecting = ref(false)

// 스키마 폴더 확장 상태
const expandedSchemas = ref<Record<string, boolean>>({
  public: true  // 기본적으로 public 스키마는 펼쳐서 표시
})

function toggleSchema(schema: string) {
  expandedSchemas.value[schema] = !expandedSchemas.value[schema]
}

// Cardinality Modal State
const isCardinalityModalOpen = ref(false)
const pendingConnection = ref<ConnectionInfo | null>(null)

// Edge Delete Modal State
const isEdgeDeleteModalOpen = ref(false)
const pendingDeleteEdge = ref<{
  id: string
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  label: string
} | null>(null)

const { fitView, zoomIn, zoomOut } = useVueFlow()

// Node types - using markRaw to prevent Vue from making the component reactive
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: Record<string, any> = {
  tableNode: markRaw(TableNode)
}

// MiniMap node color
function getNodeColor() {
  return '#228be6'
}

// Computed
const nodesWithSelection = computed(() => {
  return store.nodes.map(node => ({
    ...node,
    class: store.selectedNodeId === node.id ? 'table-node--selected' : ''
  }))
})

// 엣지에 애니메이션 클래스 적용
const edgesWithAnimation = computed(() => {
  return store.edges.map(edge => {
    // 새로 추가된 엣지 감지
    const isNewEdge = store.newlyAddedEdges.has(edge.id) || 
      (edge.data?.source && edge.data?.target && 
       store.newlyAddedEdges.has(`${edge.data.fromTable}.${edge.data.source}->${edge.data.toTable}.${edge.data.target}`))
    
    return {
      ...edge,
      class: isNewEdge ? 'edge-newly-added' : '',
      animated: isNewEdge || edge.animated
    }
  })
})

// Provide handlers to child nodes
provide('onRemoveTable', (tableName: string) => {
  store.removeTableFromCanvas(tableName)
})

provide('onLoadRelated', async (tableName: string) => {
  await store.loadRelatedTables(tableName)
  setTimeout(() => fitView({ padding: 0.3 }), 150)
})

// Lifecycle
onMounted(async () => {
  await store.loadAllTables()
  await store.loadUserRelationships()
})

// Handlers
let semanticSearchTimeout: ReturnType<typeof setTimeout> | null = null

function handleSearch() {
  store.searchQuery = searchQuery.value
  
  // 시멘틱 검색 디바운스 (500ms 후 실행)
  if (semanticSearchTimeout) {
    clearTimeout(semanticSearchTimeout)
  }
  
  if (searchQuery.value.trim().length >= 2) {
    semanticSearchTimeout = setTimeout(() => {
      store.performSemanticSearch(searchQuery.value)
    }, 500)
  } else {
    store.clearSemanticSearch()
  }
}

function clearSearch() {
  searchQuery.value = ''
  store.searchQuery = ''
  store.clearSemanticSearch()
  if (semanticSearchTimeout) {
    clearTimeout(semanticSearchTimeout)
  }
}

async function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false
  
  const data = event.dataTransfer?.getData('application/json')
  if (!data) return
  
  try {
    const { table } = JSON.parse(data)
    
    // Get drop position relative to canvas
    const bounds = (event.target as HTMLElement).getBoundingClientRect()
    const position = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    }
    
    await store.addTableToCanvas(table, position)
    setTimeout(() => fitView({ padding: 0.3 }), 150)
  } catch (error) {
    console.error('Failed to handle drop:', error)
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = true
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleDragLeave() {
  isDragOver.value = false
}

function startDragTable(event: DragEvent, table: Text2SqlTableInfo) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify({ table }))
    event.dataTransfer.effectAllowed = 'copy'
  }
}

// 테이블 더블클릭 - 캔버스에 추가
async function handleTableDoubleClick(table: Text2SqlTableInfo) {
  console.log('[SchemaCanvas] 🖱️ 테이블 더블클릭:', table.name)
  await store.addTableToCanvas(table)
  setTimeout(() => fitView({ padding: 0.3 }), 150)
}

// 시멘틱 검색 결과 드래그
function startDragSemanticResult(event: DragEvent, result: { name: string; schema: string; description: string }) {
  const table: Text2SqlTableInfo = {
    name: result.name,
    schema: result.schema,
    description: result.description,
    column_count: 0
  }
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify({ table }))
    event.dataTransfer.effectAllowed = 'copy'
  }
}

// 시멘틱 검색 결과 더블클릭으로 캔버스에 추가
async function addSemanticResultToCanvas(result: { name: string; schema: string; description: string }) {
  const table: Text2SqlTableInfo = {
    name: result.name,
    schema: result.schema,
    description: result.description,
    column_count: 0
  }
  await store.addTableToCanvas(table)
  setTimeout(() => fitView({ padding: 0.3 }), 150)
}

function onNodesChange(changes: NodeChange[]) {
  changes.forEach(change => {
    if (change.type === 'position' && 'id' in change && change.position) {
      store.updateNodePosition(change.id, change.position)
    }
  })
}

function onNodeClick(event: { node: { id: string } }) {
  store.selectNode(event.node.id)
}

function onNodeDoubleClick(event: { node: { id: string } }) {
  store.selectNode(event.node.id)
}

function onPaneClick() {
  store.clearSelection()
}

// Edge double click - 삭제 확인 다이얼로그 표시
function onEdgeDoubleClick(event: { edge: { id: string; label?: string; source: string; target: string; sourceHandle?: string; targetHandle?: string } }) {
  const edge = event.edge
  
  // 엣지 정보 파싱
  const fromTable = edge.source.replace('table-', '')
  const toTable = edge.target.replace('table-', '')
  
  // sourceHandle에서 컬럼명 추출 (fk-COLUMN_NAME-source 형식)
  let fromColumn = ''
  if (edge.sourceHandle) {
    const match = edge.sourceHandle.match(/^fk-(.+)-source$/)
    if (match) {
      fromColumn = match[1]
    }
  }
  
  // targetHandle에서 컬럼명 추출 (pk-COLUMN_NAME 형식)
  let toColumn = ''
  if (edge.targetHandle) {
    const match = edge.targetHandle.match(/^pk-(.+?)(-right)?$/)
    if (match) {
      toColumn = match[1]
    }
  }
  
  // 라벨에서 컬럼 정보 추출 시도 (COLUMN → COLUMN 형식)
  if ((!fromColumn || !toColumn) && edge.label) {
    const labelStr = typeof edge.label === 'string' ? edge.label : ''
    const labelMatch = labelStr.match(/^(.+?)\s*→\s*(.+)$/)
    if (labelMatch) {
      if (!fromColumn) fromColumn = labelMatch[1].trim()
      if (!toColumn) toColumn = labelMatch[2].trim()
    }
  }
  
  pendingDeleteEdge.value = {
    id: edge.id,
    fromTable,
    fromColumn,
    toTable,
    toColumn,
    label: typeof edge.label === 'string' ? edge.label : `${fromTable} → ${toTable}`
  }
  isEdgeDeleteModalOpen.value = true
}

// 엣지 삭제 확인
async function confirmDeleteEdge() {
  if (!pendingDeleteEdge.value) return
  
  try {
    const { fromTable, fromColumn, toTable, toColumn } = pendingDeleteEdge.value
    
    // API 호출하여 관계 삭제
    await store.removeRelationship({
      from_table: fromTable,
      from_schema: 'public',  // 기본 스키마
      from_column: fromColumn,
      to_table: toTable,
      to_schema: 'public',
      to_column: toColumn,
      relationship_type: 'FK_TO_TABLE'
    })
    
    // 캔버스에서 엣지 제거
    store.edges = store.edges.filter(e => e.id !== pendingDeleteEdge.value?.id)
    
    console.log(`[SchemaCanvas] Edge deleted: ${fromTable}.${fromColumn} → ${toTable}.${toColumn}`)
  } catch (error) {
    console.error('[SchemaCanvas] Failed to delete edge:', error)
    alert('관계 삭제에 실패했습니다.')
  } finally {
    isEdgeDeleteModalOpen.value = false
    pendingDeleteEdge.value = null
  }
}

// 엣지 삭제 취소
function cancelDeleteEdge() {
  isEdgeDeleteModalOpen.value = false
  pendingDeleteEdge.value = null
}

// Handle edge connection - show cardinality modal
function onConnect(connection: Connection) {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
    return
  }
  
  const fromTable = connection.source.replace('table-', '')
  const toTable = connection.target.replace('table-', '')
  
  // Parse column from handle ID
  let fromColumn = connection.sourceHandle
  if (fromColumn.startsWith('fk-')) {
    fromColumn = fromColumn.replace('fk-', '').replace('-source', '')
  } else if (fromColumn.startsWith('col-')) {
    fromColumn = fromColumn.replace('col-', '').replace('-out', '')
  }
  
  let toColumn = connection.targetHandle
  if (toColumn.startsWith('pk-')) {
    toColumn = toColumn.replace('pk-', '').replace('-right', '')
  } else if (toColumn.startsWith('col-')) {
    toColumn = toColumn.replace('col-', '').replace('-out', '')
  }
  
  // Store pending connection and show modal
  pendingConnection.value = {
    fromTable,
    fromColumn,
    toTable,
    toColumn
  }
  isCardinalityModalOpen.value = true
}

// Handle cardinality modal confirmation
async function handleCardinalityConfirm(cardinality: Cardinality, description: string) {
  if (!pendingConnection.value) return
  
  const { fromTable, fromColumn, toTable, toColumn } = pendingConnection.value
  
  // Create description with cardinality
  const fullDescription = description 
    ? `[${cardinality}] ${description}`
    : `[${cardinality}] ${fromTable}.${fromColumn} → ${toTable}.${toColumn}`
  
  try {
    isConnecting.value = true
    await store.addRelationshipWithCardinality({
      from_table: fromTable,
      from_schema: 'public',
      from_column: fromColumn,
      to_table: toTable,
      to_schema: 'public',
      to_column: toColumn,
      description: fullDescription,
      cardinality
    })
    
    isCardinalityModalOpen.value = false
    pendingConnection.value = null
  } catch (error) {
    console.error('Failed to create relationship:', error)
    alert('릴레이션 생성에 실패했습니다.')
  } finally {
    isConnecting.value = false
  }
}

function handleCardinalityModalClose() {
  isCardinalityModalOpen.value = false
  pendingConnection.value = null
}

function onConnectStart() {
  isConnecting.value = true
}

function onConnectEnd() {
  isConnecting.value = false
}

async function handleAddTopTables() {
  for (const table of store.tablesNotOnCanvas.slice(0, 10)) {
    await store.addTableToCanvas(table)
  }
  setTimeout(() => fitView({ padding: 0.3 }), 200)
}

async function handleAddAllTables() {
  // 전체 테이블 보기 모드 활성화
  store.setFullViewMode(true)
  await store.addAllTablesToCanvas()
  setTimeout(() => fitView({ padding: 0.2 }), 300)
}

function handleClearCanvas() {
  if (confirm('캔버스를 비우시겠습니까?')) {
    store.clearCanvas()
  }
}

async function handleRefresh() {
  await store.loadAllTables()
  await store.loadUserRelationships()
}
</script>

<template>
  <div class="schema-canvas">
    <!-- Left Panel: Table List -->
    <aside class="left-panel">
      <div class="panel-header">
        <div class="panel-title">
          <IconTable :size="16" />
          <span>테이블</span>
          <span class="panel-count">{{ store.allTables.length }}</span>
        </div>
        <button class="panel-action" @click="handleRefresh" title="새로고침">
          <IconRefresh :size="14" />
        </button>
      </div>
      
      <!-- Data Source Selector -->
      <div class="data-source-selector">
        <label>
          <input 
            type="radio" 
            value="robo"
            :checked="store.dataSource === 'robo'"
            @change="() => store.setDataSource('robo')"
          />
          <span>Neo4j (분석결과)</span>
        </label>
        <label>
          <input 
            type="radio" 
            value="text2sql"
            :checked="store.dataSource === 'text2sql'"
            @change="() => store.setDataSource('text2sql')"
          />
          <span>PostgreSQL</span>
        </label>
      </div>
      
      <!-- Search -->
      <div class="search-box">
        <IconSearch :size="14" />
        <input 
          v-model="searchQuery"
          @input="handleSearch"
          type="text" 
          placeholder="테이블 검색..."
        />
        <button v-if="searchQuery" class="search-clear" @click="clearSearch">×</button>
      </div>
      
      <!-- 시멘틱 검색 결과 섹션 -->
      <div v-if="searchQuery && store.dataSource === 'robo'" class="semantic-search-section">
        <!-- 시멘틱 검색 중 표시 -->
        <div v-if="store.isSemanticSearching" class="semantic-loading">
          <span class="semantic-spinner"></span>
          <span>의미 기반 검색 중...</span>
        </div>
        
        <!-- 시멘틱 검색 결과 -->
        <template v-else-if="store.semanticSearchResults.length > 0">
          <div class="section-header semantic-header">
            <span>🔮 의미 기반 추천</span>
            <span class="section-count">{{ store.semanticSearchResults.length }}</span>
          </div>
          <div class="semantic-results">
            <div 
              v-for="result in store.semanticSearchResults" 
              :key="`semantic-${result.name}`"
              class="semantic-result-item"
              draggable="true"
              @dragstart="(e) => startDragSemanticResult(e, result)"
              @dblclick="addSemanticResultToCanvas(result)"
            >
              <div class="semantic-result-header">
                <IconTable :size="14" class="table-icon" />
                <span class="semantic-result-name">{{ result.name }}</span>
                <span class="similarity-badge">{{ Math.round(result.similarity * 100) }}%</span>
              </div>
              <div v-if="result.description" class="semantic-result-desc">
                {{ result.description.substring(0, 80) }}...
              </div>
            </div>
          </div>
        </template>
        
        <!-- 시멘틱 검색 에러 -->
        <div v-else-if="store.semanticSearchError" class="semantic-error">
          ⚠️ {{ store.semanticSearchError }}
        </div>
      </div>
      
      <!-- Tables on Canvas -->
      <div v-if="store.tablesOnCanvas.length > 0" class="table-section">
        <div class="section-header">
          <span>캔버스에 있는 테이블</span>
          <span class="section-count">{{ store.tablesOnCanvas.length }}</span>
        </div>
        <div class="table-list">
          <div 
            v-for="tableName in store.tablesOnCanvas" 
            :key="tableName"
            class="table-item table-item--on-canvas"
            @click="store.selectNode(`table-${tableName}`)"
          >
            <IconTable :size="14" class="table-item__icon" />
            <span class="table-item__name">{{ tableName }}</span>
            <button 
              class="table-item__remove"
              @click.stop="store.removeTableFromCanvas(tableName)"
              title="캔버스에서 제거"
            >×</button>
          </div>
        </div>
      </div>
      
      <!-- 텍스트 검색 결과 (searchQuery가 있을 때만 표시) -->
      <div v-if="searchQuery && store.filteredTables.length > 0" class="table-section text-search-results">
        <div class="section-header search-results-header">
          <span>🔍 검색 결과</span>
          <span class="section-count">{{ store.tablesNotOnCanvas.length }}</span>
        </div>
        <div class="table-list">
          <div 
            v-for="table in store.tablesNotOnCanvas" 
            :key="`search-${table.name}`"
            class="table-item table-item--search-result"
            draggable="true"
            @dragstart="(e) => startDragTable(e, table)"
            @dblclick="handleTableDoubleClick(table)"
          >
            <IconTable :size="14" class="table-item__icon" />
            <div class="table-item__info">
              <span class="table-item__name">{{ table.name }}</span>
              <span class="table-item__schema">{{ table.schema }}</span>
            </div>
            <div v-if="table.description" class="table-item__desc" :title="table.description">
              {{ table.description.slice(0, 50) }}{{ table.description.length > 50 ? '...' : '' }}
            </div>
          </div>
        </div>
      </div>
      
      <!-- Available Tables (Schema Tree) - 검색어가 없을 때만 표시 -->
      <div v-else class="table-section table-section--scrollable">
        <div class="section-header">
          <span>사용 가능한 테이블</span>
          <span class="section-count">{{ store.tablesNotOnCanvas.length }}</span>
        </div>
        <div class="schema-tree">
          <!-- 스키마별 폴더 -->
          <div 
            v-for="schema in store.schemas" 
            :key="schema"
            class="schema-folder"
          >
            <!-- 스키마 헤더 (클릭 시 토글) -->
            <div 
              class="schema-header"
              :class="{ 'schema-header--expanded': expandedSchemas[schema] }"
              @click="toggleSchema(schema)"
            >
              <IconChevronRight 
                :size="12" 
                class="schema-chevron"
                :class="{ 'schema-chevron--expanded': expandedSchemas[schema] }"
              />
              <IconFolder :size="14" class="schema-icon" />
              <span class="schema-name">{{ schema }}</span>
              <span class="schema-count">{{ store.tablesBySchema[schema]?.length || 0 }}</span>
            </div>
            
            <!-- 스키마 내 테이블 목록 -->
            <div v-if="expandedSchemas[schema]" class="schema-tables">
              <div 
                v-for="table in store.tablesBySchema[schema] || []" 
                :key="table.name"
                class="table-item"
                draggable="true"
                @dragstart="(e) => startDragTable(e, table)"
                @dblclick="handleTableDoubleClick(table)"
              >
                <IconTable :size="14" class="table-item__icon" />
                <div class="table-item__info">
                  <span class="table-item__name">{{ table.name }}</span>
                  <span class="table-item__cols">{{ table.column_count }} cols</span>
                  <span v-if="table.description" class="table-item__desc" :title="table.description">
                    {{ table.description.slice(0, 30) }}{{ table.description.length > 30 ? '...' : '' }}
                  </span>
                </div>
                <div class="table-item__drag-hint">⋮⋮</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Quick Actions -->
      <div class="panel-footer">
        <button 
          v-if="store.tablesNotOnCanvas.length > 0"
          class="btn btn--secondary btn--sm btn--block"
          @click="handleAddTopTables"
        >
          상위 10개 테이블 추가
        </button>
        <button 
          v-if="store.allTables.length > 0"
          class="btn btn--primary btn--sm btn--block"
          :disabled="store.loading"
          @click="handleAddAllTables"
          style="margin-top: 8px;"
        >
          {{ store.loading ? '로딩 중...' : '📊 전체 테이블 보기' }}
        </button>
      </div>
    </aside>
    
    <!-- Main Canvas -->
    <main 
      class="canvas-area"
      :class="{ 'drop-zone-active': isDragOver }"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
    >
      <!-- Empty State -->
      <div v-if="store.nodes.length === 0" class="canvas-empty">
        <div class="canvas-empty__icon">
          <IconTable :size="64" />
        </div>
        <div class="canvas-empty__text">캔버스가 비어 있습니다</div>
        <div class="canvas-empty__hint">
          왼쪽에서 테이블을 드래그하거나 더블클릭하여 추가하세요
        </div>
      </div>
      
      <!-- VueFlow Canvas -->
      <VueFlow
        v-else
        :nodes="nodesWithSelection"
        :edges="edgesWithAnimation"
        :node-types="nodeTypes"
        :default-viewport="{ zoom: 0.8, x: 50, y: 50 }"
        :min-zoom="0.2"
        :max-zoom="2"
        :snap-to-grid="true"
        :snap-grid="[15, 15]"
        :nodes-draggable="true"
        :nodes-connectable="true"
        :pan-on-drag="true"
        :zoom-on-scroll="true"
        :prevent-scrolling="true"
        :connect-on-click="false"
        :default-edge-options="{ type: 'smoothstep', animated: true }"
        fit-view-on-init
        @nodes-change="onNodesChange"
        @node-click="onNodeClick"
        @node-double-click="onNodeDoubleClick"
        @pane-click="onPaneClick"
        @edge-double-click="onEdgeDoubleClick"
        @connect="onConnect"
        @connect-start="onConnectStart"
        @connect-end="onConnectEnd"
      >
        <!-- Custom ERD Markers -->
        <template #connection-line="{ sourceX, sourceY, targetX, targetY }">
          <path
            :d="`M${sourceX},${sourceY} C ${sourceX + 50},${sourceY} ${targetX - 50},${targetY} ${targetX},${targetY}`"
            fill="none"
            stroke="#40c057"
            stroke-width="2"
            stroke-dasharray="5,5"
          />
        </template>
        
        <!-- SVG Defs for ERD Markers -->
        <svg style="position: absolute; width: 0; height: 0;">
          <defs>
            <!-- Crow's Foot (Many) Marker -->
            <marker
              id="crowfoot-many"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="12"
              markerHeight="12"
              orient="auto-start-reverse"
            >
              <path d="M 0,10 L 18,0 M 0,10 L 18,10 M 0,10 L 18,20" 
                    fill="none" stroke="#228be6" stroke-width="2" stroke-linecap="round"/>
            </marker>
            
            <!-- One Marker -->
            <marker
              id="erd-one"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="10"
              markerHeight="10"
              orient="auto-start-reverse"
            >
              <line x1="16" y1="2" x2="16" y2="18" stroke="#228be6" stroke-width="2" stroke-linecap="round"/>
            </marker>
            
            <!-- One Marker (Green for 1:1) -->
            <marker
              id="erd-one-green"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="10"
              markerHeight="10"
              orient="auto-start-reverse"
            >
              <line x1="16" y1="2" x2="16" y2="18" stroke="#40c057" stroke-width="2" stroke-linecap="round"/>
            </marker>
            
            <!-- Crow's Foot (Many) Marker - Purple for N:N -->
            <marker
              id="crowfoot-many-purple"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="12"
              markerHeight="12"
              orient="auto-start-reverse"
            >
              <path d="M 0,10 L 18,0 M 0,10 L 18,10 M 0,10 L 18,20" 
                    fill="none" stroke="#be4bdb" stroke-width="2" stroke-linecap="round"/>
            </marker>
            
            <!-- Gray markers for auto-detected FK -->
            <marker
              id="crowfoot-many-gray"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="12"
              markerHeight="12"
              orient="auto-start-reverse"
            >
              <path d="M 0,10 L 18,0 M 0,10 L 18,10 M 0,10 L 18,20" 
                    fill="none" stroke="#868e96" stroke-width="2" stroke-linecap="round"/>
            </marker>
            
            <marker
              id="erd-one-gray"
              viewBox="0 0 20 20"
              refX="18"
              refY="10"
              markerWidth="10"
              markerHeight="10"
              orient="auto-start-reverse"
            >
              <line x1="16" y1="2" x2="16" y2="18" stroke="#868e96" stroke-width="2" stroke-linecap="round"/>
            </marker>
          </defs>
        </svg>
        
        <Background pattern-color="#2a2a3a" :gap="20" />
        <Controls position="bottom-left" />
        <MiniMap 
          :node-color="getNodeColor"
          :node-stroke-width="3"
          pannable
          zoomable
        />
      </VueFlow>
      
      <!-- Connection Mode Indicator -->
      <div v-if="isConnecting" class="connection-indicator">
        🔗 릴레이션 연결 중...
      </div>
      
      <!-- Canvas Toolbar -->
      <div v-if="store.nodes.length > 0" class="canvas-toolbar">
        <button class="canvas-toolbar__btn" @click="zoomIn()" title="Zoom In">
          <IconZoomIn :size="18" />
        </button>
        <button class="canvas-toolbar__btn" @click="zoomOut()" title="Zoom Out">
          <IconZoomOut :size="18" />
        </button>
        <button class="canvas-toolbar__btn" @click="fitView({ padding: 0.3 })" title="Fit View">
          <IconMaximize :size="18" />
        </button>
        <div class="canvas-toolbar__divider"></div>
        <button class="canvas-toolbar__btn" @click="store.updateEdgesFromRelationships()" title="릴레이션 새로고침">
          <IconLink :size="18" />
        </button>
        <button class="canvas-toolbar__btn canvas-toolbar__btn--danger" @click="handleClearCanvas" title="캔버스 비우기">
          <IconTrash :size="18" />
        </button>
      </div>
      
      <!-- Legend -->
      <div class="canvas-legend">
        <div class="legend-title">FK 관계 범례</div>
        
        <!-- DDL 기반 FK (실선, 초록색) -->
        <label class="legend-item legend-item--checkbox">
          <input 
            type="checkbox" 
            :checked="store.fkVisibility.ddl" 
            @change="store.toggleFkVisibility('ddl')"
            class="legend-checkbox"
          />
          <span class="legend-line legend-line--ddl"></span>
          <span class="legend-label">DDL 정의 FK</span>
        </label>
        
        <!-- 프로시저 분석 FK (점선, 하늘색) -->
        <label class="legend-item legend-item--checkbox">
          <input 
            type="checkbox" 
            :checked="store.fkVisibility.procedure" 
            @change="store.toggleFkVisibility('procedure')"
            class="legend-checkbox"
          />
          <span class="legend-line legend-line--procedure"></span>
          <span class="legend-label">프로시저 분석 FK</span>
        </label>
        
        <!-- 사용자 추가 FK (실선, 주황색) -->
        <label class="legend-item legend-item--checkbox">
          <input 
            type="checkbox" 
            :checked="store.fkVisibility.user" 
            @change="store.toggleFkVisibility('user')"
            class="legend-checkbox"
          />
          <span class="legend-line legend-line--user"></span>
          <span class="legend-label">사용자 추가 FK</span>
        </label>
        
        <div class="legend-divider"></div>
        <div class="legend-tip">
          💡 컬럼 핸들을 드래그하여 릴레이션 연결
        </div>
        <div class="legend-tip">
          🖱️ 테이블 더블클릭으로 상세 편집
        </div>
      </div>
    </main>
    
    <!-- Right Panel: Table Details -->
    <TableDetailPanel />
    
    <!-- Cardinality Modal -->
    <CardinalityModal
      :is-open="isCardinalityModalOpen"
      :connection="pendingConnection"
      @close="handleCardinalityModalClose"
      @confirm="handleCardinalityConfirm"
    />
    
    <!-- Edge Delete Confirmation Modal -->
    <Teleport to="body">
      <div v-if="isEdgeDeleteModalOpen" class="edge-delete-modal-overlay" @click.self="cancelDeleteEdge">
        <div class="edge-delete-modal">
          <div class="edge-delete-modal__header">
            <span class="edge-delete-modal__icon">🗑️</span>
            <h3>릴레이션 삭제</h3>
          </div>
          <div class="edge-delete-modal__body">
            <p>다음 릴레이션을 삭제하시겠습니까?</p>
            <div class="edge-delete-modal__info">
              <div class="edge-delete-modal__table">
                <span class="edge-delete-modal__label">From:</span>
                <span class="edge-delete-modal__value">{{ pendingDeleteEdge?.fromTable }}.{{ pendingDeleteEdge?.fromColumn }}</span>
              </div>
              <div class="edge-delete-modal__arrow">→</div>
              <div class="edge-delete-modal__table">
                <span class="edge-delete-modal__label">To:</span>
                <span class="edge-delete-modal__value">{{ pendingDeleteEdge?.toTable }}.{{ pendingDeleteEdge?.toColumn }}</span>
              </div>
            </div>
          </div>
          <div class="edge-delete-modal__actions">
            <button class="edge-delete-modal__btn edge-delete-modal__btn--cancel" @click="cancelDeleteEdge">
              취소
            </button>
            <button class="edge-delete-modal__btn edge-delete-modal__btn--delete" @click="confirmDeleteEdge">
              삭제
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
/* VueFlow imports */
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';
@import '@vue-flow/minimap/dist/style.css';

/* VueFlow overrides */
.vue-flow {
  background: var(--color-bg, #1a1b26) !important;
}

.vue-flow__minimap {
  background: var(--color-bg-secondary, #25262b) !important;
  border: 1px solid var(--color-border, #373a40) !important;
  border-radius: var(--radius-lg, 8px) !important;
}

.vue-flow__controls {
  background: var(--color-bg-secondary, #25262b) !important;
  border: 1px solid var(--color-border, #373a40) !important;
  border-radius: var(--radius-lg, 8px) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
}

.vue-flow__controls-button {
  background: transparent !important;
  border: none !important;
  color: var(--color-text, #c1c2c5) !important;
}

.vue-flow__controls-button:hover {
  background: var(--color-bg-tertiary, #373a40) !important;
}

.vue-flow__controls-button svg {
  fill: var(--color-text, #c1c2c5) !important;
}

.vue-flow__edge-textbg {
  fill: var(--color-bg, #1a1b26) !important;
}

.vue-flow__edge-text {
  fill: var(--color-text, #c1c2c5) !important;
}

.vue-flow__node.table-node--selected {
  z-index: 10 !important;
}

.vue-flow__edge-path {
  stroke-width: 2 !important;
}

.vue-flow__edge.animated path {
  stroke-dasharray: 5 !important;
  animation: flowEdge 0.5s linear infinite !important;
}

@keyframes flowEdge {
  to {
    stroke-dashoffset: -10;
  }
}

.vue-flow__connection-line {
  stroke: var(--color-accent, #228be6) !important;
  stroke-width: 2 !important;
  stroke-dasharray: 5 !important;
}

.vue-flow__handle:hover {
  background: var(--color-accent, #228be6) !important;
  transform: scale(1.5) !important;
}

/* 새로 추가된 엣지 애니메이션 */
.vue-flow__edge.edge-newly-added path {
  stroke: #51cf66 !important;
  stroke-width: 3 !important;
  animation: edge-draw 1s ease-out forwards, edge-pulse 0.8s ease-in-out 3;
  filter: drop-shadow(0 0 6px rgba(81, 207, 102, 0.6));
}

.vue-flow__edge.edge-newly-added .vue-flow__edge-text {
  animation: label-appear 0.5s ease-out 0.5s forwards;
  opacity: 0;
}

@keyframes edge-draw {
  0% {
    stroke-dasharray: 1000;
    stroke-dashoffset: 1000;
  }
  100% {
    stroke-dasharray: 1000;
    stroke-dashoffset: 0;
  }
}

@keyframes edge-pulse {
  0%, 100% {
    stroke-width: 3px;
    filter: drop-shadow(0 0 6px rgba(81, 207, 102, 0.6));
  }
  50% {
    stroke-width: 5px;
    filter: drop-shadow(0 0 12px rgba(81, 207, 102, 0.9));
  }
}

@keyframes label-appear {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>

<style scoped lang="scss">
.schema-canvas {
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--color-bg);
  overflow: hidden;
}

/* Left Panel */
.left-panel {
  width: 280px;
  min-width: 260px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-bright);
  
  svg {
    color: var(--color-accent);
  }
}

.panel-count {
  font-size: 0.7rem;
  padding: 2px 8px;
  background: var(--color-bg);
  border-radius: 10px;
  color: var(--color-text-light);
}

.panel-action {
  background: none;
  border: none;
  color: var(--color-text-light);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-sm);
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg);
    color: var(--color-text-bright);
  }
}

/* Search */
.data-source-selector {
  display: flex;
  gap: 12px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--color-text-secondary);
    cursor: pointer;
    
    input[type="radio"] {
      margin: 0;
      accent-color: var(--color-primary);
    }
    
    &:hover {
      color: var(--color-text);
    }
  }
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  
  svg {
    color: var(--color-text-muted);
    flex-shrink: 0;
  }
  
  input {
    flex: 1;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 0.85rem;
    outline: none;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
  }
}

.search-clear {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 1rem;
  
  &:hover {
    color: var(--color-text-bright);
  }
}

/* 시멘틱 검색 섹션 */
.semantic-search-section {
  border-bottom: 1px solid var(--color-border);
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(34, 139, 230, 0.1) 100%);
}

.semantic-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  font-size: 0.8rem;
  color: var(--color-text-light);
  
  .semantic-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.semantic-header {
  background: rgba(124, 58, 237, 0.15);
  color: #a78bfa;
}

.semantic-results {
  max-height: 200px;
  overflow-y: auto;
}

.semantic-result-item {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(124, 58, 237, 0.15);
  cursor: grab;
  transition: background 0.15s;
  
  &:hover {
    background: rgba(124, 58, 237, 0.2);
  }
  
  &:last-child {
    border-bottom: none;
  }
}

.semantic-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  
  .table-icon {
    color: #a78bfa;
  }
}

.semantic-result-name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.similarity-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 10px;
  background: linear-gradient(135deg, #7c3aed, #3b82f6);
  color: white;
}

.semantic-result-desc {
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--color-text-light);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.semantic-error {
  padding: 10px 16px;
  font-size: 0.8rem;
  color: var(--color-warning);
}

/* Table Section */
.table-section {
  padding: 8px;
  
  &--scrollable {
    flex: 1;
    overflow-y: auto;
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.section-count {
  font-size: 0.65rem;
  padding: 1px 6px;
  background: var(--color-bg);
  border-radius: 8px;
  color: var(--color-text-light);
}

/* Table List */
.table-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.table-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--color-bg-tertiary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: grab;
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg);
    border-color: var(--color-accent-light);
  }
  
  &:active {
    cursor: grabbing;
  }
  
  &--on-canvas {
    background: rgba(34, 139, 230, 0.15);
    border-color: rgba(34, 139, 230, 0.3);
    cursor: pointer;
    
    &:hover {
      background: rgba(34, 139, 230, 0.25);
    }
  }
}

.table-item__icon {
  color: var(--color-accent);
}

.table-item__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.table-item__name {
  font-size: 0.85rem;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-item__cols {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.table-item__desc {
  font-size: 0.65rem;
  color: var(--color-text-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-style: italic;
}

.table-item__schema {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  margin-left: 6px;
  opacity: 0.7;
}

/* 텍스트 검색 결과 스타일 */
.text-search-results {
  max-height: 300px;
  overflow-y: auto;
  border-bottom: 1px solid var(--color-border);
}

.search-results-header {
  background: linear-gradient(135deg, var(--color-accent), var(--color-accent-hover));
  color: white;
  
  span:first-child {
    font-weight: 600;
  }
}

.table-item--search-result {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border-left: 3px solid var(--color-accent);
  
  &:hover {
    background: var(--color-bg-hover);
    border-left-color: var(--color-success);
  }
  
  .table-item__info {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  
  .table-item__desc {
    width: 100%;
    font-size: 0.7rem;
    opacity: 0.8;
  }
}

.table-item__drag-hint {
  color: var(--color-text-muted);
  opacity: 0;
  transition: opacity 0.15s;
  font-size: 0.8rem;
}

.table-item:hover .table-item__drag-hint {
  opacity: 1;
}

// ============================================================================
// 스키마 트리 스타일
// ============================================================================

.schema-tree {
  display: flex;
  flex-direction: column;
}

.schema-folder {
  display: flex;
  flex-direction: column;
}

.schema-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
  user-select: none;
  
  &:hover {
    background: var(--color-bg-elevated);
  }
  
  &--expanded {
    .schema-icon {
      color: var(--color-accent);
    }
  }
}

.schema-chevron {
  color: var(--color-text-muted);
  transition: transform 0.2s;
  flex-shrink: 0;
  
  &--expanded {
    transform: rotate(90deg);
  }
}

.schema-icon {
  color: var(--color-text-light);
  flex-shrink: 0;
}

.schema-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
  flex: 1;
}

.schema-count {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: 10px;
}

.schema-tables {
  display: flex;
  flex-direction: column;
  padding-left: 12px;
  margin-left: 8px;
  border-left: 1px solid var(--color-border);
  
  .table-item {
    margin-left: 0;
    padding-left: 8px;
  }
}

.table-item__remove {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: all 0.15s;
  font-size: 1rem;
  
  .table-item:hover & {
    opacity: 1;
  }
  
  &:hover {
    background: var(--color-error);
    color: white;
  }
}

/* Panel Footer */
.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
}

/* Canvas Area */
.canvas-area {
  flex: 1;
  position: relative;
  background: var(--color-bg);
  overflow: hidden;
  
  &.drop-zone-active {
    background: rgba(34, 139, 230, 0.1);
    
    &::after {
      content: '';
      position: absolute;
      inset: 16px;
      border: 2px dashed var(--color-accent);
      border-radius: var(--radius-lg);
      pointer-events: none;
      z-index: 100;
    }
  }
}

/* Canvas Empty */
.canvas-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: var(--color-text-muted);
  
  &__icon {
    margin-bottom: 16px;
    opacity: 0.3;
    
    svg {
      color: var(--color-text-muted);
    }
  }
  
  &__text {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--color-text-light);
    margin-bottom: 8px;
  }
  
  &__hint {
    font-size: 0.9rem;
  }
}

/* Connection Indicator */
.connection-indicator {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, var(--color-accent) 0%, #7c3aed 100%);
  color: white;
  padding: 8px 20px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
  box-shadow: 0 4px 16px rgba(34, 139, 230, 0.4);
  z-index: 100;
  animation: pulse-indicator 1.5s infinite;
}

@keyframes pulse-indicator {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Canvas Toolbar */
.canvas-toolbar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  background: var(--color-bg-secondary);
  padding: 6px;
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  border: 1px solid var(--color-border);
  z-index: 10;
  
  &__btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.15s;
    
    &:hover {
      background: var(--color-bg);
      color: var(--color-text-bright);
    }
    
    &--danger:hover {
      background: var(--color-error);
      color: white;
    }
  }
  
  &__divider {
    width: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }
}

/* Canvas Legend */
.canvas-legend {
  position: absolute;
  top: 16px;
  right: 16px;
  background: var(--color-bg-secondary);
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10;
}

.legend-title {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--color-text-light);
  margin-bottom: 4px;
  
  &--checkbox {
    cursor: pointer;
    padding: 4px 0;
    transition: opacity 0.2s ease;
    
    &:hover {
      opacity: 0.8;
    }
  }
}

.legend-checkbox {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--color-accent);
  flex-shrink: 0;
}

.legend-line {
  width: 28px;
  height: 3px;
  border-radius: 2px;
  flex-shrink: 0;
  
  &--ddl {
    background: #22c55e;  // 초록색 실선
  }
  
  &--procedure {
    // 하늘색 점선
    background: repeating-linear-gradient(
      to right,
      #38bdf8 0px,
      #38bdf8 5px,
      transparent 5px,
      transparent 9px
    );
  }
  
  &--user {
    background: #f59e0b;  // 주황색 실선
  }
}

.legend-label {
  font-size: 0.72rem;
  white-space: nowrap;
}

.legend-color {
  width: 20px;
  height: 3px;
  border-radius: 2px;
  
  &--dashed {
    background: repeating-linear-gradient(
      to right,
      var(--color-text-muted) 0px,
      var(--color-text-muted) 4px,
      transparent 4px,
      transparent 8px
    );
  }
}

.legend-divider {
  height: 1px;
  background: var(--color-border);
  margin: 8px 0;
}

.legend-tip {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin-bottom: 4px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

/* Edge Delete Modal */
.edge-delete-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.edge-delete-modal {
  background: var(--color-bg-secondary, #2c2e33);
  border: 1px solid var(--color-border, #373a40);
  border-radius: 12px;
  padding: 24px;
  min-width: 360px;
  max-width: 450px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  
  &__header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    
    h3 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text, #c1c2c5);
    }
  }
  
  &__icon {
    font-size: 1.5rem;
  }
  
  &__body {
    margin-bottom: 24px;
    
    p {
      margin: 0 0 16px 0;
      color: var(--color-text-light, #909296);
      font-size: 0.9rem;
    }
  }
  
  &__info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--color-bg-tertiary, #25262b);
    border-radius: 8px;
    border: 1px solid var(--color-border, #373a40);
  }
  
  &__table {
    flex: 1;
    
    .edge-delete-modal__label {
      display: block;
      font-size: 0.7rem;
      color: var(--color-text-muted, #5c5f66);
      margin-bottom: 4px;
      text-transform: uppercase;
    }
    
    .edge-delete-modal__value {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--color-accent, #4dabf7);
      font-family: var(--font-mono, monospace);
    }
  }
  
  &__arrow {
    font-size: 1.2rem;
    color: var(--color-text-muted, #5c5f66);
  }
  
  &__actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
  
  &__btn {
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    
    &--cancel {
      background: var(--color-bg-tertiary, #373a40);
      color: var(--color-text-light, #909296);
      
      &:hover {
        background: var(--color-bg, #25262b);
      }
    }
    
    &--delete {
      background: #ef4444;
      color: white;
      
      &:hover {
        background: #dc2626;
      }
    }
  }
}
</style>

