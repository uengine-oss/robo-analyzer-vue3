<template>
  <div class="result-table">
    <div class="table-header">
      <h3>
        <IconTable :size="14" />
        결과 ({{ data.row_count }}행)
      </h3>
      <span class="execution-time">
        <IconPlay :size="12" />
        실행 시간: {{ data.execution_time_ms }}ms
      </span>
    </div>
    
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th v-for="col in data.columns" :key="col">{{ col }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in data.rows" :key="idx">
            <td v-for="(cell, cidx) in row" :key="cidx">
              {{ formatCell(cell) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ReactExecutionResult } from '@/types'
import { IconTable, IconPlay } from '@/components/icons'

defineProps<{
  data: ReactExecutionResult
}>()

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') {
    return value.toLocaleString()
  }
  return String(value)
}
</script>

<style scoped lang="scss">
.result-table {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.table-header h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.execution-time {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-success);
}

.table-wrapper {
  overflow-x: auto;
  max-height: 400px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: var(--color-bg-tertiary);
  position: sticky;
  top: 0;
}

th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--color-text-light);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
  font-size: 12px;
}

td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 13px;
}

tbody tr:hover {
  background: var(--color-bg-tertiary);
}
</style>
