<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { computed, inject, ref, watch } from 'vue'
import type { Text2SqlColumnInfo } from '@/types'
import { useSchemaCanvasStore } from '@/stores/schemaCanvas'

interface TableNodeData {
  tableName: string
  schema: string
  description?: string
  columns: Text2SqlColumnInfo[]
  columnCount: number
  isPrimary?: boolean  // 직접 선택/드래그한 테이블인지 여부
}

const props = defineProps<{
  id: string
  data: TableNodeData
  selected?: boolean
}>()

// Inject handlers from parent
const onRemoveTable = inject<(tableName: string) => void>('onRemoveTable')
const onLoadRelated = inject<(tableName: string) => void>('onLoadRelated')

// 캔버스 스토어 (실시간 업데이트 감지용)
const canvasStore = useSchemaCanvasStore()

// 노드 업데이트 애니메이션 상태
const isNodeUpdating = ref(false)
const isNodeNewlyAdded = ref(false)
const updatingColumns = ref<Set<string>>(new Set())

// 새로 추가된 테이블 감지
watch(
  () => canvasStore.newlyAddedTables.get(props.id),
  (newVal) => {
    if (newVal) {
      isNodeNewlyAdded.value = true
      setTimeout(() => {
        isNodeNewlyAdded.value = false
      }, 5000)
    }
  },
  { immediate: true }
)

// 노드 업데이트 감지
watch(
  () => canvasStore.updatedNodes.get(props.id),
  (newVal) => {
    if (newVal) {
      isNodeUpdating.value = true
      setTimeout(() => {
        isNodeUpdating.value = false
      }, 3000)
    }
  },
  { immediate: true }
)

// 컬럼 업데이트 감지
watch(
  () => Array.from(canvasStore.updatedColumns.entries()),
  (entries) => {
    const tableName = props.data.tableName
    for (const [key, _] of entries) {
      if (key.startsWith(`${tableName}:`)) {
        const colName = key.split(':')[1]
        updatingColumns.value.add(colName)
        setTimeout(() => {
          updatingColumns.value.delete(colName)
        }, 3000)
      }
    }
  },
  { deep: true }
)

// 컬럼이 업데이트 중인지 확인
function isColumnUpdating(colName: string): boolean {
  return updatingColumns.value.has(colName)
}

// 설명 텍스트 잘라내기 (최대 20자)
function truncateDescription(desc: string, maxLen = 20): string {
  if (!desc) return ''
  return desc.length > maxLen ? desc.substring(0, maxLen) + '...' : desc
}

// Hover state for showing handles
const hoveredColumn = ref<string | null>(null)

// 접기/펼치기 상태
const isExpanded = ref(false)

// 기본 표시 개수
const DEFAULT_DISPLAY_COUNT = 8

// 표시할 컬럼 목록
const displayColumns = computed(() => {
  const columns = props.data.columns || []
  if (isExpanded.value) {
    return columns  // 전체 표시
  }
  return columns.slice(0, DEFAULT_DISPLAY_COUNT)
})

const hasMoreColumns = computed(() => {
  return (props.data.columns?.length || 0) > DEFAULT_DISPLAY_COUNT
})

const moreColumnsCount = computed(() => {
  return (props.data.columns?.length || 0) - DEFAULT_DISPLAY_COUNT
})

// 접기/펼치기 토글
function toggleExpand(e: Event) {
  e.stopPropagation()
  isExpanded.value = !isExpanded.value
}

// Primary key column (typically 'id')
const pkColumn = computed(() => {
  return props.data.columns?.find(c => c.name.toLowerCase() === 'id')
})

function isPrimaryKey(colName: string): boolean {
  return colName.toLowerCase() === 'id'
}

function isForeignKey(colName: string): boolean {
  return colName.endsWith('_id') && colName.toLowerCase() !== 'id'
}

