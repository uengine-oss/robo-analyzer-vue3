<script setup lang="ts">
/**
 * VueFlowClassDiagram.vue
 * VueFlow 기반 UML 클래스 다이어그램 컴포넌트
 * 
 * 주요 기능:
 * - Neo4j 데이터를 기반으로 UML 클래스 다이어그램 렌더링
 * - 깊이 기반 노드 필터링
 * - 클래스 노드 확장 기능
 * - 드래그/줌 인터랙션
 */

import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Node, Edge, NodeMouseEvent } from '@vue-flow/core'
import type { GraphNode, GraphLink } from '@/types'
import {
  buildClassDiagramData,
  findNodeIdsByClassNames,
  ARROW_STYLES,
  VISIBILITY_MAP,
  type UmlClass,
  type ClassDiagramData
} from '@/utils/classDiagram'
import ELK from 'elkjs/lib/elk.bundled.js'
import ElkEdge from './ElkEdge.vue'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

// ============================================================================
// Props & Emits
// ============================================================================

interface Props {
  /** 전체 그래프 노드 */
  graphNodes: GraphNode[]
  /** 전체 그래프 링크 */
  graphLinks: GraphLink[]
  /** 선택된 클래스 정보 */
  selectedClasses: Array<{ className: string; directory: string }>
  /** 탐색 깊이 */
  depth: number
}

const props = withDefaults(defineProps<Props>(), {
  depth: 3
})

const emit = defineEmits<{
  /** 클래스 노드 클릭 */
  (e: 'class-click', className: string, directory: string): void
  /** 클래스 노드 더블클릭 (확장) */
  (e: 'class-expand', className: string, directory: string): void
}>()

// ============================================================================
// VueFlow 설정
// ============================================================================

const { fitView } = useVueFlow()

// ============================================================================
// ELK 인스턴스
// ============================================================================

const elk = new ELK()

// ============================================================================
// 상태
// ============================================================================

/** VueFlow 노드 */
const nodes = ref<Node[]>([])

/** VueFlow 엣지 */
const edges = ref<Edge[]>([])

/** 선택된 노드 ID */
const selectedNodeId = ref<string | null>(null)

/** 다이어그램 데이터 */
const diagramData = ref<ClassDiagramData | null>(null)

// ============================================================================
// Computed
// ============================================================================

/** 다이어그램이 비어있는지 */
const isEmpty = computed(() => nodes.value.length === 0)

// ============================================================================
// 유틸리티 함수 - ELK 레이아웃
// ============================================================================

type ElkResult = {
  positions: Map<string, { x: number; y: number }>
  edgeRoutes: Map<string, Array<{ x: number; y: number }>>
}

function isInheritance(type: string): boolean {
  return type === 'EXTENDS' || type === 'IMPLEMENTS'
}

/**
 * ELK를 사용한 레이아웃 계산 (노드 위치 + 엣지 경로)
 * - DEPENDENCY는 레이아웃에서 제외하여 구조를 망치지 않도록 함
 * - 포트 강제를 통해 확실한 라우팅 보장
 */
