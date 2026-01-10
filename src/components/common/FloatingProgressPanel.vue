<script setup lang="ts">
/**
 * FloatingProgressPanel.vue
 * 인제스천 진행 상태를 플로팅 팝업으로 표시
 * 메타데이터 관련 탭 전체에서 보임
 */
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '@/stores/project'
import { useDrag } from '@/composables/useDrag'
import { IconX, IconChevronDown } from '@/components/icons'

const projectStore = useProjectStore()
const { 
  isProcessing, 
  currentStep, 
  totalSteps, 
  completedSteps, 
  isPipelinePaused,
  graphEvents,
  consoleMessages
} = storeToRefs(projectStore)

const { pausePipeline, resumePipeline } = projectStore

// 드래그 기능
const { x, y, isDragging, startDrag } = useDrag({
  initialX: window.innerWidth - 420,
  initialY: 80,
  boundToWindow: true
})

// 패널 상태
const isCollapsed = ref(false)
const isMinimized = ref(false)
const activeTab = ref<'progress' | 'console'>('progress')

// 진행률 계산
const progress = computed(() => {
  if (totalSteps.value === 0) return 0
  return Math.round((completedSteps.value / totalSteps.value) * 100)
})

const isCompleted = computed(() => progress.value >= 100)

// 그래프 통계
const graphStats = computed(() => {
  const nodes = projectStore.graphData?.nodes || []
  const rels = projectStore.graphData?.links || []
  return {
    totalNodes: nodes.length,
    totalRels: rels.length
  }
})

// 일시정지/재개 토글
const togglePause = async () => {
  if (isPipelinePaused.value) {
    await resumePipeline()
  } else {
    await pausePipeline()
  }
}

// 패널 닫기 (완료 후에만)
const closePanel = () => {
  if (isCompleted.value) {
    isMinimized.value = true
  }
}

// 패널 다시 열기
const openPanel = () => {
  isMinimized.value = false
}

// 처리 시작 시 자동으로 패널 열기
watch(isProcessing, (processing) => {
  if (processing) {
    isMinimized.value = false
    isCollapsed.value = false
  }
})
</script>

<template>
  <!-- 최소화된 상태: 작은 배지만 표시 -->
  <Transition name="fade">
    <button 
      v-if="isMinimized && (isProcessing || graphStats.totalNodes > 0)"
      class="minimized-badge"
      @click="openPanel"
    >
      <span v-if="isProcessing" class="pulse-dot"></span>
      <span class="badge-icon">📊</span>
      <span class="badge-text">{{ graphStats.totalNodes }} 노드</span>
    </button>
  </Transition>

  <!-- 플로팅 패널 -->
  <Transition name="slide-fade">
    <div 
      v-if="!isMinimized && (isProcessing || graphStats.totalNodes > 0)"
      class="floating-progress-panel"
      :class="{ 
        'is-collapsed': isCollapsed, 
        'is-dragging': isDragging,
        'is-completed': isCompleted && !isProcessing,
        'is-paused': isPipelinePaused
      }"
      :style="{ left: `${x}px`, top: `${y}px` }"
    >
      <!-- 헤더 (드래그 영역) -->
      <div 
        class="panel-header"
        @mousedown="startDrag"
      >
        <div class="header-left">
          <span v-if="isProcessing" class="status-indicator pulse"></span>
          <span v-else-if="isCompleted" class="status-indicator completed">✓</span>
          <span class="header-title">
            {{ isProcessing ? '📦 인제스천 진행 중' : '📊 분석 완료' }}
          </span>
        </div>
        <div class="header-actions">
          <button 
            class="action-btn"
            @click.stop="isCollapsed = !isCollapsed"
            :title="isCollapsed ? '펼치기' : '접기'"
          >
            <IconChevronDown 
              :size="14" 
              :style="{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }"
            />
          </button>
          <button 
            v-if="!isProcessing"
            class="action-btn close-btn"
            @click.stop="closePanel"
            title="닫기"
          >
            <IconX :size="14" />
          </button>
        </div>
      </div>

      <!-- 컨텐츠 (접힌 상태가 아닐 때) -->
      <div v-show="!isCollapsed" class="panel-content">
        <!-- 진행 바 -->
        <div class="progress-section">
          <div class="progress-info">
            <span class="step-label">
              {{ isPipelinePaused ? '⏸ 일시정지됨' : currentStep || '대기 중' }}
            </span>
            <span class="progress-percent">{{ progress }}%</span>
          </div>
          <div class="progress-track">
            <div 
              class="progress-fill"
              :class="{ completed: isCompleted, paused: isPipelinePaused }"
              :style="{ width: `${progress}%` }"
            ></div>
          </div>
          
          <!-- 일시정지/재개 버튼 -->
          <button 
            v-if="isProcessing"
            class="pause-btn"
            @click="togglePause"
          >
            {{ isPipelinePaused ? '▶ 재개' : '⏸ 일시정지' }}
          </button>
        </div>

        <!-- 통계 -->
        <div class="stats-section">
          <div class="stat-item">
            <span class="stat-icon">📦</span>
            <span class="stat-value">{{ graphStats.totalNodes }}</span>
            <span class="stat-label">노드</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">🔗</span>
            <span class="stat-value">{{ graphStats.totalRels }}</span>
            <span class="stat-label">관계</span>
          </div>
        </div>

        <!-- 탭 -->
        <div class="tabs">
          <button 
            class="tab-btn"
            :class="{ active: activeTab === 'progress' }"
            @click="activeTab = 'progress'"
          >
            그래프 객체
            <span class="tab-count">{{ graphEvents?.length || 0 }}</span>
          </button>
          <button 
            class="tab-btn"
            :class="{ active: activeTab === 'console' }"
            @click="activeTab = 'console'"
          >
            콘솔
            <span class="tab-count">{{ consoleMessages.length }}</span>
          </button>
        </div>

        <!-- 이벤트 스트림 -->
        <div v-show="activeTab === 'progress'" class="event-stream">
          <div 
            v-for="event in (graphEvents || []).slice(-30).reverse()" 
            :key="event.id"
            class="event-item"
            :class="event.type"
          >
            <span class="event-icon">
              {{ event.type === 'node' ? '🔹' : '🔗' }}
            </span>
            <span class="event-source">{{ event.source || event.nodeName }}</span>
            <span v-if="event.target" class="event-arrow">→</span>
            <span v-if="event.target" class="event-target">{{ event.target }}</span>
          </div>
          <div v-if="!graphEvents?.length" class="empty-state">
            이벤트 대기 중...
          </div>
        </div>

        <!-- 콘솔 로그 -->
        <div v-show="activeTab === 'console'" class="console-stream">
          <div 
            v-for="(msg, idx) in consoleMessages.slice(-50).reverse()" 
            :key="idx"
            class="console-item"
            :class="msg.type"
          >
            {{ msg.content }}
          </div>
          <div v-if="!consoleMessages.length" class="empty-state">
            로그가 없습니다
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.floating-progress-panel {
  position: fixed;
  z-index: 1000;
  width: 380px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
  transition: box-shadow 0.2s ease;

  &.is-dragging {
    cursor: grabbing;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  }

  &.is-completed {
    border-color: var(--color-success);
    box-shadow: 0 0 0 2px rgba(64, 192, 87, 0.2), 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  &.is-paused {
    border-color: var(--color-warning);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  cursor: grab;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-accent);

  &.pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }

  &.completed {
    background: var(--color-success);
    color: white;
    width: auto;
    height: auto;
    padding: 2px;
    font-size: 0.6rem;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.9); }
}

