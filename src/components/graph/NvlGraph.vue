<script setup lang="ts">
/**
 * NvlGraph.vue
 * Neo4j NVL 기반 그래프 시각화 컴포넌트
 * 
 * 주요 기능:
 * - 배치 렌더링으로 대량 노드 처리
 * - 노드/관계 클릭 인터랙션
 * - 줌/팬/드래그 지원
 * - 노드 타입별 통계 제공
 */

import { ref, onMounted, onUnmounted, watch, shallowRef, nextTick } from 'vue'
import { NVL } from '@neo4j-nvl/base'
import { 
  ClickInteraction, 
  DragNodeInteraction, 
  PanInteraction, 
  ZoomInteraction 
} from '@neo4j-nvl/interaction-handlers'
import type { GraphData, GraphNode, NvlNode, NvlRelationship } from '@/types'
import { getNodeColor, getRelationshipColor, getNodeSize, NODE_COLORS } from '@/config/graphStyles'

// ============================================================================
// 타입 정의
// ============================================================================

interface Props {
  graphData: GraphData
  selectedNodeId?: string
}

interface NodeStat {
  count: number
  color: string
}

// ============================================================================
// 상수 설정
// ============================================================================

/** 배치당 렌더링할 노드 개수 */
const BATCH_SIZE = 20

/** 배치 간 대기 시간 (ms) */
const BATCH_INTERVAL = 1000

/** 최대 표시 노드 개수 (성능 최적화) */
const MAX_DISPLAY_NODES = 500

/** NVL 렌더러 옵션 */
const NVL_OPTIONS = {
  initialZoom: 1.0,
  disableWebWorkers: true,
  renderer: 'canvas' as const,
  relationshipLabelFontSize: 10,
  relationshipWidth: 2,
  nodeCaptionFontSize: 12,
  nodeCaptionColor: '#333333'
} as const

// ============================================================================
// Props & Emits
// ============================================================================

const props = defineProps<Props>()

const emit = defineEmits<{
  'node-select': [node: GraphNode | null]
  'node-double-click': [node: GraphNode]
}>()

// ============================================================================
// 상태 관리 - Refs
// ============================================================================

// DOM 참조
const containerRef = ref<HTMLElement>()

// NVL 인스턴스 (shallowRef로 성능 최적화)
const nvlInstance = shallowRef<NVL | null>(null)

// 초기화 상태
const isInitializing = ref(false)

// 로딩 상태
const loadingProgress = ref(0)
const isLoadingBatch = ref(false)
const pendingNodeCount = ref(0)

// 노드 limit 관련 상태
const totalNodeCount = ref(0)        // 전체 노드 수
const hiddenNodeCount = ref(0)       // 숨겨진 노드 수 (limit 초과)
const isLimitApplied = ref(false)    // limit 적용 여부

// 통계 데이터
const nodeStats = ref<Map<string, NodeStat>>(new Map())
const relationshipStats = ref<Map<string, NodeStat>>(new Map())

// ============================================================================
// 내부 데이터 구조 (반응형 불필요 - 성능 최적화)
// ============================================================================

/** 전체 노드 맵 (ID → NvlNode) */
const nodeMap = new Map<string, NvlNode>()

/** 전체 관계 맵 (ID → NvlRelationship) */
const relationshipMap = new Map<string, NvlRelationship>()

/** 렌더링 완료된 노드 ID */
const renderedNodeIds = new Set<string>()

/** 렌더링 완료된 관계 ID */
const renderedRelIds = new Set<string>()

/** 렌더링 대기 노드 큐 */
const nodeRenderQueue: NvlNode[] = []

/** 렌더링 대기 관계 큐 */
const relRenderQueue: NvlRelationship[] = []

/** 배치 타이머 ID */
let batchTimerId: ReturnType<typeof setTimeout> | null = null

/** 큐 처리 중 플래그 */
let isProcessingQueue = false

/** 업데이트 대기 플래그 (디바운싱) */
let updatePending = false

