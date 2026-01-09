<script setup lang="ts">
/**
 * PivotAnalysis.vue
 * 피벗 테이블 분석 - 드래그앤드롭으로 차원/측정값 구성 및 쿼리 실행
 */
import { ref, watch } from 'vue'
import { useOlapStore } from '@/stores/olap'
import * as olapApi from '@/services/olap-api'
import FieldList from './FieldList.vue'

const store = useOlapStore()
const showSQL = ref(false)
const etlLoading = ref(false)
const etlResult = ref<any>(null)
const showETLResult = ref(false)
const airflowUrl = ref<string | null>(null)

// Drop zone drag states
const rowsOver = ref(false)
const colsOver = ref(false)
const measuresOver = ref(false)

// Drop handlers
function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function onDropRows(event: DragEvent) {
  event.preventDefault()
  rowsOver.value = false
  handleDrop(event, 'rows')
}

function onDropCols(event: DragEvent) {
  event.preventDefault()
  colsOver.value = false
  handleDrop(event, 'cols')
}

function onDropMeasures(event: DragEvent) {
  event.preventDefault()
  measuresOver.value = false
  handleDrop(event, 'measures')
}

function handleDrop(event: DragEvent, target: 'rows' | 'cols' | 'measures') {
  if (!event.dataTransfer) return
  
  try {
    const data = JSON.parse(event.dataTransfer.getData('application/json'))
    
    if (data.type === 'dimension') {
      if (target === 'rows') {
        store.addToRows({ dimension: data.dimension, level: data.level })
      } else if (target === 'cols') {
        store.addToColumns({ dimension: data.dimension, level: data.level })
      }
    } else if (data.type === 'measure' && target === 'measures') {
      store.addMeasure({ name: data.name })
    }
  } catch (e) {
    console.error('Drop error:', e)
  }
}

// Auto-preview SQL when config changes
watch(
  () => store.pivotConfig,
  async () => {
    if (store.pivotConfig.rows.length || store.pivotConfig.columns.length || store.pivotConfig.measures.length) {
      await store.previewSQL()
    }
  },
  { deep: true }
)

const executeQuery = async () => {
  await store.executePivotQuery()
}

// Deploy and run ETL via Airflow
const executeETL = async () => {
  if (!store.currentCube) return
  
  etlLoading.value = true
  etlResult.value = null
  showETLResult.value = true
  airflowUrl.value = null
  
  try {
    // Use Airflow to run ETL pipeline
    const result = await olapApi.runETLPipeline(store.currentCube)
    etlResult.value = result
    
    if (result.airflow_url) {
      airflowUrl.value = result.airflow_url
    }
  } catch (e: any) {
    // Fallback: Try direct sync if Airflow is not available
    console.warn('Airflow not available, trying direct sync:', e.message)
    try {
      const result = await store.executeETLSync(store.currentCube)
      etlResult.value = result
    } catch (syncError: any) {
      etlResult.value = { 
        status: 'failed', 
        error: `Airflow: ${e.message} | Direct: ${syncError.message}` 
      }
    }
  } finally {
    etlLoading.value = false
  }
}

// Open Airflow UI
const openAirflow = () => {
  if (airflowUrl.value) {
    window.open(airflowUrl.value, '_blank')
  }
}

function copySQL() {
  navigator.clipboard.writeText(store.generatedSQL)
}
</script>