function getColumnTypeShort(dtype: string): string {
  const type = dtype.toLowerCase()
  if (type.includes('varchar') || type.includes('text') || type.includes('char')) return 'str'
  if (type.includes('int') || type.includes('serial')) return 'int'
  if (type.includes('decimal') || type.includes('numeric') || type.includes('float') || type.includes('double')) return 'num'
  if (type.includes('bool')) return 'bool'
  if (type.includes('timestamp') || type.includes('datetime')) return 'ts'
  if (type.includes('date')) return 'date'
  if (type.includes('time')) return 'time'
  if (type.includes('json')) return 'json'
  if (type.includes('uuid')) return 'uuid'
  return type.substring(0, 4)
}

function handleRemove(e: Event) {
  e.stopPropagation()
  onRemoveTable?.(props.data.tableName)
}

function handleLoadRelated(e: Event) {
  e.stopPropagation()
  onLoadRelated?.(props.data.tableName)
}

function onColumnMouseEnter(colName: string) {
  hoveredColumn.value = colName
}

function onColumnMouseLeave() {
  hoveredColumn.value = null
}
</script>

<template>
  <div 
    class="table-node"
    :class="{ 
      'is-selected': selected, 
      'is-primary': data.isPrimary,
      'is-updating': isNodeUpdating,
      'is-newly-added': isNodeNewlyAdded
    }"
  >
    <!-- Header with PK Target Handle -->
    <div class="table-node__header">
      <!-- PK Target Handle - for receiving FK connections -->
      <Handle 
        v-if="pkColumn"
        :id="`pk-${pkColumn.name}`"
        type="target"
        :position="Position.Left"
        class="table-node__pk-handle table-node__pk-handle--left"
      />
      
      <div class="table-node__icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="3" y1="9" x2="21" y2="9"></line>
          <line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
      </div>
      <span class="table-node__name">{{ data.tableName }}</span>
      <div class="table-node__actions">
        <button 
          class="table-node__action-btn" 
          @click="handleLoadRelated"
          title="관련 테이블 로드"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
        </button>
        <button 
          class="table-node__action-btn table-node__action-btn--remove" 
          @click="handleRemove"
          title="캔버스에서 제거"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <!-- PK Target Handle Right -->
      <Handle 
        v-if="pkColumn"
        :id="`pk-${pkColumn.name}-right`"
        type="target"
        :position="Position.Right"
        class="table-node__pk-handle table-node__pk-handle--right"
      />
    </div>
    
    <!-- Description -->
    <div v-if="data.description" class="table-node__description">
      {{ data.description }}
    </div>
    
    <!-- Columns -->
    <div class="table-node__columns">
      <div 
        v-for="col in displayColumns" 
        :key="col.name"
        class="table-node__column"
        :class="{
          'is-pk': isPrimaryKey(col.name),
          'is-fk': isForeignKey(col.name),
          'is-hovered': hoveredColumn === col.name,
          'is-updating': isColumnUpdating(col.name)
        }"
        @mouseenter="onColumnMouseEnter(col.name)"
        @mouseleave="onColumnMouseLeave"
      >
        <!-- Target Handle (left side) - 각 컬럼에서 연결을 받을 수 있음 -->
        <Handle 
          :id="`pk-${col.name}`"
          type="target"
          :position="Position.Left"
          class="table-node__target-handle table-node__target-handle--left"
        />
        
        <!-- Source Handle (right side) - 모든 컬럼에서 관계 시작 가능 -->
        <Handle 
          :id="`fk-${col.name}-source`"
          type="source"
          :position="Position.Right"
          class="table-node__source-handle table-node__source-handle--right"
          :class="{ 'is-fk': isForeignKey(col.name), 'is-hovered': hoveredColumn === col.name }"
        />
        
        <div class="table-node__column-info">
          <span class="table-node__column-icon">
            <template v-if="isPrimaryKey(col.name)">🔑</template>
            <template v-else-if="isForeignKey(col.name)">🔗</template>
            <template v-else>•</template>
          </span>
          <span class="table-node__column-name">{{ col.name }}</span>
          <span class="table-node__column-type">{{ getColumnTypeShort(col.dtype) }}</span>
          <span v-if="!col.nullable" class="table-node__column-required">*</span>
        </div>
        
        <!-- 컬럼 설명 (있는 경우만 표시) -->
        <div 
          v-if="col.description" 
          class="table-node__column-desc"
          :class="{ 'is-updating': isColumnUpdating(col.name) }"
          :title="col.description"
        >
          {{ truncateDescription(col.description) }}
        </div>
        
        <!-- Drag hint for FK columns -->
        <span 
          v-if="isForeignKey(col.name)" 
          class="table-node__drag-hint"
          :class="{ 'is-visible': hoveredColumn === col.name }"
        >
          ➜
        </span>
      </div>
      
      <!-- 접기/펼치기 버튼 -->
      <div 
        v-if="hasMoreColumns" 
        class="table-node__toggle"
        @click="toggleExpand"
      >
        <span v-if="!isExpanded" class="table-node__toggle-icon">▼</span>
        <span v-else class="table-node__toggle-icon">▲</span>
        <span v-if="!isExpanded">+{{ moreColumnsCount }} more columns</span>
        <span v-else>접기</span>
      </div>
    </div>
    
    <!-- Footer -->
    <div class="table-node__footer">
      <span class="table-node__schema">{{ data.schema }}</span>
      <span class="table-node__count">{{ data.columnCount }} cols</span>
    </div>
  </div>
