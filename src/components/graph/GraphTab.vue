<script setup lang="ts">
/**
 * GraphTab.vue
 * 그래프 및 UML 다이어그램 탭 컴포넌트
 * 
 * 주요 기능:
 * - Neo4j NVL 그래프 시각화
 * - UML 다이어그램 생성 및 표시
 * - 클래스/인터페이스 검색
 * - 노드 상세 패널
 * - 콘솔 로그 표시
 */

import { ref, computed, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { storeToRefs } from 'pinia'
import NvlGraph from './NvlGraph.vue'
import NodeDetailPanel from './NodeDetailPanel.vue'
import MermaidDiagram from '../convert/MermaidDiagram.vue'
import type { GraphNode } from '@/types'

// ============================================================================
// Store 연결
// ============================================================================

const projectStore = useProjectStore()
const { 
  graphData, 
  isProcessing, 
  currentStep, 
  sourceType,
  diagramState,
  graphMessages
} = storeToRefs(projectStore)

// ============================================================================
// 상수 정의
// ============================================================================

/** 패널 최소 너비 */
const MIN_PANEL_WIDTH = 280

/** 패널 최대 너비 */
const MAX_PANEL_WIDTH = 600

/** 검색 결과 최대 표시 개수 */
const MAX_SEARCH_RESULTS = 8

/** 클래스/인터페이스 라벨 목록 */
const CLASS_LABELS = ['Class', 'CLASS', 'Interface', 'INTERFACE']

// ============================================================================
// 상태 - UI 제어
// ============================================================================

/** 서브 탭: 그래프 또는 UML */
const activeView = ref<'graph' | 'uml'>('graph')

/** 노드 상세 패널 표시 여부 */
const showNodePanel = ref(true)

/** 콘솔 패널 표시 여부 */
const showConsole = ref(true)

/** 콘솔 패널 높이 */
const consoleHeight = ref(180)

/** 노드 상세 패널 너비 */
const panelWidth = ref(380)

/** 패널 리사이즈 중 여부 */
const isResizing = ref(false)

// ============================================================================
// 상태 - 데이터
// ============================================================================

/** 검색 쿼리 */
const searchQuery = ref('')

/** 선택된 노드 */
const selectedNode = ref<GraphNode | null>(null)

/** NvlGraph 컴포넌트 참조 */
const nvlGraphRef = ref<InstanceType<typeof NvlGraph> | null>(null)

// ============================================================================
// Computed - 파생 상태
// ============================================================================

/** 현재 상태 타입 (UI 표시용) */
const statusType = computed(() => {
  if (!currentStep.value) return 'idle'
  
  const step = currentStep.value.toLowerCase()
  if (step.includes('에러') || step.includes('실패') || step.includes('error')) return 'error'
  if (step.includes('완료') || step.includes('complete')) return 'success'
  if (isProcessing.value) return 'processing'
  
  return 'idle'
})

/** 그래프 데이터 존재 여부 */
const hasGraph = computed(() => 
  graphData.value?.nodes.length > 0
)

/** UML 탭 표시 조건 (java/python 소스만) */
const showUmlTab = computed(() => 
  sourceType.value === 'java' || sourceType.value === 'python'
)

/** UML 다이어그램 존재 여부 */
const hasUmlDiagram = computed(() => 
  Boolean(diagramState.value?.diagram)
)

/** 클래스/인터페이스 노드 검색 결과 */
const filteredNodes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!graphData.value || !query) return []
  
  return graphData.value.nodes.filter(node => {
    // 클래스/인터페이스만 검색
    const labels = node.labels || []
    if (!labels.some(label => CLASS_LABELS.includes(label))) return false
    
    // name 또는 class_name으로 검색
    const name = ((node.properties?.name as string) || '').toLowerCase()
    const className = ((node.properties?.class_name as string) || '').toLowerCase()
    
    return name.includes(query) || className.includes(query)
  })
})

// ============================================================================
// 패널 리사이즈 핸들러
// ============================================================================

function startResize(e: MouseEvent): void {
  isResizing.value = true
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  e.preventDefault()
}

function onResize(e: MouseEvent): void {
  if (!isResizing.value) return
  
  const newWidth = window.innerWidth - e.clientX
  panelWidth.value = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth))
}

function stopResize(): void {
  isResizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 타임스탬프를 시간 문자열로 포맷
 */
function formatTime(timestamp: string): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString('ko-KR', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  })
}

/**
 * 노드에서 시스템명 추출
 */
function getSystemName(node: GraphNode): string {
  return (node.properties?.system_name as string) || ''
}