// ============================================================================
// 데이터 변환 함수
// ============================================================================

/**
 * GraphNode를 NVL 형식으로 변환
 */
function toNvlNode(node: GraphNode): NvlNode {
  const labels = node.labels || []
  const name = (node.properties?.name as string) 
    || labels[0] 
    || node.id
  
  return {
    id: node.id,
    caption: name,
    color: getNodeColor(labels),
    size: getNodeSize(labels),
    properties: { ...node.properties, labels }
  }
}

/**
 * GraphLink를 NVL Relationship 형식으로 변환
 */
function toNvlRelationship(link: GraphData['links'][0]): NvlRelationship {
  return {
    id: link.id,
    from: link.source,
    to: link.target,
    caption: link.type,
    color: getRelationshipColor(link.type),
    properties: link.properties
  }
}

/**
 * 플레이스홀더 노드 생성 (관계의 누락된 노드용)
 */
function createPlaceholderNode(nodeId: string): NvlNode {
  return {
    id: nodeId,
    caption: '...',
    color: '#808080',
    size: 15,
    properties: { labels: ['_Placeholder'], _isPlaceholder: true }
  }
}

// ============================================================================
// 통계 업데이트
// ============================================================================

/**
 * 노드 타입별 통계 업데이트
 */
function updateNodeStats(): void {
  const stats = new Map<string, NodeStat>()
  
  for (const node of nodeMap.values()) {
    const labels = (node.properties?.labels as string[]) || []
    const primaryLabel = labels[0] || '_Placeholder'
    
    if (primaryLabel === '_Placeholder') continue
    
    const existing = stats.get(primaryLabel)
    if (existing) {
      existing.count++
    } else {
      stats.set(primaryLabel, { 
        count: 1, 
        color: NODE_COLORS[primaryLabel] || NODE_COLORS[primaryLabel.toUpperCase()] || NODE_COLORS.DEFAULT 
      })
    }
  }
  
  nodeStats.value = stats
}

/**
 * 관계 타입별 통계 업데이트
 */
function updateRelationshipStats(): void {
  const stats = new Map<string, NodeStat>()
  
  for (const rel of relationshipMap.values()) {
    const type = rel.caption || 'UNKNOWN'
    const existing = stats.get(type)
    
    if (existing) {
      existing.count++
    } else {
      stats.set(type, { count: 1, color: rel.color || '#9ca3af' })
    }
  }
  
  relationshipStats.value = stats
}

// ============================================================================
// 배치 렌더링 시스템
// ============================================================================

/**
 * 관계가 렌더링 가능한지 확인 (양쪽 노드가 모두 렌더링됨)
 */
function canRenderRelationship(rel: NvlRelationship): boolean {
  return renderedNodeIds.has(rel.from) && renderedNodeIds.has(rel.to)
}

/**
 * 다음 배치 처리
 */
function processNextBatch(): void {
  if (!nvlInstance.value || nodeRenderQueue.length === 0) {
    isProcessingQueue = false
    isLoadingBatch.value = false
    pendingNodeCount.value = 0
    loadingProgress.value = 100
    return
  }
  
  isProcessingQueue = true
  isLoadingBatch.value = true
  
  // 노드 배치 추출
  const nodeBatch = nodeRenderQueue.splice(0, BATCH_SIZE)
  nodeBatch.forEach(node => renderedNodeIds.add(node.id))
  
  // 렌더링 가능한 관계 추출
  const relBatch: NvlRelationship[] = []
  const remainingRels: NvlRelationship[] = []
  
  for (const rel of relRenderQueue) {
    if (!renderedRelIds.has(rel.id) && canRenderRelationship(rel)) {
      relBatch.push(rel)
      renderedRelIds.add(rel.id)
    } else if (!renderedRelIds.has(rel.id)) {
      remainingRels.push(rel)
    }
  }
  
  relRenderQueue.length = 0
  relRenderQueue.push(...remainingRels)
  
  // NVL에 추가
  if (nodeBatch.length > 0 || relBatch.length > 0) {
    nvlInstance.value.addAndUpdateElementsInGraph(nodeBatch, relBatch)
  }
  
  // 진행률 업데이트
  const totalNodes = nodeMap.size
  loadingProgress.value = Math.round((renderedNodeIds.size / totalNodes) * 100)
  pendingNodeCount.value = nodeRenderQueue.length
  
  // 다음 배치 예약 또는 완료
  if (nodeRenderQueue.length > 0) {
    batchTimerId = setTimeout(processNextBatch, BATCH_INTERVAL)
  } else {
    isProcessingQueue = false
    isLoadingBatch.value = false
    pendingNodeCount.value = 0
  }
}

