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
import { IconTable, IconSearch, IconRefresh, IconTrash, IconZoomIn, IconZoomOut, IconMaximize, IconLink } from '@/components/icons'

const store = useSchemaCanvasStore()
const isDragOver = ref(false)
const searchQuery = ref('')
const isConnecting = ref(false)

// Cardinality Modal State
const isCardinalityModalOpen = ref(false)
const pendingConnection = ref<ConnectionInfo | null>(null)

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
function handleSearch() {
  store.searchQuery = searchQuery.value
}

function clearSearch() {
  searchQuery.value = ''
  store.searchQuery = ''
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
      
      <!-- Available Tables -->
      <div class="table-section table-section--scrollable">
        <div class="section-header">
          <span>사용 가능한 테이블</span>
          <span class="section-count">{{ store.tablesNotOnCanvas.length }}</span>
        </div>
        <div class="table-list">
          <div 
            v-for="table in store.tablesNotOnCanvas" 
            :key="table.name"
            class="table-item"
            draggable="true"
            @dragstart="(e) => startDragTable(e, table)"
            @dblclick="store.addTableToCanvas(table)"
          >
            <IconTable :size="14" class="table-item__icon" />
            <div class="table-item__info">
              <span class="table-item__name">{{ table.name }}</span>
              <span class="table-item__cols">{{ table.column_count }} cols</span>
            </div>
            <div class="table-item__drag-hint">⋮⋮</div>
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
        :edges="store.edges"
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
        <div class="legend-title">범례</div>
        <div class="legend-item">
          <span class="legend-color" style="background: var(--color-accent);"></span>
          <span>사용자 정의 릴레이션</span>
        </div>
        <div class="legend-item">
          <span class="legend-color legend-color--dashed"></span>
          <span>자동 감지 FK</span>
        </div>
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

.table-item__drag-hint {
  color: var(--color-text-muted);
  opacity: 0;
  transition: opacity 0.15s;
  font-size: 0.8rem;
}

.table-item:hover .table-item__drag-hint {
  opacity: 1;
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
</style>

