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
import type { GraphData, GraphNode, GraphLink, NvlNode, NvlRelationship } from '@/types'
import type { PartialNode, PartialRelationship } from '@neo4j-nvl/base'
import { getNodeColor, getRelationshipColor, getNodeSize } from '@/config/graphStyles'

// ============================================================================
// 타입 정의
// ============================================================================

interface Props {
  graphData: GraphData
  selectedNodeId?: string
  selectedRelationshipId?: string
  /** 최대 표시 노드 개수 */
  maxNodes?: number
  /** 노드 라벨 필터 (비어있으면 전체 표시) */
  labelFilters?: string[]
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

/** 기본 최대 표시 노드 개수 */
const DEFAULT_MAX_NODES = 2000

/** NVL 렌더러 옵션 */
const NVL_OPTIONS = {
  initialZoom: 1.0,
  disableWebWorkers: true,
  renderer: 'canvas' as const,
  relationshipLabelFontSize: 10,
  relationshipWidth: 2,
  nodeCaptionFontSize: 12,
  nodeCaptionColor: '#333333',
  // 노드 클릭시 자동 이동 비활성화
  panOnClick: false,
  zoomOnClick: false,
  layout: 'forceDirected' as const,
  layoutOptions: {
    iterations: 150,
    animationDuration: 0,
    disableAnimation: true,
    updateLayoutOnChange: false,
    // 분리된 컴포넌트(클러스터) 배치 옵션
    separateComponents: true,       // 연결되지 않은 컴포넌트 분리
    componentSpacing: 200,          // 컴포넌트 간 간격
    componentArrangement: 'grid',   // 컴포넌트 배열 방식: 'grid' | 'circle'
    // Force 시뮬레이션 파라미터
    nodeRepulsion: 800,             // 노드 간 반발력 (높을수록 더 넓게 분포)
    linkDistance: 80,               // 연결된 노드 간 기본 거리
    gravity: 0.05,                  // 중심으로 끌어당기는 힘
    physics: {
      enabled: false
    },
    updateOnDrag: false,
    updateOnClick: false
  } as any
} as const

// ============================================================================
// Props & Emits
// ============================================================================

const props = withDefaults(defineProps<Props>(), {
  maxNodes: DEFAULT_MAX_NODES,
  labelFilters: () => []
})

const emit = defineEmits<{
  'node-select': [node: GraphNode | null]
  'relationship-select': [relationship: GraphLink | null]
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
const displayedRelationshipCount = ref(0)  // 표시된 관계 수

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

/** 확장 가능한 노드 ID 집합 (자식이 존재하는 노드) */
const expandableNodeIds = new Set<string>()

/** 현재 확장된 노드 ID (더블클릭으로 확장된 노드) */
const expandedNodeId = ref<string | null>(null)

/** 화면에서 숨겨진 노드 ID 집합 (삭제된 노드) */
const hiddenNodeIds = new Set<string>()

// 컨텍스트 메뉴 상태
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuNodeId = ref<string | null>(null)
// 컨텍스트 메뉴 DOM 참조
const contextMenuRef = ref<HTMLElement | null>(null)

// ============================================================================
// 데이터 변환 함수
// ============================================================================

/**
 * 노드가 확장 가능한지 확인 (추가할 수 있는 노드가 실제로 존재하는지)
 */
function isExpandableNode(nodeId: string): boolean {
  // 확장 가능한 노드 집합에 없으면 false
  if (!expandableNodeIds.has(nodeId)) return false
  
  // 연결된 노드들 중 실제로 추가할 수 있는 노드가 있는지 확인
  for (const link of props.graphData.links) {
    let connectedNodeId: string | null = null
    
    if (link.source === nodeId) {
      connectedNodeId = link.target
    } else if (link.target === nodeId) {
      connectedNodeId = link.source
    }
    
    if (!connectedNodeId) continue
    
    // 이미 표시된 노드는 스킵
    if (nodeMap.has(connectedNodeId) && !hiddenNodeIds.has(connectedNodeId)) {
      continue
    }
    
    // 숨겨진 노드이거나 nodeMap에 없는 노드 중에서
    // graphData에 실제로 존재하는 노드가 있으면 확장 가능
    const existsInGraphData = props.graphData.nodes.some(n => n.id === connectedNodeId)
    if (existsInGraphData) {
      return true
    }
  }
  
  return false
}

/**
 * 확장 가능한 노드 집합 업데이트
 * 모든 관계 타입에서 숨겨진/표시되지 않은 노드와 연결된 노드를 확장 가능으로 표시
 */
function updateExpandableNodes(): void {
  expandableNodeIds.clear()
  
  // 전체 노드 ID 집합 (graphData에 있는 모든 노드)
  const allNodeIds = new Set(props.graphData.nodes.map(n => n.id))
  
  // 현재 표시된 노드 ID 집합 (nodeMap에서 가져옴, 숨김 제외)
  const displayedNodeIds = new Set<string>()
  for (const nodeId of nodeMap.keys()) {
    if (!hiddenNodeIds.has(nodeId)) {
      displayedNodeIds.add(nodeId)
    }
  }
  
  // 디버깅: 초기 상태 로그
  console.log('[updateExpandableNodes] 상태:', {
    전체노드수: allNodeIds.size,
    표시된노드수: displayedNodeIds.size,
    관계수: props.graphData.links.length
  })
  
  // 모든 관계를 확인하여 확장 가능한 노드 찾기
  for (const link of props.graphData.links) {
    const sourceDisplayed = displayedNodeIds.has(link.source)
    const targetDisplayed = displayedNodeIds.has(link.target)
    const sourceExists = allNodeIds.has(link.source)
    const targetExists = allNodeIds.has(link.target)
    
    // source가 표시되어 있고, target이 존재하지만 표시되지 않은 경우
    if (sourceDisplayed && targetExists && !targetDisplayed) {
      expandableNodeIds.add(link.source)
    }
    
    // target이 표시되어 있고, source가 존재하지만 표시되지 않은 경우
    if (targetDisplayed && sourceExists && !sourceDisplayed) {
      expandableNodeIds.add(link.target)
    }
  }
  
  console.log('[updateExpandableNodes] 확장 가능 노드:', expandableNodeIds.size, '개')
}

/**
 * GraphNode를 NVL 형식으로 변환
 */
function toNvlNode(node: GraphNode, isSelected: boolean = false, isExpandable: boolean = false): NvlNode {
  const labels = node.labels || []
  const name = (node.properties?.name as string) 
    || labels[0] 
    || node.id
  
  return {
    id: node.id,
    caption: name,
    color: getNodeColor(labels),
    size: getNodeSize(labels),
    selected: isSelected,
    properties: { 
      ...node.properties, 
      labels,
      isExpandable: isExpandable
    }
  }
}

/**
 * GraphLink를 NVL Relationship 형식으로 변환
 */
function toNvlRelationship(link: GraphData['links'][0], isSelected: boolean = false): NvlRelationship {
  return {
    id: link.id,
    from: link.source,
    to: link.target,
    caption: link.type,
    color: getRelationshipColor(link.type),
    selected: isSelected,
    properties: link.properties
  }
}


// ============================================================================
// 통계 업데이트
// ============================================================================

/**
 * 노드 타입별 통계 업데이트 (전체 데이터 기반)
 */
function updateNodeStats(): void {
  const stats = new Map<string, NodeStat>()
  
  // 전체 props.graphData에서 통계 계산 (limit 적용 전)
  for (const node of props.graphData.nodes) {
    const labels = node.labels || []
    const primaryLabel = labels[0] || '_Placeholder'
    
    if (primaryLabel === '_Placeholder') continue
    
    const existing = stats.get(primaryLabel)
    if (existing) {
      existing.count++
    } else {
      stats.set(primaryLabel, { 
        count: 1, 
        color: getNodeColor(labels)
      })
    }
  }
  
  nodeStats.value = stats
}

/**
 * 관계 타입별 통계 업데이트 (전체 데이터 기반)
 */
function updateRelationshipStats(): void {
  const stats = new Map<string, NodeStat>()
  
  // 전체 props.graphData에서 통계 계산 (limit 적용 전)
  for (const link of props.graphData.links) {
    const type = link.type || 'UNKNOWN'
    const existing = stats.get(type)
    
    if (existing) {
      existing.count++
    } else {
      stats.set(type, { count: 1, color: getRelationshipColor(type) })
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
  
  if (nodeBatch.length > 0 || relBatch.length > 0) {
    nvlInstance.value.addAndUpdateElementsInGraph(nodeBatch, relBatch)
  }
  
  const totalNodes = nodeMap.size
  loadingProgress.value = Math.round((renderedNodeIds.size / totalNodes) * 100)
  pendingNodeCount.value = nodeRenderQueue.length
  
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
 * 노드가 필터에 맞는지 확인
 */
function matchesLabelFilter(node: GraphNode): boolean {
  if (!props.labelFilters || props.labelFilters.length === 0) {
    return true // 필터가 없으면 모든 노드 표시
  }
  const labels = node.labels || []
  return labels.some(label => props.labelFilters!.includes(label))
}

/**
 * 그래프 데이터 동기화 (props → 내부 맵, 노드 limit 적용)
 */
function syncGraphData(data: GraphData): { newNodes: NvlNode[]; newRels: NvlRelationship[] } {
  const newNodes: NvlNode[] = []
  const newRels: NvlRelationship[] = []
  
  // 전체 노드 수 저장
  totalNodeCount.value = data.nodes.length
  
  // 확장된 노드가 있으면 limit 무시
  const shouldIgnoreLimit = expandedNodeId.value !== null
  
  // 노드 limit 적용 (props.maxNodes 사용, 확장 모드에서는 무시)
  const maxDisplayNodes = shouldIgnoreLimit ? data.nodes.length : (props.maxNodes || DEFAULT_MAX_NODES)
  
  // 라벨 필터 적용 후 limit 적용
  const filteredNodes = data.nodes.filter(n => matchesLabelFilter(n))
  const limitedNodes = filteredNodes.slice(0, maxDisplayNodes)
  
  // 숨겨진 노드 제외
  const visibleNodes = limitedNodes.filter(n => !hiddenNodeIds.has(n.id))
  const displayedNodeIds = new Set(visibleNodes.map(n => n.id))
  
  hiddenNodeCount.value = shouldIgnoreLimit ? 0 : Math.max(0, data.nodes.length - maxDisplayNodes)
  isLimitApplied.value = shouldIgnoreLimit ? false : (data.nodes.length > maxDisplayNodes)
  
  // 먼저 노드를 nodeMap에 추가
  for (const node of visibleNodes) {
    const isSelected = props.selectedNodeId === node.id
    const existing = nodeMap.get(node.id)
    
    if (existing && existing.selected === isSelected) {
      continue
    }
    
    // 일단 isExpandable=false로 추가 (나중에 업데이트)
    const nvlNode = toNvlNode(node, isSelected, false)
    nodeMap.set(node.id, nvlNode)
    newNodes.push(nvlNode)
  }
  
  // nodeMap이 채워진 후에 확장 가능한 노드 업데이트
  updateExpandableNodes()
  
  // 확장 가능 상태 반영하여 노드 속성 업데이트
  for (const nvlNode of newNodes) {
    const expandable = isExpandableNode(nvlNode.id)
    if (nvlNode.properties) {
      nvlNode.properties.isExpandable = expandable
    }
  }
  
  const displayedRels = new Map<string, NvlRelationship>()
  
  for (const link of data.links) {
    // 숨겨진 노드와 연결된 관계는 제외
    if (hiddenNodeIds.has(link.source) || hiddenNodeIds.has(link.target)) {
      continue
    }
    
    if (!displayedNodeIds.has(link.source) || !displayedNodeIds.has(link.target)) {
      continue
    }
    
    const isRelSelected = props.selectedRelationshipId === link.id
    const existing = relationshipMap.get(link.id)
    
    if (existing && existing.selected === isRelSelected) {
      displayedRels.set(link.id, existing)
      continue
    }
    
    const nvlRel = toNvlRelationship(link, isRelSelected)
    displayedRels.set(link.id, nvlRel)
    newRels.push(nvlRel)
  }
  
  relationshipMap.clear()
  for (const [relId, rel] of displayedRels.entries()) {
    relationshipMap.set(relId, rel)
  }
  
  displayedRelationshipCount.value = relationshipMap.size
  
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
 * 노드 확장 (1단계 자식만 표시)
 * 확장된 노드와 직접 연결된 노드/관계를 그래프에 추가
 */
function expandNode(nodeId: string): void {
  if (!nvlInstance.value) return
  
  expandedNodeId.value = nodeId
  
  // 확장된 노드와 직접 연결된 노드 찾기
  const connectedNodeIds = new Set<string>()
  for (const link of props.graphData.links) {
    if (link.source === nodeId) {
      connectedNodeIds.add(link.target)
    } else if (link.target === nodeId) {
      connectedNodeIds.add(link.source)
    }
  }
  
  // 추가할 노드들 찾기 (아직 표시되지 않은 노드들만)
  const nodesToAdd: NvlNode[] = []
  const relsToAdd: NvlRelationship[] = []
  
  // 디버깅용 카운터
  let alreadyDisplayedCount = 0
  let notFoundInGraphDataCount = 0
  const notFoundNodeIds: string[] = []
  
  for (const connectedNodeId of connectedNodeIds) {
    // 이미 표시된 노드는 스킵
    if (nodeMap.has(connectedNodeId) && !hiddenNodeIds.has(connectedNodeId)) {
      alreadyDisplayedCount++
      continue
    }
    
    const originalNode = props.graphData.nodes.find(n => n.id === connectedNodeId)
    if (!originalNode) {
      notFoundInGraphDataCount++
      notFoundNodeIds.push(connectedNodeId.substring(0, 30))
      continue
    }
    
    hiddenNodeIds.delete(connectedNodeId)
    
    const nvlNode = toNvlNode(originalNode, props.selectedNodeId === connectedNodeId, isExpandableNode(connectedNodeId))
    nodeMap.set(connectedNodeId, nvlNode)
    nodesToAdd.push(nvlNode)
  }
  
  // 상세 디버깅 로그
  if (notFoundInGraphDataCount > 0) {
    console.warn(`[expandNode] ⚠️ graphData.nodes에서 찾지 못한 연결 노드: ${notFoundInGraphDataCount}개`, notFoundNodeIds)
  }
  
  // 확장된 노드와 직계 노드들 간의 관계 추가
  for (const link of props.graphData.links) {
    const sourceConnected = connectedNodeIds.has(link.source) || link.source === nodeId
    const targetConnected = connectedNodeIds.has(link.target) || link.target === nodeId
    
    if (sourceConnected && targetConnected && !relationshipMap.has(link.id)) {
      const nvlRel = toNvlRelationship(link, props.selectedRelationshipId === link.id)
      relationshipMap.set(link.id, nvlRel)
      relsToAdd.push(nvlRel)
    }
  }
  
  // 디버깅 로그
  console.log(`[expandNode] 노드 ${nodeId} 확장:`, {
    연결된노드수: connectedNodeIds.size,
    이미표시됨: alreadyDisplayedCount,
    새로추가: nodesToAdd.length,
    새관계: relsToAdd.length
  })
  
  if (nodesToAdd.length === 0 && relsToAdd.length === 0) {
    console.log(`[expandNode] 추가할 노드/관계가 없음 - 모든 연결된 노드가 이미 표시됨`)
  }
  
  // NVL 공식 API로 직접 추가
  if (nodesToAdd.length > 0 || relsToAdd.length > 0) {
    nvlInstance.value.addAndUpdateElementsInGraph(nodesToAdd, relsToAdd)
    nodesToAdd.forEach(node => renderedNodeIds.add(node.id))
    relsToAdd.forEach(rel => renderedRelIds.add(rel.id))
    
    // 새 노드 추가 후 확장 가능한 노드 목록 업데이트
    updateExpandableNodes()
    
    // 새로 추가된 노드들과 기존 노드들의 확장 가능 상태 업데이트
    const allDisplayedNodeIds = Array.from(nodeMap.keys())
    const nodesToUpdate: NvlNode[] = []
    
    for (const nodeId of allDisplayedNodeIds) {
      const existingNode = nodeMap.get(nodeId)
      if (existingNode) {
        const shouldBeExpandable = isExpandableNode(nodeId)
        const currentExpandable = existingNode.properties?.isExpandable ?? false
        
        if (shouldBeExpandable !== currentExpandable) {
          existingNode.properties = {
            ...existingNode.properties,
            isExpandable: shouldBeExpandable
          }
          nodesToUpdate.push(existingNode)
        }
      }
    }
    
    // 확장 가능 상태가 변경된 노드들 업데이트
    if (nodesToUpdate.length > 0) {
      nvlInstance.value.addAndUpdateElementsInGraph(nodesToUpdate, [])
      console.log(`[expandNode] ${nodesToUpdate.length}개 노드의 확장 가능 상태 업데이트됨`)
    }
  }
  
  updateNodeStats()
  updateRelationshipStats()
}


/**
 * 인터랙션 핸들러 설정
 */
function setupInteractions(): void {
  if (!nvlInstance.value || !containerRef.value) return
  
  const nvl = nvlInstance.value
  const click = new ClickInteraction(nvl)
  
  let lastClickNodeId: string | null = null
  let lastClickTime = 0
  
  click.updateCallback('onNodeClick', (node: { id: string } | null) => {
    if (!node?.id) return
    
    const now = Date.now()
    const isDoubleClick = lastClickNodeId === node.id && (now - lastClickTime) < 300
    
    if (isDoubleClick) {
      // 더블클릭: 노드 확장
      const expandable = isExpandableNode(node.id)
      console.log(`[더블클릭] 노드: ${node.id.substring(0, 30)}..., 확장가능: ${expandable}, expandableNodeIds 크기: ${expandableNodeIds.size}`)
      
      if (expandable) {
        expandNode(node.id)
      } else {
        // 확장 가능하지 않은 이유 상세 디버깅
        const linksForNode = props.graphData.links.filter(l => l.source === node.id || l.target === node.id)
        console.log(`[더블클릭] 확장 불가 - 연결된 관계 수: ${linksForNode.length}`)
        
        // 연결된 노드들 분석
        const allNodeIds = new Set(props.graphData.nodes.map(n => n.id))
        const displayedIds = new Set(Array.from(nodeMap.keys()).filter(id => !hiddenNodeIds.has(id)))
        
        for (const link of linksForNode) {
          const connectedId = link.source === node.id ? link.target : link.source
          const inGraphData = allNodeIds.has(connectedId)
          const isDisplayed = displayedIds.has(connectedId)
          console.log(`  관계 [${link.type}] → ${connectedId.substring(0, 20)}... | graphData: ${inGraphData}, 표시됨: ${isDisplayed}`)
        }
      }
      lastClickNodeId = null
      lastClickTime = 0
    } else {
      // 단일 클릭: 노드 선택
      lastClickNodeId = node.id
      lastClickTime = now
      
      const graphNode = findOriginalNode(node.id)
      if (graphNode) {
        emit('node-select', graphNode)
      }
    }
  })
  
  // 오른쪽 클릭 콜백 등록
  click.updateCallback('onNodeRightClick', (node: { id: string } | null, _hits: any, evt: MouseEvent) => {
    if (!node?.id) return
    evt.preventDefault()
    
    // 컨텍스트 메뉴 표시
    contextMenuNodeId.value = node.id
    contextMenuPosition.value = { x: evt.clientX, y: evt.clientY }
    contextMenuVisible.value = true
  })
  
  click.updateCallback('onRelationshipClick', (relationship: { id: string } | null) => {
    if (!relationship?.id) return
    const graphLink = findOriginalRelationship(relationship.id)
    if (graphLink) {
      emit('relationship-select', graphLink)
    }
  })
  
  click.updateCallback('onCanvasClick', () => {
    emit('node-select', null)
    emit('relationship-select', null)
    closeContextMenu()
  })
  
  // 기본 컨텍스트 메뉴 방지
  contextMenuHandler = (e: MouseEvent) => {
    if (!contextMenuNodeId.value) {
      e.preventDefault()
    }
  }
  
  // 외부 클릭 시 메뉴 닫기 (bubble phase 사용)
  documentClickHandler = (e: MouseEvent) => {
    if (!contextMenuVisible.value) return
    
    const contextMenuElement = contextMenuRef.value
    if (contextMenuElement && e.target instanceof Node && contextMenuElement.contains(e.target)) {
      return // 메뉴 내부 클릭은 무시
    }
    
    closeContextMenu()
  }
  
  containerRef.value.addEventListener('contextmenu', contextMenuHandler)
  document.addEventListener('click', documentClickHandler as EventListener)
  
  new DragNodeInteraction(nvl)
  new PanInteraction(nvl)
  new ZoomInteraction(nvl)
}

/**
 * 컨텍스트 메뉴 닫기
 */
function closeContextMenu(): void {
  contextMenuVisible.value = false
  contextMenuNodeId.value = null
}

// 삭제 처리 중 플래그 (중복 실행 방지)
let isDeleting = false

/**
 * 노드 삭제 처리 (화면상에서만)
 */
async function handleDeleteNode(event?: Event): Promise<void> {
  if (isDeleting) return
  
  if (event) {
    event.stopPropagation()
    event.preventDefault()
  }
  
  const targetNodeId = contextMenuNodeId.value
  if (!targetNodeId || !nvlInstance.value) return
  
  isDeleting = true
  
  // 숨겨진 노드 집합에 추가
  hiddenNodeIds.add(targetNodeId)
  
  // 해당 노드와 연결된 모든 관계 찾기
  const relatedRelIds: string[] = []
  for (const [relId, rel] of relationshipMap.entries()) {
    if (rel.from === targetNodeId || rel.to === targetNodeId) {
      relatedRelIds.push(relId)
    }
  }
  
  // 관계 맵에서 제거
  for (const relId of relatedRelIds) {
    relationshipMap.delete(relId)
    renderedRelIds.delete(relId)
  }
  
  // 노드 맵에서 제거
  nodeMap.delete(targetNodeId)
  renderedNodeIds.delete(targetNodeId)
  
  // NVL 공식 API로 노드 제거 (인접 관계도 자동 제거됨)
  nvlInstance.value.removeNodesWithIds([targetNodeId])
  
  // 선택된 노드가 삭제된 경우 선택 해제
  if (props.selectedNodeId === targetNodeId) {
    emit('node-select', null)
  }
  
  // 통계 업데이트
  updateNodeStats()
  updateRelationshipStats()
  
  isDeleting = false
  closeContextMenu()
}

/**
 * 노드 확장 처리 (컨텍스트 메뉴에서)
 */
function handleExpandNode(event?: Event): void {
  if (event) {
    event.stopPropagation()
    event.preventDefault()
  }
  
  const nodeId = contextMenuNodeId.value
  if (!nodeId) {
    closeContextMenu()
    return
  }
  
  if (isExpandableNode(nodeId)) {
    expandNode(nodeId)
  }
  
  closeContextMenu()
}

/**
 * 원본 GraphNode 찾기
 */
function findOriginalNode(id: string): GraphNode | undefined {
  return props.graphData.nodes.find(n => n.id === id)
}

/**
 * 원본 GraphLink 찾기
 */
function findOriginalRelationship(id: string): GraphLink | undefined {
  return props.graphData.links.find(l => l.id === id)
}

// ============================================================================
// 그래프 업데이트 및 리셋
// ============================================================================

/**
 * 노드 스타일만 업데이트 (사용자 설정 변경 시)
 * PartialNode를 사용하여 위치 없이 속성만 업데이트하여 레이아웃 재계산 방지
 */
function updateNodeStyles(): void {
  if (!nvlInstance.value) return
  
  const nodesToUpdate: PartialNode[] = []
  
  for (const [nodeId, node] of nodeMap.entries()) {
    const labels = (node.properties?.labels as string[]) || []
    const newColor = getNodeColor(labels)
    const newSize = getNodeSize(labels)
    
    if (node.color !== newColor || node.size !== newSize) {
      // PartialNode를 사용하여 위치 없이 속성만 업데이트 (레이아웃 재계산 방지)
      const updatedNode: PartialNode = {
        id: nodeId,
        color: newColor,
        size: newSize
      }
      nodesToUpdate.push(updatedNode)
      // 내부 맵도 업데이트
      nodeMap.set(nodeId, { ...node, color: newColor, size: newSize })
    }
  }
  
  if (nodesToUpdate.length > 0) {
    // PartialNode를 사용하여 레이아웃 재계산 없이 속성만 업데이트
    nvlInstance.value.updateElementsInGraph(nodesToUpdate, [])
    updateNodeStats()
  }
}

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
  expandedNodeId.value = null
  hiddenNodeIds.clear()
  
  loadingProgress.value = 0
  isLoadingBatch.value = false
  pendingNodeCount.value = 0
  totalNodeCount.value = 0
  hiddenNodeCount.value = 0
  isLimitApplied.value = false
  displayedRelationshipCount.value = 0
  
  if (nvlInstance.value) {
    nvlInstance.value.destroy()
    nvlInstance.value = null
  }
  
  closeContextMenu()
}

// ============================================================================
// 라이프사이클 훅
// ============================================================================

onMounted(() => {
  if (props.graphData.nodes.length > 0) {
    initNvl()
  }
})

// 이벤트 핸들러 참조 저장 (cleanup용)
let contextMenuHandler: ((e: MouseEvent) => void) | null = null
let documentClickHandler: ((e: MouseEvent) => void) | null = null

onUnmounted(() => {
  if (containerRef.value && contextMenuHandler) {
    containerRef.value.removeEventListener('contextmenu', contextMenuHandler)
  }
  if (documentClickHandler) {
    document.removeEventListener('click', documentClickHandler)
  }
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
    // 확장 가능한 노드 업데이트
    updateExpandableNodes()
    updateGraph()
  }
}, { deep: true })

watch(() => props.maxNodes, () => {
  if (props.graphData.nodes.length > 0) {
    resetGraph()
    initNvl()
  }
})

// 라벨 필터 변경 시 그래프 재렌더링
watch(() => props.labelFilters, () => {
  if (props.graphData.nodes.length > 0) {
    resetGraph()
    initNvl()
  }
}, { deep: true })

watch([() => props.selectedNodeId, () => props.selectedRelationshipId], ([newNodeId, newRelId], [oldNodeId, oldRelId]) => {
  if (!nvlInstance.value || (newNodeId === oldNodeId && newRelId === oldRelId)) return
  
  const nodesToUpdate: PartialNode[] = []
  const relsToUpdate: PartialRelationship[] = []
  
  if (oldNodeId) {
    // PartialNode를 사용하여 선택 상태만 업데이트 (레이아웃 재계산 방지)
    nodesToUpdate.push({ id: oldNodeId, selected: false })
    const graphNode = props.graphData.nodes.find(n => n.id === oldNodeId)
    if (graphNode) {
      const restoredNode = toNvlNode(graphNode, false)
      nodeMap.set(oldNodeId, restoredNode)
    }
  }
  
  if (newNodeId) {
    // PartialNode를 사용하여 선택 상태만 업데이트 (레이아웃 재계산 방지)
    nodesToUpdate.push({ id: newNodeId, selected: true })
    const graphNode = props.graphData.nodes.find(n => n.id === newNodeId)
    if (graphNode) {
      const highlightedNode = toNvlNode(graphNode, true)
      nodeMap.set(newNodeId, highlightedNode)
    }
  }
  
  if (oldRelId) {
    // PartialRelationship을 사용하여 선택 상태만 업데이트 (레이아웃 재계산 방지)
    relsToUpdate.push({ id: oldRelId, selected: false })
    const graphLink = props.graphData.links.find(l => l.id === oldRelId)
    if (graphLink) {
      const restoredRel = toNvlRelationship(graphLink, false)
      relationshipMap.set(oldRelId, restoredRel)
    }
  }
  
  if (newRelId) {
    // PartialRelationship을 사용하여 선택 상태만 업데이트 (레이아웃 재계산 방지)
    relsToUpdate.push({ id: newRelId, selected: true })
    const graphLink = props.graphData.links.find(l => l.id === newRelId)
    if (graphLink) {
      const highlightedRel = toNvlRelationship(graphLink, true)
      relationshipMap.set(newRelId, highlightedRel)
    }
  }
  
  if (nodesToUpdate.length > 0 || relsToUpdate.length > 0) {
    // PartialNode/PartialRelationship을 사용하여 레이아웃 재계산 없이 속성만 업데이트
    nvlInstance.value.updateElementsInGraph(nodesToUpdate, relsToUpdate)
  }
}, { immediate: false })

// ============================================================================
// Public API (외부 노출)
// ============================================================================

/**
 * 특정 노드로 포커스 (그래프에서 해당 노드를 중앙에 배치하고 선택)
 */
function focusOnNode(nodeId: string): void {
  if (!nvlInstance.value || !nodeId) return
  
  // 노드가 존재하는지 확인
  const targetNode = nodeMap.get(nodeId)
  if (!targetNode) {
    console.warn(`[focusOnNode] 노드를 찾을 수 없습니다: ${nodeId}`)
    return
  }
  
  // 노드 선택 이벤트 발생
  emit('node-select', props.graphData?.nodes.find(n => n.id === nodeId) || null)
  
  // NVL의 fit 메서드로 해당 노드에 포커스
  try {
    // NVL fit 메서드: 특정 노드들을 화면에 맞춤
    if (typeof nvlInstance.value.fit === 'function') {
      nvlInstance.value.fit([nodeId], { animate: true })
    }
  } catch (error) {
    console.warn('[focusOnNode] fit 메서드 호출 중 오류:', error)
  }
}

/**
 * 특정 노드와 연결된 노드만 표시 (검색 결과 선택 시)
 * 기존 그래프를 초기화하고 해당 노드 + 직접 연결된 노드/관계만 로드
 */
function filterToNode(nodeId: string, depth: number = 1): void {
  if (!nvlInstance.value || !props.graphData || !nodeId) return
  
  console.log(`[filterToNode] 노드 ${nodeId}와 연결된 노드만 표시 (depth: ${depth})`)
  console.log(`[filterToNode] 전체 노드: ${props.graphData.nodes.length}개, 관계: ${props.graphData.links.length}개`)
  
  // 대상 노드 찾기
  const targetNode = props.graphData.nodes.find(n => n.id === nodeId)
  if (!targetNode) {
    console.warn(`[filterToNode] 노드를 찾을 수 없습니다: ${nodeId}`)
    return
  }
  
  console.log(`[filterToNode] 대상 노드:`, targetNode.properties?.name || targetNode.id)
  
  // BFS로 연결된 노드 수집 (incoming + outgoing 모두)
  const connectedNodeIds = new Set<string>([nodeId])
  const connectedRelIds = new Set<string>()
  
  let currentLevel = new Set<string>([nodeId])
  
  for (let d = 0; d < depth; d++) {
    const nextLevel = new Set<string>()
    
    for (const link of props.graphData.links) {
      // source/target이 객체일 수도 있으므로 안전하게 처리
      const sourceId = typeof link.source === 'object' && link.source !== null 
        ? (link.source as { id?: string }).id || String(link.source)
        : String(link.source)
      const targetId = typeof link.target === 'object' && link.target !== null
        ? (link.target as { id?: string }).id || String(link.target)
        : String(link.target)
      
      // Outgoing: 현재 레벨 노드가 source인 경우
      if (currentLevel.has(sourceId) && !connectedNodeIds.has(targetId)) {
        nextLevel.add(targetId)
        connectedNodeIds.add(targetId)
        connectedRelIds.add(link.id)
        console.log(`[filterToNode] Outgoing: ${sourceId} -> ${targetId} (${link.type})`)
      }
      // Incoming: 현재 레벨 노드가 target인 경우
      if (currentLevel.has(targetId) && !connectedNodeIds.has(sourceId)) {
        nextLevel.add(sourceId)
        connectedNodeIds.add(sourceId)
        connectedRelIds.add(link.id)
        console.log(`[filterToNode] Incoming: ${sourceId} -> ${targetId} (${link.type})`)
      }
      // 이미 포함된 노드 간의 관계도 추가
      if (connectedNodeIds.has(sourceId) && connectedNodeIds.has(targetId)) {
        connectedRelIds.add(link.id)
      }
    }
    
    currentLevel = nextLevel
  }
  
  console.log(`[filterToNode] 연결된 노드: ${connectedNodeIds.size}개, 관계: ${connectedRelIds.size}개`)
  console.log(`[filterToNode] 노드 IDs:`, Array.from(connectedNodeIds))
  
  // 기존 그래프 초기화
  nodeMap.clear()
  relationshipMap.clear()
  renderedNodeIds.clear()
  renderedRelIds.clear()
  hiddenNodeIds.clear()
  nodeRenderQueue.length = 0
  
  // NVL 인스턴스 초기화
  if (nvlInstance.value) {
    try {
      // 기존 노드/관계 모두 제거
      const existingNodeIds = Array.from(nodeMap.keys())
      if (existingNodeIds.length > 0) {
        nvlInstance.value.removeNodesWithIds(existingNodeIds)
      }
    } catch (e) {
      // 무시
    }
  }
  
  // 필터링된 노드/관계 추가
  const nodesToAdd: NvlNode[] = []
  const relsToAdd: NvlRelationship[] = []
  
  for (const node of props.graphData.nodes) {
    if (connectedNodeIds.has(node.id)) {
      const isSelected = node.id === nodeId
      const nvlNode = toNvlNode(node, isSelected, false)
      nodeMap.set(node.id, nvlNode)
      nodesToAdd.push(nvlNode)
      renderedNodeIds.add(node.id)
    }
  }
  
  for (const link of props.graphData.links) {
    if (connectedRelIds.has(link.id)) {
      const nvlRel = toNvlRelationship(link, false)
      relationshipMap.set(link.id, nvlRel)
      relsToAdd.push(nvlRel)
      renderedRelIds.add(link.id)
    }
  }
  
  // NVL에 추가
  if (nvlInstance.value && (nodesToAdd.length > 0 || relsToAdd.length > 0)) {
    nvlInstance.value.addAndUpdateElementsInGraph(nodesToAdd, relsToAdd)
  }
  
  // 통계 업데이트
  updateNodeStats()
  updateRelationshipStats()
  
  // 대상 노드로 포커스
  emit('node-select', targetNode)
  
  // fit으로 전체 보기
  nextTick(() => {
    if (nvlInstance.value && typeof nvlInstance.value.fit === 'function') {
      nvlInstance.value.fit(Array.from(connectedNodeIds), { animate: true })
    }
  })
}

defineExpose({
  resetGraph,
  updateGraph,
  updateNodeStyles,
  expandNodeChildren: expandNode,
  focusOnNode,
  filterToNode,
  nodeStats,
  relationshipStats,
  nodeCount: () => nodeMap.size,
  relationshipCount: () => relationshipMap.size,
  loadingProgress,
  isLoadingBatch,
  pendingNodeCount,
  totalNodeCount,
  hiddenNodeCount: () => hiddenNodeCount.value,
  isLimitApplied: () => isLimitApplied.value,
  displayedRelationshipCount: () => displayedRelationshipCount.value
})
</script>

<template>
  <div class="nvl-graph" ref="containerRef">
    <!-- 빈 상태 (초기화 완료 후 데이터가 없을 때만 표시) -->
    <div v-if="!isInitializing && !isLoadingBatch && nodeMap.size === 0 && totalNodeCount === 0" class="empty-state">
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
    
    <!-- 컨텍스트 메뉴 -->
    <Transition name="fade">
      <div
        v-if="contextMenuVisible && contextMenuNodeId"
        ref="contextMenuRef"
        class="context-menu"
        :style="{
          left: `${contextMenuPosition.x}px`,
          top: `${contextMenuPosition.y}px`
        }"
        @click.stop.prevent
        @mousedown.stop.prevent
      >
        <button
          v-if="isExpandableNode(contextMenuNodeId)"
          class="context-menu-item"
          @mousedown.stop.prevent
          @click.stop.prevent="handleExpandNode($event)"
        >
          <span class="icon">⤢</span>
          <span>확장</span>
        </button>
        <button
          class="context-menu-item danger"
          @mousedown.stop.prevent="handleDeleteNode($event)"
        >
          <span class="icon">🗑</span>
          <span>노드 삭제</span>
        </button>
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
  background: var(--color-canvas-bg);
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
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
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

// 컨텍스트 메뉴
.context-menu {
  position: fixed;
  z-index: 1000;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
  font-size: 14px;
  color: #333;
  transition: background-color 0.2s;
  
  &:hover {
    background: #f3f4f6;
  }
  
  &.danger {
    color: #dc2626;
    
    &:hover {
      background: #fee2e2;
    }
  }
  
  .icon {
    font-size: 16px;
    width: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