/**
 * 노드에서 클래스명 추출
 */
function getClassName(node: GraphNode): string {
  return (node.properties?.class_name as string)
    || (node.properties?.name as string)
    || ''
}

// ============================================================================
// 이벤트 핸들러 - 노드 선택
// ============================================================================

/**
 * 노드 선택 핸들러
 */
function handleNodeSelect(node: GraphNode | null): void {
  selectedNode.value = node
  if (node) showNodePanel.value = true
}

/**
 * 노드 더블클릭 핸들러
 */
function handleNodeDoubleClick(node: GraphNode): void {
  selectedNode.value = node
  showNodePanel.value = true
}

// ============================================================================
// 이벤트 핸들러 - 검색 및 다이어그램
// ============================================================================

/**
 * 검색 결과 선택 핸들러
 */
function handleSearchSelect(node: GraphNode): void {
  selectedNode.value = node
  
  // UML 뷰에서 검색 시 다이어그램 확장
  if (activeView.value === 'uml') {
    const className = getClassName(node)
    const systemName = getSystemName(node)
    
    if (!className) {
      alert('클래스명을 찾을 수 없습니다.')
      return
    }
    
    if (!systemName) {
      alert(`시스템명(system_name)을 찾을 수 없습니다.\n클래스: ${className}`)
      return
    }
    
    handleDiagramExpand(`${systemName}/${className}`)
    searchQuery.value = ''
  }
}

/**
 * 아키텍처 다이어그램 생성 핸들러
 */
async function handleRunArchitecture(classNames: string[]): Promise<void> {
  try {
    await projectStore.generateDiagram(classNames)
    activeView.value = 'uml'
  } catch (error) {
    alert(`다이어그램 생성 실패: ${error}`)
  }
}

/**
 * 다이어그램 확장 핸들러
 */
function handleDiagramExpand(className: string): void {
  projectStore.expandDiagram(className)
}

// ============================================================================
// 워처
// ============================================================================

// 그래프 생성 시 패널 자동 열기
watch(hasGraph, (has, prev) => {
  if (has && !prev) showNodePanel.value = true
})
</script>

