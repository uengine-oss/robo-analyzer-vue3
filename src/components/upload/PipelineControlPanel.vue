<script setup lang="ts">
/**
 * PipelineControlPanel.vue
 * 파이프라인 제어 패널 - 단계 표시 및 일시정지/재개/중단 기능
 */
import { computed, onMounted, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import type { PipelinePhaseInfo } from '@/services/api'

// ============================================================================
// Props & Emits
// ============================================================================

const props = defineProps<{
  isVisible: boolean
}>()

// ============================================================================
// Store
// ============================================================================

const projectStore = useProjectStore()

// ============================================================================
// Computed
// ============================================================================

const phases = computed(() => projectStore.pipelinePhases)
const status = computed(() => projectStore.pipelineStatus)
const currentPhase = computed(() => status.value?.currentPhase || 'idle')
const isPaused = computed(() => projectStore.isPipelinePaused)
const isStopped = computed(() => projectStore.isPipelineStopped)
const isProcessing = computed(() => projectStore.isProcessing)
const currentPhaseOrder = computed(() => status.value?.phaseOrder ?? -1)

// 단계 상태에 따른 클래스
function getPhaseClass(phase: PipelinePhaseInfo): string {
  const order = phase.order
  const current = currentPhaseOrder.value
  
  if (order < current) return 'phase--completed'
  if (order === current) {
    if (isPaused.value) return 'phase--paused'
    return 'phase--active'
  }
  return 'phase--pending'
}

// 단계 아이콘
function getPhaseIcon(phase: PipelinePhaseInfo): string {
  const order = phase.order
  const current = currentPhaseOrder.value
  
  if (order < current) return '✓'
  if (order === current) {
    if (isPaused.value) return '⏸'
    return '▶'
  }
  return '○'
}

// ============================================================================
// Lifecycle
// ============================================================================

onMounted(async () => {
  await projectStore.fetchPipelinePhases()
})

// 처리 중일 때 주기적으로 상태 조회
let statusPollingId: ReturnType<typeof setInterval> | null = null

watch(() => projectStore.isProcessing, (processing) => {
  if (processing) {
    // 500ms마다 상태 조회
    statusPollingId = setInterval(() => {
      projectStore.fetchPipelineStatus()
    }, 500)
  } else {
    if (statusPollingId) {
      clearInterval(statusPollingId)
      statusPollingId = null
    }
  }
}, { immediate: true })

// ============================================================================
// Actions
// ============================================================================

async function handlePause() {
  await projectStore.pausePipeline()
}

async function handleResume() {
  await projectStore.resumePipeline()
}

async function handleStop() {
  if (confirm('파이프라인을 완전히 중단하시겠습니까?')) {
    await projectStore.stopPipeline()
  }
}
</script>

<template>
  <div v-if="isVisible && isProcessing" class="pipeline-control-panel">
    <!-- 헤더 -->
    <div class="panel-header">
      <span class="panel-title">🔄 파이프라인 진행</span>
      <div class="panel-controls">
        <!-- 일시정지/재개 버튼 -->
        <button
          v-if="!isPaused"
          class="control-btn control-btn--pause"
          :disabled="isStopped"
          @click="handlePause"
          title="일시정지"
        >
          <span class="btn-icon">⏸</span>
          <span class="btn-text">일시정지</span>
        </button>
        <button
          v-else
          class="control-btn control-btn--resume"
          :disabled="isStopped"
          @click="handleResume"
          title="재개"
        >
          <span class="btn-icon">▶</span>
          <span class="btn-text">재개</span>
        </button>
        
        <!-- 중단 버튼 -->
        <button
          class="control-btn control-btn--stop"
          :disabled="isStopped"
          @click="handleStop"
          title="중단"
        >
          <span class="btn-icon">⏹</span>
          <span class="btn-text">중단</span>
        </button>
      </div>
    </div>
    
    <!-- 단계 타임라인 -->
    <div class="phase-timeline">
      <div
        v-for="phase in phases"
        :key="phase.phase"
        :class="['phase-item', getPhaseClass(phase)]"
      >
        <div class="phase-indicator">
          <span class="phase-icon">{{ getPhaseIcon(phase) }}</span>
        </div>
        <div class="phase-info">
          <span class="phase-name">{{ phase.name }}</span>
          <span class="phase-description">{{ phase.description }}</span>
        </div>
      </div>
    </div>
    
    <!-- 일시정지 알림 -->
    <div v-if="isPaused" class="paused-notice">
      <span class="notice-icon">⏸</span>
      <span class="notice-text">
        파이프라인이 일시정지되었습니다. 
        <strong>{{ status?.phaseName }}</strong> 단계 완료 후 대기 중.
        Neo4j에서 현재까지의 그래프를 확인할 수 있습니다.
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.pipeline-control-panel {
  background: linear-gradient(145deg, #1a1f2e, #151923);
  border: 1px solid rgba(100, 150, 255, 0.2);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: #e2e8f0;
}

.panel-controls {
  display: flex;
  gap: 8px;
}

.control-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .btn-icon {
    font-size: 14px;
  }
  
  &--pause {
    background: rgba(255, 170, 0, 0.15);
    border-color: rgba(255, 170, 0, 0.4);
    color: #ffaa00;
    
    &:hover:not(:disabled) {
      background: rgba(255, 170, 0, 0.25);
      border-color: rgba(255, 170, 0, 0.6);
    }
  }
  
  &--resume {
    background: rgba(0, 200, 100, 0.15);
    border-color: rgba(0, 200, 100, 0.4);
    color: #00c864;
    
    &:hover:not(:disabled) {
      background: rgba(0, 200, 100, 0.25);
      border-color: rgba(0, 200, 100, 0.6);
    }
  }
  
  &--stop {
    background: rgba(255, 80, 80, 0.15);
    border-color: rgba(255, 80, 80, 0.4);
    color: #ff5050;
    
    &:hover:not(:disabled) {
      background: rgba(255, 80, 80, 0.25);
      border-color: rgba(255, 80, 80, 0.6);
    }
  }
}

.phase-timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.phase-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  transition: all 0.3s ease;
  
  &--pending {
    opacity: 0.5;
    
    .phase-indicator {
      background: rgba(100, 100, 100, 0.2);
      border-color: rgba(100, 100, 100, 0.4);
    }
  }
  
  &--active {
    background: rgba(100, 150, 255, 0.1);
    
    .phase-indicator {
      background: rgba(100, 150, 255, 0.2);
      border-color: rgba(100, 150, 255, 0.6);
      animation: pulse 1.5s ease-in-out infinite;
    }
    
    .phase-icon {
      color: #6496ff;
    }
  }
  
  &--paused {
    background: rgba(255, 170, 0, 0.1);
    
    .phase-indicator {
      background: rgba(255, 170, 0, 0.2);
      border-color: rgba(255, 170, 0, 0.6);
    }
    
    .phase-icon {
      color: #ffaa00;
    }
  }
  
  &--completed {
    .phase-indicator {
      background: rgba(0, 200, 100, 0.2);
      border-color: rgba(0, 200, 100, 0.5);
    }
    
    .phase-icon {
      color: #00c864;
    }
    
    .phase-name {
      text-decoration: line-through;
      opacity: 0.7;
    }
  }
}

.phase-indicator {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(100, 100, 100, 0.4);
  border-radius: 50%;
  flex-shrink: 0;
}

.phase-icon {
  font-size: 14px;
}

.phase-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.phase-name {
  font-size: 13px;
  font-weight: 500;
  color: #e2e8f0;
}

.phase-description {
  font-size: 11px;
  color: #94a3b8;
}

.paused-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 12px 16px;
  background: rgba(255, 170, 0, 0.1);
  border: 1px solid rgba(255, 170, 0, 0.3);
  border-radius: 8px;
}

.notice-icon {
  font-size: 18px;
}

.notice-text {
  font-size: 12px;
  color: #fbbf24;
  line-height: 1.5;
  
  strong {
    color: #ffcc00;
  }
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(100, 150, 255, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(100, 150, 255, 0);
  }
}
</style>

