<template>
  <div class="history-panel" :class="{ collapsed: !isOpen }">
    <!-- 토글 버튼 -->
    <button class="toggle-btn" @click="$emit('toggle')">
      <IconHistory :size="16" />
      <span v-if="isOpen">히스토리</span>
    </button>

    <!-- 패널 내용 -->
    <div v-if="isOpen" class="panel-content">
      <!-- 헤더 -->
      <div class="panel-header">
        <h3>쿼리 히스토리</h3>
        <div class="header-actions">
          <button v-if="historyStore.items.length > 0" class="clear-btn" @click="handleClearAll" title="전체 삭제">
            <IconTrash :size="14" />
          </button>
          <button class="refresh-btn" @click="refreshHistory" title="새로고침">
            <IconRefresh :size="14" :class="{ spinning: historyStore.loading }" />
          </button>
        </div>
      </div>

      <!-- 검색 -->
      <div class="search-box">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="검색..." 
          @input="debouncedSearch"
        />
      </div>

      <!-- 히스토리 목록 -->
      <div class="history-list" ref="listRef">
        <div v-if="historyStore.loading" class="loading">
          <div class="spinner"></div>
        </div>
        
        <div v-else-if="historyStore.items.length === 0" class="empty">
          <IconHistory :size="32" />
          <p>히스토리가 없습니다</p>
        </div>

        <template v-else>
          <div
            v-for="item in historyStore.items"
            :key="item.id"
            class="history-item"
            :class="{ 
              active: historyStore.selectedItem?.id === item.id,
              error: item.status === 'error'
            }"
            @click="selectItem(item)"
          >
            <div class="item-header">
              <span class="status-dot" :class="item.status"></span>
              <span class="time">{{ formatTime(item.created_at) }}</span>
              <button class="delete-btn" @click.stop="deleteItem(item.id)" title="삭제">
                <IconX :size="12" />
              </button>
            </div>
            <div class="item-question">{{ truncateText(item.question, 60) }}</div>
            <div v-if="item.final_sql" class="item-sql">
              <code>{{ truncateText(item.final_sql, 40) }}</code>
            </div>
            <div v-if="item.row_count !== null" class="item-meta">
              {{ item.row_count }}행 · {{ Math.round(item.execution_time_ms || 0) }}ms
            </div>
            
            <!-- OLAP 내보내기 버튼 (복잡한 쿼리용) -->
            <button 
              v-if="item.final_sql && isComplexQuery(item.final_sql)"
              class="export-olap-btn"
              @click.stop="exportToOlap(item)"
              title="OLAP으로 내보내기 - DW 스키마 설계"
            >
              <IconBarChart :size="12" />
              <span>OLAP</span>
            </button>
          </div>
        </template>
      </div>

      <!-- 페이지네이션 -->
      <div v-if="historyStore.total > historyStore.pageSize" class="pagination">
        <button 
          :disabled="historyStore.page <= 1" 
          @click="historyStore.prevPage()"
        >
          ◀
        </button>
        <span>{{ historyStore.page }} / {{ Math.ceil(historyStore.total / historyStore.pageSize) }}</span>
        <button 
          :disabled="historyStore.page * historyStore.pageSize >= historyStore.total"
          @click="historyStore.nextPage()"
        >
          ▶
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useHistoryStore, type QueryHistoryItem } from '@/stores/text2sql'
import { useSessionStore } from '@/stores/session'
import { IconHistory, IconTrash, IconRefresh, IconX, IconBarChart } from '@/components/icons'

// Props
defineProps<{
  isOpen: boolean
}>()

// Emits
const emit = defineEmits<{
  toggle: []
  select: [item: QueryHistoryItem]
}>()

const historyStore = useHistoryStore()
const sessionStore = useSessionStore()
const searchQuery = ref('')
const listRef = ref<HTMLElement | null>(null)

// 복잡한 쿼리 판별 (1개 이상 JOIN, 서브쿼리 등)
function isComplexQuery(sql: string | null): boolean {
  if (!sql) return false
  const upperSql = sql.toUpperCase()
  
  // JOIN 개수 카운트
  const joinCount = (upperSql.match(/\bJOIN\b/g) || []).length
  
  return (
    joinCount >= 1 ||  // 1개 이상 JOIN
    (upperSql.match(/SELECT/g) || []).length > 1 || // 서브쿼리
    upperSql.includes('GROUP BY') ||  // 집계 쿼리
    upperSql.includes('HAVING') ||
    upperSql.includes('UNION') ||
    upperSql.includes('WITH ') // CTE
  )
}

// OLAP으로 내보내기
function exportToOlap(item: QueryHistoryItem) {
  console.log('[OLAP Export] item:', item)
  console.log('[OLAP Export] final_sql:', item.final_sql)
  
  if (!item.final_sql) {
    alert('SQL 쿼리가 없습니다.')
    return
  }
  sessionStore.navigateToOlapWithSQL(item.question, item.final_sql)
}