/**
 * 노드를 렌더링 큐에 추가
 */
function enqueueNodes(nodes: NvlNode[]): void {
  for (const node of nodes) {
    if (renderedNodeIds.has(node.id)) continue
    if (nodeRenderQueue.some(n => n.id === node.id)) continue
    nodeRenderQueue.push(node)
  }
  
  pendingNodeCount.value = nodeRenderQueue.length
  
  // 큐 처리 시작
  if (!isProcessingQueue && nodeRenderQueue.length > 0 && nvlInstance.value) {
    processNextBatch()
  }
}

/**
 * 관계를 렌더링 큐에 추가
 */
function enqueueRelationships(rels: NvlRelationship[]): void {
  for (const rel of rels) {
    if (renderedRelIds.has(rel.id)) continue
    if (relRenderQueue.some(r => r.id === rel.id)) continue
    relRenderQueue.push(rel)
  }
}

// ============================================================================
// 데이터 동기화
// ============================================================================

/**
 * 그래프 데이터 동기화 (props → 내부 맵, 노드 limit 적용)
 */
function syncGraphData(data: GraphData): { newNodes: NvlNode[]; newRels: NvlRelationship[] } {
  const newNodes: NvlNode[] = []
  const newRels: NvlRelationship[] = []
  
  // 전체 노드 수 저장
  totalNodeCount.value = data.nodes.length
  
  // 노드 limit 적용
  const limitedNodes = data.nodes.slice(0, MAX_DISPLAY_NODES)
  const displayedNodeIds = new Set(limitedNodes.map(n => n.id))
  
  hiddenNodeCount.value = Math.max(0, data.nodes.length - MAX_DISPLAY_NODES)
  isLimitApplied.value = data.nodes.length > MAX_DISPLAY_NODES
  
  // 노드 처리 (limit 적용)
  for (const node of limitedNodes) {
    const nvlNode = toNvlNode(node)
    const existing = nodeMap.get(node.id)
    
    if (!existing || existing.properties?._isPlaceholder) {
      nodeMap.set(node.id, nvlNode)
      newNodes.push(nvlNode)
    }
  }
  
  // 관계 처리 (표시된 노드 간의 관계만)
  for (const link of data.links) {
    // 양쪽 노드가 모두 표시되는 경우에만 관계 추가
    const sourceDisplayed = displayedNodeIds.has(link.source) || nodeMap.has(link.source)
    const targetDisplayed = displayedNodeIds.has(link.target) || nodeMap.has(link.target)
    
    if (!sourceDisplayed || !targetDisplayed) continue
    
    // 소스 노드 확인 (플레이스홀더)
    if (!nodeMap.has(link.source)) {
      const placeholder = createPlaceholderNode(link.source)
      nodeMap.set(link.source, placeholder)
      newNodes.push(placeholder)
    }
    
    // 타겟 노드 확인
    if (!nodeMap.has(link.target)) {
      const placeholder = createPlaceholderNode(link.target)
      nodeMap.set(link.target, placeholder)
      newNodes.push(placeholder)
    }
    
    // 관계 추가
    if (!relationshipMap.has(link.id)) {
      const nvlRel = toNvlRelationship(link)
      relationshipMap.set(link.id, nvlRel)
      newRels.push(nvlRel)
    }
  }
  
  // 통계 업데이트 (변경이 있을 때만)
  if (newNodes.length > 0 || newRels.length > 0) {
    updateNodeStats()
    updateRelationshipStats()
  }
  
  return { newNodes, newRels }
}