async function layoutWithElk(
  classes: UmlClass[],
  relationships: Array<{ id: string; source: string; target: string; type: string; label?: string }>
): Promise<ElkResult> {
  // ✅ 0) 레이아웃을 망치는 dependency는 제외
  const layoutRels = relationships.filter(r => r.type !== 'DEPENDENCY')

  // ✅ 1) ELK 그래프
  const elkGraph: any = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      // ✅ 포트 강제 (이거 없으면 포트 side가 무시되는 케이스 많음)
      'elk.portConstraints': 'FIXED_SIDE',
      // ✅ spacing은 크게 잡아야 UML이 정돈됨 (300px 노드 기준)
      'elk.spacing.nodeNode': '150',
      'elk.layered.spacing.nodeNodeBetweenLayers': '240',
      // ✅ UML은 직각 라우팅이 정석 (교차/겹침이 크게 줄어듦)
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    // ✅ 2) 노드 + 포트 정의 (layoutOptions로 side 지정)
    children: classes.map((cls) => ({
      id: cls.id,
      width: 300,
      height: calculateNodeHeight(cls) + 20, // 약간 여유
      // 노드 레벨에서도 한 번 더 강제
      layoutOptions: {
        'elk.portConstraints': 'FIXED_SIDE',
      },
      ports: [
        { id: `${cls.id}:top`,    layoutOptions: { 'elk.port.side': 'NORTH' } },
        { id: `${cls.id}:bottom`, layoutOptions: { 'elk.port.side': 'SOUTH' } },
        { id: `${cls.id}:left`,   layoutOptions: { 'elk.port.side': 'WEST' } },
        { id: `${cls.id}:right`,  layoutOptions: { 'elk.port.side': 'EAST' } },
      ],
    })),
    // ✅ 3) 엣지: sources/targets는 "port id"를 사용 (포트 강제)
    edges: layoutRels.map((rel) => {
      const inh = isInheritance(rel.type)
      const sourcePort = inh ? `${rel.source}:bottom` : `${rel.source}:right`
      const targetPort = inh ? `${rel.target}:top`    : `${rel.target}:left`

      return {
        id: rel.id,
        sources: [sourcePort],
        targets: [targetPort],
        // 상속은 아래로 흐르도록 약간 더 강제 (있으면 도움)
        ...(inh ? { layoutOptions: { 'elk.layered.priority.direction': '1' } } : {}),
      }
    }),
  }

  // ✅ 4) 레이아웃 실행
  const out = await elk.layout(elkGraph)

  // ✅ 5) 노드 위치
  const positions = new Map<string, { x: number; y: number }>()
  for (const n of out.children ?? []) {
    positions.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 })
  }

  // ✅ 6) 엣지 경로
  const edgeRoutes = new Map<string, Array<{ x: number; y: number }>>()
  for (const e of out.edges ?? []) {
    const section = e.sections?.[0]
    if (!section) continue

    const pts: Array<{ x: number; y: number }> = []
    if (section.startPoint) pts.push(section.startPoint)
    if (section.bendPoints?.length) pts.push(...section.bendPoints)
    if (section.endPoint) pts.push(section.endPoint)

    edgeRoutes.set(e.id, pts)
  }

  return { positions, edgeRoutes }
}

/**
 * 노드 높이 계산 (필드/메서드 수에 따라)
 */
function calculateNodeHeight(umlClass: UmlClass): number {
  const headerHeight = 56  // 헤더 (스테레오타입 + 클래스명)
  const sectionPadding = 8 // 섹션 패딩
  const memberHeight = 22  // 멤버 한 줄 높이
  const dividerHeight = 2  // 구분선
  const minSectionHeight = 24 // 빈 섹션 최소 높이
  
  // 필드 섹션 높이
  const fieldCount = Math.min(umlClass.fields.length, 8)
  const fieldsHeight = fieldCount > 0 
    ? (fieldCount * memberHeight) + sectionPadding + dividerHeight
    : minSectionHeight + dividerHeight
  
  // 메서드 섹션 높이
  const methodCount = Math.min(umlClass.methods.length, 8)
  const methodsHeight = methodCount > 0 
    ? (methodCount * memberHeight) + sectionPadding + dividerHeight
    : minSectionHeight + dividerHeight
  
  return headerHeight + fieldsHeight + methodsHeight + 20
}

// ============================================================================
// 유틸리티 함수 - 포맷팅 (UML 클래스 다이어그램 표준)
// 참고: https://brownbears.tistory.com/577
// ============================================================================

/**
 * 접근제어자 기호 변환
 * + public, - private, # protected, ~ default
 */
function formatVisibility(visibility: string): string {
  return VISIBILITY_MAP[visibility] || VISIBILITY_MAP['private']
}

/**
 * 필드 문자열 생성 (UML 표준: {접근제어자}{필드명}: {타입})
 */
function formatField(field: { name: string; type: string; visibility: string }): string {
  const vis = VISIBILITY_MAP[field.visibility] || '-'
  return field.type ? `${vis}${field.name}: ${field.type}` : `${vis}${field.name}`
}

