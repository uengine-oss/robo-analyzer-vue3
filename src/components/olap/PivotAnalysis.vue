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

// Visual Modeler Modal
const showCubeEditor = ref(false)
const cubeEditLoading = ref(false)
const cubeEditError = ref<string | null>(null)
const cubeEditSuccess = ref<string | null>(null)
const dagRedeployLoading = ref(false)

// Visual Modeler State (for current cube)
const editCubeName = ref('')
const editFactTable = ref('')
const editDimensions = ref<any[]>([])
const editMeasures = ref<any[]>([])

// Load current cube for editing
async function openCubeEditor() {
  if (!store.currentCube) return
  
  cubeEditLoading.value = true
  cubeEditError.value = null
  
  try {
    // Load cube metadata
    const metadata = store.cubeMetadata
    if (metadata) {
      editCubeName.value = store.currentCube
      editFactTable.value = metadata.fact_table || ''
      editDimensions.value = (metadata.dimensions || []).map((d: any, i: number) => ({
        id: Date.now() + i,
        name: d.name || '',
        table: d.table || '',
        foreignKey: d.foreign_key || '',
        levels: (d.levels || []).map((l: any, j: number) => ({
          id: Date.now() + i * 100 + j,
          name: l.name || '',
          column: l.column || ''
        }))
      }))
      editMeasures.value = (metadata.measures || []).map((m: any, i: number) => ({
        id: Date.now() + i,
        name: m.name || '',
        column: m.column || '',
        aggregator: m.aggregator || 'sum'
      }))
    } else {
      // Empty template if no metadata
      editCubeName.value = store.currentCube
      editFactTable.value = ''
      editDimensions.value = []
      editMeasures.value = []
    }
    
    showCubeEditor.value = true
  } catch (e: any) {
    cubeEditError.value = e.message
  } finally {
    cubeEditLoading.value = false
  }
}

// Visual Modeler Functions
function addEditDimension() {
  editDimensions.value.push({
    id: Date.now(),
    name: '',
    table: '',
    foreignKey: '',
    levels: [{ id: Date.now(), name: '', column: '' }]
  })
}

function removeEditDimension(index: number) {
  editDimensions.value.splice(index, 1)
}

function addEditLevel(dimIndex: number) {
  editDimensions.value[dimIndex].levels.push({
    id: Date.now(),
    name: '',
    column: ''
  })
}

function removeEditLevel(dimIndex: number, levelIndex: number) {
  editDimensions.value[dimIndex].levels.splice(levelIndex, 1)
}

function addEditMeasure() {
  editMeasures.value.push({
    id: Date.now(),
    name: '',
    column: '',
    aggregator: 'sum'
  })
}

function removeEditMeasure(index: number) {
  editMeasures.value.splice(index, 1)
}

