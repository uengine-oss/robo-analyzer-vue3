<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import type { StreamMessage } from '@/types'
import { IconSettings, IconX, IconCheck, IconUpload, IconCode, IconBrain, IconLayers, IconBarChart, IconAlertTriangle } from '@/components/icons'

interface Props {
  visible: boolean
  messages: StreamMessage[]
  currentStep: string
  isProcessing: boolean
  totalSteps: number
  completedSteps: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

// 자동 스크롤 관련
const logContainerRef = ref<HTMLElement>()
const shouldAutoScroll = ref(true)

// 진행률 계산
const progress = computed(() => {
  if (props.totalSteps === 0) return 0
  return Math.round((props.completedSteps / props.totalSteps) * 100)
})

// 단계 정의
const stepIcons = {
  1: IconUpload,
  2: IconCode,
  3: IconBrain,
  4: IconLayers
}

// 단계 상태
const steps = computed(() => [
  { id: 1, name: '파일 업로드', icon: stepIcons[1], status: getStepStatus(1) },
  { id: 2, name: '파싱', icon: stepIcons[2], status: getStepStatus(2) },
  { id: 3, name: 'AI 분석', icon: stepIcons[3], status: getStepStatus(3) },
  { id: 4, name: '인제스천', icon: stepIcons[4], status: getStepStatus(4) }
])

function getStepStatus(stepId: number): 'pending' | 'active' | 'completed' | 'error' {
  if (props.completedSteps >= stepId) return 'completed'
  if (props.completedSteps === stepId - 1 && props.isProcessing) return 'active'
  if (props.currentStep.includes('실패') || props.currentStep.includes('에러')) {
    if (props.completedSteps === stepId - 1) return 'error'
  }
  return 'pending'
}

// 완료 여부
const isCompleted = computed(() => 
  props.completedSteps >= props.totalSteps && !props.isProcessing
)

// 에러 여부
const hasError = computed(() => 
  props.currentStep.includes('실패') || props.currentStep.includes('에러')
)

// 닫기 가능 여부 (완료 또는 에러 시에만)
const canClose = computed(() => isCompleted.value || hasError.value)

// 시간 포맷
function formatTime(timestamp: string): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString('ko-KR', { 
    hour: '2-digit', minute: '2-digit', second: '2-digit' 
  })
}

// 메시지가 추가될 때 자동 스크롤
watch(() => props.messages.length, async () => {
  if (shouldAutoScroll.value) {
    await nextTick()
    scrollToBottom()
  }
})

function scrollToBottom() {
  if (logContainerRef.value) {
    logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight
  }
}

// 스크롤 이벤트로 자동 스크롤 활성화/비활성화
function handleScroll() {
  if (!logContainerRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = logContainerRef.value
  // 하단에서 50px 이내이면 자동 스크롤 유지
  shouldAutoScroll.value = scrollHeight - scrollTop - clientHeight < 50
}

// 닫기 핸들러
function handleClose() {
  if (canClose.value) {
    emit('close')
  }
}

// ESC 키로 닫기
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && canClose.value) {
    emit('close')
  }
}

// 키보드 이벤트 등록
watch(() => props.visible, (visible) => {
  if (visible) {
    window.addEventListener('keydown', handleKeydown)
  } else {
    window.removeEventListener('keydown', handleKeydown)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="handleClose">
        <div class="modal">
          <!-- 헤더 -->
          <div class="modal-header">
            <div class="header-left">
              <span class="header-icon">
                <IconSettings :size="22" class="spin" />
              </span>
              <h2 class="modal-title">분석 진행 중</h2>
            </div>
            <button 
              v-if="canClose" 
              class="close-btn" 
              @click="handleClose"
              title="닫기 (ESC)"
            >
              <IconX :size="16" />
            </button>
          </div>
          
          <!-- 진행 단계 표시 -->
          <div class="steps-container">
            <div class="steps">
              <div 
                v-for="step in steps" 
                :key="step.id" 
                class="step"
                :class="step.status"
              >
                <div class="step-indicator">
                  <IconCheck v-if="step.status === 'completed'" :size="16" class="check" />
                  <span v-else-if="step.status === 'active'" class="spinner"></span>
                  <span v-else-if="step.status === 'error'" class="error-icon">!</span>
                  <span v-else class="step-number">{{ step.id }}</span>
                </div>
                <div class="step-info">
                  <component :is="step.icon" :size="14" class="step-icon" />
                  <span class="step-name">{{ step.name }}</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 진행바 -->
          <div class="progress-section">
            <div class="progress-header">
              <span class="progress-label">진행률</span>
              <span class="progress-percent">{{ progress }}%</span>
            </div>
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :class="{ error: hasError, completed: isCompleted }"
                :style="{ width: `${progress}%` }"
              ></div>
            </div>
            <div class="current-step">{{ currentStep }}</div>
          </div>
          
          <!-- 로그 영역 -->
          <div class="log-section">
            <div class="log-header">
              <span class="log-title">
                <IconBarChart :size="14" />
                실시간 로그
              </span>
              <span class="log-count">{{ messages.length }}개 메시지</span>
            </div>
            <div 
              ref="logContainerRef" 
              class="log-container"
              @scroll="handleScroll"
            >
              <div 
                v-for="(msg, idx) in messages" 
                :key="idx"
                class="log-item"
                :class="msg.type"
              >
                <span class="log-time">{{ formatTime(msg.timestamp) }}</span>
                <span class="log-type-badge">
                  <IconAlertTriangle v-if="msg.type === 'error'" :size="12" />
                  <IconBarChart v-else-if="msg.type === 'data'" :size="12" />
                  <span v-else class="arrow">→</span>
                </span>
                <span class="log-content">{{ msg.content }}</span>
              </div>
              <div v-if="messages.length === 0" class="log-empty">
                로그 대기 중...
              </div>
            </div>
          </div>
          
          <!-- 푸터 -->
          <div class="modal-footer">
            <div class="footer-status">
              <template v-if="isCompleted">
                <span class="status-icon success">
                  <IconCheck :size="14" />
                </span>
                <span class="status-text">분석이 완료되었습니다!</span>
              </template>
              <template v-else-if="hasError">
                <span class="status-icon error">
                  <IconAlertTriangle :size="14" />
                </span>
                <span class="status-text">오류가 발생했습니다</span>
              </template>
              <template v-else>
                <span class="status-icon processing"></span>
                <span class="status-text">분석을 진행하고 있습니다...</span>
              </template>
            </div>
            <button 
              v-if="canClose"
              class="btn btn--primary"
              @click="handleClose"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 2000;
}

.modal {
  width: 90%;
  max-width: 680px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, var(--color-bg-secondary) 0%, var(--color-bg) 100%);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  color: var(--color-accent);
  display: flex;
  align-items: center;
  
  .spin {
    animation: spin 2s linear infinite;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text-bright);
  margin: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-light);
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(250, 82, 82, 0.15);
    border-color: var(--color-error);
    color: var(--color-error);
  }
}