/**
 * 파라미터 목록 문자열 생성
 */
function formatParams(params: Array<{ name: string; type: string }>): string {
  if (!params || params.length === 0) return ''
  return params
    .map(p => {
      if (p.type && p.name) return `${p.name}: ${p.type}`
      return p.name || p.type || ''
    })
    .filter(Boolean)
    .join(', ')
}

/**
 * 메서드 전체 문자열 생성 (툴팁용)
 */
function formatMethodFull(method: { 
  name: string
  returnType: string
  visibility: string
  parameters: Array<{ name: string; type: string }>
  isConstructor: boolean
}): string {
  const vis = VISIBILITY_MAP[method.visibility] || '+'
  const params = formatParams(method.parameters)
  
  if (method.isConstructor) {
    return `${vis}${method.name}(${params})`
  }
  return `${vis}${method.name}(${params}): ${method.returnType}`
}

/**
 * 메서드 문자열 생성 (UML 표준: {접근제어자}{메서드명}({파라미터}): {반환타입})
 */
function formatMethod(method: { 
  name: string
  returnType: string
  visibility: string
  parameters: Array<{ name: string; type: string }>
  isConstructor: boolean
}): string {
  return formatMethodFull(method)
}

// ============================================================================
// 다이어그램 생성
// ============================================================================

/**
 * 다이어그램 데이터 생성 및 VueFlow 노드/엣지 변환 (ELK 레이아웃 사용)
 */
