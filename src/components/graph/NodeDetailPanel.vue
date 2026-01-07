<script setup lang="ts">
/**
 * NodeDetailPanel.vue
 * 노드 상세 정보 및 그래프 통계 패널
 * 
 * 주요 기능:
 * - 선택된 노드의 속성 표시
 * - 노드/관계 타입별 통계 표시
 */

import { computed, ref } from 'vue'
import type { GraphNode, GraphLink } from '@/types'
import { getNodeColor } from '@/config/graphStyles'

// ============================================================================
// 타입 정의
// ============================================================================

interface Stats {
  count: number
  color: string
}

interface Props {
  node: GraphNode | null
  relationship: GraphLink | null
  nodeStats?: Map<string, Stats>
  relationshipStats?: Map<string, Stats>
  totalNodes?: number
  totalRelationships?: number
  displayedNodes?: number  // 실제 표시된 노드 수
  displayedRelationships?: number  // 실제 표시된 관계 수
  hiddenNodes?: number     // limit으로 숨겨진 노드 수
  isProcessing?: boolean
  isLimitApplied?: boolean  // limit 적용 여부
  maxDisplayNodes?: number  // 최대 표시 노드 수
  activeFilters?: string[]  // 활성화된 필터 (노드 라벨)
}

interface PropertyItem {
  key: string
  value: string
  isMultiLine: boolean
}

// ============================================================================
// 상수 정의
// ============================================================================

/** 숨길 속성 키 목록 */
const HIDDEN_KEYS = ['labels', 'user_id', 'project_name']

/** 긴 값 기준 (자수) */
const LONG_VALUE_THRESHOLD = 50

// ============================================================================
// Props & Emits
// ============================================================================

const props = withDefaults(defineProps<Props>(), {
  totalNodes: 0,
  totalRelationships: 0,
  displayedNodes: 0,
  displayedRelationships: 0,
  hiddenNodes: 0,
  isProcessing: false,
  isLimitApplied: false,
  maxDisplayNodes: 2000,
  activeFilters: () => []
})

const emit = defineEmits<{
  'node-type-select': [nodeType: string, topOffset: number]
  'style-updated': []
  'label-filter': [label: string]
  'clear-filters': []
}>()


// ============================================================================
// 상태
// ============================================================================

/** 펼침 상태 관리 */
const expandedKeys = ref<Set<string>>(new Set())


// ============================================================================
// Computed - 노드 정보
// ============================================================================


/** 노드의 모든 라벨 반환 */
const nodeClassLabels = computed(() => {
  if (!props.node?.labels) return []
  return props.node.labels
})

/** 노드의 색상 계산 (라벨 기반) */
const nodeColor = computed(() => {
  if (!props.node?.labels) return '#3b82f6'
  return getNodeColor(props.node.labels)
})

/** 각 라벨별 색상 맵 */
const labelColors = computed(() => {
  if (!props.node?.labels) return new Map<string, string>()
  const colorMap = new Map<string, string>()
  for (const label of props.node.labels) {
    colorMap.set(label, getNodeColor([label]))
  }
  return colorMap
})

/** 속성 목록 (노드용) */
const nodeProperties = computed<PropertyItem[]>(() => {
  if (!props.node?.properties) return []
  
  return Object.entries(props.node.properties)
    .filter(([key]) => !HIDDEN_KEYS.includes(key))
    .map(([key, value]) => ({
      key,
      value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
      isMultiLine: typeof value === 'object' || String(value).includes('\n')
    }))
})

/** 속성 목록 (관계용) */
const relationshipProperties = computed<PropertyItem[]>(() => {
  // 노드가 있으면 관계 속성은 절대 표시하지 않음
  if (props.node) return []
  if (!props.relationship) return []
  
  const propsList: PropertyItem[] = [{
    key: '<id>',
    value: props.relationship.id,
    isMultiLine: false
  }]
  
  if (props.relationship.properties) {
    const propEntries = Object.entries(props.relationship.properties)
      .map(([key, value]) => ({
        key,
        value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value),
        isMultiLine: typeof value === 'object' || String(value).includes('\n')
      }))
    propsList.push(...propEntries)
  }
  
  return propsList
})

/** 표시할 속성 목록 (노드 우선, 없으면 관계) */
const properties = computed(() => {
  // 노드가 있으면 항상 노드 속성 표시
  return props.node ? nodeProperties.value : relationshipProperties.value
})