.header-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-bright);
}

.header-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--color-bg);
    color: var(--color-text-bright);
  }

  &.close-btn:hover {
    background: var(--color-error);
    color: white;
  }

  svg {
    transition: transform 0.2s;
  }
}

.panel-content {
  max-height: 400px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.progress-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.step-label {
  font-size: 0.75rem;
  color: var(--color-text-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 250px;
}

.progress-percent {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-accent);
}

.progress-track {
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4dabf7, #228be6);
  border-radius: 4px;
  transition: width 0.3s ease;
  box-shadow: 0 0 8px rgba(77, 171, 247, 0.5);

  &.completed {
    background: linear-gradient(90deg, #40c057, #51cf66);
    box-shadow: 0 0 8px rgba(64, 192, 87, 0.5);
  }

  &.paused {
    background: linear-gradient(90deg, #fab005, #fcc419);
    box-shadow: 0 0 8px rgba(250, 176, 5, 0.5);
  }
}

.pause-btn {
  margin-top: 10px;
  width: 100%;
  padding: 6px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-accent);
  }
}

.stats-section {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-icon {
  font-size: 0.9rem;
}

.stat-value {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text-bright);
}

.stat-label {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--color-border);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  background: none;
  border: none;
  font-size: 0.75rem;
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.15s;
  border-bottom: 2px solid transparent;

  &:hover {
    background: var(--color-bg-tertiary);
  }

  &.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }
}

.tab-count {
  font-size: 0.65rem;
  background: var(--color-bg);
  padding: 1px 5px;
  border-radius: 8px;
}

.event-stream,
.console-stream {
  flex: 1;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 0.7rem;
  color: var(--color-text-light);
  border-radius: var(--radius-sm);

  &:hover {
    background: var(--color-bg-tertiary);
  }
}

.event-icon {
  font-size: 0.65rem;
}

.event-source,
.event-target {
  color: var(--color-accent-light);
}

.event-arrow {
  color: var(--color-text-muted);
}

.console-item {
  padding: 3px 8px;
  font-size: 0.7rem;
  font-family: var(--font-mono);
  color: var(--color-text-light);
  border-radius: var(--radius-sm);

  &.error {
    color: var(--color-error);
    background: rgba(255, 59, 48, 0.1);
  }
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--color-text-muted);
  font-size: 0.75rem;
  font-style: italic;
}

/* 최소화된 배지 */
.minimized-badge {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 30px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
    border-color: var(--color-accent);
  }
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: pulse 1.5s ease-in-out infinite;
}

.badge-icon {
  font-size: 1rem;
}

.badge-text {
  font-size: 0.8rem;
  color: var(--color-text-bright);
  font-weight: 500;
}

/* 애니메이션 */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