// 단계 표시
.steps-container {
  padding: 20px 24px;
  background: var(--color-bg-tertiary);
}

.steps {
  display: flex;
  justify-content: space-between;
  position: relative;
  
  // 연결선
  &::before {
    content: '';
    position: absolute;
    top: 18px;
    left: 40px;
    right: 40px;
    height: 2px;
    background: var(--color-border);
  }
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  position: relative;
  z-index: 1;
}

.step-indicator {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary);
  border: 2px solid var(--color-border);
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-muted);
  transition: all 0.3s;
  
  .step.completed & {
    background: var(--color-success);
    border-color: var(--color-success);
    color: white;
  }
  
  .step.active & {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: white;
  }
  
  .step.error & {
    background: var(--color-error);
    border-color: var(--color-error);
    color: white;
  }
}

.check {
  flex-shrink: 0;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.error-icon {
  font-size: 18px;
  font-weight: 700;
}

.step-number {
  font-size: 14px;
}

.step-info {
  display: flex;
  align-items: center;
  gap: 6px;
  
  .step.pending & {
    opacity: 0.5;
  }
}

.step-icon {
  flex-shrink: 0;
}

.step-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-light);
  
  .step.completed &,
  .step.active & {
    color: var(--color-text);
  }
}

// 진행바
.progress-section {
  padding: 16px 24px 20px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-light);
}

.progress-percent {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-accent);
}

.progress-bar {
  height: 8px;
  background: var(--color-bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
  border-radius: 4px;
  transition: width 0.3s ease;
  
  &.completed {
    background: linear-gradient(90deg, var(--color-success) 0%, #4ade80 100%);
  }
  
  &.error {
    background: linear-gradient(90deg, var(--color-error) 0%, #f87171 100%);
  }
}

.current-step {
  margin-top: 10px;
  font-size: 13px;
  color: var(--color-text);
  text-align: center;
}

// 로그 영역
.log-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 24px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);
}

.log-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.log-count {
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  padding: 4px 10px;
  border-radius: 12px;
}

.log-container {
  flex: 1;
  min-height: 200px;
  max-height: 280px;
  overflow-y: auto;
  padding: 12px 0;
  
  // 커스텀 스크롤바
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 3px;
    
    &:hover {
      background: var(--color-text-light);
    }
  }
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  animation: fadeInSlide 0.2s ease;
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
  
  &.error {
    background: rgba(250, 82, 82, 0.1);
    
    .log-content {
      color: var(--color-error);
    }
  }
}

@keyframes fadeInSlide {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.log-time {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-text-muted);
}

.log-type-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
  
  .arrow {
    font-size: 12px;
  }
}

.log-content {
  flex: 1;
  color: var(--color-text);
  line-height: 1.5;
  word-break: break-word;
}

.log-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  font-size: 13px;
}

// 푸터
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--color-bg-tertiary);
  border-top: 1px solid var(--color-border);
}

.footer-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  
  &.success {
    background: var(--color-success);
    color: white;
  }
  
  &.error {
    background: var(--color-error);
    color: white;
  }
  
  &.processing {
    background: var(--color-accent);
    animation: pulse 1.5s infinite;
    
    &::before {
      content: '';
      width: 8px;
      height: 8px;
      background: white;
      border-radius: 50%;
    }
  }
}

@keyframes pulse {
  0%, 100% { 
    opacity: 1;
    transform: scale(1);
  }
  50% { 
    opacity: 0.7;
    transform: scale(0.95);
  }
}

.status-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-light);
}

// 트랜지션
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  
  .modal {
    transform: scale(0.95) translateY(20px);
  }
}

.modal-enter-to,
.modal-leave-from {
  opacity: 1;
  
  .modal {
    transform: scale(1) translateY(0);
  }
}
</style>
