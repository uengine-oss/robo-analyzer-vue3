<script setup lang="ts">
/**
 * LineageTab.vue
 * 데이터 리니지 시각화 탭 - ETL 데이터 흐름을 그래프로 표시
 * 
 * 데이터 소스:
 * 1. robo-analyzer의 Neo4j 리니지 데이터
 * 2. data-platform-olap의 ETL 설정 데이터
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'
import LineageGraph from './LineageGraph.vue'
import LineageDetailPanel from './LineageDetailPanel.vue'
import { IconRefresh, IconUpload, IconSearch } from '@/components/icons'

// API Gateway URL for OLAP service
const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL ?? 'http://localhost:9000'
const OLAP_API_BASE = `${API_GATEWAY_URL}/olap/api`

// 스토어
const projectStore = useProjectStore()
const sessionStore = useSessionStore()
const { projectName } = storeToRefs(projectStore)

// 상태
const isLoading = ref(false)
const error = ref<string | null>(null)
const searchQuery = ref('')
const selectedNode = ref<LineageNode | null>(null)

// 리니지 데이터
const lineageData = ref<LineageGraphData>({
  nodes: [],
  edges: [],
  stats: {
    etlCount: 0,
    sourceCount: 0,
    targetCount: 0,
    flowCount: 0
  }
})

// 표시할 통계 (실제 데이터)
const displayStats = computed(() => {
  return lineageData.value.stats
})

// 타입 정의
interface LineageNode {
  id: string
  name: string
  type: 'SOURCE' | 'TARGET' | 'ETL'
  properties: Record<string, unknown>
}

interface LineageEdge {
  id: string
  source: string
  target: string
  type: string
  properties: Record<string, unknown>
}

interface LineageGraphData {
  nodes: LineageNode[]
  edges: LineageEdge[]
  stats: {
    etlCount: number
    sourceCount: number
    targetCount: number
    flowCount: number
  }
}

// 필터링된 노드
const filteredNodes = computed(() => {
  if (!searchQuery.value) return lineageData.value.nodes
  const query = searchQuery.value.toLowerCase()
  return lineageData.value.nodes.filter(node => 
    node.name.toLowerCase().includes(query)
  )
})

// 데이터 없음 여부
const hasNoData = computed(() => {
  return lineageData.value.nodes.length === 0 && !isLoading.value
})

// 리니지 데이터 로드 - Neo4j와 OLAP ETL 설정 모두에서 가져옴
async function loadLineageData() {
  isLoading.value = true
  error.value = null
  
  const allNodes: LineageNode[] = []
  const allEdges: LineageEdge[] = []
  let totalStats = { etlCount: 0, sourceCount: 0, targetCount: 0, flowCount: 0 }
  
  try {
    // 1. OLAP ETL 설정에서 리니지 데이터 가져오기
    try {
      const olapResponse = await fetch(`${OLAP_API_BASE}/etl/lineage/overview`)
      if (olapResponse.ok) {
        const olapData = await olapResponse.json()
        
        // 소스 테이블 변환
        for (const src of olapData.source_tables || []) {
          allNodes.push({
            id: src.id,
            name: src.name,
            type: 'SOURCE',
            properties: { 
              columns: src.columns, 
              schema: src.schema || 'public'
            }
          })
        }
        
        // ETL 프로세스 변환
        for (const etl of olapData.etl_processes || []) {
          allNodes.push({
            id: etl.id,
            name: etl.name,
            type: 'ETL',
            properties: {
              operation: etl.operation,
              cube_name: etl.cube_name,
              sync_mode: etl.sync_mode,
              mappings_count: etl.mappings_count
            }
          })
        }
        
        // 타겟 테이블 변환
        for (const tgt of olapData.target_tables || []) {
          allNodes.push({
            id: tgt.id,
            name: tgt.name,
            type: 'TARGET',
            properties: {
              columns: tgt.columns,
              schema: tgt.schema,
              table_type: tgt.type,
              cube_name: tgt.cube_name
            }
          })
        }
        
        // 데이터 흐름 변환
        for (const flow of olapData.data_flows || []) {
          allEdges.push({
            id: `flow_${flow.from}_${flow.to}`,
            source: flow.from,
            target: flow.to,
            type: flow.type === 'extract' ? 'DATA_FLOW_TO' : 'TRANSFORMS_TO',
            properties: { flowType: flow.type }
          })
        }
        
        // 통계 업데이트
        if (olapData.summary) {
          totalStats.etlCount += olapData.summary.total_etl_processes || 0
          totalStats.sourceCount += olapData.summary.total_sources || 0
          totalStats.targetCount += olapData.summary.total_targets || 0
          totalStats.flowCount += olapData.summary.total_flows || 0
        }
      }
    } catch (olapErr) {
      console.warn('OLAP 리니지 데이터 로드 실패 (무시됨):', olapErr)
    }
    
    // 2. Neo4j 리니지 데이터 가져오기 (프로젝트가 선택된 경우)
    if (projectName.value) {
      try {
        const headers = sessionStore.getHeaders()
        const response = await fetch(
          `/robo/lineage/?projectName=${encodeURIComponent(projectName.value)}`,
          { headers }
        )
        
        if (response.ok) {
          const data = await response.json()
          
          // 중복 제거하면서 노드 추가
          for (const node of data.nodes || []) {
            if (!allNodes.find(n => n.id === node.id || n.name === node.name)) {
              allNodes.push(node)
            }
          }
          
          // 엣지 추가
          for (const edge of data.edges || []) {
            if (!allEdges.find(e => e.id === edge.id)) {
              allEdges.push(edge)
            }
          }
          
          // 통계 업데이트
          if (data.stats) {
            totalStats.etlCount += data.stats.etlCount || 0
            totalStats.sourceCount += data.stats.sourceCount || 0
            totalStats.targetCount += data.stats.targetCount || 0
            totalStats.flowCount += data.stats.flowCount || 0
          }
        }
      } catch (neo4jErr) {
        console.warn('Neo4j 리니지 데이터 로드 실패 (무시됨):', neo4jErr)
      }
    }
    
    // 데이터 설정
    lineageData.value = {
      nodes: allNodes,
      edges: allEdges,
      stats: totalStats
    }
    
    console.log('리니지 데이터 로드 완료:', {
      nodes: allNodes.length,
      edges: allEdges.length,
      stats: totalStats
    })
    
  } catch (e) {
    error.value = e instanceof Error ? e.message : '데이터 로드 실패'
    console.error('리니지 데이터 로드 실패:', e)
  } finally {
    isLoading.value = false
  }
}

// ETL 코드 분석
async function analyzeEtlCode(sqlContent: string, fileName: string = '') {
  if (!projectName.value || !sqlContent.trim()) return
  
  isLoading.value = true
  error.value = null
  
  try {
    const headers = sessionStore.getHeaders()
    const response = await fetch('/robo/lineage/analyze/', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectName: projectName.value,
        sqlContent,
        fileName,
        dbms: 'oracle'
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    await response.json()
    // 분석 후 데이터 새로고침
    await loadLineageData()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '분석 실패'
    console.error('ETL 분석 실패:', e)
  } finally {
    isLoading.value = false
  }
}

// 노드 선택 핸들러
function handleNodeSelect(node: LineageNode | null) {
  selectedNode.value = node
}

// 프로젝트 변경 시 데이터 로드
watch(projectName, () => {
  loadLineageData()
}, { immediate: true })

onMounted(() => {
  loadLineageData()
})

// 파일 업로드 처리
const fileInput = ref<HTMLInputElement | null>(null)

function triggerFileUpload() {
  fileInput.value?.click()
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  
  const content = await file.text()
  await analyzeEtlCode(content, file.name)
  input.value = ''
}
</script>

<template>
  <div class="lineage-tab">
    <!-- 헤더 -->
    <header class="lineage-header">
      <div class="header-left">
        <h2 class="title">
          <span class="title-icon">🔀</span>
          데이터 리니지
        </h2>
        <span class="project-badge" v-if="projectName">
          {{ projectName }}
        </span>
      </div>
      
      <div class="header-actions">
        <!-- 검색 -->
        <div class="search-box">
          <IconSearch :size="16" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="테이블/ETL 검색..."
            class="search-input"
          />
        </div>
        
        <!-- ETL 파일 업로드 -->
        <input
          ref="fileInput"
          type="file"
          accept=".sql,.pls,.pck"
          class="hidden"
          @change="handleFileUpload"
        />
        <button class="action-btn upload-btn" @click="triggerFileUpload" :disabled="isLoading">
          <IconUpload :size="16" />
          <span>ETL 분석</span>
        </button>
        
        <!-- 새로고침 -->
        <button class="action-btn refresh-btn" @click="loadLineageData" :disabled="isLoading">
          <IconRefresh :size="16" :class="{ spinning: isLoading }" />
          <span>새로고침</span>
        </button>
      </div>
    </header>
    
    <!-- 통계 카드 -->
    <div class="stats-bar">
      <div class="stat-card source">
        <div class="stat-value">{{ displayStats.sourceCount }}</div>
        <div class="stat-label">소스 테이블</div>
      </div>
      <div class="stat-card etl">
        <div class="stat-value">{{ displayStats.etlCount }}</div>
        <div class="stat-label">ETL 프로세스</div>
      </div>
      <div class="stat-card target">
        <div class="stat-value">{{ displayStats.targetCount }}</div>
        <div class="stat-label">타겟 테이블</div>
      </div>
      <div class="stat-card flow">
        <div class="stat-value">{{ displayStats.flowCount }}</div>
        <div class="stat-label">데이터 흐름</div>
      </div>
    </div>
    
    <!-- 메인 컨텐츠 -->
    <div class="lineage-content">
      <!-- 에러 메시지 -->
      <div v-if="error" class="error-message">
        <span class="error-icon">⚠️</span>
        {{ error }}
        <button @click="loadLineageData" class="retry-btn">다시 시도</button>
      </div>
      
      <!-- 그래프 뷰 -->
      <template v-if="!error">
        <!-- 데이터 없음 상태 -->
        <div v-if="hasNoData" class="empty-state">
          <div class="empty-icon">🔗</div>
          <h3>데이터 리니지 없음</h3>
          <p>ETL 설정을 생성하면 데이터 리니지가 표시됩니다.<br/>큐브 모델러에서 ETL을 설계하거나, ETL 파일을 업로드하세요.</p>
          <button class="upload-cta" @click="triggerFileUpload">
            <IconUpload :size="18" />
            <span>ETL 파일 업로드</span>
          </button>
        </div>
        
        <!-- 그래프 표시 -->
        <template v-else>
          <div class="graph-container">
            <LineageGraph
              :nodes="filteredNodes"
              :edges="lineageData.edges"
              :is-loading="isLoading"
              @node-select="handleNodeSelect"
            />
          </div>
          
          <!-- 상세 패널 -->
          <LineageDetailPanel
            v-if="selectedNode"
            :node="selectedNode"
            :edges="lineageData.edges"
            :all-nodes="lineageData.nodes"
            @close="selectedNode = null"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.lineage-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
}

// 헤더
.lineage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-bright);
  margin: 0;
  
  .title-icon {
    font-size: 20px;
  }
}

.project-badge {
  padding: 4px 10px;
  background: linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(34, 139, 230, 0.08) 100%);
  color: var(--color-accent);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-box {
  position: relative;
  
  .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
  }
  
  .search-input {
    padding: 8px 12px 8px 32px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-tertiary);
    color: var(--color-text);
    font-size: 13px;
    width: 200px;
    transition: all 0.2s;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.15);
    }
    
    &::placeholder {
      color: var(--color-text-muted);
    }
  }
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover:not(:disabled) {
    background: var(--color-bg-elevated);
    border-color: var(--color-accent);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &.upload-btn {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-color: transparent;
    color: white;
    
    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
    }
  }
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.hidden {
  display: none;
}

// 통계 바
.stats-bar {
  display: flex;
  gap: 16px;
  padding: 16px 24px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
}

.stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  
  .stat-value {
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
  }
  
  .stat-label {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  &.source {
    .stat-value { color: #3b82f6; }
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%);
    border-color: rgba(59, 130, 246, 0.3);
  }
  
  &.etl {
    .stat-value { color: #8b5cf6; }
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%);
    border-color: rgba(139, 92, 246, 0.3);
  }
  
  &.target {
    .stat-value { color: #10b981; }
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%);
    border-color: rgba(16, 185, 129, 0.3);
  }
  
  &.flow {
    .stat-value { color: #f59e0b; }
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%);
    border-color: rgba(245, 158, 11, 0.3);
  }
}

// 메인 컨텐츠
.lineage-content {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.graph-container {
  flex: 1;
  position: relative;
}

// 에러 메시지
.error-message {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 24px;
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  margin: 16px;
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  
  .error-icon {
    font-size: 18px;
  }
  
  .retry-btn {
    margin-left: auto;
    padding: 6px 12px;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    
    &:hover {
      background: #dc2626;
    }
  }
}

// 빈 상태
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  padding: 48px;
  
  .empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-bright);
    margin: 0 0 8px 0;
  }
  
  p {
    font-size: 14px;
    color: var(--color-text-muted);
    margin: 0 0 24px 0;
    max-width: 320px;
  }
  
  .upload-cta {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    
    &:hover {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      transform: translateY(-1px);
    }
  }
}
</style>

