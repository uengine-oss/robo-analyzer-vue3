<template>
  <div class="text2sql-tab">
    <!-- 상단 탭 -->
    <div class="react-tabs">
      <button 
        class="react-tab-btn" 
        :class="{ active: reactTab === 'input' }" 
        @click="reactTab = 'input'"
      >
        <span>✏️ 쿼리 입력</span>
      </button>
      <button 
        class="react-tab-btn" 
        :class="{ active: reactTab === 'summary', disabled: !hasExecutionData }"
        :disabled="!hasExecutionData" 
        @click="reactTab = 'summary'"
      >
        <span>📊 실시간 요약</span>
        <span v-if="reactStore.isRunning" class="live-badge">LIVE</span>
      </button>
      <button 
        class="react-tab-btn" 
        :class="{ active: reactTab === 'details', disabled: !reactStore.hasSteps }"
        :disabled="!reactStore.hasSteps" 
        @click="reactTab = 'details'"
      >
        <span>🔍 상세 스텝</span>
        <span v-if="reactStore.hasSteps" class="step-count">{{ reactStore.steps.length }}</span>
      </button>
    </div>

    <div v-if="reactStore.error" class="error-message">
      <strong>오류:</strong> {{ reactStore.error }}
    </div>

    <!-- ReAct 콘텐츠 -->
    <div class="react-content">
      <transition name="fade" mode="out-in">
        <div v-if="reactTab === 'input'" key="input" class="react-pane">
          <ReactInput 
            :loading="reactStore.isRunning" 
            :waiting-for-user="reactStore.isWaitingUser"
            :question-to-user="reactStore.questionToUser" 
            :current-question="reactStore.currentQuestion"
            @start="handleStart" 
            @respond="handleRespond" 
            @cancel="handleCancel" 
          />
        </div>

        <div v-else-if="reactTab === 'summary'" key="summary" class="react-pane">
          <div v-if="reactStore.isRunning && !reactStore.hasSteps" class="loading-state">
            <div class="spinner"></div>
            <p>에이전트가 SQL을 구성하고 있습니다...</p>
          </div>

          <ReactSummaryPanel 
            v-if="reactStore.hasSteps || reactStore.partialSql || reactStore.finalSql"
            :status="reactStore.status" 
            :partial-sql="reactStore.latestPartialSql"
            :final-sql="reactStore.finalSql" 
            :validated-sql="reactStore.validatedSql"
            :warnings="reactStore.warnings" 
            :execution-result="reactStore.executionResult"
            :collected-metadata="reactStore.collectedMetadata"
            :remaining-tool-calls="reactStore.remainingToolCalls" 
            :current-step="reactStore.steps.length"
            :is-running="reactStore.isRunning" 
            :latest-step="reactStore.latestStep" 
          />
        </div>

        <div v-else-if="reactTab === 'details'" key="details" class="react-pane">
          <ReactStepTimeline 
            v-if="reactStore.hasSteps" 
            :steps="reactStore.steps"
            :is-running="reactStore.isRunning" 
          />
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useReactStore } from '@/stores/text2sql'
import ReactInput from './ReactInput.vue'
import ReactStepTimeline from './ReactStepTimeline.vue'
import ReactSummaryPanel from './ReactSummaryPanel.vue'

const reactStore = useReactStore()

// 뷰 상태
const reactTab = ref<'input' | 'summary' | 'details'>('input')

// Computed
const hasExecutionData = computed(() =>
  reactStore.hasSteps || reactStore.partialSql || reactStore.finalSql || reactStore.isRunning
)

// ReAct 이벤트 핸들러
watch(() => reactStore.isRunning, (isRunning, wasRunning) => {
  if (isRunning && !wasRunning) {
    reactTab.value = 'summary'
  }
})

watch(() => reactStore.hasSteps, (hasSteps) => {
  if (hasSteps && reactTab.value === 'input' && !reactStore.isRunning) {
    reactTab.value = 'summary'
  }
})

watch(() => reactStore.isWaitingUser, (isWaiting) => {
  if (isWaiting) {
    reactTab.value = 'input'
  }
})

async function handleStart(
  question: string,
  options: { maxToolCalls: number; maxSqlSeconds: number }
) {
  await reactStore.start(question, options)
}

async function handleRespond(answer: string) {
  await reactStore.continueWithResponse(answer)
}

function handleCancel() {
  reactStore.cancel()
}
</script>

<style scoped>
.text2sql-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #f8fafc;
}

.react-tabs {
  display: flex;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.react-tab-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.75rem;
  background: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  font-size: 0.8rem;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.react-tab-btn:hover:not(:disabled) {
  background: #edf2f7;
}

.react-tab-btn.active {
  background: #667eea;
  border-color: #667eea;
  color: white;
}

.react-tab-btn.disabled,
.react-tab-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.live-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #ef4444;
  color: white;
  font-size: 0.55rem;
  font-weight: 700;
  padding: 0.15rem 0.35rem;
  border-radius: 8px;
  animation: pulse 2s ease-in-out infinite;
}

.step-count {
  background: rgba(255,255,255,0.3);
  padding: 0.1rem 0.35rem;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 700;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.error-message {
  background: #ffebee;
  border-left: 3px solid #f44336;
  padding: 0.75rem 1rem;
  margin: 0.5rem;
  border-radius: 6px;
  color: #c62828;
  font-size: 0.85rem;
}

.react-content {
  flex: 1;
  overflow: auto;
  padding: 1rem;
}

.react-pane {
  max-width: 1200px;
  margin: 0 auto;
}

.loading-state {
  text-align: center;
  padding: 3rem 2rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.loading-state p {
  color: #666;
  font-size: 0.95rem;
  margin: 0;
}

.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto 1rem;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 트랜지션 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
