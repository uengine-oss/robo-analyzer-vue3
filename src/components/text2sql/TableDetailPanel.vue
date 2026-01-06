<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useSchemaCanvasStore } from '@/stores/schemaCanvas'
import type { Text2SqlColumnInfo } from '@/types'
import { IconX, IconEdit, IconTrash, IconPlus } from '@/components/icons'

const store = useSchemaCanvasStore()

// Edit states
const isEditingDescription = ref(false)
const editingColumnName = ref<string | null>(null)

// Edit forms
const tableDescForm = reactive({
  description: ''
})

const columnDescForm = reactive({
  description: ''
})

// New relationship form
const showRelationshipForm = ref(false)
const newRelationship = reactive({
  from_column: '',
  to_table: '',
  to_column: '',
  description: ''
})

// Computed
const table = computed(() => store.selectedTable)
const columns = computed(() => store.selectedTableColumns)
const isOpen = computed(() => store.isDetailPanelOpen)

const availableTables = computed(() => {
  return store.allTables.filter(t => t.name !== table.value?.name)
})

const targetTableColumns = computed(() => {
  if (!newRelationship.to_table) return []
  return store.tableColumnsCache[newRelationship.to_table] || []
})

const tableRelationships = computed(() => {
  if (!table.value) return []
  return store.userRelationships.filter(
    r => r.from_table === table.value?.name || r.to_table === table.value?.name
  )
})

// Watchers
watch(() => store.selectedTable, (newTable) => {
  if (newTable) {
    tableDescForm.description = newTable.description || ''
  }
  isEditingDescription.value = false
  editingColumnName.value = null
})

watch(() => newRelationship.to_table, async (tableName) => {
  if (tableName && !store.tableColumnsCache[tableName]) {
    await store.loadTableColumns(tableName)
  }
  newRelationship.to_column = ''
})

// Methods
function closePanel() {
  store.closeDetailPanel()
}

function startEditDescription() {
  tableDescForm.description = table.value?.description || ''
  isEditingDescription.value = true
}

function cancelEditDescription() {
  isEditingDescription.value = false
}

async function saveDescription() {
  if (!table.value) return
  
  try {
    await store.updateTableDescription(table.value.name, tableDescForm.description)
    isEditingDescription.value = false
  } catch {
    alert('테이블 설명 저장에 실패했습니다.')
  }
}

function startEditColumn(columnName: string) {
  const col = columns.value.find(c => c.name === columnName)
  if (col) {
    columnDescForm.description = col.description || ''
    editingColumnName.value = columnName
  }
}

function cancelEditColumn() {
  editingColumnName.value = null
}

async function saveColumnDescription(columnName: string) {
  if (!table.value) return
  
  try {
    await store.updateColumnDescription(table.value.name, columnName, columnDescForm.description)
    editingColumnName.value = null
  } catch {
    alert('컬럼 설명 저장에 실패했습니다.')
  }
}

function toggleRelationshipForm() {
  showRelationshipForm.value = !showRelationshipForm.value
  if (showRelationshipForm.value) {
    resetRelationshipForm()
  }
}

function resetRelationshipForm() {
  newRelationship.from_column = ''
  newRelationship.to_table = ''
  newRelationship.to_column = ''
  newRelationship.description = ''
}

async function addRelationship() {
  if (!table.value || !newRelationship.from_column || !newRelationship.to_table || !newRelationship.to_column) {
    return
  }
  
  try {
    await store.addRelationship({
      from_table: table.value.name,
      from_schema: table.value.schema || 'public',
      from_column: newRelationship.from_column,
      to_table: newRelationship.to_table,
      to_schema: 'public',
      to_column: newRelationship.to_column,
      description: newRelationship.description
    })
    
    resetRelationshipForm()
    showRelationshipForm.value = false
  } catch {
    alert('릴레이션 추가에 실패했습니다.')
  }
}

function getColumnIcon(col: Text2SqlColumnInfo): string {
  if (col.name.toLowerCase() === 'id') return '🔑'
  if (col.name.endsWith('_id')) return '🔗'
  return '📝'
}
</script>