// ============================================================================
// Computed - 통계
// ============================================================================

/** 노드 통계 (개수 많은 순 정렬) */
const sortedNodeStats = computed(() => {
  if (!props.nodeStats) return []
  
  return Array.from(props.nodeStats.entries())
    .map(([label, stat]) => ({ label, ...stat }))
    .sort((a, b) => b.count - a.count)
})

/** 관계 통계 (개수 많은 순 정렬) */
const sortedRelStats = computed(() => {
  if (!props.relationshipStats) return []
  
  return Array.from(props.relationshipStats.entries())
    .map(([type, stat]) => ({ type, ...stat }))
    .sort((a, b) => b.count - a.count)
})

/** limit 적용 여부 (isLimitApplied 또는 totalNodes > displayedNodes로 판단) */
const showLimitWarning = computed(() => {
  return props.isLimitApplied || (props.totalNodes > props.displayedNodes && props.displayedNodes >= props.maxDisplayNodes)
})

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 값이 긴지 확인
 */
function isLongValue(value: string): boolean {
  return value.length > LONG_VALUE_THRESHOLD || value.includes('\n')
}


// ============================================================================
// 이벤트 핸들러
// ============================================================================

/**
 * 값 펼침/접기 토글
 */
function toggleExpand(key: string): void {
  if (expandedKeys.value.has(key)) {
    expandedKeys.value.delete(key)
  } else {
    expandedKeys.value.add(key)
  }
}

/**
 * 노드 타입 필터 핸들러 (클릭 시 해당 라벨로 필터링)
 */
function handleLabelFilter(label: string): void {
  emit('label-filter', label)
}

/**
 * 노드 타입 스타일 선택 핸들러 (우클릭 시 색상 변경)
 * 클릭한 라벨의 세로 중앙 위치를 계산하여 스타일 패널 위치 결정
 */
function handleNodeTypeContextMenu(event: MouseEvent, nodeType: string): void {
  event.preventDefault()
  const target = event.currentTarget as HTMLElement
  const panelBody = target.closest('.panel-body') as HTMLElement
  const panelHeader = target.closest('.floating-panel')?.querySelector('.panel-header') as HTMLElement
  
  if (!panelBody || !panelHeader) {
    emit('node-type-select', nodeType, 100)
    return
  }
  
  const panelHeaderHeight = panelHeader.offsetHeight
  const scrollTop = panelBody.scrollTop
  const rect = target.getBoundingClientRect()
  const panelBodyRect = panelBody.getBoundingClientRect()
  
  // 라벨의 세로 중앙 위치를 패널 내부 기준으로 계산
  const labelCenterY = rect.top + rect.height / 2 - panelBodyRect.top + scrollTop
  const topOffset = panelHeaderHeight + labelCenterY
  
  emit('node-type-select', nodeType, Math.max(0, topOffset))
}

/**
 * 필터가 활성화되어 있는지 확인
 */
function isFilterActive(label: string): boolean {
  return props.activeFilters?.includes(label) ?? false
}

/**
 * 전체 필터가 적용되어 있는지
 */
function hasActiveFilters(): boolean {
  return (props.activeFilters?.length ?? 0) > 0
}

/**
 * 필터 초기화
 */
function handleClearFilters(): void {
  emit('clear-filters')
}


</script>

