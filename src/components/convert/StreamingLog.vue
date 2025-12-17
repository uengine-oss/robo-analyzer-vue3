<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

interface Props {
  messages: string[]
  currentStep?: string
  isProcessing?: boolean
}

const props = defineProps<Props>()

const logContainer = ref<HTMLElement>()

// 자동 스크롤
watch(() => props.messages.length, async () => {
  await nextTick()
  if (logContainer.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
})

// 메시지 타입 감지
const getMessageType = (msg: string): 'info' | 'success' | 'warning' | 'error' => {
  const lower = msg.toLowerCase()
  if (lower.includes('error') || lower.includes('fail')) return 'error'
  if (lower.includes('complet') || lower.includes('success')) return 'success'
  if (lower.includes('warn')) return 'warning'
  return 'info'
}

// 타임스탬프 포맷
const getTimestamp = (): string => {
  const now = new Date()
  return now.toTimeString().slice(0, 8)
}
</script>

<template>
  <div class="streaming-log">
    <div class="log-header">
      <h3>📜 스트리밍 로그</h3>
      <div class="log-status" v-if="isProcessing">
        <span class="status-dot"></span>
        <span>{{ currentStep }}</span>
      </div>
    </div>
    
    <div class="log-content" ref="logContainer">
      <template v-if="messages.length > 0">
        <div 
          v-for="(msg, index) in messages" 
          :key="index"
          class="log-entry"
          :class="getMessageType(msg)"
        >
          <span class="log-time">{{ getTimestamp() }}</span>
          <span class="log-message">{{ msg }}</span>
        </div>
      </template>
      <template v-else>
        <div class="empty-state">
          <span class="empty-icon">📭</span>
          <p>스트리밍 로그가 여기에 표시됩니다</p>
        </div>
      </template>
    </div>
    
    <div class="log-footer" v-if="messages.length > 0">
      <span class="log-count">{{ messages.length }}개 메시지</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.streaming-log {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  
  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }
}

.log-status {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 12px;
  color: var(--color-accent-primary);
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-accent-primary);
    animation: pulse 1s ease-in-out infinite;
  }
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}

.log-entry {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  animation: fadeIn 0.2s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.02);
  }
  
  &.info .log-message {
    color: var(--color-text-primary);
  }
  
  &.success .log-message {
    color: var(--color-success);
  }
  
  &.warning .log-message {
    color: var(--color-warning);
  }
  
  &.error .log-message {
    color: var(--color-error);
  }
}

.log-time {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.log-message {
  flex: 1;
  word-break: break-word;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--color-text-muted);
  
  .empty-icon {
    font-size: 32px;
    margin-bottom: var(--spacing-sm);
    opacity: 0.5;
  }
  
  p {
    font-size: 12px;
  }
}

.log-footer {
  padding: var(--spacing-sm) var(--spacing-md);
  border-top: 1px solid var(--color-border);
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>