<template>
  <Transition name="slide">
    <div v-if="isOpen && table" class="detail-panel">
      <!-- Header -->
      <div class="detail-panel__header">
        <div class="detail-panel__title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
          <span>{{ table.name }}</span>
        </div>
        <button class="detail-panel__close" @click="closePanel">
          <IconX :size="18" />
        </button>
      </div>
      
      <!-- Content -->
      <div class="detail-panel__content">
        <!-- Table Info Section -->
        <section class="detail-section">
          <div class="detail-section__header">
            <h3>테이블 정보</h3>
            <span class="detail-section__badge">{{ table.schema || 'public' }}</span>
          </div>
          
          <!-- Description -->
          <div class="detail-field">
            <label>설명</label>
            <div v-if="isEditingDescription" class="detail-field__edit">
              <textarea 
                v-model="tableDescForm.description"
                placeholder="테이블 설명을 입력하세요..."
                rows="3"
              ></textarea>
              <div class="detail-field__actions">
                <button class="btn btn--primary btn--sm" @click="saveDescription">저장</button>
                <button class="btn btn--secondary btn--sm" @click="cancelEditDescription">취소</button>
              </div>
            </div>
            <div v-else class="detail-field__display" @click="startEditDescription">
              <span v-if="table.description">{{ table.description }}</span>
              <span v-else class="placeholder">설명을 추가하려면 클릭하세요</span>
              <IconEdit :size="14" />
            </div>
          </div>
        </section>
        
        <!-- Columns Section -->
        <section class="detail-section">
          <div class="detail-section__header">
            <h3>컬럼 ({{ columns.length }})</h3>
          </div>
          
          <div class="columns-list">
            <div 
              v-for="col in columns" 
              :key="col.name"
              class="column-item"
              :class="{ 
                'is-pk': col.name.toLowerCase() === 'id',
                'is-fk': col.name.endsWith('_id') && col.name.toLowerCase() !== 'id'
              }"
            >
              <div class="column-item__header">
                <span class="column-item__icon">{{ getColumnIcon(col) }}</span>
                <span class="column-item__name">{{ col.name }}</span>
                <span class="column-item__type">{{ col.dtype.toUpperCase() }}</span>
                <span v-if="!col.nullable" class="column-item__required" title="NOT NULL">*</span>
              </div>
              
              <div v-if="editingColumnName === col.name" class="column-item__edit">
                <textarea 
                  v-model="columnDescForm.description"
                  placeholder="컬럼 설명..."
                  rows="2"
                ></textarea>
                <div class="column-item__actions">
                  <button class="btn btn--primary btn--xs" @click="saveColumnDescription(col.name)">저장</button>
                  <button class="btn btn--secondary btn--xs" @click="cancelEditColumn">취소</button>
                </div>
              </div>
              <div v-else class="column-item__desc" @click="startEditColumn(col.name)">
                <span v-if="col.description">{{ col.description }}</span>
                <span v-else class="placeholder">설명 추가...</span>
              </div>
            </div>
          </div>
        </section>
        
        <!-- Relationships Section -->
        <section class="detail-section">
          <div class="detail-section__header">
            <h3>릴레이션</h3>
            <button 
              class="btn btn--primary btn--sm"
              @click="toggleRelationshipForm"
            >
              <template v-if="showRelationshipForm">취소</template>
              <template v-else><IconPlus :size="12" /> 추가</template>
            </button>
          </div>
          
          <!-- Add Relationship Form -->
          <div v-if="showRelationshipForm" class="relationship-form">
            <div class="form-group">
              <label>From 컬럼</label>
              <select v-model="newRelationship.from_column">
                <option value="">선택하세요</option>
                <option v-for="col in columns" :key="col.name" :value="col.name">
                  {{ col.name }}
                </option>
              </select>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>To 테이블</label>
                <select v-model="newRelationship.to_table">
                  <option value="">선택하세요</option>
                  <option v-for="t in availableTables" :key="t.name" :value="t.name">
                    {{ t.name }}
                  </option>
                </select>
              </div>
              
              <div class="form-group">
                <label>To 컬럼</label>
                <select v-model="newRelationship.to_column" :disabled="!newRelationship.to_table">
                  <option value="">선택하세요</option>
                  <option v-for="col in targetTableColumns" :key="col.name" :value="col.name">
                    {{ col.name }}
                  </option>
                </select>
              </div>
            </div>
            
            <div class="form-group">
              <label>설명 (선택)</label>
              <input 
                v-model="newRelationship.description"
                type="text"
                placeholder="릴레이션 설명..."
              />
            </div>
            
            <button 
              class="btn btn--primary btn--block"
              @click="addRelationship"
              :disabled="!newRelationship.from_column || !newRelationship.to_table || !newRelationship.to_column"
            >
              릴레이션 추가
            </button>
          </div>
          
          <!-- Existing Relationships -->
          <div class="relationships-list">
            <div 
              v-for="rel in tableRelationships" 
              :key="`${rel.from_table}-${rel.from_column}-${rel.to_table}`"
              class="relationship-item"
            >
              <div class="relationship-item__info">
                <span class="relationship-item__from">{{ rel.from_table }}.{{ rel.from_column }}</span>
                <span class="relationship-item__arrow">→</span>
                <span class="relationship-item__to">{{ rel.to_table }}.{{ rel.to_column }}</span>
              </div>
              <button 
                class="relationship-item__remove"
                @click="store.removeRelationship(rel)"
                title="삭제"
              >
                <IconTrash :size="14" />
              </button>
            </div>
            
            <div v-if="tableRelationships.length === 0" class="empty-state">
              이 테이블과 연결된 릴레이션이 없습니다
            </div>
          </div>
        </section>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.detail-panel {
  width: 380px;
  height: 100%;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Header */
.detail-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.detail-panel__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-bright);
  
  svg {
    color: var(--color-accent);
  }
}