<template>
  <div class="graph-tab">
    <!-- ========== 서브 탭 ========== -->
    <div class="view-tabs">
      <button 
        class="view-tab"
        :class="{ active: activeView === 'graph' }"
        @click="activeView = 'graph'"
      >
        <span>🔗</span> 그래프
        <span class="badge" v-if="hasGraph">{{ graphData?.nodes.length }}</span>
      </button>
      <button 
        class="view-tab"
        :class="{ active: activeView === 'uml', disabled: !showUmlTab }"
        :disabled="!showUmlTab"
        @click="activeView = 'uml'"
      >
        <span>📊</span> UML
        <span class="badge success" v-if="hasUmlDiagram">✓</span>
      </button>
    </div>
    
    <!-- ========== 메인 컨텐츠 ========== -->
    <div class="main-content">
      <!-- 그래프 뷰 -->
      <div class="graph-area" v-show="activeView === 'graph'">
        <template v-if="hasGraph">
          <NvlGraph 
            ref="nvlGraphRef"
            :graphData="graphData!"
            :selectedNodeId="selectedNode?.id"
            @node-select="handleNodeSelect"
            @node-double-click="handleNodeDoubleClick"
          />
          <div class="floating-info">
            <span>노드 {{ graphData?.nodes.length }}</span>
            <span>관계 {{ graphData?.links.length }}</span>
          </div>
        </template>
        <template v-else>
          <div class="empty-state">
            <div class="empty-icon">🔗</div>
            <h3>그래프 데이터가 없습니다</h3>
            <p>업로드 탭에서 파일을 업로드하고 Understanding을 실행하세요</p>
          </div>
        </template>
      </div>
      
      <!-- UML 뷰 -->
      <div class="uml-area" v-show="activeView === 'uml'">
        <!-- 검색창 -->
        <div class="search-box">
          <input 
            v-model="searchQuery"
            placeholder="🔍 클래스명 검색..."
          />
          <div class="search-results" v-if="searchQuery && filteredNodes.length > 0">
            <button 
              v-for="node in filteredNodes.slice(0, MAX_SEARCH_RESULTS)" 
              :key="node.id"
              @click="handleSearchSelect(node)"
            >
              <span class="tag">{{ node.labels?.[0] }}</span>
              {{ node.properties?.name || node.id }}
            </button>
          </div>
        </div>
        
        <!-- 다이어그램 영역 -->
        <div class="diagram-view" v-if="hasUmlDiagram">
          <div class="diagram-canvas">
            <MermaidDiagram 
              :diagram="diagramState.diagram"
              @class-click="handleDiagramExpand"
            />
          </div>
        </div>
        <div class="empty-state" v-else>
          <div class="empty-icon">📊</div>
          <h3>UML 다이어그램이 없습니다</h3>
          <p>노드를 선택하고 "다이어그램 생성"을 클릭하세요</p>
        </div>
      </div>
    </div>
    
    <!-- ========== 하단 콘솔 패널 ========== -->
    <div 
      class="console-panel"
      :class="{ collapsed: !showConsole }"
      :style="{ height: showConsole ? `${consoleHeight}px` : '44px' }"
    >
      <div class="console-header" @click="showConsole = !showConsole">
        <div class="console-title">
          <span class="console-icon" :class="statusType"></span>
          <span>콘솔</span>
          <span class="message-count" v-if="graphMessages.length">{{ graphMessages.length }}</span>
        </div>
        <div class="console-actions">
          <button class="console-toggle">
            {{ showConsole ? '▼' : '▲' }}
          </button>
        </div>
      </div>
      
      <div class="console-body" v-show="showConsole">
        <div class="log-entries">
          <div 
            v-for="(msg, idx) in graphMessages" 
            :key="idx"
            class="log-entry"
            :class="msg.type"
          >
            <span class="log-time">{{ formatTime(msg.timestamp) }}</span>
            <span class="log-icon" v-if="msg.type === 'error'">❌</span>
            <span class="log-icon" v-else-if="msg.type === 'message'">💬</span>
            <span class="log-text">{{ msg.content }}</span>
          </div>
          <div class="log-empty" v-if="graphMessages.length === 0">
            로그가 없습니다
          </div>
        </div>
      </div>
    </div>
    
    <!-- ========== 우측 노드 상세 패널 ========== -->
    <Transition name="slide">
      <div 
        v-if="showNodePanel && hasGraph"
        class="node-panel" 
        :class="{ resizing: isResizing }"
        :style="{ width: `${panelWidth}px` }"
      >
        <div class="resize-handle" @mousedown="startResize"></div>
        
        <div class="node-panel-header">
          <h3>{{ selectedNode ? 'Node properties' : 'Overview' }}</h3>
          <button class="close-btn" @click="showNodePanel = false">✕</button>
        </div>
        
        <div class="node-panel-body">
          <NodeDetailPanel 
            :node="selectedNode"
            :nodeStats="nvlGraphRef?.nodeStats"
            :relationshipStats="nvlGraphRef?.relationshipStats"
            :totalNodes="graphData?.nodes.length || 0"
            :totalRelationships="graphData?.links.length || 0"
            @run-architecture="handleRunArchitecture"
          />
        </div>
      </div>
    </Transition>
    
    <!-- 노드 패널 열기 버튼 -->
    <button 
      v-if="hasGraph && !showNodePanel"
      class="open-node-btn"
      @click="showNodePanel = true"
    >
      📋 {{ selectedNode ? ((selectedNode.properties?.name as string) || selectedNode.labels?.[0]) : '통계 보기' }}
    </button>
  </div>
</template>

<style lang="scss" scoped>
// ============================================================================
// 레이아웃
// ============================================================================

.graph-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  background: var(--color-bg-secondary);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.graph-area,
.uml-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: var(--color-bg-primary);
}

// ============================================================================
// 서브 탭
// ============================================================================

.view-tabs {
  display: flex;
  gap: 4px;
  padding: 10px 16px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.view-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover:not(.disabled) {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }
  
  &.active {
    background: var(--color-accent-primary);
    color: white;
    
    .badge {
      background: rgba(239, 246, 255, 0.95);
      color: #1d4ed8;
    }
  }
  
  &.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  
  .badge {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--color-bg-tertiary);
    border-radius: 10px;
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
  }
}

// ============================================================================
// 플로팅 정보
// ============================================================================

.floating-info {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  gap: 12px;
  padding: 8px 14px;
  background: var(--color-bg-elevated);
  backdrop-filter: blur(8px);
  border-radius: 20px;
  border: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
  z-index: 10;
  box-shadow: var(--shadow-md);
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
  text-align: center;
  color: var(--color-text-muted);
  
  .empty-icon {
    font-size: 56px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 16px;
    color: var(--color-text-secondary);
    margin-bottom: 8px;
    font-weight: 500;
  }
  
  p {
    font-size: 13px;
    max-width: 280px;
  }
}

// ============================================================================
// UML 검색
// ============================================================================

