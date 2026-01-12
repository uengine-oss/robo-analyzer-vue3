<script setup lang="ts">
/**
 * LineageDetailPanel.vue
 * 선택된 노드의 상세 정보 패널
 */
import { computed, ref } from 'vue'
import { IconX } from '@/components/icons'
import * as olapApi from '@/services/olap-api'

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

interface Props {
  node: LineageNode
  edges: LineageEdge[]
  allNodes: LineageNode[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'close': []
}>()

// 타입별 스타일
const typeConfig = computed(() => {
  switch (props.node.type) {
    case 'SOURCE':
      return { color: '#3b82f6', icon: '📥', label: '소스 테이블' }
    case 'ETL':
      return { color: '#8b5cf6', icon: '⚙️', label: 'ETL 프로세스' }
    case 'TARGET':
      return { color: '#10b981', icon: '📤', label: '타겟 테이블' }
    default:
      return { color: '#64748b', icon: '📦', label: '알 수 없음' }
  }
})

// 인바운드 연결 (이 노드로 들어오는)
const inboundConnections = computed(() => {
  return props.edges
    .filter(edge => edge.target === props.node.id)
    .map(edge => {
      const sourceNode = props.allNodes.find(n => n.id === edge.source)
      return {
        edge,
        node: sourceNode
      }
    })
    .filter(c => c.node)
})

// 아웃바운드 연결 (이 노드에서 나가는)
const outboundConnections = computed(() => {
  return props.edges
    .filter(edge => edge.source === props.node.id)
    .map(edge => {
      const targetNode = props.allNodes.find(n => n.id === edge.target)
      return {
        edge,
        node: targetNode
      }
    })
    .filter(c => c.node)
})

// 속성 필터링 (내부 속성 제외)
const displayProperties = computed(() => {
  const exclude = ['user_id', 'project_name']
  return Object.entries(props.node.properties || {})
    .filter(([key]) => !exclude.includes(key))
    .map(([key, value]) => ({ key, value }))
})

// 노드 타입 아이콘
function getNodeTypeIcon(type: string): string {
  switch (type) {
    case 'SOURCE': return '📥'
    case 'ETL': return '⚙️'
    case 'TARGET': return '📤'
    default: return '📦'
  }
}

// DAG 재생성 상태
const dagRedeployLoading = ref(false)
const dagRedeployResult = ref<{ success: boolean; message: string } | null>(null)

// ETL인 경우 큐브 이름 추출
const cubeName = computed(() => {
  if (props.node.type !== 'ETL') return null
  // properties에서 cube_name 가져오기
  const cubeNameProp = props.node.properties?.cube_name as string
  if (cubeNameProp) return cubeNameProp
  // 노드 이름에서 추출 (ETL_xxx_yyy 형태에서 xxx_yyy 추출)
  const name = props.node.name
  if (name.startsWith('ETL_')) {
    return name.substring(4).toLowerCase()
  }
  return name.toLowerCase()
})

// DAG 재생성 함수
async function redeployDAG() {
  if (!cubeName.value) {
    dagRedeployResult.value = { success: false, message: '큐브 이름을 찾을 수 없습니다' }
    return
  }
  
  if (!confirm(`"${cubeName.value}" 큐브의 Airflow DAG를 재생성하시겠습니까?`)) {
    return
  }
  
  dagRedeployLoading.value = true
  dagRedeployResult.value = null
  
  try {
    const result = await olapApi.deployETLPipeline(cubeName.value, true)
    dagRedeployResult.value = {
      success: true,
      message: `DAG 재생성 완료! (ID: ${result.dag_id})`
    }
    
    setTimeout(() => {
      dagRedeployResult.value = null
    }, 5000)
  } catch (e: any) {
    dagRedeployResult.value = {
      success: false,
      message: `실패: ${e.message}`
    }
  } finally {
    dagRedeployLoading.value = false
  }
}

// Airflow UI 열기
function openAirflowUI() {
  // Airflow URL (기본값)
  const dagId = `etl_${cubeName.value}`
  const airflowUrl = `http://localhost:8080/dags/${dagId}/grid`
  window.open(airflowUrl, '_blank')
}
</script>

<template>
  <aside class="detail-panel">
    <!-- 헤더 -->
    <header class="panel-header" :style="{ borderLeftColor: typeConfig.color }">
      <div class="header-content">
        <span class="node-icon">{{ typeConfig.icon }}</span>
        <div class="header-text">
          <h3 class="node-name">{{ node.name }}</h3>
          <span class="node-type" :style="{ color: typeConfig.color }">
            {{ typeConfig.label }}
          </span>
        </div>
      </div>
      <button class="close-btn" @click="emit('close')" title="닫기">
        <IconX :size="18" />
      </button>
    </header>
    