<template>
  <div class="panel-content">
    <!-- ========== 노드 선택 시: 노드 속성 표시 ========== -->
    <template v-if="node">
      <!-- 노드 타입 표시 (각 라벨의 색상 적용) -->
      <div class="type-header">
        <span 
          class="type-badge" 
          v-for="label in nodeClassLabels" 
          :key="label"
          :style="{ background: labelColors.get(label) || nodeColor }"
        >
          {{ label }}
        </span>
      </div>
      
      <!-- Properties 테이블 -->
      <div class="props-table-wrapper">
        <table class="props-table">
          <thead>
            <tr>
              <th class="col-key">속성</th>
              <th class="col-value">값</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="properties.length === 0">
              <td colspan="2" class="cell-empty">속성이 없습니다</td>
            </tr>
            <tr v-for="prop in properties" :key="prop.key">
              <td class="cell-key">{{ prop.key }}</td>
              <td class="cell-value">
                <div 
                  class="value-container" 
                  :class="{ expanded: expandedKeys.has(prop.key) }"
                >
                  <div class="value-content">{{ prop.value }}</div>
                </div>
                <button 
                  v-if="isLongValue(prop.value)" 
                  class="show-toggle"
                  @click="toggleExpand(prop.key)"
                >
                  {{ expandedKeys.has(prop.key) ? '접기' : '전체 보기' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    
    <!-- ========== 관계 선택 시: 관계 속성 표시 (노드가 없을 때만) ========== -->
    <template v-else-if="relationship">
      <!-- 관계 타입 표시 -->
      <div class="type-header">
        <span class="type-badge relationship-badge">{{ relationship.type }}</span>
      </div>
      
      <!-- Properties 테이블 -->
      <div class="props-table-wrapper">
        <table class="props-table">
          <thead>
            <tr>
              <th class="col-key">속성</th>
              <th class="col-value">값</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="properties.length === 0">
              <td colspan="2" class="cell-empty">속성이 없습니다</td>
            </tr>
            <tr v-for="prop in properties" :key="prop.key">
              <td class="cell-key">{{ prop.key }}</td>
              <td class="cell-value">
                <div 
                  class="value-container" 
                  :class="{ expanded: expandedKeys.has(prop.key) }"
                >
                  <div class="value-content">{{ prop.value }}</div>
                </div>
                <button 
                  v-if="isLongValue(prop.value)" 
                  class="show-toggle"
                  @click="toggleExpand(prop.key)"
                >
                  {{ expandedKeys.has(prop.key) ? '접기' : '전체 보기' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
    </template>
    
    <!-- ========== 노드/관계 미선택 시: 통계 표시 ========== -->
    <template v-if="!node && !relationship">
      <div class="stats-wrapper">
        <!-- Node labels 섹션 -->
        <div class="stats-section">
          <div class="section-header">
            <span class="section-title">Node labels</span>
            <button 
              v-if="hasActiveFilters()" 
              class="clear-filter-btn"
              @click="handleClearFilters"
              title="필터 초기화"
            >
              ✕ 필터 해제
            </button>
          </div>
          <div class="badge-container">
            <span 
              class="stat-badge total clickable"
              :class="{ dimmed: hasActiveFilters() }"
              @click="handleClearFilters"
              title="전체 보기"
            >* ({{ totalNodes }})</span>
            <span 
              v-for="stat in sortedNodeStats" 
              :key="stat.label"
              class="stat-badge clickable"
              :class="{ active: isFilterActive(stat.label), dimmed: hasActiveFilters() && !isFilterActive(stat.label) }"
              :style="{ background: stat.color }"
              @click="handleLabelFilter(stat.label)"
              @contextmenu="handleNodeTypeContextMenu($event, stat.label)"
              :title="`클릭: 필터링 / 우클릭: 색상 변경`"
            >
              {{ stat.label }} ({{ stat.count }})
            </span>
          </div>
        </div>
        
        <!-- Relationship types 섹션 -->
        <div class="stats-section">
          <div class="section-title">Relationship types</div>
          <div class="badge-container">
            <span class="stat-badge total">* ({{ totalRelationships }})</span>
            <span 
              v-for="stat in sortedRelStats" 
              :key="stat.type"
              class="stat-badge rel"
              :style="{ background: stat.color }"
            >
              {{ stat.type }} ({{ stat.count }})
            </span>
          </div>
        </div>
        
        <!-- 요약 -->
        <div class="display-summary">
          <div class="summary-main">
            <span>Displaying {{ displayedNodes ?? totalNodes }} nodes, {{ displayedRelationships ?? totalRelationships }} relationships.</span>
          </div>
          <div class="limit-warning" v-if="showLimitWarning">
            <span class="warning-text">
              More than {{ maxDisplayNodes.toLocaleString() }} nodes were found; only
              {{ maxDisplayNodes.toLocaleString() }} are visible due to the display limit.
            </span>
          </div>
          <div class="summary-detail" v-if="hiddenNodes > 0 && !isLimitApplied">
            <span class="hidden-badge">+{{ hiddenNodes }} 숨김</span>
            <span class="hint">더블클릭으로 확장</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
// ============================================================================
// 레이아웃
// ============================================================================

.panel-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-top: 8px;
}

// ============================================================================
// 타입 뱃지
// ============================================================================

.type-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
}

.type-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-bright);
}

.type-badge {
  display: inline-block;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-radius: var(--radius-sm);
  background: var(--color-accent);
  color: white;
  
  &.relationship-badge {
    background: var(--color-text-muted);
    color: white;
  }
}

