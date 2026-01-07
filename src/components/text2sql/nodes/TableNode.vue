<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { computed, inject, ref } from 'vue'
import type { Text2SqlColumnInfo } from '@/types'

interface TableNodeData {
  tableName: string
  schema: string
  description?: string
  columns: Text2SqlColumnInfo[]
  columnCount: number
}

const props = defineProps<{
  id: string
  data: TableNodeData
  selected?: boolean
}>()

// Inject handlers from parent
const onRemoveTable = inject<(tableName: string) => void>('onRemoveTable')
const onLoadRelated = inject<(tableName: string) => void>('onLoadRelated')

// Hover state for showing handles
const hoveredColumn = ref<string | null>(null)

// Show only first 8 columns for ERD
const displayColumns = computed(() => {
  return (props.data.columns || []).slice(0, 8)
})

const hasMoreColumns = computed(() => {
  return (props.data.columns?.length || 0) > 8
})

const moreColumnsCount = computed(() => {
  return (props.data.columns?.length || 0) - 8
})

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
    :class="{ 'is-selected': selected }"
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
          'is-hovered': hoveredColumn === col.name
        }"
        @mouseenter="onColumnMouseEnter(col.name)"
        @mouseleave="onColumnMouseLeave"
      >
        <!-- Source Handle (right side) - for FK columns to drag -->
        <Handle 
          v-if="isForeignKey(col.name) || hoveredColumn === col.name"
          :id="`fk-${col.name}-source`"
          type="source"
          :position="Position.Right"
          class="table-node__fk-handle table-node__fk-handle--right"
          :class="{ 'is-visible': hoveredColumn === col.name || isForeignKey(col.name) }"
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
        
        <!-- Drag hint for FK columns -->
        <span 
          v-if="isForeignKey(col.name)" 
          class="table-node__drag-hint"
          :class="{ 'is-visible': hoveredColumn === col.name }"
        >
          ➜
        </span>
      </div>
      
      <!-- More columns indicator -->
      <div v-if="hasMoreColumns" class="table-node__more">
        +{{ moreColumnsCount }} more columns
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

/* Description */
.table-node__description {
  padding: 8px 12px;
  font-size: 0.75rem;
  color: var(--color-text-light, #909296);
  border-bottom: 1px solid var(--color-border, #373a40);
  background: var(--color-bg-tertiary, #25262b);
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

/* FK Handle - 드래그용 */
.table-node__fk-handle {
  width: 12px !important;
  height: 12px !important;
  background: #228be6 !important;
  border: 2px solid #fff !important;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
  cursor: grab !important;
  z-index: 10 !important;
  transition: all 0.2s ease !important;
  opacity: 0;
}

.table-node__fk-handle.is-visible,
.table-node__column:hover .table-node__fk-handle {
  opacity: 1;
}

.table-node__fk-handle:hover {
  transform: scale(1.4) !important;
  background: #40c057 !important;
  box-shadow: 0 0 12px rgba(64, 192, 87, 0.8) !important;
  cursor: grabbing !important;
}

.table-node__fk-handle--right {
  right: -6px !important;
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

/* More columns */
.table-node__more {
  padding: 6px 12px;
  font-size: 0.7rem;
  color: var(--color-text-muted, #5c5f66);
  text-align: center;
  font-style: italic;
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
</style>