// ============================================================================
// NVL 초기화 및 인터랙션
// ============================================================================

/**
 * NVL 인스턴스 초기화
 */
async function initNvl(): Promise<void> {
  if (!containerRef.value || isInitializing.value) return
  
  isInitializing.value = true
  loadingProgress.value = 0
  isLoadingBatch.value = true
  
  // 기존 상태 정리
  clearBatchTimer()
  resetQueues()
  
  // 데이터 동기화
  const { newNodes, newRels } = syncGraphData(props.graphData)
  
  await nextTick()
  
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      if (!containerRef.value) {
        isInitializing.value = false
        isLoadingBatch.value = false
        resolve()
        return
      }
      
      // 첫 배치 준비
      const initialNodes = newNodes.slice(0, BATCH_SIZE)
      initialNodes.forEach(node => renderedNodeIds.add(node.id))
      
      const initialRels = newRels.filter(canRenderRelationship)
      initialRels.forEach(rel => renderedRelIds.add(rel.id))
      
      // NVL 인스턴스 생성
      nvlInstance.value = new NVL(
        containerRef.value!,
        initialNodes,
        initialRels,
        NVL_OPTIONS,
        {
        onLayoutDone: () => {
          isInitializing.value = false
          
            // 남은 노드 배치 처리 시작
          const remainingNodes = newNodes.slice(BATCH_SIZE)
          if (remainingNodes.length > 0) {
            enqueueNodes(remainingNodes)
            enqueueRelationships(newRels.filter(r => !renderedRelIds.has(r.id)))
          } else {
            isLoadingBatch.value = false
            loadingProgress.value = 100
          }
        }
      }
      )
      
      pendingNodeCount.value = newNodes.length - initialNodes.length
      loadingProgress.value = Math.round((initialNodes.length / Math.max(newNodes.length, 1)) * 100)
      
      setupInteractions()
      resolve()
    })
  })
}

/**
 * 인터랙션 핸들러 설정
 */
function setupInteractions(): void {
  if (!nvlInstance.value) return
  
  const nvl = nvlInstance.value
  const click = new ClickInteraction(nvl)
  
  // 노드 클릭
  click.updateCallback('onNodeClick', (node: { id: string } | null) => {
    if (!node?.id) return
    const graphNode = findOriginalNode(node.id)
    if (graphNode) emit('node-select', graphNode)
  })
  
  // 노드 더블클릭
  click.updateCallback('onNodeDoubleClick', (node: { id: string } | null) => {
    if (!node?.id) return
    const graphNode = findOriginalNode(node.id)
    if (graphNode) emit('node-double-click', graphNode)
  })
  
  // 캔버스 클릭 (선택 해제)
  click.updateCallback('onCanvasClick', () => {
    emit('node-select', null)
  })
  
  // 드래그, 팬, 줌 인터랙션
  new DragNodeInteraction(nvl)
  new PanInteraction(nvl)
  new ZoomInteraction(nvl)
}

/**
 * 원본 GraphNode 찾기
 */
function findOriginalNode(id: string): GraphNode | undefined {
  return props.graphData.nodes.find(n => n.id === id)
}

// ============================================================================
// 그래프 업데이트 및 리셋
// ============================================================================

/**
 * 그래프 업데이트 (디바운싱 적용)
 */
function updateGraph(): void {
  if (!nvlInstance.value) {
    initNvl()
    return
  }
  
  if (updatePending) return
  updatePending = true
  
  requestAnimationFrame(() => {
    updatePending = false
    if (!nvlInstance.value) return
    
    const { newNodes, newRels } = syncGraphData(props.graphData)
    
    if (newNodes.length > 0) enqueueNodes(newNodes)
    if (newRels.length > 0) enqueueRelationships(newRels)
  })
}

/**
 * 배치 타이머 정리
 */
