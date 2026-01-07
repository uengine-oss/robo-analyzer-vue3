<script setup lang="ts">
/**
 * LineageDetailPanel.vue
 * 선택된 노드의 상세 정보 패널
 */
import { computed } from 'vue'
import { IconX } from '@/components/icons'

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
</style>