    <!-- 컨텐츠 -->
    <div class="panel-content">
      <!-- 인바운드 연결 -->
      <section v-if="inboundConnections.length > 0" class="section">
        <h4 class="section-title">
          <span class="arrow-icon">⬅️</span>
          데이터 입력원 ({{ inboundConnections.length }})
        </h4>
        <div class="connections-list">
          <div
            v-for="conn in inboundConnections"
            :key="conn.edge.id"
            class="connection-item"
          >
            <span class="conn-icon">{{ getNodeTypeIcon(conn.node!.type) }}</span>
            <span class="conn-name">{{ conn.node!.name }}</span>
            <span class="conn-type">{{ conn.node!.type }}</span>
          </div>
        </div>
      </section>
      
      <!-- 아웃바운드 연결 -->
      <section v-if="outboundConnections.length > 0" class="section">
        <h4 class="section-title">
          <span class="arrow-icon">➡️</span>
          데이터 출력 ({{ outboundConnections.length }})
        </h4>
        <div class="connections-list">
          <div
            v-for="conn in outboundConnections"
            :key="conn.edge.id"
            class="connection-item"
          >
            <span class="conn-icon">{{ getNodeTypeIcon(conn.node!.type) }}</span>
            <span class="conn-name">{{ conn.node!.name }}</span>
            <span class="conn-type">{{ conn.node!.type }}</span>
          </div>
        </div>
      </section>
      
      <!-- 속성 -->
      <section v-if="displayProperties.length > 0" class="section">
        <h4 class="section-title">
          <span class="arrow-icon">📋</span>
          속성
        </h4>
        <div class="properties-list">
          <div
            v-for="prop in displayProperties"
            :key="prop.key"
            class="property-item"
          >
            <span class="prop-key">{{ prop.key }}</span>
            <span class="prop-value">{{ prop.value }}</span>
          </div>
        </div>
      </section>
      
      <!-- Airflow 액션 (ETL 노드인 경우만) -->
      <section v-if="node.type === 'ETL'" class="section airflow-section">
        <h4 class="section-title">
          <span class="arrow-icon">🚀</span>
          Airflow 파이프라인
        </h4>
        
        <div class="airflow-actions">
          <button 
            class="btn-airflow" 
            @click="redeployDAG" 
            :disabled="dagRedeployLoading"
          >
            <span v-if="dagRedeployLoading" class="spinner"></span>
            <span v-else>🔄</span>
            {{ dagRedeployLoading ? '재생성 중...' : 'DAG 재생성' }}
          </button>
          
          <button class="btn-airflow-link" @click="openAirflowUI">
            🔗 Airflow UI
          </button>
        </div>
        
        <!-- 결과 메시지 -->
        <div v-if="dagRedeployResult" class="dag-result" :class="{ success: dagRedeployResult.success, error: !dagRedeployResult.success }">
          {{ dagRedeployResult.message }}
        </div>
      </section>
      
      <!-- 연결 없음 -->
      <div v-if="inboundConnections.length === 0 && outboundConnections.length === 0" class="no-connections">
        <span class="no-conn-icon">🔗</span>
        <p>연결된 데이터 흐름이 없습니다.</p>
      </div>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.detail-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 320px;
  height: 100%;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 16px rgba(0, 0, 0, 0.4);
  z-index: 100;
  
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

// 헤더
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  border-left: 4px solid;
  background: var(--color-bg-tertiary);
}

.header-content {
  display: flex;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.node-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.node-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-bright);
  margin: 0;
  word-break: break-all;
}

.node-type {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.close-btn {
  padding: 6px;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
  flex-shrink: 0;
  
  &:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-bright);
  }
}

// 컨텐츠
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.section {
  margin-bottom: 20px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-light);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px 0;
  
  .arrow-icon {
    font-size: 14px;
  }
}

// 연결 목록
.connections-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.connection-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  transition: all 0.15s;
  
  &:hover {
    background: var(--color-bg-elevated);
    border-color: var(--color-accent);
  }
  
  .conn-icon {
    font-size: 14px;
    flex-shrink: 0;
  }
  
  .conn-name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .conn-type {
    font-size: 9px;
    font-weight: 500;
    color: var(--color-text-muted);
    text-transform: uppercase;
    padding: 2px 6px;
    background: var(--color-bg-secondary);
    border-radius: 4px;
  }
}

// 속성 목록
.properties-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.property-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 10px;
  background: var(--color-bg-tertiary);
  border-radius: 6px;
  
  .prop-key {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-light);
    flex-shrink: 0;
  }
  
  .prop-value {
    font-size: 12px;
    color: var(--color-text-bright);
    text-align: right;
    word-break: break-all;
  }
}

// 연결 없음
.no-connections {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  text-align: center;
  
  .no-conn-icon {
    font-size: 32px;
    opacity: 0.5;
    margin-bottom: 12px;
  }
  
  p {
    font-size: 13px;
    color: var(--color-text-muted);
    margin: 0;
  }
}

// Airflow 섹션
.airflow-section {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%);
  padding: 14px;
  border-radius: 10px;
  border: 1px solid rgba(139, 92, 246, 0.25);
}

.airflow-actions {
  display: flex;
  gap: 8px;
}

.btn-airflow {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  }
  
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

.btn-airflow-link {
  padding: 10px 14px;
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  
  &:hover {
    background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
  }
}

.dag-result {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  
  &.success {
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.3);
    color: #22c55e;
  }
  
  &.error {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

