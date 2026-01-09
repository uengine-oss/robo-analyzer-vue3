<script setup lang="ts">
/**
 * CubeDesigner.vue
 * OLAP 큐브 설계 - AI 기반 스타 스키마 생성 및 ETL 전략
 */
import { ref, computed, onMounted, nextTick } from 'vue'
import { useOlapStore } from '@/stores/olap'
import * as olapApi from '@/services/olap-api'
import mermaid from 'mermaid'

const store = useOlapStore()

// State
const loading = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)
const catalog = ref<any>({ tables: [], schemas: [], relationships: [] })
const etlDescription = ref('')
const aiSuggestion = ref<any>(null)
const dwSchema = ref('dw')

// Visual Modeler State
const cubeName = ref('')
const factTable = ref('')
const dimensions = ref<any[]>([])
const measures = ref<any[]>([])

// Diagram refs
const starSchemaDiagram = ref<HTMLDivElement | null>(null)
const lineageDiagram = ref<HTMLDivElement | null>(null)

// Airflow State
const airflowDag = ref<any>(null)
const airflowLoading = ref(false)
const airflowError = ref<string | null>(null)

// Initialize Mermaid
onMounted(async () => {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    themeVariables: {
      primaryColor: '#0d1929',
      primaryTextColor: '#e2e8f0',
      primaryBorderColor: '#228be6',
      lineColor: '#228be6',
      secondaryColor: '#1a2744',
      tertiaryColor: '#0f1d32'
    }
  })
  
  await fetchCatalog()
})

// Fetch catalog from Neo4j
async function fetchCatalog() {
  try {
    const data = await olapApi.getETLCatalog()
    catalog.value = data
  } catch (e) {
    console.error('Failed to fetch catalog:', e)
  }
}