function clearBatchTimer(): void {
  if (batchTimerId) {
    clearTimeout(batchTimerId)
    batchTimerId = null
  }
  }
  
/**
 * 렌더링 큐 초기화
 */
function resetQueues(): void {
  nodeRenderQueue.length = 0
  relRenderQueue.length = 0
  renderedNodeIds.clear()
  renderedRelIds.clear()
  isProcessingQueue = false
}

/**
 * 그래프 완전 리셋
 */
function resetGraph(): void {
  clearBatchTimer()
  resetQueues()
  
  nodeMap.clear()
  relationshipMap.clear()
  
  loadingProgress.value = 0
  isLoadingBatch.value = false
  pendingNodeCount.value = 0
  
  if (nvlInstance.value) {
    nvlInstance.value.destroy()
    nvlInstance.value = null
  }
}

// ============================================================================
// 라이프사이클 훅
// ============================================================================

onMounted(() => {
  if (props.graphData.nodes.length > 0) {
    initNvl()
  }
})

onUnmounted(() => {
  resetGraph()
})

// ============================================================================
// 워처
// ============================================================================

// 그래프 데이터 변경 감시
watch(() => props.graphData, (newData) => {
  if (newData.nodes.length === 0 && nodeMap.size > 0) {
    resetGraph()
    return
  }
  
  if (newData.nodes.length > 0) {
    updateGraph()
  }
}, { deep: true })

// 선택된 노드 하이라이트
watch(() => props.selectedNodeId, (newId) => {
  if (!nvlInstance.value || !newId) return
  
  const nodes = Array.from(nodeMap.values()).map(n => ({
    ...n,
    color: n.id === newId ? '#3b82f6' : n.color
  }))
  
  nvlInstance.value.addAndUpdateElementsInGraph(nodes, Array.from(relationshipMap.values()))
})

// ============================================================================
// Public API (외부 노출)
// ============================================================================

defineExpose({
  resetGraph,
  updateGraph,
  nodeStats,
  relationshipStats,
  nodeCount: () => nodeMap.size,
  relationshipCount: () => relationshipMap.size,
  loadingProgress,
  isLoadingBatch,
  pendingNodeCount,
  // 노드 limit 관련
  totalNodeCount,
  hiddenNodeCount,
  isLimitApplied
})
</script>

<template>
  <div class="nvl-graph" ref="containerRef">
    <!-- 빈 상태 -->
    <div v-if="nodeMap.size === 0" class="empty-state">
      <div class="empty-icon">🔗</div>
      <p>그래프 데이터가 없습니다</p>
      <p class="hint">업로드 후 분석을 시작하면 그래프가 표시됩니다</p>
    </div>
    
    <!-- 배치 로딩 프로그레스 -->
    <Transition name="fade">
      <div v-if="isLoadingBatch" class="loading-indicator">
        <div class="loading-bar">
          <div class="loading-fill" :style="{ width: `${loadingProgress}%` }"></div>
        </div>
        <span class="loading-text">
          노드 렌더링 중... {{ loadingProgress }}%
          <span v-if="pendingNodeCount > 0">(대기: {{ pendingNodeCount }}개)</span>
        </span>
      </div>
    </Transition>
    
  </div>
</template>

<style lang="scss" scoped>
.nvl-graph {
  width: 100%;
  height: 100%;
  min-height: 400px;
  position: relative;
  background: 
    radial-gradient(circle at center, rgba(59, 130, 246, 0.02) 0%, transparent 70%),
    var(--color-bg-primary);
}
  
// 빈 상태
  .empty-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: var(--color-text-muted);
    
    .empty-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }
    
    p {
      margin: 0.5rem 0;
    }
    
    .hint {
      font-size: 0.85rem;
      opacity: 0.7;
  }
}

// 로딩 인디케이터
.loading-indicator {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 100;
}

.loading-bar {
  width: 200px;
  height: 6px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
}

.loading-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.loading-text {
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  font-family: var(--font-mono);
}

// 트랜지션
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}
</style>