// Debounced search
let searchTimeout: number | null = null
function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = window.setTimeout(() => {
    historyStore.fetchHistory({ search: searchQuery.value || undefined })
  }, 300)
}

function refreshHistory() {
  historyStore.fetchHistory({ search: searchQuery.value || undefined })
}

function selectItem(item: QueryHistoryItem) {
  historyStore.selectItem(item)
  emit('select', item)
}

async function deleteItem(id: number) {
  if (confirm('이 히스토리를 삭제하시겠습니까?')) {
    await historyStore.deleteHistory(id)
  }
}

async function handleClearAll() {
  if (confirm('모든 히스토리를 삭제하시겠습니까?')) {
    await historyStore.deleteAllHistory()
  }
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return '방금 전'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}일 전`
  
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// Load history on mount
onMounted(() => {
  historyStore.fetchHistory()
})

// Watch for open state to refresh
watch(() => historyStore.items.length, () => {
  // Auto-scroll to top when new items are added
  if (listRef.value) {
    listRef.value.scrollTop = 0
  }
})
</script>

<style scoped lang="scss">
$primary: #00d4aa;
$bg-dark: rgba(15, 20, 25, 0.98);
$border: rgba(255, 255, 255, 0.08);
$text-primary: #f0f4f8;
$text-secondary: #94a3b8;
$text-muted: #64748b;

.history-panel {
  display: flex;
  flex-direction: column;
  background: $bg-dark;
  backdrop-filter: blur(20px);
  border-right: 1px solid $border;
  transition: width 0.3s ease;
  width: 280px;
  flex-shrink: 0;
  overflow: hidden;

  &.collapsed {
    width: 48px;
    
    .toggle-btn {
      justify-content: center;
      padding: 12px;
      
      span {
        display: none;
      }
    }
  }
}

.toggle-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid $border;
  color: $text-primary;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  svg {
    color: $primary;
    flex-shrink: 0;
  }
}

.panel-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid $border;

  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    color: $text-secondary;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .header-actions {
    display: flex;
    gap: 4px;
  }

  button {
    padding: 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: $text-muted;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.05);
      color: $text-secondary;
    }

    &.clear-btn:hover {
      color: #f87171;
    }
  }

  .spinning {
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.search-box {
  padding: 12px 16px;
  border-bottom: 1px solid $border;

  input {
    width: 100%;
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid $border;
    border-radius: 10px;
    color: $text-primary;
    font-size: 13px;
    transition: border-color 0.2s;

    &::placeholder {
      color: $text-muted;
    }

    &:focus {
      outline: none;
      border-color: rgba($primary, 0.5);
    }
  }
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }
}

.loading, .empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  color: $text-muted;
  gap: 12px;

  p {
    margin: 0;
    font-size: 13px;
  }
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba($primary, 0.2);
  border-top-color: $primary;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.history-item {
  padding: 12px;
  margin-bottom: 6px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid $border;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 0, 0, 0.3);
    border-color: rgba($primary, 0.2);
  }

  &.active {
    background: rgba($primary, 0.08);
    border-color: rgba($primary, 0.3);
  }

  &.error {
    border-left: 3px solid #f87171;
  }
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;

  &.completed {
    background: #34d399;
  }

  &.error {
    background: #f87171;
  }

  &.pending {
    background: #fbbf24;
  }
}

.time {
  font-size: 10px;
  color: $text-muted;
  flex: 1;
}

.delete-btn {
  padding: 4px;
  background: transparent;
  border: none;
  color: $text-muted;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;

  .history-item:hover & {
    opacity: 1;
  }

  &:hover {
    color: #f87171;
  }
}

.item-question {
  font-size: 13px;
  color: $text-primary;
  line-height: 1.4;
  margin-bottom: 6px;
  word-break: break-word;
}

.item-sql {
  margin-bottom: 6px;

  code {
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    color: #38bdf8;
    background: rgba(0, 0, 0, 0.3);
    padding: 4px 8px;
    border-radius: 4px;
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.item-meta {
  font-size: 10px;
  color: $text-muted;
  font-family: 'JetBrains Mono', monospace;
}

.export-olap-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 6px 10px;
  background: linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%);
  border: 1px solid rgba(34, 139, 230, 0.3);
  border-radius: 6px;
  color: #38bdf8;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: linear-gradient(135deg, rgba(34, 139, 230, 0.25) 0%, rgba(124, 58, 237, 0.25) 100%);
    border-color: rgba(34, 139, 230, 0.5);
    box-shadow: 0 2px 8px rgba(34, 139, 230, 0.2);
  }

  svg {
    color: #38bdf8;
  }
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  border-top: 1px solid $border;

  button {
    padding: 6px 12px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid $border;
    border-radius: 6px;
    color: $text-secondary;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      background: rgba($primary, 0.1);
      border-color: rgba($primary, 0.3);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  span {
    font-size: 11px;
    color: $text-muted;
  }
}
</style>

