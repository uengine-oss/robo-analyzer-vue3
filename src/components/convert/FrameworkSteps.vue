<script setup lang="ts">
import { computed } from 'vue'

interface Step {
  step: number
  done: boolean
}

interface Props {
  steps: Step[]
  strategy: string
}

const props = defineProps<Props>()

// 전략별 단계 라벨
const stepLabelsMap: Record<string, string[]> = {
  oracle: ['Skeleton', 'Body'],
  postgresql: ['Skeleton', 'Body'],
  java: ['Entity', 'Repository', 'Service', 'Controller', 'Config'],
  python: ['Model', 'Schema', 'Service', 'Router', 'Config'],
  mermaid: ['Diagram']
}

const stepLabels = computed(() => stepLabelsMap[props.strategy] || ['Step'])

const getStepStatus = (step: Step, index: number, steps: Step[]): 'done' | 'current' | 'pending' => {
  if (step.done) return 'done'
  
  // 이전 스텝이 모두 완료되고 현재 스텝이 완료되지 않으면 current
  const allPreviousDone = steps.slice(0, index).every(s => s.done)
  if (allPreviousDone && !step.done) return 'current'
  
  return 'pending'
}
</script>

<template>
  <div class="steps-bar">
    <span class="steps-title">🚀 단계</span>
    <div class="steps-row">
      <div 
        v-for="(step, index) in steps" 
        :key="step.step"
        class="step"
        :class="getStepStatus(step, index, steps)"
      >
        <span class="step-num">{{ step.done ? '✓' : step.step }}</span>
        <span class="step-name">{{ stepLabels[index] }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.steps-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.steps-title {
  font-size: 12px;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.steps-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.step {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: 12px;
  font-size: 11px;
  transition: all 0.2s;
  
  &.done {
    background: rgba(34, 197, 94, 0.15);
    
    .step-num {
      background: var(--color-success);
      color: white;
    }
    
    .step-name {
      color: var(--color-success);
    }
  }
  
  &.current {
    background: rgba(59, 130, 246, 0.15);
    
    .step-num {
      background: var(--color-accent-primary);
      color: white;
      animation: pulse 1.5s ease-in-out infinite;
    }
    
    .step-name {
      color: var(--color-accent-primary);
      font-weight: 600;
    }
  }
  
  &.pending {
    opacity: 0.5;
  }
}

.step-num {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-bg-secondary);
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.step-name {
  color: var(--color-text-secondary);
  white-space: nowrap;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