async function buildDiagram(): Promise<void> {
  if (!props.selectedClasses.length || !props.graphNodes.length) {
    nodes.value = []
    edges.value = []
    diagramData.value = null
    return
  }
  
  // 1. 선택된 클래스의 노드 ID 찾기
  const selectedNodeIds = findNodeIdsByClassNames(
    props.graphNodes,
    props.selectedClasses
  )
  
  if (selectedNodeIds.length === 0) {
    nodes.value = []
    edges.value = []
    diagramData.value = null
    return
  }
  
  // 2. 클래스 다이어그램 데이터 생성
  const data = buildClassDiagramData(
    props.graphNodes,
    props.graphLinks,
    selectedNodeIds,
    props.depth
  )
  
  diagramData.value = data
  
  // 3. ELK 레이아웃 실행
  const { positions, edgeRoutes } = await layoutWithElk(data.classes, data.relationships)
  
  // 4. VueFlow 노드 생성 (ELK positions 사용)
  nodes.value = data.classes.map(cls => {
    const pos = positions.get(cls.id) || { x: 0, y: 0 }
    const isSelected = props.selectedClasses.some(
      s => s.className === cls.className && s.directory === cls.directory
    )
    
    return {
      id: cls.id,
      type: 'classNode',
      position: pos,
      data: {
        umlClass: cls,
        isExpanded: isSelected,
        isSelected,
        // UML 포맷팅 함수들
        formatVisibility,
        formatField,
        formatParams,
        formatMethod,
        formatMethodFull
      },
      style: {
        width: '300px',
        height: `${calculateNodeHeight(cls)}px`
      }
    }
  })
  
  // 5. VueFlow 엣지 생성 (ELK가 준 route를 data로 넣음)
  edges.value = data.relationships.map(rel => {
    const route = edgeRoutes.get(rel.id) || null
    const isDep = rel.type === 'DEPENDENCY'
    const arrowStyle = ARROW_STYLES[rel.type] || ARROW_STYLES.ASSOCIATION
    const lineColor = isDep ? '#666666' : '#333333'
    
    // style 문자열을 CSSProperties 객체로 변환
    const styleObj: Record<string, string> = {}
    const styleParts = arrowStyle.style.split(';').filter(Boolean)
    for (const part of styleParts) {
      const [key, value] = part.split(':').map(s => s.trim())
      if (key && value) {
        const cssKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
        styleObj[cssKey] = value
      }
    }
    
    return {
      id: rel.id,
      source: rel.source,
      target: rel.target,
      // ✅ route 있으면 elkEdge로, 없으면 기본 bezier로
      type: route ? 'elkEdge' : 'bezier',
      animated: false,
      label: rel.label || '',
      labelStyle: { fontSize: 10, fill: '#333333', fontWeight: 500 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
      style: styleObj,
      markerEnd: {
        type: arrowStyle.markerEnd as any,
        color: lineColor
      } as any,
      // ELK 경로 points를 넘김 (없으면 null)
      data: {
        relationship: rel,
        points: route,
      }
    } as unknown as Edge
  })
  
  // 6. 뷰 맞추기
  nextTick(() => {
    setTimeout(() => fitView({ padding: 0.2 }), 100)
  })
}

// ============================================================================
// 이벤트 핸들러
// ============================================================================

/**
 * 노드 클릭 핸들러
 */
function onNodeClick(event: NodeMouseEvent): void {
  const nodeId = event.node.id
  selectedNodeId.value = nodeId
  
  const umlClass = (event.node.data as any)?.umlClass as UmlClass
  if (umlClass) {
    emit('class-click', umlClass.className, umlClass.directory)
  }
}

/**
 * 노드 더블클릭 핸들러 (확장)
 */
function onNodeDoubleClick(event: NodeMouseEvent): void {
  const umlClass = (event.node.data as any)?.umlClass as UmlClass
  if (umlClass) {
    emit('class-expand', umlClass.className, umlClass.directory)
  }
}

// ============================================================================
// 워처 (async 호출 처리 + race 방지)
// ============================================================================

let layoutRunId = 0

async function rebuildSafely(): Promise<void> {
  const myId = ++layoutRunId
  await buildDiagram()
  // 최신 호출만 적용되도록 (race 방지)
  if (myId !== layoutRunId) {
    return
  }
}

// selectedClasses 변경 시 다이어그램 재생성
watch(
  () => props.selectedClasses,
  () => {
    rebuildSafely()
  },
  { deep: true, immediate: true }
)

// depth 변경 시 다이어그램 재생성
watch(
  () => props.depth,
  () => {
    if (props.selectedClasses.length > 0) {
      rebuildSafely()
    }
  }
)

// graphNodes 변경 시 다이어그램 재생성
watch(
  () => props.graphNodes.length,
  () => {
    if (props.selectedClasses.length > 0) {
      rebuildSafely()
    }
  }
)

// ============================================================================
// 라이프사이클
// ============================================================================

onMounted(() => {
  rebuildSafely()
})
</script>

<template>
  <div class="vueflow-class-diagram">
    <!-- 빈 상태 -->
    <div v-if="isEmpty" class="empty-state">
      <div class="empty-icon">📊</div>
      <h3>클래스를 선택하세요</h3>
      <p>검색창에서 클래스를 검색하고 선택하면<br>UML 다이어그램이 표시됩니다</p>
    </div>
    
    <!-- VueFlow 다이어그램 -->
    <VueFlow 
      v-else
      :nodes="nodes"
      :edges="edges"
      :default-viewport="{ zoom: 1 }"
      :min-zoom="0.1"
      :max-zoom="2"
      fit-view-on-init
      @node-click="onNodeClick"
      @node-double-click="onNodeDoubleClick"
    >
      <!-- 배경 -->
      <Background pattern-color="#e2e8f0" :gap="20" />
      
      <!-- 컨트롤 -->
      <Controls position="bottom-right" />
      
      <!-- 미니맵 -->
      <MiniMap 
        position="bottom-left"
        :node-stroke-width="3"
        pannable
        zoomable
      />
      
      <!-- ELK 커스텀 엣지 -->
      <template #edge-elkEdge="edgeProps">
        <ElkEdge v-bind="edgeProps" />
      </template>
      
      <!-- 커스텀 클래스 노드 (UML 클래스 다이어그램 표준) -->
      <!-- 
        UML 클래스 다이어그램 표기법:
        - 접근제어자: + (public), - (private), # (protected), ~ (default)
        - 속성: {접근제어자} {필드명}: {타입}
        - 메서드: {접근제어자} {메서드명}({파라미터타입}): {반환타입}
        - 스테레오타입: «interface», «abstract», «enumeration»
        - 밑줄: static, {readonly}: final
        참고: https://brownbears.tistory.com/577
      -->
      <template #node-classNode="{ data }">
        <div 
          class="class-node"
          :class="{
            'is-interface': data.umlClass.classType === 'interface',
            'is-enum': data.umlClass.classType === 'enum',
            'is-abstract': data.umlClass.isAbstract,
            'is-selected': data.isSelected
          }"
        >
          <!-- 헤더 (클래스명 + 스테레오타입) -->
          <div class="class-header">
            <div class="stereotype" v-if="data.umlClass.classType !== 'class' || data.umlClass.isAbstract">
              {{ data.umlClass.classType === 'interface' ? '«interface»' : 
                 data.umlClass.classType === 'enum' ? '«enumeration»' : 
                 data.umlClass.isAbstract ? '«abstract»' : '' }}
            </div>
            <div class="class-name" :class="{ 'italic': data.umlClass.isAbstract }">
              {{ data.umlClass.className }}
            </div>
          </div>
          
          <!-- 속성(필드) 섹션 -->
          <div class="class-section fields">
            <div class="section-divider"></div>
            <template v-if="data.umlClass.fields.length > 0">
              <div 
                v-for="(field, idx) in data.umlClass.fields.slice(0, 8)" 
                :key="'f-' + idx"
                class="member field-member"
                :title="`${field.visibility} ${field.type} ${field.name}`"
              >
                <span class="visibility">{{ data.formatVisibility(field.visibility) }}</span>
                <span class="member-name">{{ field.name }}</span>
                <span class="member-type" v-if="field.type">: {{ field.type }}</span>
              </div>
              <div v-if="data.umlClass.fields.length > 8" class="more">
                ... +{{ data.umlClass.fields.length - 8 }} more
              </div>
            </template>
            <div v-else class="empty-section">─</div>
          </div>
          
          <!-- 메서드 섹션 -->
          <div class="class-section methods">
            <div class="section-divider"></div>
            <template v-if="data.umlClass.methods.length > 0">
              <div 
                v-for="(method, idx) in data.umlClass.methods.slice(0, 8)" 
                :key="'m-' + idx"
                class="member method-member"
                :class="{ 'constructor': method.isConstructor }"
                :title="data.formatMethodFull(method)"
              >
                <span class="visibility">{{ data.formatVisibility(method.visibility) }}</span>
                <span class="member-name">{{ method.name }}</span>
                <span class="params">({{ data.formatParams(method.parameters) }})</span>
                <span class="return-type" v-if="!method.isConstructor">: {{ method.returnType }}</span>
              </div>
              <div v-if="data.umlClass.methods.length > 8" class="more">
                ... +{{ data.umlClass.methods.length - 8 }} more
              </div>
            </template>
            <div v-else class="empty-section">─</div>
          </div>
          
          <!-- 확장 힌트 -->
          <div class="expand-hint">더블클릭하여 확장</div>
        </div>
      </template>
    </VueFlow>
    
    <!-- 범례 + 통계 (노드패널 버튼 바로 아래) -->
    <div class="legend" v-if="!isEmpty">
      <div class="legend-title">관계 타입</div>
      <div class="legend-items">
        <div class="legend-item">
          <svg class="legend-icon" viewBox="0 0 40 16">
            <line x1="0" y1="8" x2="30" y2="8" stroke="#333" stroke-width="2"/>
            <polygon points="30,4 38,8 30,12" fill="none" stroke="#333" stroke-width="1.5"/>
          </svg>
          <span>상속 (extends)</span>
        </div>
        <div class="legend-item">
          <svg class="legend-icon" viewBox="0 0 40 16">
            <line x1="0" y1="8" x2="30" y2="8" stroke="#333" stroke-width="2" stroke-dasharray="4 3"/>
            <polygon points="30,4 38,8 30,12" fill="none" stroke="#333" stroke-width="1.5"/>
          </svg>
          <span>구현 (implements)</span>
        </div>
        <div class="legend-item">
          <svg class="legend-icon" viewBox="0 0 40 16">
            <polygon points="0,8 6,4 12,8 6,12" fill="#333"/>
            <line x1="12" y1="8" x2="40" y2="8" stroke="#333" stroke-width="2"/>
          </svg>
          <span>합성 (composition)</span>
        </div>
        <div class="legend-item">
          <svg class="legend-icon" viewBox="0 0 40 16">
            <line x1="0" y1="8" x2="32" y2="8" stroke="#333" stroke-width="2"/>
            <polyline points="28,4 36,8 28,12" fill="none" stroke="#333" stroke-width="2"/>
          </svg>
          <span>연관 (association)</span>
        </div>
        <div class="legend-item">
          <svg class="legend-icon" viewBox="0 0 40 16">
            <line x1="0" y1="8" x2="32" y2="8" stroke="#666" stroke-width="1.5" stroke-dasharray="3 2"/>
            <polyline points="28,4 36,8 28,12" fill="none" stroke="#666" stroke-width="1.5"/>
          </svg>
          <span>의존 (dependency)</span>
        </div>
      </div>
      <div class="legend-stats" v-if="diagramData">
        <span>클래스 {{ diagramData.classes.length }}개</span>
        <span class="divider">·</span>
        <span>관계 {{ diagramData.relationships.length }}개</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// ============================================================================