</template>

<style scoped>
.table-node {
  background: var(--color-bg-secondary, #2c2e33);
  border: 2px solid var(--color-border, #373a40);
  border-radius: 10px;
  min-width: 240px;
  max-width: 300px;
  font-family: var(--font-main, 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  transition: all 0.2s ease;
  position: relative;
}

.table-node:hover {
  border-color: var(--color-accent, #4dabf7);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.table-node.is-selected {
  border-color: var(--color-accent, #228be6);
  box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.3), 0 8px 24px rgba(0, 0, 0, 0.5);
}

/* Primary table (직접 선택/드래그한 테이블) - 노란색 테두리 */
.table-node.is-primary {
  border-color: #fbbf24;
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.35), 0 8px 24px rgba(0, 0, 0, 0.5);
}

.table-node.is-primary .table-node__header {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  border-bottom-color: #d97706;
}

.table-node.is-primary .table-node__header .table-node__name {
  color: #1a1b1e;
}

.table-node.is-primary .table-node__header .table-node__icon {
  color: #1a1b1e;
}

/* Header */
.table-node__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #339af0 0%, #228be6 100%);
  color: white;
  border-radius: 8px 8px 0 0;
  position: relative;
}

.table-node__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
}

.table-node__name {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-node__actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.table-node:hover .table-node__actions {
  opacity: 1;
}

.table-node__action-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: background 0.15s ease;
}

.table-node__action-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.table-node__action-btn--remove:hover {
  background: rgba(255, 59, 48, 0.8);
}

/* PK Handle in Header - 받기용 */
.table-node__pk-handle {
  width: 14px !important;
  height: 14px !important;
  background: #ffd43b !important;
  border: 2px solid #fff !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
  cursor: crosshair !important;
  z-index: 10 !important;
  transition: all 0.2s ease !important;
}

.table-node__pk-handle:hover {
  transform: scale(1.4) !important;
  background: #40c057 !important;
  box-shadow: 0 0 12px rgba(64, 192, 87, 0.8) !important;
}

.table-node__pk-handle--left {
  left: -7px !important;
}

.table-node__pk-handle--right {
  right: -7px !important;
}

/* Description - 한 줄로 제한, 넘치면 ... */
.table-node__description {
  padding: 8px 12px;
  font-size: 0.75rem;
  color: var(--color-text-light, #909296);
  border-bottom: 1px solid var(--color-border, #373a40);
  background: var(--color-bg-tertiary, #25262b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Columns */
.table-node__columns {
  padding: 6px 0;
  background: var(--color-bg-secondary, #2c2e33);
}

.table-node__column {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  position: relative;
  transition: all 0.15s ease;
  cursor: default;
}

.table-node__column:hover,
.table-node__column.is-hovered {
  background: var(--color-bg-tertiary, #373a40);
}

.table-node__column.is-pk {
  background: rgba(255, 212, 59, 0.15);
  border-left: 3px solid #ffd43b;
}

.table-node__column.is-fk {
  background: rgba(34, 139, 230, 0.12);
  border-left: 3px solid #228be6;
  cursor: grab;
}

.table-node__column.is-fk:hover {
  background: rgba(34, 139, 230, 0.25);
}

.table-node__column-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.table-node__column-icon {
  font-size: 0.7rem;
  width: 16px;
  text-align: center;
}

.table-node__column.is-pk .table-node__column-icon {
  color: #ffd43b;
}

.table-node__column.is-fk .table-node__column-icon {
  color: #228be6;
}

.table-node__column-name {
  flex: 1;
  font-size: 0.8rem;
  color: var(--color-text, #c1c2c5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-node__column-type {
  font-size: 0.7rem;
  color: var(--color-text-muted, #5c5f66);
  background: var(--color-bg-tertiary, #25262b);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

.table-node__column-required {
  color: #ff6b6b;
  font-weight: bold;
  font-size: 0.75rem;
}

/* 컬럼 설명 표시 */
.table-node__column-desc {
  margin-top: 2px;
  margin-left: 22px;
  font-size: 0.65rem;
  color: var(--color-text-muted, #868e96);
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
  transition: all 0.3s ease;
}

.table-node__column-desc.is-updating {
  background: rgba(81, 207, 102, 0.25);
  color: #51cf66;
  animation: desc-highlight 0.5s ease-in-out 3;
}

@keyframes desc-highlight {
  0%, 100% { background: rgba(81, 207, 102, 0.25); }
  50% { background: rgba(81, 207, 102, 0.5); }
}

/* Target Handle (left) - 각 컬럼에서 연결을 받음 */
.table-node__target-handle {
  width: 10px !important;
  height: 10px !important;
  background: #40c057 !important;
  border: 2px solid #fff !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
  cursor: crosshair !important;
  z-index: 10 !important;
  transition: all 0.2s ease !important;
  opacity: 0.6;
}

.table-node__target-handle:hover {
  transform: scale(1.3) !important;
  opacity: 1;
  background: #51cf66 !important;
  box-shadow: 0 0 10px rgba(64, 192, 87, 0.7) !important;
}

.table-node__target-handle--left {
  left: -5px !important;
}

/* Source Handle (right) - 관계 시작점 */
.table-node__source-handle {
  width: 10px !important;
  height: 10px !important;
  background: #868e96 !important;
  border: 2px solid #fff !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
  cursor: grab !important;
  z-index: 10 !important;
  transition: all 0.2s ease !important;
  opacity: 0.4;
}

.table-node__source-handle.is-fk {
  background: #228be6 !important;
  opacity: 0.8;
}

.table-node__source-handle.is-hovered,
.table-node__column:hover .table-node__source-handle {
  opacity: 1;
  transform: scale(1.2) !important;
}

.table-node__source-handle:hover {
  transform: scale(1.4) !important;
  background: #40c057 !important;
  box-shadow: 0 0 12px rgba(64, 192, 87, 0.8) !important;
  cursor: grabbing !important;
}

.table-node__source-handle--right {
  right: -5px !important;
}

/* Drag hint */
.table-node__drag-hint {
  font-size: 0.85rem;
  color: var(--color-accent, #228be6);
  opacity: 0;
  transition: opacity 0.2s ease;
  margin-left: 4px;
}

.table-node__drag-hint.is-visible {
  opacity: 1;
  animation: pulse-arrow 1s ease-in-out infinite;
}

@keyframes pulse-arrow {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(4px); }
}

/* 접기/펼치기 토글 버튼 */
.table-node__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 0.75rem;
  color: var(--color-accent, #4dabf7);
  text-align: center;
  cursor: pointer;
  background: var(--color-bg-tertiary, #25262b);
  border-top: 1px dashed var(--color-border, #373a40);
  transition: all 0.2s ease;
  user-select: none;
}

.table-node__toggle:hover {
  background: rgba(77, 171, 247, 0.15);
  color: var(--color-accent-hover, #74c0fc);
}

.table-node__toggle-icon {
  font-size: 0.65rem;
  transition: transform 0.2s ease;
}

.table-node__toggle:hover .table-node__toggle-icon {
  transform: scale(1.2);
}

/* Footer */
.table-node__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--color-bg-tertiary, #25262b);
  border-radius: 0 0 8px 8px;
  border-top: 1px solid var(--color-border, #373a40);
}

.table-node__schema {
  font-size: 0.65rem;
  color: var(--color-text-muted, #5c5f66);
  background: var(--color-bg, #373a40);
  padding: 2px 6px;
  border-radius: 3px;
}

.table-node__count {
  font-size: 0.65rem;
  color: var(--color-text-light, #909296);
}

/* =========================================
   실시간 업데이트 애니메이션
   ========================================= */

/* 새로 추가된 테이블 애니메이션 */
.table-node.is-newly-added {
  animation: table-appear 0.8s ease-out forwards;
  border-color: #339af0 !important;
  box-shadow: 
    0 0 0 4px rgba(51, 154, 240, 0.4),
    0 0 30px rgba(51, 154, 240, 0.3),
    0 12px 30px rgba(0, 0, 0, 0.5) !important;
}

.table-node.is-newly-added::before {
  content: '🆕 NEW';
  position: absolute;
  top: -12px;
  left: 10px;
  background: linear-gradient(135deg, #339af0, #228be6);
  color: white;
  font-size: 0.6rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  z-index: 100;
  animation: badge-float 2s ease-in-out infinite;
  box-shadow: 0 2px 10px rgba(51, 154, 240, 0.5);
}

.table-node.is-newly-added .table-node__header {
  background: linear-gradient(135deg, #339af0 0%, #228be6 100%);
  animation: header-glow 1s ease-in-out infinite alternate;
}

@keyframes table-appear {
  0% {
    opacity: 0;
    transform: scale(0.5) translateY(-20px);
  }
  60% {
    opacity: 1;
    transform: scale(1.05) translateY(5px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes badge-float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}

@keyframes header-glow {
  0% {
    box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.1);
  }
  100% {
    box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.2);
  }
}

/* 노드 업데이트 애니메이션 */
.table-node.is-updating {
  animation: node-update-pulse 0.8s ease-in-out 3;
  border-color: #51cf66 !important;
  box-shadow: 
    0 0 0 3px rgba(81, 207, 102, 0.4),
    0 0 20px rgba(81, 207, 102, 0.3),
    0 8px 24px rgba(0, 0, 0, 0.5) !important;
}

.table-node.is-updating .table-node__header {
  background: linear-gradient(135deg, #51cf66 0%, #40c057 100%);
  animation: header-flash 0.8s ease-in-out 3;
}

@keyframes node-update-pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.02);
  }
}

@keyframes header-flash {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}

/* 컬럼 업데이트 애니메이션 */
.table-node__column.is-updating {
  animation: column-update-highlight 0.6s ease-in-out 3;
  background: rgba(81, 207, 102, 0.3) !important;
  border-left: 3px solid #51cf66 !important;
}

.table-node__column.is-updating .table-node__column-name {
  color: #51cf66 !important;
  font-weight: 600;
}

@keyframes column-update-highlight {
  0%, 100% {
    background: rgba(81, 207, 102, 0.3);
  }
  50% {
    background: rgba(81, 207, 102, 0.5);
  }
}

/* 업데이트 배지 (선택적) */
.table-node.is-updating::before {
  content: '✨ 업데이트';
  position: absolute;
  top: -10px;
  right: 10px;
  background: linear-gradient(135deg, #51cf66, #40c057);
  color: white;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  z-index: 100;
  animation: badge-bounce 0.5s ease-out;
  box-shadow: 0 2px 8px rgba(81, 207, 102, 0.4);
}

@keyframes badge-bounce {
  0% {
    transform: translateY(-10px) scale(0.8);
    opacity: 0;
  }
  50% {
    transform: translateY(2px) scale(1.05);
  }
  100% {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}

/* Description 업데이트 효과 */
.table-node.is-updating .table-node__description {
  background: rgba(81, 207, 102, 0.2);
  border-left: 3px solid #51cf66;
  animation: desc-pulse 0.8s ease-in-out 3;
}

@keyframes desc-pulse {
  0%, 100% {
    padding-left: 12px;
  }
  50% {
    padding-left: 16px;
  }
}
</style>