.search-box {
  position: absolute;
  top: 16px;
  left: 16px;
  right: 16px;
  z-index: 20;
  
  input {
    width: 100%;
    padding: 10px 16px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text-primary);
    font-size: 13px;
    box-shadow: var(--shadow-md);
    
    &:focus {
      outline: none;
      border-color: var(--color-accent-primary);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }
    
    &::placeholder {
      color: var(--color-text-muted);
    }
  }
  
  .search-results {
    margin-top: 8px;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    overflow: hidden;
    max-height: 280px;
    overflow-y: auto;
    box-shadow: var(--shadow-lg);
    
    button {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 14px;
      background: transparent;
      border: none;
      text-align: left;
      color: var(--color-text-primary);
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
      
      &:hover {
        background: var(--color-bg-tertiary);
      }
      
      .tag {
        font-size: 10px;
        padding: 2px 6px;
        background: var(--color-accent-primary);
        color: white;
        border-radius: 4px;
        text-transform: uppercase;
        font-weight: 600;
      }
    }
  }
}

// ============================================================================
// 다이어그램 뷰
// ============================================================================

.diagram-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin: 56px 12px 12px;
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  min-height: 300px;
}

.diagram-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  height: 100%;
}

// ============================================================================
// 하단 콘솔 패널
// ============================================================================

.console-panel {
  flex-shrink: 0;
  background: #eff6ff;
  border-top: 2px solid #bfdbfe;
  display: flex;
  flex-direction: column;
  transition: height 0.25s ease;
  overflow: hidden;
  
  &.collapsed {
    height: 44px !important;
    
    .console-body {
      display: none;
    }
  }
}

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  height: 44px;
  min-height: 44px;
  background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid #bfdbfe;
  
  &:hover {
    background: linear-gradient(135deg, #bfdbfe 0%, #dbeafe 100%);
  }
}

.console-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #1e40af;
  
  .console-icon {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #60a5fa;
    
    &.error {
      background: #ef4444;
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
    }
    
    &.processing {
      background: #3b82f6;
      box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
      animation: pulse 1.5s infinite;
    }
    
    &.success {
      background: #22c55e;
      box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
    }
  }
  
  .message-count {
    font-size: 11px;
    padding: 2px 10px;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
    border-radius: 12px;
    font-family: var(--font-mono);
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.25);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.console-actions {
  .console-toggle {
    width: 28px;
    height: 28px;
    background: #ffffff;
    border: 1px solid #93c5fd;
    border-radius: 6px;
    color: #3b82f6;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
    
    &:hover {
      background: #dbeafe;
      color: #1d4ed8;
      border-color: #60a5fa;
    }
  }
}

.console-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.log-entries {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}

.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 16px;
  color: #475569;
  transition: background 0.15s;
  
  &:hover {
    background: rgba(0, 0, 0, 0.02);
  }
  
  &.error {
    color: #b91c1c;
    background: rgba(239, 68, 68, 0.08);
    border-left: 3px solid #ef4444;
    
    .log-time {
      color: #dc2626;
    }
  }
  
  &.message {
    color: #1e293b;
  }
  
  .log-time {
    color: #94a3b8;
    flex-shrink: 0;
    min-width: 70px;
  }
  
  .log-icon {
    flex-shrink: 0;
  }
  
  .log-text {
    flex: 1;
    word-break: break-word;
  }
}

.log-empty {
  padding: 32px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

// ============================================================================
// 우측 노드 패널
// ============================================================================

.node-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 380px;
  background: #ffffff;
  border-left: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.08);
  
  &.resizing {
    user-select: none;
  }
}

.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  background: transparent;
  transition: background 0.15s;
  z-index: 10;
  
  &:hover {
    background: rgba(59, 130, 246, 0.3);
  }
  
  &:active {
    background: rgba(59, 130, 246, 0.5);
  }
}

.node-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
  
  h3 {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    display: flex;
    align-items: center;
    gap: 8px;
    
    &::before {
      content: '📋';
      font-size: 14px;
    }
  }
  
  .close-btn {
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    color: #9ca3af;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
    
    &:hover {
      background: #fef2f2;
      color: #ef4444;
      border-color: #fecaca;
    }
  }
}

.node-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
}

// ============================================================================
// 트랜지션
// ============================================================================

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease, opacity 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

// ============================================================================
// 노드 패널 열기 버튼
// ============================================================================

.open-node-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  padding: 8px 14px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-accent-primary);
  border-radius: 8px;
  color: var(--color-accent-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  z-index: 50;
  box-shadow: var(--shadow-md);
  transition: all 0.15s;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  
  &:hover {
    background: var(--color-accent-primary);
    color: white;
  }
}
</style>