// 컨테이너
// ============================================================================

.vueflow-class-diagram {
  width: 100%;
  height: 100%;
  position: relative;
  background: #f8fafc;
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
  color: #64748b;
  
  .empty-icon {
    font-size: 56px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 16px;
    color: #475569;
    margin-bottom: 8px;
    font-weight: 500;
  }
  
  p {
    font-size: 13px;
    line-height: 1.6;
  }
}

// ============================================================================
// 클래스 노드 (머메이드 스타일 UML 클래스 다이어그램)
// ============================================================================

// 머메이드 스타일 클래스 노드
.class-node {
  background: #ffffde;
  border: 2px solid #333333;
  border-radius: 0;
  min-width: 200px;
  max-width: 340px;
  font-size: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.15s;
  position: relative;
  
  &:hover {
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.15);
    transform: translate(-1px, -1px);
    
    .expand-hint {
      opacity: 1;
    }
  }
  
  // 인터페이스: 주황색 배경 + 사선 패턴 (머메이드 스타일)
  &.is-interface {
    background: 
      repeating-linear-gradient(
        135deg,
        transparent,
        transparent 4px,
        rgba(255, 140, 0, 0.15) 4px,
        rgba(255, 140, 0, 0.15) 8px
      ),
      #fff4e6;
    border-color: #ff8c00;
    
    .class-header {
      background: 
        repeating-linear-gradient(
          135deg,
          transparent,
          transparent 4px,
          rgba(255, 140, 0, 0.2) 4px,
          rgba(255, 140, 0, 0.2) 8px
        ),
        #ffe4c4;
      border-color: #ff8c00;
    }
    
    .class-section {
      background: 
        repeating-linear-gradient(
          135deg,
          transparent,
          transparent 4px,
          rgba(255, 140, 0, 0.1) 4px,
          rgba(255, 140, 0, 0.1) 8px
        ),
        #fff8f0;
    }
  }
  
  // Enum: 노란색 점선 테두리 (머메이드 스타일)
  &.is-enum {
    background: #fffacd;
    border-style: dashed;
    border-color: #b8860b;
    
    .class-header {
      background: #fff8dc;
      border-style: dashed;
      border-color: #b8860b;
    }
    
    .class-section {
      background: #fffacd;
    }
  }
  
  // 추상 클래스: 파란색 배경 + 사선 패턴 (머메이드 스타일)
  &.is-abstract {
    background: 
      repeating-linear-gradient(
        135deg,
        transparent,
        transparent 4px,
        rgba(100, 149, 237, 0.12) 4px,
        rgba(100, 149, 237, 0.12) 8px
      ),
      #e6f0ff;
    border-color: #4682b4;
    
    .class-header {
      background: 
        repeating-linear-gradient(
          135deg,
          transparent,
          transparent 4px,
          rgba(100, 149, 237, 0.18) 4px,
          rgba(100, 149, 237, 0.18) 8px
        ),
        #cce0ff;
      border-color: #4682b4;
    }
    
    .class-section {
      background: 
        repeating-linear-gradient(
          135deg,
          transparent,
          transparent 4px,
          rgba(100, 149, 237, 0.08) 4px,
          rgba(100, 149, 237, 0.08) 8px
        ),
        #f0f6ff;
    }
    
    .class-name {
      font-style: italic;
    }
  }
  
  // 선택된 클래스
  &.is-selected {
    border-width: 3px;
    box-shadow: 0 0 0 4px rgba(255, 165, 0, 0.5);
  }
}