<template>
  <div class="pivot-analysis">
    <!-- Field List Sidebar -->
    <aside class="fields-panel">
      <FieldList />
    </aside>
    
    <!-- Pivot Configuration -->
    <main class="config-panel">
      <div class="config-header">
        <h3>피벗 설정</h3>
        <div class="config-actions">
          <button 
            class="btn btn-etl" 
            @click="executeETL" 
            :disabled="etlLoading || !store.currentCube" 
            title="OLTP → OLAP 데이터 동기화"
          >
            <span v-if="etlLoading" class="spinner-sm"></span>
            <span v-else>🔄</span>
            {{ etlLoading ? 'ETL 중...' : 'ETL 동기화' }}
          </button>
          <button class="btn btn-ghost" @click="showSQL = !showSQL">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
            SQL 보기
          </button>
          <button class="btn btn-secondary" @click="store.resetPivotConfig">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            초기화
          </button>
          <button 
            class="btn btn-primary" 
            @click="executeQuery"
            :disabled="!store.pivotConfig.measures.length"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            실행
          </button>
        </div>
        
        <!-- ETL Result Popup -->
        <div v-if="showETLResult" class="etl-result-popup">
          <div class="etl-result-content" :class="etlResult?.status || (etlResult?.success ? 'success' : 'failed')">
            <button class="close-btn" @click="showETLResult = false">×</button>
            <div v-if="etlLoading" class="etl-loading">
              <div class="spinner"></div>
              <span>ETL 파이프라인 배포 중...</span>
            </div>
            <div v-else-if="etlResult">
              <!-- Airflow Pipeline Deployed -->
              <div v-if="etlResult.success && etlResult.dag_id" class="etl-success">
                <span class="icon">🚀</span>
                <div>
                  <strong>ETL 파이프라인 배포됨!</strong>
                  <p class="dag-info">DAG: {{ etlResult.dag_id }}</p>
                  <p v-if="etlResult.state">상태: {{ etlResult.state }}</p>
                  <p class="message">{{ etlResult.message }}</p>
                  <button v-if="airflowUrl" class="btn-airflow" @click="openAirflow">
                    🔗 Airflow에서 모니터링
                  </button>
                </div>
              </div>
              <!-- Direct Sync Completed -->
              <div v-else-if="etlResult.status === 'completed'" class="etl-success">
                <span class="icon">✅</span>
                <div>
                  <strong>ETL 동기화 완료!</strong>
                  <p>{{ etlResult.rows_inserted || 0 }}행 삽입, {{ etlResult.rows_updated || 0 }}행 업데이트</p>
                  <p class="duration">소요 시간: {{ etlResult.duration_ms }}ms</p>
                </div>
              </div>
              <!-- Failed -->
              <div v-else class="etl-error">
                <span class="icon">❌</span>
                <div>
                  <strong>ETL 실패</strong>
                  <p>{{ etlResult.error || etlResult.message }}</p>
                  <button v-if="airflowUrl" class="btn-airflow" @click="openAirflow">
                    🔗 Airflow에서 확인
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Drop Zones -->
      <div class="drop-zones">
        <!-- Rows -->
        <div class="zone-container">
          <label class="zone-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            행
          </label>
          <div 
            class="drop-zone" 
            :class="{ 'drag-over': rowsOver }"
            @dragover="onDragOver"
            @dragenter="rowsOver = true"
            @dragleave="rowsOver = false"
            @drop="onDropRows"
          >
            <div 
              v-for="(field, index) in store.pivotConfig.rows" 
              :key="`row-${index}`"
              class="tag dimension"
            >
              {{ field.dimension }} › {{ field.level }}
              <span class="remove" @click="store.removeFromRows(index)">×</span>
            </div>
            <span v-if="!store.pivotConfig.rows.length" class="placeholder">
              차원을 여기에 드롭하세요
            </span>
          </div>
        </div>
        
        <!-- Columns -->
        <div class="zone-container">
          <label class="zone-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="3" x2="12" y2="21"/>
              <line x1="6" y1="3" x2="6" y2="21"/>
              <line x1="18" y1="3" x2="18" y2="21"/>
            </svg>
            열
          </label>
          <div 
            class="drop-zone"
            :class="{ 'drag-over': colsOver }"
            @dragover="onDragOver"
            @dragenter="colsOver = true"
            @dragleave="colsOver = false"
            @drop="onDropCols"
          >
            <div 
              v-for="(field, index) in store.pivotConfig.columns" 
              :key="`col-${index}`"
              class="tag dimension"
            >
              {{ field.dimension }} › {{ field.level }}
              <span class="remove" @click="store.removeFromColumns(index)">×</span>
            </div>
            <span v-if="!store.pivotConfig.columns.length" class="placeholder">
              차원을 여기에 드롭하세요
            </span>
          </div>
        </div>
        
        <!-- Measures -->
        <div class="zone-container">
          <label class="zone-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="20" x2="12" y2="10"/>
              <line x1="18" y1="20" x2="18" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="16"/>
            </svg>
            측정값
          </label>
          <div 
            class="drop-zone"
            :class="{ 'drag-over': measuresOver }"
            @dragover="onDragOver"
            @dragenter="measuresOver = true"
            @dragleave="measuresOver = false"
            @drop="onDropMeasures"
          >
            <div 
              v-for="(measure, index) in store.pivotConfig.measures" 
              :key="`measure-${index}`"
              class="tag measure"
            >
              {{ measure.name }}
              <span class="remove" @click="store.removeMeasure(index)">×</span>
            </div>
            <span v-if="!store.pivotConfig.measures.length" class="placeholder">
              측정값을 여기에 드롭하세요
            </span>
          </div>
        </div>
      </div>
      
      <!-- Query Results -->
      <div v-if="store.queryResult" class="results-section">
        <h4>결과</h4>
        <div class="results-table-wrapper">
          <table class="results-table">
            <thead>
              <tr>
                <th v-for="col in store.queryResult.columns" :key="col">{{ col }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in store.queryResult.data?.slice(0, 50)" :key="i">
                <td v-for="col in store.queryResult.columns" :key="col">{{ row[col] }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="store.queryResult.data?.length > 50" class="more-rows">
            ... 외 {{ store.queryResult.data.length - 50 }}개 행
          </p>
        </div>
      </div>
      
      <!-- SQL Preview -->
      <div v-if="showSQL && store.generatedSQL" class="sql-preview">
        <div class="sql-header">
          <span>생성된 SQL</span>
          <button class="btn btn-ghost btn-sm" @click="copySQL">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            복사
          </button>
        </div>
        <pre class="code-block">{{ store.generatedSQL }}</pre>
      </div>
      
      <!-- Error -->
      <div v-if="store.error" class="error-message">
        {{ store.error }}
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.pivot-analysis {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  height: 100%;
  width: 100%;
  padding: 16px;
  overflow: hidden;
}

.fields-panel {
  max-height: 100%;
  overflow-y: auto;
}

.config-panel {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  
  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
}

.config-actions {
  display: flex;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &.btn-primary {
    background: var(--color-accent);
    color: white;
    
    &:hover:not(:disabled) {
      background: var(--color-accent-hover);
    }
  }
  
  &.btn-secondary {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    
    &:hover {
      background: var(--color-bg);
    }
  }
  
  &.btn-ghost {
    background: transparent;
    color: var(--color-text-light);
    
    &:hover {
      background: var(--color-bg-tertiary);
    }
  }
  
  &.btn-etl {
    background: linear-gradient(135deg, #228be6, #7c3aed);
    color: white;
    
    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(34, 139, 230, 0.4);
    }
  }
  
  &.btn-sm {
    padding: 4px 8px;
    font-size: 0.75rem;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.drop-zones {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.zone-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.zone-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  font-weight: 500;
}

.drop-zone {
  min-height: 100px;
  background: var(--color-bg-tertiary);
  border: 2px dashed var(--color-border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
  transition: all 0.2s ease;
  
  &.drag-over {
    border-color: var(--color-accent);
    background: rgba(34, 139, 230, 0.1);
    box-shadow: inset 0 0 0 2px rgba(34, 139, 230, 0.2);
  }
  
  .placeholder {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    width: 100%;
    text-align: center;
    padding: 24px;
    pointer-events: none;
  }
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 0.75rem;
  
  &.dimension {
    background: rgba(174, 62, 201, 0.15);
    color: #ae3ec9;
  }
  
  &.measure {
    background: rgba(55, 178, 77, 0.15);
    color: #37b24d;
  }
  
  .remove {
    cursor: pointer;
    opacity: 0.6;
    
    &:hover {
      opacity: 1;
    }
  }
}

.results-section {
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
  
  h4 {
    margin: 0 0 12px 0;
    font-size: 0.875rem;
  }
}

.results-table-wrapper {
  max-height: 300px;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
  
  th, td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }
  
  th {
    background: var(--color-bg-tertiary);
    font-weight: 600;
    position: sticky;
    top: 0;
  }
  
  tr:hover td {
    background: var(--color-bg-tertiary);
  }
}

.more-rows {
  text-align: center;
  padding: 8px;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  margin: 0;
}

.sql-preview {
  border-top: 1px solid var(--color-border);
  padding-top: 16px;
}

.sql-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.code-block {
  background: var(--color-bg);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  font-family: monospace;
  font-size: 0.8125rem;
  max-height: 200px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
}

.error-message {
  padding: 12px;
  background: rgba(250, 82, 82, 0.1);
  border: 1px solid rgba(250, 82, 82, 0.3);
  border-radius: 8px;
  color: #fa5252;
  font-size: 0.875rem;
}

/* ETL Popup */
.etl-result-popup {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  z-index: 100;
}

.etl-result-content {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  min-width: 280px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  position: relative;
  
  .close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 1.25rem;
    cursor: pointer;
    
    &:hover {
      color: var(--color-text);
    }
  }
}

.etl-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-text-muted);
}

.etl-success, .etl-error {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  
  .icon {
    font-size: 1.5rem;
  }
  
  strong {
    display: block;
    margin-bottom: 4px;
  }
  
  p {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }
  
  .duration {
    font-size: 0.75rem;
  }
  
  .dag-info {
    font-family: monospace;
    background: rgba(0, 0, 0, 0.2);
    padding: 2px 6px;
    border-radius: 4px;
  }
  
  .message {
    margin-top: 8px !important;
  }
}

.btn-airflow {
  margin-top: 12px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #00d4aa 0%, #00a896 100%);
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: linear-gradient(135deg, #00a896 0%, #008b7a 100%);
    transform: translateY(-1px);
  }
}

.spinner, .spinner-sm {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-sm {
  width: 14px;
  height: 14px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