// Generate Mondrian XML
function generateEditXML(): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Schema name="${editCubeName.value}Schema">\n`
  xml += `  <Cube name="${editCubeName.value}">\n`
  xml += `    <Table name="${editFactTable.value.split('.').pop()}" schema="dw"/>\n`
  
  editDimensions.value.forEach(dim => {
    if (dim.name && dim.table) {
      xml += `    <Dimension name="${dim.name}" foreignKey="${dim.foreignKey || dim.name.toLowerCase() + '_id'}">\n`
      xml += `      <Hierarchy hasAll="true" primaryKey="id">\n`
      xml += `        <Table name="${dim.table.split('.').pop()}" schema="dw"/>\n`
      dim.levels?.forEach((level: any) => {
        if (level.name && level.column) {
          xml += `        <Level name="${level.name}" column="${level.column}"/>\n`
        }
      })
      xml += `      </Hierarchy>\n`
      xml += `    </Dimension>\n`
    }
  })
  
  editMeasures.value.forEach(m => {
    if (m.name && m.column) {
      xml += `    <Measure name="${m.name}" column="${m.column}" aggregator="${m.aggregator}"/>\n`
    }
  })
  
  xml += `  </Cube>\n</Schema>`
  return xml
}

// Save cube changes
async function saveCubeChanges() {
  cubeEditLoading.value = true
  cubeEditError.value = null
  cubeEditSuccess.value = null
  
  try {
    const xml = generateEditXML()
    await olapApi.uploadSchemaText(xml)
    cubeEditSuccess.value = '큐브가 업데이트되었습니다!'
    
    // Reload cubes and metadata
    await store.loadCubes()
    if (store.currentCube) {
      await store.selectCube(store.currentCube)
    }
    
    setTimeout(() => {
      showCubeEditor.value = false
      cubeEditSuccess.value = null
    }, 1500)
  } catch (e: any) {
    cubeEditError.value = e.message
  } finally {
    cubeEditLoading.value = false
  }
}

// Redeploy DAG to Airflow
async function redeployDAG() {
  if (!store.currentCube) {
    cubeEditError.value = '큐브를 선택해주세요'
    return
  }
  
  if (!confirm('DAG를 재생성하시겠습니까?\n기존 DAG가 덮어씌워집니다.')) {
    return
  }
  
  dagRedeployLoading.value = true
  cubeEditError.value = null
  cubeEditSuccess.value = null
  
  try {
    // Force redeploy to Airflow
    const result = await olapApi.deployETLPipeline(store.currentCube, true)
    cubeEditSuccess.value = `DAG가 성공적으로 재생성되었습니다! (DAG ID: ${result.dag_id || store.currentCube})`
    
    console.log('DAG redeployment result:', result)
    
    setTimeout(() => {
      cubeEditSuccess.value = null
    }, 3000)
  } catch (e: any) {
    console.error('DAG redeployment failed:', e)
    cubeEditError.value = `DAG 재생성 실패: ${e.message}`
  } finally {
    dagRedeployLoading.value = false
  }
}

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
            class="btn btn-cube-edit" 
            @click="openCubeEditor" 
            :disabled="!store.currentCube"
            title="큐브 구조 편집"
          >
            ✏️ 큐브 편집
          </button>
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
    
    <!-- Cube Editor Modal (Visual Modeler) -->
    <div v-if="showCubeEditor" class="modal-overlay" @click.self="showCubeEditor = false">
      <div class="cube-editor-modal">
        <header class="modal-header">
          <h2>✏️ 큐브 편집: {{ editCubeName }}</h2>
          <button class="btn-close" @click="showCubeEditor = false">×</button>
        </header>
        
        <div class="modal-body">
          <!-- Messages -->
          <div v-if="cubeEditError" class="message error">{{ cubeEditError }}</div>
          <div v-if="cubeEditSuccess" class="message success">{{ cubeEditSuccess }}</div>
          
          <div class="editor-grid">
            <!-- Left: Form -->
            <div class="editor-form">
              <!-- Basic Info -->
              <div class="form-section">
                <h4>📦 기본 정보</h4>
                <div class="form-group">
                  <label>큐브 이름</label>
                  <input type="text" v-model="editCubeName" class="form-input" disabled />
                </div>
                <div class="form-group">
                  <label>팩트 테이블</label>
                  <input type="text" v-model="editFactTable" placeholder="dw.fact_xxx" class="form-input" />
                </div>
              </div>
              
              <!-- Dimensions -->
              <div class="form-section">
                <div class="section-header">
                  <h4>📐 디멘전</h4>
                  <button class="btn btn-sm btn-add" @click="addEditDimension">+ 추가</button>
                </div>
                
                <div v-for="(dim, dimIndex) in editDimensions" :key="dim.id" class="dimension-item">
                  <div class="dim-row">
                    <input v-model="dim.name" placeholder="디멘전 이름" class="form-input" />
                    <button class="btn-remove" @click="removeEditDimension(dimIndex)">×</button>
                  </div>
                  <div class="dim-details">
                    <input v-model="dim.table" placeholder="테이블 (dw.dim_xxx)" class="form-input" />
                    <input v-model="dim.foreignKey" placeholder="FK (xxx_id)" class="form-input" />
                  </div>
                  <div class="levels-section">
                    <span class="levels-label">레벨:</span>
                    <div v-for="(level, levelIndex) in dim.levels" :key="level.id" class="level-item">
                      <input v-model="level.name" placeholder="레벨명" class="form-input level-input" />
                      <input v-model="level.column" placeholder="컬럼" class="form-input level-input" />
                      <button class="btn-remove-level" @click="removeEditLevel(dimIndex, levelIndex)">×</button>
                    </div>
                    <button class="btn-add-level" @click="addEditLevel(dimIndex)">+ 레벨</button>
                  </div>
                </div>
                
                <div v-if="editDimensions.length === 0" class="empty-hint">
                  디멘전이 없습니다
                </div>
              </div>
              
              <!-- Measures -->
              <div class="form-section">
                <div class="section-header">
                  <h4>📊 측정값</h4>
                  <button class="btn btn-sm btn-add" @click="addEditMeasure">+ 추가</button>
                </div>
                
                <div v-for="(measure, measureIndex) in editMeasures" :key="measure.id" class="measure-item">
                  <input v-model="measure.name" placeholder="이름" class="form-input" />
                  <input v-model="measure.column" placeholder="컬럼" class="form-input" />
                  <select v-model="measure.aggregator" class="form-select">
                    <option value="sum">SUM</option>
                    <option value="count">COUNT</option>
                    <option value="avg">AVG</option>
                    <option value="min">MIN</option>
                    <option value="max">MAX</option>
                  </select>
                  <button class="btn-remove" @click="removeEditMeasure(measureIndex)">×</button>
                </div>
                
                <div v-if="editMeasures.length === 0" class="empty-hint">
                  측정값이 없습니다
                </div>
              </div>
            </div>
            
            <!-- Right: XML Preview -->
            <div class="editor-preview">
              <h4>XML 미리보기</h4>
              <pre class="xml-preview">{{ generateEditXML() }}</pre>
            </div>
          </div>
        </div>
        
        <footer class="modal-footer">
          <div class="footer-left">
            <button class="btn btn-dag-redeploy" @click="redeployDAG" :disabled="dagRedeployLoading">
              <span v-if="dagRedeployLoading" class="spinner-sm"></span>
              <span v-else>🔄 DAG 재생성</span>
            </button>
          </div>
          <div class="footer-right">
            <button class="btn btn-secondary" @click="showCubeEditor = false">취소</button>
            <button class="btn btn-primary" @click="saveCubeChanges" :disabled="cubeEditLoading">
              <span v-if="cubeEditLoading" class="spinner-sm"></span>
              <span v-else>💾 저장</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
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

/* Cube Editor Button */
.btn-cube-edit {
  background: linear-gradient(135deg, #20c997, #12b886);
  color: white;
  
  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(32, 201, 151, 0.4);
  }
}

/* Cube Editor Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.cube-editor-modal {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  width: 90vw;
  max-width: 1200px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
  
  h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  
  .btn-close {
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 1.5rem;
    cursor: pointer;
    padding: 4px 8px;
    
    &:hover {
      color: var(--color-text);
    }
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  
  .message {
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 16px;
    
    &.error {
      background: rgba(250, 82, 82, 0.1);
      border: 1px solid rgba(250, 82, 82, 0.3);
      color: #fa5252;
    }
    
    &.success {
      background: rgba(64, 192, 87, 0.1);
      border: 1px solid rgba(64, 192, 87, 0.3);
      color: #40c057;
    }
  }
}

.editor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-section {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  
  h4 {
    margin: 0 0 12px;
    font-size: 0.875rem;
    color: var(--color-text);
  }
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  
  h4 {
    margin: 0;
  }
}

.form-group {
  margin-bottom: 12px;
  
  label {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: 4px;
  }
}

.form-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.875rem;
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
  
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
}

.form-select {
  padding: 8px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 0.875rem;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: var(--color-accent);
  }
}

.btn-add {
  background: var(--color-accent);
  color: white;
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  
  &:hover {
    opacity: 0.9;
  }
}

.dimension-item, .measure-item {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.dim-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  
  .form-input {
    flex: 1;
  }
}

.dim-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 8px;
}

.levels-section {
  padding-top: 8px;
  border-top: 1px dashed var(--color-border);
  
  .levels-label {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }
}

.level-item {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 6px 0;
  
  .level-input {
    width: 120px;
    padding: 4px 8px;
    font-size: 0.75rem;
  }
}

.btn-add-level {
  background: transparent;
  color: var(--color-accent);
  border: 1px dashed var(--color-accent);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.7rem;
  
  &:hover {
    background: rgba(34, 139, 230, 0.1);
  }
}

.btn-remove {
  background: transparent;
  border: none;
  color: #fa5252;
  font-size: 1.25rem;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  
  &:hover {
    background: rgba(250, 82, 82, 0.1);
    border-radius: 4px;
  }
}

.btn-remove-level {
  background: transparent;
  border: none;
  color: #fa5252;
  font-size: 1rem;
  cursor: pointer;
  padding: 0 4px;
  
  &:hover {
    background: rgba(250, 82, 82, 0.1);
    border-radius: 4px;
  }
}

.measure-item {
  display: flex;
  gap: 8px;
  align-items: center;
  
  .form-input {
    flex: 1;
  }
  
  .form-select {
    width: 100px;
  }
}

.empty-hint {
  color: var(--color-text-muted);
  font-size: 0.8125rem;
  text-align: center;
  padding: 16px;
  font-style: italic;
}

.editor-preview {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  
  h4 {
    margin: 0 0 12px;
    font-size: 0.875rem;
  }
  
  .xml-preview {
    flex: 1;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 12px;
    margin: 0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    overflow: auto;
    white-space: pre-wrap;
    color: var(--color-text-light);
    max-height: 400px;
  }
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  
  .footer-left {
    display: flex;
    gap: 10px;
  }
  
  .footer-right {
    display: flex;
    gap: 10px;
  }
}

.btn-dag-redeploy {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  .spinner-sm {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}
</style>