// 머메이드 스타일 헤더 영역
.class-header {
  background: #ffecb3;
  color: #333333;
  padding: 10px 14px;
  text-align: center;
  border-bottom: 2px solid #333333;
  
  .stereotype {
    font-size: 11px;
    color: #555555;
    margin-bottom: 3px;
    font-weight: 500;
  }
  
  .class-name {
    font-weight: 700;
    font-size: 14px;
    word-break: break-word;
    color: #000000;
    letter-spacing: 0.3px;
    
    &.italic {
      font-style: italic;
    }
  }
}

// 머메이드 스타일 섹션
.class-section {
  padding: 6px 10px;
  min-height: 24px;
  background: #ffffde;
  
  &.methods {
    border-top: 2px solid #333333;
  }
  
  .section-divider {
    display: none;
  }
  
  .empty-section {
    text-align: center;
    color: #999999;
    font-size: 11px;
    padding: 4px 0;
  }
}

// 머메이드 스타일 멤버
.member {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 11px;
  color: #333333;
  padding: 3px 6px;
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 2px;
  
  &:hover {
    background: rgba(0, 0, 0, 0.06);
  }
  
  // 접근제어자 기호
  .visibility {
    display: inline-block;
    width: 14px;
    font-weight: 700;
  }
  
  // 멤버 이름
  .member-name {
    font-weight: 600;
    color: #1a1a1a;
  }
  
  // 타입
  .member-type {
    color: #0066cc;
    font-weight: 500;
  }
  
  // 파라미터
  .params {
    color: #555555;
  }
  
  // 반환 타입
  .return-type {
    color: #0066cc;
    font-weight: 500;
  }
  
  // 생성자
  &.constructor {
    .member-name {
      color: #8b008b;
      font-weight: 700;
    }
  }
}