.detail-panel__close {
  background: none;
  border: none;
  color: var(--color-text-light);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg);
    color: var(--color-text-bright);
  }
}

/* Content */
.detail-panel__content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* Sections */
.detail-section {
  margin-bottom: 24px;
}

.detail-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  
  h3 {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-light);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }
}

.detail-section__badge {
  font-size: 0.7rem;
  padding: 2px 8px;
  background: var(--color-bg);
  border-radius: var(--radius-sm);
  color: var(--color-text-light);
}

/* Fields */
.detail-field {
  margin-bottom: 16px;
  
  label {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: 6px;
  }
}

.detail-field__display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s;
  font-size: 0.875rem;
  color: var(--color-text);
  
  &:hover {
    border-color: var(--color-accent);
  }
  
  svg {
    color: var(--color-text-muted);
  }
  
  .placeholder {
    color: var(--color-text-muted);
    font-style: italic;
  }
}

.detail-field__edit {
  textarea {
    width: 100%;
    padding: 10px;
    background: var(--color-bg);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 0.875rem;
    resize: vertical;
    font-family: inherit;
    
    &::placeholder {
      color: var(--color-text-muted);
    }
  }
}

.detail-field__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* Columns List */
.columns-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.column-item {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  transition: border-color 0.15s;
  
  &:hover {
    border-color: var(--color-accent-light);
  }
  
  &.is-pk {
    border-left: 3px solid #ffd43b;
  }
  
  &.is-fk {
    border-left: 3px solid var(--color-accent);
  }
}

.column-item__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.column-item__icon {
  font-size: 0.8rem;
}

.column-item__name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text-bright);
}

.column-item__type {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  background: var(--color-bg);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

.column-item__required {
  color: var(--color-error);
  font-weight: bold;
}

.column-item__desc {
  margin-top: 6px;
  padding: 6px 8px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  color: var(--color-text-light);
  cursor: pointer;
  
  &:hover {
    background: var(--color-bg);
  }
  
  .placeholder {
    font-style: italic;
    color: var(--color-text-muted);
  }
}

.column-item__edit {
  margin-top: 8px;
  
  textarea {
    width: 100%;
    padding: 8px;
    background: var(--color-bg);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    font-size: 0.8rem;
    resize: none;
    font-family: inherit;
  }
}

.column-item__actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

/* Relationship Form */
.relationship-form {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  margin-bottom: 16px;
}

.form-group {
  margin-bottom: 12px;
  
  label {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-light);
    margin-bottom: 6px;
  }
  
  select,
  input {
    width: 100%;
    padding: 8px 10px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 0.85rem;
    
    &:focus {
      border-color: var(--color-accent);
      outline: none;
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.form-row {
  display: flex;
  gap: 12px;
  
  .form-group {
    flex: 1;
  }
}

/* Relationships List */
.relationships-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.relationship-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.relationship-item__info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
}

.relationship-item__from,
.relationship-item__to {
  color: var(--color-accent-light);
  font-weight: 500;
}

.relationship-item__arrow {
  color: var(--color-text-muted);
}

.relationship-item__remove {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-error);
    color: white;
  }
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-style: italic;
}
</style>

