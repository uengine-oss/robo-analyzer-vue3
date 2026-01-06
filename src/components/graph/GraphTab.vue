<script setup lang="ts">
/**
 * GraphTab.vue
 * 그래프 및 UML 다이어그램 탭 - 개선된 플로팅 UI
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { storeToRefs } from 'pinia'
import NvlGraph from './NvlGraph.vue'
import NodeDetailPanel from './NodeDetailPanel.vue'
import NodeStylePanel from './NodeStylePanel.vue'
import VueFlowClassDiagram from './VueFlowClassDiagram.vue'
import SchemaView from '../text2sql/SchemaView.vue'
import { getClassName, getDirectory, CLASS_LABELS } from '@/utils/classDiagram'
import type { GraphNode, GraphLink } from '@/types'
import { useResize } from '@/composables/useResize'

const projectStore = useProjectStore()
const { 
  graphData, 
  isProcessing, 
  currentStep, 
  sourceType,
  consoleMessages
} = storeToRefs(projectStore)

const MAX_SEARCH_RESULTS = 8

const activeView = ref<'graph' | 'uml' | 'schema'>('graph')
const showNodePanel = ref(false)
const showConsole = ref(false)
const showSearch = ref(false)

// 노드 패널 리사이즈
const { value: panelWidth, isResizing: isPanelResizing, startResize: startPanelResize } = useResize({
  direction: 'horizontal',
  initialValue: 300,
  min: 200,
  max: 600,
  fromEnd: true
})

// 콘솔 리사이즈
const { value: consoleHeight, isResizing: isConsoleResizing, startResize: startConsoleResize } = useResize({
  direction: 'vertical',
  initialValue: 200,
  min: 100,
  max: 600,
  fromEnd: true
})

const searchQuery = ref('')
const selectedNode = ref<GraphNode | null>(null)
const selectedRelationship = ref<GraphLink | null>(null)
const selectedNodeType = ref<string | null>(null)
const stylePanelTop = ref<number>(0)
const nvlGraphRef = ref<InstanceType<typeof NvlGraph> | null>(null)
const selectedClasses = ref<Array<{ className: string; directory: string }>>([])

// 설정에서 값 가져오기 (localStorage 또는 기본값)
const umlDepth = ref(3)
const nodeLimit = ref(500)

// localStorage에서 값 로드 (안전하게)
try {
  const savedUmlDepth = localStorage.getItem('umlDepth')
  if (savedUmlDepth) {
    const parsed = parseInt(savedUmlDepth)
    if (!isNaN(parsed)) umlDepth.value = parsed
  }
  const savedNodeLimit = localStorage.getItem('nodeLimit')
  if (savedNodeLimit) {
    const parsed = parseInt(savedNodeLimit)
    if (!isNaN(parsed)) nodeLimit.value = parsed
  }
} catch (e) {
  // localStorage 접근 불가 시 기본값 사용
  console.warn('localStorage 접근 실패:', e)
}

// 설정 변경 이벤트 리스너
function handleUmlDepthChange(event: Event) {
  const customEvent = event as CustomEvent
  umlDepth.value = customEvent.detail
}

function handleNodeLimitChange(event: Event) {
  const customEvent = event as CustomEvent
  nodeLimit.value = customEvent.detail
}

onMounted(() => {
  window.addEventListener('umlDepthChange', handleUmlDepthChange)
  window.addEventListener('nodeLimitChange', handleNodeLimitChange)
})

onUnmounted(() => {
  window.removeEventListener('umlDepthChange', handleUmlDepthChange)
  window.removeEventListener('nodeLimitChange', handleNodeLimitChange)
})

const statusType = computed(() => {
  if (!currentStep.value) return 'idle'
  const step = currentStep.value.toLowerCase()
  if (step.includes('에러') || step.includes('실패') || step.includes('error')) return 'error'
  if (step.includes('완료') || step.includes('complete')) return 'success'
  if (isProcessing.value) return 'processing'
  return 'idle'
})

const hasGraph = computed(() => graphData.value?.nodes.length > 0)
const showUmlTab = computed(() => sourceType.value === 'java' || sourceType.value === 'python')
const showSchemaTab = computed(() => true) // 스키마 탭은 항상 활성화

const displayedRelationshipsCount = computed(() => 
  nvlGraphRef.value?.displayedRelationshipCount?.() ?? 0
)

// 로그가 있을 때 자동으로 콘솔 표시
watch(consoleMessages, (messages) => {
  if (messages.length > 0 && !showConsole.value) {
    showConsole.value = true
  }
}, { immediate: true })

const filteredNodes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!graphData.value || !query) return []
  
  return graphData.value.nodes.filter(node => {
    const labels = node.labels || []
    if (!labels.some(label => CLASS_LABELS.includes(label))) return false
    
    const name = ((node.properties?.name as string) || '').toLowerCase()
    const className = ((node.properties?.class_name as string) || '').toLowerCase()
    
    return name.includes(query) || className.includes(query)
  })
})

function formatTime(timestamp: string): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString('ko-KR', { 
    hour: '2-digit', minute: '2-digit', second: '2-digit' 
  })
}

function handleNodeSelect(node: GraphNode | null): void {
  selectedNode.value = node
  selectedRelationship.value = null
  selectedNodeType.value = null
  stylePanelTop.value = 0
  if (node) showNodePanel.value = true
}

function handleRelationshipSelect(relationship: GraphLink | null): void {
  selectedRelationship.value = relationship
  selectedNode.value = null
  selectedNodeType.value = null
  stylePanelTop.value = 0
  if (relationship) showNodePanel.value = true
}

function handleNodeTypeSelect(nodeType: string, topOffset: number): void {
  selectedNodeType.value = nodeType
  selectedNode.value = null
  stylePanelTop.value = topOffset
  showNodePanel.value = true
}

function handleStylePanelClose(): void {
  selectedNodeType.value = null
  stylePanelTop.value = 0
}

function handleSearchSelect(node: GraphNode): void {
  // 관계와 타입 선택을 먼저 초기화 (명시적으로)
  selectedRelationship.value = null
  selectedNodeType.value = null
  stylePanelTop.value = 0
  
  // 노드 선택
  selectedNode.value = node
  showNodePanel.value = true
  
  const directory = getDirectory(node)
  const className = getClassName(node)
  
  if (!directory || !className) return
  
  if (activeView.value === 'uml') {
    const exists = selectedClasses.value.some(
      c => c.className === className && c.directory === directory
    )
    if (!exists) {
      selectedClasses.value = [...selectedClasses.value, { className, directory }]
    }
  }
  
  searchQuery.value = ''
  showSearch.value = false
}

function handleVueFlowClassClick(nodeId: string): void {
  // 클릭한 노드의 ID로 직접 찾기 (우회 없이)
  const node = graphData.value?.nodes.find(n => n.id === nodeId)
  if (node) {
    selectedNode.value = node
    selectedRelationship.value = null  // 관계 선택 초기화
    selectedNodeType.value = null
    showNodePanel.value = true
  }
}

function handleVueFlowClassExpand(className: string, directory: string): void {
  const exists = selectedClasses.value.some(
    c => c.className === className && c.directory === directory
  )
  if (!exists) {
    selectedClasses.value = [...selectedClasses.value, { className, directory }]
  }
}

function clearSelectedClasses(): void {
  selectedClasses.value = []
}

function removeSelectedClass(className: string, directory: string): void {
  selectedClasses.value = selectedClasses.value.filter(
    c => !(c.className === className && c.directory === directory)
  )
}

function handleStyleUpdated(): void {
  nvlGraphRef.value?.updateNodeStyles()
}

function handleNodeDelete(nodeId: string): void {
  // Store의 deleteNodeAndRelationships 메서드 사용
  projectStore.deleteNodeAndRelationships(nodeId)
  
  // 선택된 노드가 삭제된 경우 선택 해제
  if (selectedNode.value?.id === nodeId) {
    selectedNode.value = null
  }
}

function handleNodeExpand(nodeId: string): void {
  if (!nvlGraphRef.value) return
  nvlGraphRef.value.expandNodeChildren(nodeId)
}

watch(hasGraph, (has, prev) => {
  if (has && !prev) showNodePanel.value = true
})


</script>

<template>
  <div class="graph-tab">
    <!-- 메인 콘텐츠 -->
    <div class="content-area">
      <div class="view-container" v-show="activeView === 'graph'">
        <template v-if="hasGraph">
          <NvlGraph 
            ref="nvlGraphRef"
            :graphData="graphData!"
            :selectedNodeId="selectedNode?.id"
            :selectedRelationshipId="selectedRelationship?.id"
            :maxNodes="nodeLimit"
            @node-select="handleNodeSelect"
            @relationship-select="handleRelationshipSelect"
            @node-delete="handleNodeDelete"
            @node-expand="handleNodeExpand"
          />
          
        </template>
        <template v-else>
          <div class="empty-state">
            <div class="empty-icon">📈</div>
            <h3>그래프 데이터가 없습니다</h3>
            <p>업로드 탭에서 파일을 업로드하고 분석을 실행하세요</p>
          </div>
        </template>
      </div>
      
      <div class="view-container" v-show="activeView === 'uml'">
        <VueFlowClassDiagram
          :graph-nodes="graphData?.nodes || []"
          :graph-links="graphData?.links || []"
          :selected-classes="selectedClasses"
          :depth="umlDepth"
          @class-click="handleVueFlowClassClick"
          @class-expand="handleVueFlowClassExpand"
          @relationship-select="handleRelationshipSelect"
        />
      </div>
      
      <div class="view-container" v-show="activeView === 'schema'">
        <SchemaView />
      </div>
      
      <!-- 플로팅: 우측 패널 토글 -->
      <button 
        v-if="!showNodePanel"
        class="panel-toggle right"
        @click="showNodePanel = !showNodePanel"
      >
        ‹
      </button>
    </div>
    
    <!-- 플로팅: 좌측 상단 컨트롤 -->
    <div class="floating-controls left-top">
      <div class="view-switcher">
        <button 
          :class="{ active: activeView === 'graph' }"
          @click="activeView = 'graph'"
        >
          Graph
        </button>
        <button 
          :class="{ active: activeView === 'uml', disabled: !showUmlTab }"
          :disabled="!showUmlTab"
          @click="activeView = 'uml'"
        >
          UML
        </button>
        <button 
          :class="{ active: activeView === 'schema', disabled: !showSchemaTab }"
          :disabled="!showSchemaTab"
          @click="activeView = 'schema'"
        >
          스키마
        </button>
      </div>
      
      <template v-if="activeView === 'uml'">
        <button class="control-btn" @click="showSearch = !showSearch" title="클래스 명 검색">
          🔍
        </button>
      </template>
      
      <div class="search-panel" v-if="showSearch && activeView === 'uml'">
        <input 
          v-model="searchQuery"
          placeholder="클래스 명 검색..."
          @keyup.escape="showSearch = false"
          autofocus
        />
        <div class="search-results" v-if="searchQuery && filteredNodes.length > 0">
          <button 
            v-for="node in filteredNodes.slice(0, MAX_SEARCH_RESULTS)" 
            :key="node.id"
            @click="handleSearchSelect(node)"
          >
            <span class="tag">{{ node.labels?.[0] }}</span>
            <span class="node-info">
              <span class="node-name">{{ node.properties?.name || node.properties?.class_name || node.id }}</span>
              <span class="node-dir" v-if="getDirectory(node)">{{ getDirectory(node) }}</span>
            </span>
          </button>
        </div>
      </div>
      
      <div class="selected-tags" v-if="activeView === 'uml' && selectedClasses.length > 0">
        <span v-for="cls in selectedClasses" :key="`${cls.directory}::${cls.className}`" class="tag">
          {{ cls.className }}
          <button @click="removeSelectedClass(cls.className, cls.directory)">✕</button>
        </span>
        <button class="clear-btn" @click="clearSelectedClasses">지우기</button>
      </div>
      
    </div>
    
    <!-- 플로팅: 노드 패널 -->
    <Transition name="slide-right">
      <div 
        class="floating-panel right" 
        v-if="showNodePanel" 
        :style="{ width: `${panelWidth}px` }"
      >
        <div class="panel-header">
          <span>{{ selectedNode ? 'Node' : selectedRelationship ? 'Relationship' : 'Overview' }}</span>
          <button @click="showNodePanel = false">›</button>
        </div>
        <div class="panel-body">
          <NodeDetailPanel 
            :node="selectedNode"
            :relationship="selectedRelationship"
            :nodeStats="nvlGraphRef?.nodeStats"
            :relationshipStats="nvlGraphRef?.relationshipStats"
            :totalNodes="graphData?.nodes.length || 0"
            :totalRelationships="graphData?.links.length || 0"
            :displayedNodes="nvlGraphRef?.nodeCount?.() || graphData?.nodes.length || 0"
            :displayedRelationships="displayedRelationshipsCount"
            :hiddenNodes="nvlGraphRef?.hiddenNodeCount?.() ?? 0"
            :isProcessing="isProcessing"
            :isLimitApplied="nvlGraphRef?.isLimitApplied?.() ?? false"
            :maxDisplayNodes="nodeLimit"
            @node-type-select="handleNodeTypeSelect"
            @style-updated="handleStyleUpdated"
          />
        </div>
        <!-- 리사이즈 핸들 -->
        <div 
          class="panel-resize-handle"
          :class="{ resizing: isPanelResizing }"
          @mousedown="startPanelResize"
        ></div>
        
        <!-- 노드 스타일 설정 패널 (노드 패널 바로 왼쪽에 배치) -->
        <Transition name="fade">
          <div 
            v-if="selectedNodeType" 
            class="style-panel-wrapper"
            :style="{ top: `${stylePanelTop}px` }"
          >
            <NodeStylePanel 
              :nodeType="selectedNodeType"
              @style-updated="handleStyleUpdated"
              @close="handleStylePanelClose"
            />
          </div>
        </Transition>
      </div>
    </Transition>
    
    <!-- 플로팅: 콘솔 토글 버튼 (콘솔이 닫혔을 때만 표시) -->
    <button 
      v-if="!showConsole"
      class="console-toggle-btn"
      :class="[statusType]"
      @click="showConsole = !showConsole"
    >
      <span class="status-dot"></span>
      콘솔
      <span class="count" v-if="consoleMessages.length">{{ consoleMessages.length }}</span>
    </button>
    
    <Transition name="slide-up">
      <div class="floating-console" v-if="showConsole" :style="{ height: `${consoleHeight}px` }">
        <div class="console-header">
          <span>콘솔</span>
          <span class="console-count" v-if="consoleMessages.length">{{ consoleMessages.length }}</span>
        </div>
        <!-- 리사이즈 핸들 -->
        <div 
          class="console-resize-handle"
          :class="{ resizing: isConsoleResizing }"
          @mousedown="startConsoleResize"
        ></div>
        <div class="console-content">
          <div 
            v-for="(msg, idx) in consoleMessages" 
            :key="idx"
            class="log-item"
            :class="msg.type"
          >
            <span class="time">{{ formatTime(msg.timestamp) }}</span>
            <span class="text">{{ msg.content }}</span>
          </div>
          <div class="log-empty" v-if="consoleMessages.length === 0">
            로그가 없습니다
          </div>
        </div>
        <!-- 콘솔 닫기 버튼 (하단 중앙) -->
        <button class="console-close-btn-bottom" @click="showConsole = false">
          <span class="arrow">▼</span>
        </button>
      </div>
    </Transition>
    
  </div>
</template>

<style lang="scss" scoped>
// ============================================================================
// 기본 레이아웃 (명확한 구분)
// ============================================================================

.graph-tab {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
  background: var(--color-bg);
}

.content-area {
  flex: 1;
  display: flex;
  position: relative;
}

.view-container {
  position: absolute;
  inset: 0;
  background: #1e1e2e;
  overflow: visible;
}

// ============================================================================
// 노드 스타일 설정 패널
// ============================================================================

.style-panel-wrapper {
  position: absolute;
  right: 100%;
  top: 0;
  margin-right: 12px;
  z-index: 1000;
  pointer-events: none;
  transform: translateY(-50%);
  
  > * {
    pointer-events: auto;
  }
}

// ============================================================================
// 빈 상태
// ============================================================================

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-light);
  
  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 16px;
    color: var(--color-text-bright);
    margin-bottom: 6px;
    font-weight: 600;
  }
  
  p {
    font-size: 13px;
    color: var(--color-text-muted);
  }
}

// ============================================================================
// 플로팅 좌측 상단 컨트롤 (명확한 구분)
// ============================================================================

.floating-controls {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 50px;
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 100;
}

.view-switcher {
  display: flex;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
  gap: 4px;
  padding: 4px;
  
  button {
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    background: transparent;
    border: none;
    color: var(--color-text-light);
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: var(--radius-sm);
    
    &:hover:not(.disabled) {
      background: var(--color-bg-tertiary);
      color: var(--color-text);
    }
    
    &.active {
      background: var(--color-bg-tertiary);
      color: var(--color-text-bright);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }
    
    &.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 10px;
  height: 32px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  
  &:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-text-muted);
    color: var(--color-text);
  }
}


// ============================================================================
// 검색 패널
// ============================================================================

.search-panel {
  position: relative;
  
  input {
    width: 200px;
    height: 32px;
    padding: 0 10px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--color-text-bright);
    box-shadow: var(--shadow-md);
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
    }
    
    &::placeholder {
      color: var(--color-text-muted);
    }
  }
  
  .search-results {
    position: absolute;
    top: 100%;
    left: 0;
    width: 320px;
    margin-top: 4px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-lg);
    max-height: 280px;
    overflow-y: auto;
    
    button {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      background: transparent;
      border: none;
      text-align: left;
      font-size: 12px;
      color: var(--color-text);
      cursor: pointer;
      border-bottom: 1px solid var(--color-border);
      
      &:last-child {
        border-bottom: none;
      }
      
      &:hover {
        background: var(--color-bg-tertiary);
      }
      
      .tag {
        font-size: 10px;
        padding: 2px 6px;
        background: var(--color-accent);
        color: white;
        border-radius: var(--radius-sm);
        font-weight: 600;
        flex-shrink: 0;
        margin-top: 2px;
      }
      
      .node-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
        
        .node-name {
          font-weight: 500;
          color: var(--color-text-bright);
        }
        
        .node-dir {
          font-size: 10px;
          color: var(--color-text-light);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }
    }
  }
}


// ============================================================================
// 선택된 클래스 태그
// ============================================================================

.selected-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  max-width: 280px;
  
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--color-accent);
    color: white;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 500;
    
    button {
      width: 14px;
      height: 14px;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      border-radius: 50%;
      color: white;
      font-size: 9px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &:hover {
        background: rgba(255, 255, 255, 0.4);
      }
    }
  }
  
  .clear-btn {
    padding: 4px 8px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 10px;
    color: var(--color-text-light);
    cursor: pointer;
    
    &:hover {
      background: rgba(250, 82, 82, 0.15);
      border-color: var(--color-error);
      color: var(--color-error);
    }
  }
}

// ============================================================================
// 패널 토글 버튼
// ============================================================================

.panel-toggle {
  position: absolute;
  top: 8px;
  width: 32px;
  height: 32px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-light);
  cursor: pointer;
  z-index: 100;
  transition: all 0.15s;
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: center;
  justify-content: center;
  
  &.right {
    right: 8px;
    border-radius: var(--radius-sm);
  }
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text-bright);
    border-color: var(--color-text-light);
    box-shadow: var(--shadow-lg);
  }
}

// ============================================================================
// 리사이즈 핸들 공통 스타일
// ============================================================================

@mixin resize-handle-base {
  background: transparent;
  transition: background 0.15s;
  z-index: 10;
  
  &:hover {
    background: var(--color-border);
  }
  
  &.resizing {
    background: var(--color-text-light);
  }
}

// ============================================================================
// 플로팅 노드 패널
// ============================================================================

.floating-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  height: 100%;
  min-height: 200px;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  z-index: 90;
  box-shadow: var(--shadow-lg);
  
  &.right {
    right: 0;
  }
  
  .panel-resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    @include resize-handle-base;
  }
  
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--color-bg-tertiary);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    
    span {
      font-size: 12px;
      font-weight: 600;
      color: var(--color-text-bright);
    }
    
    button {
      width: 24px;
      height: 24px;
      background: transparent;
      border: none;
      color: var(--color-text-light);
      cursor: pointer;
      border-radius: var(--radius-sm);
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &:hover {
        background: var(--color-bg-elevated);
        color: var(--color-text-bright);
      }
    }
  }
  
  .panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px;
    
    // 스크롤바 스타일링
    &::-webkit-scrollbar {
      width: 6px;
    }
    
    &::-webkit-scrollbar-track {
      background: var(--color-bg-tertiary);
      border-radius: 3px;
    }
    
    &::-webkit-scrollbar-thumb {
      background: var(--color-border);
      border-radius: 3px;
      
      &:hover {
        background: var(--color-text-light);
      }
    }
  }
}

// ============================================================================
// 콘솔 토글 버튼
// ============================================================================

.console-toggle-btn {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
  box-shadow: var(--shadow-md);
  z-index: 100;
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg-tertiary);
    box-shadow: var(--shadow-lg);
  }
  
  
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-muted);
  }
  
  &.processing .status-dot {
    background: var(--color-accent);
    animation: pulse 1.5s infinite;
  }
  
  &.error .status-dot {
    background: var(--color-error);
  }
  
  &.success .status-dot {
    background: var(--color-success);
  }
  
  .count {
    padding: 2px 6px;
    background: var(--color-accent);
    color: white;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
  }
  
  .arrow {
    font-size: 10px;
    color: var(--color-text-muted);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

// ============================================================================
// 플로팅 콘솔
// ============================================================================

.floating-console {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-bg-secondary);
  border-top: 2px solid var(--color-border);
  z-index: 90;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  
  .console-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--color-bg-tertiary);
    border-bottom: 1px solid var(--color-border);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-bright);
    
    .console-count {
      padding: 2px 6px;
      background: var(--color-accent);
      color: white;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 600;
    }
    
  }
  
  .console-close-btn-bottom {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-light);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    z-index: 10;
    transition: all 0.15s;
    box-shadow: var(--shadow-md);
    
    .arrow {
      font-size: 12px;
    }
    
    &:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-bright);
      border-color: var(--color-text-light);
      box-shadow: var(--shadow-lg);
    }
  }
  
  .console-resize-handle {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    cursor: row-resize;
    z-index: 1;
    @include resize-handle-base;
  }
  
  .console-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    margin-top: 4px;
    font-family: var(--font-mono);
    font-size: 11px;
    background: var(--color-bg);
    margin-left: 4px;
    margin-right: 4px;
    margin-bottom: 4px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
  }
  
  .log-item {
    display: flex;
    gap: 10px;
    padding: 3px 0;
    color: var(--color-text);
    
    &.error {
      color: var(--color-error);
    }
    
    .time {
      color: var(--color-text-muted);
      flex-shrink: 0;
    }
  }
  
  .log-empty {
    color: var(--color-text-muted);
    text-align: center;
    padding: 16px;
  }
}

// ============================================================================
// 트랜지션
// ============================================================================

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.2s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