// ============================================================================
// Properties 테이블
// ============================================================================

.props-table-wrapper {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.props-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  
  thead {
    position: sticky;
    top: 0;
    z-index: 1;
    
    th {
      padding: 12px 14px;
      text-align: left;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid var(--color-border);
      
      &.col-key {
        width: 110px;
        min-width: 110px;
        background: var(--color-bg-tertiary);
        color: var(--color-text-light);
      }
      
      &.col-value {
        width: auto;
        background: var(--color-bg-secondary);
        color: var(--color-text-muted);
      }
    }
  }
  
  tbody {
    tr {
      border-bottom: 1px solid var(--color-border);
      
      &:last-child {
        border-bottom: none;
      }
    }
    
    td {
      padding: 12px 14px;
      vertical-align: top;
    }
  }
}

.cell-key {
  font-weight: 600;
  color: var(--color-text);
  font-size: 12px;
  white-space: nowrap;
  background: var(--color-bg-tertiary);
  border-right: 1px solid var(--color-border);
  
  // 텍스트 선택시 가시성 보장
  ::selection {
    background: var(--color-accent);
    color: white;
  }
  
  ::-moz-selection {
    background: var(--color-accent);
    color: white;
  }
}

.cell-value {
  background: var(--color-bg);
  
  // 텍스트 선택시 가시성 보장
  ::selection {
    background: #1c7ed6;
    color: white;
  }
  
  ::-moz-selection {
    background: #1c7ed6;
    color: white;
  }
}

.cell-empty {
  text-align: center;
  padding: 20px;
  color: var(--color-text-muted);
  font-style: italic;
}

// ============================================================================
// 값 컨테이너
// ============================================================================

.value-container {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-accent);
  line-height: 1.6;
  
  // 텍스트 선택시 가시성 보장
  ::selection {
    background: #1c7ed6;
    color: white;
  }
  
  ::-moz-selection {
    background: #1c7ed6;
    color: white;
  }
  
  .value-content {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  &.expanded .value-content {
    display: block;
    -webkit-line-clamp: unset;
    max-height: 300px;
    overflow-y: auto;
  }
}

.show-toggle {
  display: block;
  margin-top: 6px;
  background: none;
  border: none;
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  
  &:hover {
    text-decoration: underline;
  }
}


// ============================================================================
// 통계 섹션
// ============================================================================

.stats-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  padding-bottom: 8px;
}

.stats-section {
  margin-bottom: 20px;
  flex-shrink: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-bright);
}

.clear-filter-btn {
  padding: 3px 8px;
  font-size: 10px;
  font-weight: 500;
  background: rgba(250, 82, 82, 0.15);
  color: var(--color-error);
  border: 1px solid rgba(250, 82, 82, 0.3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: rgba(250, 82, 82, 0.25);
    border-color: var(--color-error);
  }
}

.badge-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.stat-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 14px;
  color: white;
  
  &.total {
    background: var(--color-text-muted);
  }
  
  &.rel {
    background: var(--color-text-light);
  }
  
  &.clickable {
    cursor: pointer;
    transition: all 0.15s ease;
    position: relative;
    
    &:hover {
      transform: scale(1.02);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
      z-index: 1;
      opacity: 0.9;
    }
    
    &:active {
      transform: scale(1.0);
    }
  }
  
  &.active {
    box-shadow: 0 0 0 2px white, 0 0 0 4px var(--color-accent);
    transform: scale(1.05);
    z-index: 2;
  }
  
  &.dimmed {
    opacity: 0.4;
    
    &:hover {
      opacity: 0.7;
    }
  }
}

// ============================================================================
// 요약
// ============================================================================

.display-summary {
  margin-top: auto;
  padding: 16px 0 8px 0;
  flex-shrink: 0;
  
  .summary-main {
    font-size: 13px;
    font-weight: 400;
    color: var(--color-text);
  }
  
  .limit-warning {
    margin-top: 8px;
    font-size: 12px;
    font-weight: 400;
    
    .warning-text {
      color: var(--color-warning);
      font-size: 12px;
      line-height: 1.5;
    }
  }
  
  .summary-detail {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 11px;
    
    .hidden-badge {
      padding: 2px 8px;
      background: rgba(250, 176, 5, 0.2);
      color: var(--color-warning);
      border-radius: 10px;
      font-weight: 500;
    }
    
    .hint {
      color: var(--color-text-muted);
    }
  }
}
</style>