// 필드 멤버 - public은 초록색, private는 빨간색
.field-member .visibility {
  color: #cc0000;
}

// 메서드 멤버 - public은 초록색
.method-member .visibility {
  color: #008800;
}

// 더보기
.more {
  font-size: 10px;
  color: #6b7280;
  font-style: italic;
  padding: 4px 4px 2px;
  text-align: center;
}

// 확장 힌트
.expand-hint {
  position: absolute;
  bottom: 2px;
  right: 6px;
  font-size: 9px;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 6px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.2s;
}

// ============================================================================
// 범례 (노드패널 버튼 바로 아래)
// ============================================================================

.legend {
  position: absolute;
  top: 48px;
  right: 8px;
  background: #fffef8;
  border: 1px solid #d4d4d4;
  border-radius: 4px;
  padding: 12px 16px;
  font-size: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
  
  .legend-title {
    font-weight: 600;
    color: #333333;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e5e5;
    font-size: 13px;
  }
  
  .legend-items {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #333333;
    font-size: 12px;
    
    .legend-icon {
      width: 40px;
      height: 16px;
      flex-shrink: 0;
    }
  }
  
  .legend-stats {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #e5e5e5;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #666;
    
    .divider {
      color: #ccc;
    }
  }
}

// ============================================================================
// VueFlow 커스터마이징
// ============================================================================

:deep(.vue-flow__minimap) {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

:deep(.vue-flow__controls) {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  
  button {
    background: white;
    border: none;
    
    &:hover {
      background: #f1f5f9;
    }
  }
}
</style>