// Get AI suggestion
async function getAISuggestion() {
  if (!etlDescription.value.trim()) {
    error.value = '큐브 설명을 입력해주세요'
    return
  }
  
  loading.value = true
  error.value = null
  aiSuggestion.value = null
  
  try {
    const data = await olapApi.suggestETLStrategy(etlDescription.value)
    aiSuggestion.value = data.suggestion
    
    if (aiSuggestion.value && !aiSuggestion.value.error) {
      await populateFromAISuggestion(aiSuggestion.value)
      success.value = 'AI 추천이 완료되었습니다.'
      
      await nextTick()
      await renderDiagrams()
    }
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// Populate from AI suggestion
async function populateFromAISuggestion(suggestion: any) {
  if (!cubeName.value) {
    cubeName.value = etlDescription.value.split(/\s+/).slice(0, 2).join('').replace(/[^a-zA-Z0-9가-힣]/g, '') || 'AnalyticsCube'
  }
  
  const factSources = suggestion.fact_sources || []
  factTable.value = `${dwSchema.value}.fact_${cubeName.value.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
  
  dimensions.value = []
  const dimSources = suggestion.dimension_sources || {}
  
  for (const [dimName, sources] of Object.entries(dimSources)) {
    if (Array.isArray(sources) && sources.length > 0) {
      const sourceTable = sources[0] as string
      const tableInfo = catalog.value.tables.find((t: any) => t.name === sourceTable)
      
      dimensions.value.push({
        id: Date.now() + Math.random(),
        name: dimName,
        table: `${dwSchema.value}.${dimName}`,
        foreignKey: `${dimName.toLowerCase()}_id`,
        levels: tableInfo?.columns?.slice(0, 2).map((col: any) => ({
          name: col.name,
          column: col.name
        })) || [{ name: 'id', column: 'id' }]
      })
    }
  }
  
  measures.value = [
    { id: Date.now(), name: 'Count', column: 'id', aggregator: 'count' },
    { id: Date.now() + 1, name: 'Total', column: 'amount', aggregator: 'sum' }
  ]
}

// Sanitize name for Mermaid
function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '').replace(/_+$/, '') || 'entity'
}

// Generate star schema diagram
const starSchemaMermaid = computed(() => {
  if (!cubeName.value || !factTable.value) return ''
  
  const safeFact = sanitizeName(factTable.value)
  let diagram = `erDiagram\n`
  
  // Fact table
  diagram += `    ${safeFact} {\n`
  diagram += `        int id PK\n`
  dimensions.value.forEach(dim => {
    diagram += `        int ${sanitizeName(dim.foreignKey)} FK\n`
  })
  measures.value.forEach(m => {
    diagram += `        decimal ${sanitizeName(m.column)}\n`
  })
  diagram += `    }\n\n`
  
  // Dimension tables
  dimensions.value.forEach(dim => {
    const safeDim = sanitizeName(dim.table)
    diagram += `    ${safeDim} {\n`
    diagram += `        int id PK\n`
    dim.levels?.forEach((level: any) => {
      diagram += `        varchar ${sanitizeName(level.column)}\n`
    })
    diagram += `    }\n`
    diagram += `    ${safeDim} ||--o{ ${safeFact} : has\n`
  })
  
  return diagram
})

// Generate lineage diagram
const lineageMermaid = computed(() => {
  if (!aiSuggestion.value) return ''
  
  const sources = aiSuggestion.value.fact_sources || []
  let diagram = `flowchart LR\n`
  
  diagram += `    subgraph OLTP["🗄️ OLTP"]\n`
  sources.forEach((s: string) => {
    diagram += `        ${sanitizeName(s)}["📊 ${s}"]\n`
  })
  diagram += `    end\n\n`
  
  diagram += `    ETL{{"⚙️ ETL"}}\n\n`
  
  diagram += `    subgraph OLAP["⭐ OLAP"]\n`
  diagram += `        ${sanitizeName(factTable.value)}[["🎯 ${factTable.value}"]]\n`
  dimensions.value.forEach(dim => {
    diagram += `        ${sanitizeName(dim.table)}["📐 ${dim.name}"]\n`
  })
  diagram += `    end\n\n`
  
  sources.forEach((s: string) => {
    diagram += `    ${sanitizeName(s)} --> ETL\n`
  })
  diagram += `    ETL --> ${sanitizeName(factTable.value)}\n`
  dimensions.value.forEach(dim => {
    diagram += `    ETL --> ${sanitizeName(dim.table)}\n`
  })
  
  return diagram
})

// Render diagrams
async function renderDiagrams() {
  if (starSchemaDiagram.value && starSchemaMermaid.value) {
    try {
      const { svg } = await mermaid.render(`star_${Date.now()}`, starSchemaMermaid.value)
      starSchemaDiagram.value.innerHTML = svg
    } catch (e) {
      console.error('Star schema diagram error:', e)
    }
  }
  
  if (lineageDiagram.value && lineageMermaid.value) {
    try {
      const { svg } = await mermaid.render(`lineage_${Date.now()}`, lineageMermaid.value)
      lineageDiagram.value.innerHTML = svg
    } catch (e) {
      console.error('Lineage diagram error:', e)
    }
  }
}

// Generate and upload cube schema + ETL config
async function uploadCube() {
  if (!cubeName.value || !factTable.value) {
    error.value = '큐브 이름과 팩트 테이블을 설정해주세요'
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    // 1. Generate and upload Mondrian XML
    const xml = generateMondrianXML()
    console.log('Uploading cube schema...')
    await store.uploadSchemaText(xml)
    console.log('Cube schema uploaded successfully')
    
    // 2. Create ETL configuration (always attempt)
    const etlConfig = buildETLConfig()
    console.log('Creating ETL config:', etlConfig)
    
    if (etlConfig.mappings.length > 0 || etlConfig.source_tables.length > 0) {
      try {
        await olapApi.createETLConfig(etlConfig)
        console.log('ETL config created successfully')
        success.value = '큐브와 ETL 설정이 성공적으로 저장되었습니다!'
      } catch (etlError: any) {
        console.error('ETL config creation failed:', etlError)
        success.value = `큐브는 저장되었으나 ETL 설정 생성 실패: ${etlError.message}`
      }
    } else {
      console.warn('No mappings or source tables - skipping ETL config')
      success.value = '큐브가 저장되었습니다. (ETL 설정: 매핑 정보 없음)'
    }
  } catch (e: any) {
    console.error('Upload failed:', e)
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// Build ETL config from current state
function buildETLConfig() {
  const suggestion = aiSuggestion.value || {}
  
  // Get source tables from suggestion or dimensions
  const factSources = suggestion.fact_sources || []
  const dimSources = suggestion.dimension_sources || {}
  const allSourceTables = new Set<string>(factSources)
  
  // Add from dimension sources
  Object.values(dimSources).forEach((sources: any) => {
    if (Array.isArray(sources)) {
      sources.forEach(s => {
        const cleaned = s.replace(/^\./, '')
        if (cleaned) allSourceTables.add(cleaned)
      })
    }
  })
  
  // Also add source tables from dimensions if not from AI
  dimensions.value.forEach(dim => {
    if (dim.sourceTable) {
      const cleaned = dim.sourceTable.replace(/^\./, '')
      if (cleaned) allSourceTables.add(cleaned)
    }
  })
  
  // Get dimension table names
  const dimensionTableNames = dimensions.value.map(d => d.tableName).filter(Boolean)
  
  // Build mappings from AI suggestion
  const mappings: any[] = []
  const suggestedMappings = suggestion.suggested_mappings || []
  
  suggestedMappings.forEach((m: any) => {
    // Parse source (handle formats like ".table.column" or "table.column")
    const sourceParts = (m.source || '').replace(/^\./, '').split('.')
    const sourceTable = sourceParts.length >= 2 ? sourceParts[0] : ''
    const sourceCol = sourceParts.length >= 2 ? sourceParts.slice(1).join('.') : sourceParts[0] || ''
    
    // Parse target (handle formats like "fact_table.column" or "dim_table.column")
    const targetParts = (m.target || '').replace(/^\./, '').split('.')
    const targetTable = targetParts.length >= 2 ? targetParts[0] : ''
    const targetCol = targetParts.length >= 2 ? targetParts.slice(1).join('.') : targetParts[0] || ''
    
    // Only add if we have valid source and target
    if (sourceTable && sourceCol && targetTable && targetCol) {
      mappings.push({
        source_table: sourceTable,
        source_column: sourceCol,
        target_table: targetTable,
        target_column: targetCol,
        transformation: m.transformation || ''
      })
    }
  })
  
  // If no mappings from AI, create basic mappings from dimensions
  if (mappings.length === 0 && dimensions.value.length > 0) {
    dimensions.value.forEach(dim => {
      if (dim.sourceTable && dim.foreignKey) {
        mappings.push({
          source_table: dim.sourceTable.replace(/^\./, ''),
          source_column: dim.foreignKey,
          target_table: dim.tableName,
          target_column: dim.foreignKey,
          transformation: ''
        })
      }
    })
  }
  
  return {
    cube_name: cubeName.value,
    fact_table: factTable.value,
    dimension_tables: dimensionTableNames,
    source_tables: Array.from(allSourceTables),
    mappings: mappings,
    dw_schema: dwSchema.value,
    sync_mode: suggestion.sync_strategy || 'full',
    incremental_column: suggestion.incremental_column || null
  }
}

// Deploy to Airflow
async function deployToAirflow() {
  if (!cubeName.value) {
    airflowError.value = '큐브 이름이 없습니다'
    return
  }
  
  airflowLoading.value = true
  airflowError.value = null
  
  try {
    // First ensure ETL config exists
    const etlConfig = buildETLConfig()
    await olapApi.createETLConfig(etlConfig)
    
    // Deploy to Airflow
    const result = await olapApi.deployETLPipeline(cubeName.value)
    airflowDag.value = result
    
    console.log('Airflow deployment result:', result)
  } catch (e: any) {
    console.error('Airflow deployment failed:', e)
    airflowError.value = e.message
  } finally {
    airflowLoading.value = false
  }
}

// Open Airflow UI
function openAirflowUI() {
  if (airflowDag.value?.airflow_url) {
    window.open(airflowDag.value.airflow_url, '_blank')
  } else {
    window.open('http://localhost:8080', '_blank')
  }
}

// Upload cube and deploy to Airflow
async function uploadCubeAndDeploy() {
  if (!cubeName.value || !factTable.value) {
    error.value = '큐브 이름과 팩트 테이블을 설정해주세요'
    return
  }
  
  loading.value = true
  error.value = null
  airflowError.value = null
  
  try {
    // 1. Upload cube schema
    const xml = generateMondrianXML()
    console.log('Uploading cube schema...')
    await store.uploadSchemaText(xml)
    
    // 2. Create ETL config
    const etlConfig = buildETLConfig()
    console.log('Creating ETL config:', etlConfig)
    await olapApi.createETLConfig(etlConfig)
    
    // 3. Deploy to Airflow
    console.log('Deploying to Airflow...')
    const result = await olapApi.deployETLPipeline(cubeName.value)
    airflowDag.value = result
    
    success.value = '큐브와 ETL 파이프라인이 Airflow에 배포되었습니다!'
    console.log('Deployment complete:', result)
  } catch (e: any) {
    console.error('Upload failed:', e)
    error.value = e.message
  } finally {
    loading.value = false
  }
}

// Generate Mondrian XML
function generateMondrianXML(): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Schema name="${cubeName.value}Schema">\n`
  xml += `  <Cube name="${cubeName.value}">\n`
  xml += `    <Table name="${factTable.value.split('.').pop()}" schema="${dwSchema.value}"/>\n`
  
  dimensions.value.forEach(dim => {
    xml += `    <Dimension name="${dim.name}" foreignKey="${dim.foreignKey}">\n`
    xml += `      <Hierarchy hasAll="true" primaryKey="id">\n`
    xml += `        <Table name="${dim.table.split('.').pop()}" schema="${dwSchema.value}"/>\n`
    dim.levels?.forEach((level: any) => {
      xml += `        <Level name="${level.name}" column="${level.column}"/>\n`
    })
    xml += `      </Hierarchy>\n`
    xml += `    </Dimension>\n`
  })
  
  measures.value.forEach(m => {
    xml += `    <Measure name="${m.name}" column="${m.column}" aggregator="${m.aggregator}"/>\n`
  })
  
  xml += `  </Cube>\n</Schema>`
  return xml
}
</script>

<template>
  <div class="cube-designer">
    <!-- Left Panel: Catalog -->
    <aside class="catalog-panel">
      <h3>📚 데이터 카탈로그</h3>
      <div class="catalog-list">
        <div 
          v-for="table in catalog.tables" 
          :key="table.name" 
          class="catalog-item"
        >
          <span class="table-icon">📊</span>
          <div class="table-info">
            <span class="table-name">{{ table.name }}</span>
            <span class="table-desc" v-if="table.description" :title="table.description">
              {{ table.description }}
            </span>
          </div>
        </div>
        <div v-if="!catalog.tables?.length" class="empty-catalog">
          카탈로그가 비어있습니다
        </div>
      </div>
    </aside>
    
    <!-- Main Content -->
    <main class="design-content">
      <!-- AI Input -->
      <section class="ai-section">
        <h3>🤖 AI 큐브 설계</h3>
        <div class="ai-input-row">
          <textarea 
            v-model="etlDescription"
            placeholder="분석하고 싶은 내용을 자연어로 설명하세요. 예: 주문 관련 매출 분석 큐브를 만들어주세요."
            rows="3"
          ></textarea>
          <button 
            class="btn btn-primary" 
            @click="getAISuggestion"
            :disabled="loading || !etlDescription.trim()"
          >
            <span v-if="loading" class="spinner"></span>
            <span v-else>⚡ AI 스타 스키마 생성</span>
          </button>
        </div>
        
        <!-- Messages -->
        <div v-if="error" class="message error">{{ error }}</div>
        <div v-if="success" class="message success">{{ success }}</div>
      </section>
      
      <!-- Results -->
      <section v-if="aiSuggestion" class="results-section">
        <div class="diagrams-grid">
          <!-- Star Schema -->
          <div class="diagram-card">
            <h4>⭐ 스타 스키마</h4>
            <div ref="starSchemaDiagram" class="diagram-container"></div>
          </div>
          
          <!-- Airflow DAG -->
          <div class="diagram-card airflow-card">
            <h4>
              <img src="https://airflow.apache.org/images/feature-image.png" alt="Airflow" class="airflow-logo" />
              Airflow ETL Pipeline
            </h4>
            
            <div class="airflow-content">
              <!-- Not Deployed Yet -->
              <div v-if="!airflowDag && !airflowLoading" class="airflow-empty">
                <div ref="lineageDiagram" class="diagram-container mini"></div>
                <button class="btn btn-airflow" @click="deployToAirflow" :disabled="!cubeName">
                  🚀 Airflow에 배포
                </button>
                <p class="hint">ETL 파이프라인을 Apache Airflow에 배포합니다</p>
              </div>
              
              <!-- Loading -->
              <div v-else-if="airflowLoading" class="airflow-loading">
                <div class="spinner"></div>
                <span>Airflow에 배포 중...</span>
              </div>
              
              <!-- Deployed -->
              <div v-else-if="airflowDag" class="airflow-deployed">
                <div class="dag-info">
                  <div class="dag-status success">
                    <span class="status-icon">✅</span>
                    <span>DAG 배포됨</span>
                  </div>
                  <div class="dag-details">
                    <div class="detail-row">
                      <span class="label">DAG ID:</span>
                      <code>{{ airflowDag.dag_id }}</code>
                    </div>
                    <div class="detail-row">
                      <span class="label">큐브:</span>
                      <span>{{ airflowDag.cube_name }}</span>
                    </div>
                  </div>
                </div>
                
                <button class="btn btn-airflow-open" @click="openAirflowUI">
                  🔗 Airflow UI에서 보기
                </button>
                
                <p class="airflow-hint">
                  Airflow에서 DAG를 트리거하고 실행 상태를 모니터링할 수 있습니다
                </p>
              </div>
              
              <!-- Error -->
              <div v-if="airflowError" class="airflow-error">
                <span>❌ {{ airflowError }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- ETL Strategy -->
        <div class="etl-strategy">
          <h4>📋 ETL 전략</h4>
          <div class="strategy-grid">
            <div class="strategy-item">
              <span class="label">동기화 방식</span>
              <span class="value badge">{{ aiSuggestion.sync_strategy === 'incremental' ? '🔄 증분' : '🔃 전체' }}</span>
            </div>
            <div class="strategy-item" v-if="aiSuggestion.incremental_column">
              <span class="label">증분 기준</span>
              <span class="value mono">{{ aiSuggestion.incremental_column }}</span>
            </div>
            <div class="strategy-item">
              <span class="label">원본 테이블</span>
              <span class="value">{{ aiSuggestion.fact_sources?.join(', ') }}</span>
            </div>
          </div>
          
          <!-- Mappings -->
          <div class="mappings-table" v-if="aiSuggestion.suggested_mappings?.length">
            <h5>컬럼 매핑 ({{ aiSuggestion.suggested_mappings.length }}개)</h5>
            <table>
              <thead>
                <tr>
                  <th>원본 (OLTP)</th>
                  <th></th>
                  <th>대상 (OLAP)</th>
                  <th>변환</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(m, i) in aiSuggestion.suggested_mappings" :key="i">
                  <td class="source">{{ m.source }}</td>
                  <td class="arrow">→</td>
                  <td class="target">{{ m.target }}</td>
                  <td class="transform">{{ m.transformation || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        
        <!-- Actions -->
        <div class="actions-bar">
          <button class="btn btn-success" @click="uploadCubeAndDeploy" :disabled="loading">
            📤 큐브 업로드 & Airflow 배포
          </button>
          <p class="hint">큐브와 ETL 파이프라인을 저장하고 Airflow에 배포합니다.</p>
        </div>
      </section>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.cube-designer {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.catalog-panel {
  width: 280px;
  flex-shrink: 0;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  
  h3 {
    padding: 16px;
    margin: 0;
    font-size: 0.9375rem;
    border-bottom: 1px solid var(--color-border);
  }
}

.catalog-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.catalog-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
  
  .table-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }
  
  .table-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }
  
  .table-name {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text);
  }
  
  .table-desc {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.empty-catalog {
  padding: 24px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.design-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.ai-section {
  h3 {
    margin: 0 0 16px 0;
    font-size: 1rem;
  }
}

.ai-input-row {
  display: flex;
  gap: 12px;
  
  textarea {
    flex: 1;
    padding: 12px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    color: var(--color-text);
    font-size: 0.875rem;
    resize: none;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
  
  .btn {
    white-space: nowrap;
    align-self: flex-end;
  }
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  
  &.btn-primary {
    background: linear-gradient(135deg, var(--color-accent) 0%, #1c7ed6 100%);
    color: white;
    
    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(34, 139, 230, 0.4);
    }
  }
  
  &.btn-success {
    background: linear-gradient(135deg, #37b24d 0%, #2f9e44 100%);
    color: white;
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.message {
  padding: 12px 16px;
  border-radius: 8px;
  margin-top: 12px;
  font-size: 0.875rem;
  
  &.error {
    background: rgba(250, 82, 82, 0.1);
    border: 1px solid rgba(250, 82, 82, 0.3);
    color: #fa5252;
  }
  
  &.success {
    background: rgba(55, 178, 77, 0.1);
    border: 1px solid rgba(55, 178, 77, 0.3);
    color: #37b24d;
  }
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.diagrams-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.diagram-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  
  h4 {
    padding: 12px 16px;
    margin: 0;
    font-size: 0.875rem;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-tertiary);
  }
}

.diagram-container {
  min-height: 250px;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  
  :deep(svg) {
    max-width: 100%;
    height: auto;
  }
}

.etl-strategy {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  
  h4 {
    margin: 0 0 16px 0;
    font-size: 0.9375rem;
  }
  
  h5 {
    margin: 16px 0 8px 0;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }
}

.strategy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.strategy-item {
  background: var(--color-bg-tertiary);
  padding: 12px;
  border-radius: 8px;
  
  .label {
    display: block;
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  
  .value {
    font-size: 0.875rem;
    color: var(--color-text);
    
    &.badge {
      display: inline-block;
      padding: 2px 8px;
      background: rgba(34, 139, 230, 0.2);
      border-radius: 4px;
      color: var(--color-accent);
    }
    
    &.mono {
      font-family: monospace;
    }
  }
}

.mappings-table {
  margin-top: 16px;
  
  table {
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
      color: var(--color-text-muted);
      font-size: 0.6875rem;
      text-transform: uppercase;
    }
    
    .source {
      font-family: monospace;
      color: var(--color-accent);
    }
    
    .arrow {
      text-align: center;
      color: #37b24d;
    }
    
    .target {
      font-family: monospace;
      color: #ae3ec9;
    }
    
    .transform {
      font-family: monospace;
      color: var(--color-text-muted);
      font-size: 0.75rem;
    }
  }
}

.actions-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
  
  .hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0;
  }
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

// Airflow Card Styles
.airflow-card {
  h4 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .airflow-logo {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
}

.airflow-content {
  padding: 16px;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.airflow-empty {
  text-align: center;
  
  .diagram-container.mini {
    min-height: 120px;
    max-height: 150px;
    margin-bottom: 16px;
    
    :deep(svg) {
      max-height: 120px;
    }
  }
  
  .hint {
    margin-top: 8px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
}

.airflow-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--color-text-muted);
  
  .spinner {
    width: 32px;
    height: 32px;
    border-width: 3px;
    border-color: rgba(0, 212, 170, 0.3);
    border-top-color: #00d4aa;
  }
}

.airflow-deployed {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dag-info {
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  padding: 16px;
}

.dag-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 12px;
  
  &.success {
    color: #37b24d;
  }
  
  .status-icon {
    font-size: 1.25rem;
  }
}

.dag-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  
  .label {
    color: var(--color-text-muted);
    min-width: 60px;
  }
  
  code {
    font-family: monospace;
    background: rgba(0, 0, 0, 0.2);
    padding: 2px 8px;
    border-radius: 4px;
    color: #00d4aa;
  }
}

.btn-airflow {
  padding: 10px 20px;
  background: linear-gradient(135deg, #00d4aa 0%, #00a896 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #00a896 0%, #008b7a 100%);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 212, 170, 0.3);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-airflow-open {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 24px;
  background: linear-gradient(135deg, #017cee 0%, #0056b3 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: linear-gradient(135deg, #0056b3 0%, #003d80 100%);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(1, 124, 238, 0.3);
  }
}

.airflow-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0;
}

.airflow-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  padding: 12px;
  color: #ef4444;
  font-size: 0.875rem;
}
</style>

