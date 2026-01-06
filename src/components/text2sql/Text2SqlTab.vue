<template>
  <div class="text2sql-tab">
    <!-- 입력만 표시 (실행 전) -->
    <div v-if="!hasExecutionData" class="input-only-view">
      <div class="input-wrapper">
        <div class="input-header">
          <IconBrain :size="32" />
          <div class="header-text">
            <h1>ReAct Text2SQL</h1>
            <p>자연어로 질문하면 AI가 SQL을 생성합니다</p>
          </div>
        </div>
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
    </div>

    <!-- 실행 중/완료: 좌우 분할 레이아웃 -->
    <div v-else class="split-layout">
      <!-- 좌측: 스텝 진행 상황 -->
      <div class="left-panel">
        <div class="panel-header">
          <div class="panel-title">
            <IconLayers :size="16" />
            <span>ReAct 진행 과정</span>
          </div>
          <div class="step-counter" v-if="reactStore.hasSteps">
            Step {{ reactStore.steps.length }}
          </div>
          <span v-if="reactStore.isRunning" class="live-badge">LIVE</span>
        </div>
        
        <div class="panel-content" ref="stepsContainer">
          <!-- 현재 진행 중인 Phase 표시 -->
          <div v-if="reactStore.isRunning && reactStore.currentPhase !== 'idle'" class="current-phase-card">
            <div class="phase-header">
              <span class="phase-iteration">Step {{ reactStore.currentIteration }}</span>
              <span :class="['phase-indicator', reactStore.currentPhase]">
                <span class="phase-icon">{{ phaseIcon }}</span>
                {{ phaseLabel }}
              </span>
            </div>
            
            <!-- Thinking Phase -->
            <div v-if="reactStore.currentPhase === 'thinking'" class="phase-content thinking-phase">
              <div class="thinking-visual">
                <div class="brain-pulse">
                  <span class="brain-icon">🧠</span>
                  <div class="pulse-ring"></div>
                  <div class="pulse-ring delay-1"></div>
                  <div class="pulse-ring delay-2"></div>
                </div>
              </div>
              <p class="phase-description">LLM이 질문을 분석하고 있습니다...</p>
            </div>
            
            <!-- Reasoning Phase -->
            <div v-else-if="reactStore.currentPhase === 'reasoning'" class="phase-content reasoning-phase">
              <div class="reasoning-box">
                <div class="section-label">
                  <span class="label-icon">💭</span>
                  AI 사고 과정
                </div>
                <p class="reasoning-text streaming">
                  {{ reactStore.currentPhaseData?.reasoning || '추론 중...' }}
                </p>
              </div>
              <div v-if="reactStore.currentPhaseData?.tool_name" class="next-action">
                <span class="action-label">다음 액션:</span>
                <span class="action-value">{{ reactStore.currentPhaseData.tool_name }}</span>
              </div>
            </div>
            
            <!-- Acting Phase -->
            <div v-else-if="reactStore.currentPhase === 'acting'" class="phase-content acting-phase">
              <div class="tool-executing">
                <div class="tool-icon-wrapper">
                  <span class="tool-icon">⚡</span>
                  <div class="executing-spinner"></div>
                </div>
                <div class="tool-info">
                  <span class="tool-name">{{ reactStore.currentPhaseData?.tool_name }}</span>
                  <span class="tool-status">실행 중...</span>
                </div>
              </div>
              <div v-if="reactStore.currentPhaseData?.tool_parameters" class="tool-params-preview">
                <code>{{ formatParams(reactStore.currentPhaseData.tool_parameters) }}</code>
              </div>
            </div>
            
            <!-- Observing Phase -->
            <div v-else-if="reactStore.currentPhase === 'observing'" class="phase-content observing-phase">
              <div class="observation-box">
                <div class="section-label">
                  <span class="label-icon">👁️</span>
                  결과 수신 중
                </div>
                <div class="result-preview">
                  <pre><code>{{ reactStore.currentPhaseData?.tool_result_preview || '...' }}</code></pre>
                </div>
              </div>
            </div>
          </div>

          <!-- 로딩 상태 (첫 스텝 시작 전) -->
          <div v-else-if="reactStore.isRunning && !reactStore.hasSteps && reactStore.currentPhase === 'idle'" class="loading-state">
            <div class="thinking-animation">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
            <p>AI가 사고를 시작하고 있습니다...</p>
          </div>

          <!-- 스텝 타임라인 -->
          <div class="steps-list">
            <TransitionGroup name="step-anim">
              <div 
                v-for="step in sortedSteps" 
                :key="step.iteration"
                class="step-card"
                :class="{ current: isCurrentStep(step) }"
              >
                <!-- 스텝 헤더 -->
                <div class="step-header" @click="toggleStep(step.iteration)">
                  <div class="step-number">{{ step.iteration }}</div>
                  <div class="step-info">
                    <div class="step-phase">
                      <span class="phase-badge thinking">💭</span>
                      <span class="phase-arrow">→</span>
                      <span class="phase-badge acting">{{ step.tool_call.name }}</span>
                      <template v-if="step.tool_result">
                        <span class="phase-arrow">→</span>
                        <span class="phase-badge observing">✓</span>
                      </template>
                    </div>
                  </div>
                  <div class="step-status">
                    <span v-if="isCurrentStep(step) && reactStore.isRunning && !step.tool_result" class="processing">
                      <span class="pulse"></span>
                    </span>
                    <IconCheck v-else-if="step.tool_result" :size="16" class="completed" />
                    <IconChevronDown 
                      :size="14" 
                      class="expand-icon"
                      :class="{ expanded: expandedSteps.has(step.iteration) }"
                    />
                  </div>
                </div>

                <!-- 스텝 상세 내용 (항상 표시) -->
                <div class="step-body">
                  <!-- Thinking -->
                  <div class="step-section thinking">
                    <div class="section-label">
                      <span class="label-icon">💭</span>
                      Reasoning
                    </div>
                    <p class="reasoning-text" :class="{ typing: isCurrentStep(step) && !step.tool_result }">
                      {{ step.reasoning || 'AI가 사고 중...' }}
                    </p>
                  </div>

                  <!-- Acting -->
                  <div class="step-section acting">
                    <div class="section-label">
                      <span class="label-icon">⚡</span>
                      Tool: {{ step.tool_call.name }}
                    </div>
                    <div class="tool-params">
                      <code>{{ formatParams(step.tool_call.parameters) }}</code>
                    </div>
                  </div>

                  <!-- Observation (확장 시에만 상세 표시) -->
                  <div v-if="step.tool_result" class="step-section observing">
                    <div class="section-label">
                      <span class="label-icon">👁️</span>
                      Result
                    </div>
                    <div class="tool-result">
                      <pre><code>{{ truncateResult(step.tool_result, expandedSteps.has(step.iteration)) }}</code></pre>
                      <button 
                        v-if="isResultLong(step.tool_result)" 
                        class="toggle-result-btn"
                        type="button"
                        @click.stop="toggleStep(step.iteration)"
                      >
                        {{ expandedSteps.has(step.iteration) ? '접기' : '더 보기' }}
                      </button>
                    </div>
                  </div>

                  <!-- 대기 중 -->
                  <div v-else-if="isCurrentStep(step)" class="step-section observing waiting">
                    <div class="section-label">
                      <span class="label-icon">⏳</span>
                      대기 중...
                    </div>
                    <div class="waiting-indicator">
                      <span class="loading-dots"><span></span><span></span><span></span></span>
                      도구 실행 중...
                    </div>
                  </div>
                </div>
              </div>
            </TransitionGroup>
          </div>
        </div>
      </div>

      <!-- 우측: SQL 및 상태 패널 -->
      <div class="right-panel">
        <!-- 상태 카드 -->
        <div class="status-card">
          <div class="card-header">
            <div class="status-indicator" :class="reactStore.status">
              <span class="status-dot"></span>
              <span>{{ statusLabel }}</span>
            </div>
          </div>
          <div class="card-body">
            <div class="stat-grid">
              <div class="stat-item">
                <span class="stat-label">Steps</span>
                <span class="stat-value">{{ reactStore.steps.length }}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">남은 호출</span>
                <span class="stat-value">{{ reactStore.remainingToolCalls }}</span>
              </div>
            </div>
            <div v-if="latestCompleteness" class="completeness-info">
              <span class="completeness-label">완성도:</span>
              <span :class="['completeness-value', getConfidenceClass(latestCompleteness.confidence_level)]">
                {{ latestCompleteness.confidence_level }}
              </span>
            </div>
          </div>
        </div>

        <!-- SQL 미리보기 -->
        <div class="sql-card">
          <div class="card-header">
            <h3>
              <IconCode :size="14" />
              현재 SQL
            </h3>
            <button v-if="currentSql" class="btn-copy" type="button" @click="copySql">
              <IconCopy :size="12" />
              복사
            </button>
          </div>
          <div class="card-body">
            <div v-if="currentSql" class="sql-preview">
              <pre><code>{{ currentSql }}</code></pre>
            </div>
            <div v-else class="sql-placeholder">
              <IconLoader :size="24" class="loading-icon" />
              <span>SQL 생성 대기 중...</span>
            </div>
          </div>
        </div>

        <!-- 사용자 입력 대기 -->
        <div v-if="reactStore.isWaitingUser" class="user-input-card">
          <div class="card-header warning">
            <h3>
              <IconMessageSquare :size="14" />
              사용자 입력 필요
            </h3>
          </div>
          <div class="card-body">
            <p class="question-text">{{ reactStore.questionToUser }}</p>
            <div class="input-group">
              <input 
                v-model="userResponse" 
                type="text" 
                class="response-input"
                placeholder="답변을 입력하세요..."
                @keyup.enter="submitResponse"
              />
              <button class="btn btn--primary" type="button" @click="submitResponse">답변</button>
            </div>
          </div>
        </div>

        <!-- 결과 표시 (완료 시) -->
        <div v-if="reactStore.status === 'completed' && reactStore.executionResult" class="result-card">
          <div class="card-header success">
            <h3>
              <IconCheck :size="14" />
              실행 결과
            </h3>
          </div>
          <div class="card-body">
            <div class="result-stats">
              <span>{{ reactStore.executionResult.row_count }}개 행</span>
              <span>{{ reactStore.executionResult.execution_time_ms.toFixed(1) }}ms</span>
            </div>
            <ResultTable :data="reactStore.executionResult" />
          </div>
        </div>

        <!-- 경고 -->
        <div v-if="reactStore.warnings.length" class="warnings-card">
          <div class="card-header warning">
            <h3>
              <IconAlertTriangle :size="14" />
              경고
            </h3>
          </div>
          <div class="card-body">
            <ul class="warnings-list">
              <li v-for="warning in reactStore.warnings" :key="warning">{{ warning }}</li>
            </ul>
          </div>
        </div>

        <!-- 에러 -->
        <div v-if="reactStore.error" class="error-card">
          <div class="card-header error">
            <h3>
              <IconAlertTriangle :size="14" />
              오류
            </h3>
          </div>
          <div class="card-body">
            <p class="error-text">{{ reactStore.error }}</p>
          </div>
        </div>

        <!-- 액션 버튼 -->
        <div class="action-buttons">
          <button v-if="reactStore.isRunning" class="btn btn--danger" type="button" @click="handleCancel">
            <IconX :size="14" />
            실행 중단
          </button>
          <button v-if="reactStore.status === 'completed' || reactStore.status === 'error'" class="btn btn--primary" type="button" @click="startNewQuery">
            <IconRefresh :size="14" />
            새 쿼리
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useReactStore } from '@/stores/text2sql'
import ReactInput from './ReactInput.vue'
import ResultTable from './ResultTable.vue'
import type { ReactStepModel } from '@/types'
import { 
  IconBrain, IconLayers, IconCode, IconCopy, IconCheck, IconChevronDown,
  IconLoader, IconMessageSquare, IconAlertTriangle, IconX, IconRefresh
} from '@/components/icons'

const reactStore = useReactStore()

const userResponse = ref('')
const expandedSteps = ref<Set<number>>(new Set())
const stepsContainer = ref<HTMLElement | null>(null)

// Computed
const hasExecutionData = computed(() =>
  reactStore.hasSteps || reactStore.partialSql || reactStore.finalSql || reactStore.isRunning
)

const sortedSteps = computed(() => 
  [...reactStore.steps].sort((a, b) => a.iteration - b.iteration)
)

const currentSql = computed(() => 
  reactStore.finalSql || reactStore.latestPartialSql || ''
)

const latestCompleteness = computed(() => 
  reactStore.latestStep?.sql_completeness ?? null
)

const statusLabel = computed(() => {
  switch (reactStore.status) {
    case 'running': return '실행 중'
    case 'needs_user_input': return '입력 대기'
    case 'completed': return '완료'
    case 'error': return '오류'
    default: return '대기'
  }
})

const phaseIcon = computed(() => {
  switch (reactStore.currentPhase) {
    case 'thinking': return '🧠'
    case 'reasoning': return '💭'
    case 'acting': return '⚡'
    case 'observing': return '👁️'
    default: return '○'
  }
})

const phaseLabel = computed(() => {
  switch (reactStore.currentPhase) {
    case 'thinking': return 'LLM 호출 중...'
    case 'reasoning': return 'AI 추론 중...'
    case 'acting': return '도구 실행 중...'
    case 'observing': return '결과 분석 중...'
    default: return '대기'
  }
})

// Functions
function isCurrentStep(step: ReactStepModel): boolean {
  return sortedSteps.value.length > 0 && 
         step.iteration === sortedSteps.value[sortedSteps.value.length - 1].iteration
}

function toggleStep(iteration: number) {
  if (expandedSteps.value.has(iteration)) {
    expandedSteps.value.delete(iteration)
  } else {
    expandedSteps.value.add(iteration)
  }
}

function formatParams(params: Record<string, unknown>): string {
  try {
    const entries = Object.entries(params)
    if (entries.length === 0) return ''
    return entries
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ')
  } catch {
    return ''
  }
}

function truncateResult(result: string, expanded: boolean): string {
  if (expanded) return result
  const lines = result.split('\n')
  if (lines.length > 5) {
    return lines.slice(0, 5).join('\n') + '\n...'
  }
  if (result.length > 200) {
    return result.slice(0, 200) + '...'
  }
  return result
}

function isResultLong(result: string): boolean {
  return result.split('\n').length > 5 || result.length > 200
}

function getConfidenceClass(level: string): string {
  const lower = level.toLowerCase()
  if (lower.includes('high')) return 'high'
  if (lower.includes('medium')) return 'medium'
  return 'low'
}

function copySql() {
  if (currentSql.value) {
    navigator.clipboard.writeText(currentSql.value)
  }
}

async function handleStart(
  question: string,
  options: { maxToolCalls: number; maxSqlSeconds: number }
) {
  expandedSteps.value.clear()
  await reactStore.start(question, options)
}

async function handleRespond(answer: string) {
  await reactStore.continueWithResponse(answer)
}

async function submitResponse() {
  if (userResponse.value.trim()) {
    await reactStore.continueWithResponse(userResponse.value.trim())
    userResponse.value = ''
  }
}

function handleCancel() {
  reactStore.cancel()
}

function startNewQuery() {
  reactStore.clear()
  expandedSteps.value.clear()
}

// 새 스텝이 추가될 때 스크롤
watch(() => reactStore.steps.length, async () => {
  await nextTick()
  if (stepsContainer.value) {
    stepsContainer.value.scrollTop = stepsContainer.value.scrollHeight
  }
})
</script>

<style scoped lang="scss">
.text2sql-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}

/* 입력만 표시 */
.input-only-view {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 32px;
}

.input-wrapper {
  width: 100%;
  max-width: 700px;
}

.input-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--color-border);
  
  svg {
    color: var(--color-accent);
  }
  
  .header-text {
    h1 {
      margin: 0 0 4px 0;
      font-size: 24px;
      font-weight: 700;
      color: var(--color-text);
    }
    
    p {
      margin: 0;
      font-size: 14px;
      color: var(--color-text-light);
    }
  }
}

/* 좌우 분할 레이아웃 */
.split-layout {
  display: grid;
  grid-template-columns: 1fr 380px;
  height: 100%;
  overflow: hidden;
}

/* 좌측 패널 */
.left-panel {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.step-counter {
  padding: 4px 10px;
  background: var(--color-accent);
  color: white;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.live-badge {
  margin-left: auto;
  background: var(--color-error);
  color: white;
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 8px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 로딩 상태 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  
  p {
    margin: 0;
    color: var(--color-text-light);
    font-size: 14px;
  }
}

.thinking-animation {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  
  .dot {
    width: 12px;
    height: 12px;
    background: var(--color-accent);
    border-radius: 50%;
    animation: bounce 1.4s ease-in-out infinite;
    
    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }
}

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
  40% { transform: scale(1.2); opacity: 1; }
}

/* 현재 진행 중인 Phase 카드 */
.current-phase-card {
  background: linear-gradient(135deg, var(--color-bg-secondary), var(--color-bg-tertiary));
  border: 2px solid var(--color-accent);
  border-radius: var(--radius-lg);
  padding: 16px;
  margin-bottom: 16px;
  animation: phase-glow 2s ease-in-out infinite;
}

@keyframes phase-glow {
  0%, 100% { box-shadow: 0 0 10px rgba(34, 139, 230, 0.3); }
  50% { box-shadow: 0 0 20px rgba(34, 139, 230, 0.5); }
}

.phase-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.phase-iteration {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-accent);
  padding: 4px 10px;
  background: rgba(34, 139, 230, 0.15);
  border-radius: 6px;
}

.phase-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  
  .phase-icon {
    font-size: 16px;
  }
  
  &.thinking {
    background: rgba(251, 191, 36, 0.2);
    color: var(--color-warning);
  }
  
  &.reasoning {
    background: rgba(168, 85, 247, 0.2);
    color: #a855f7;
  }
  
  &.acting {
    background: rgba(34, 139, 230, 0.2);
    color: var(--color-accent);
  }
  
  &.observing {
    background: rgba(64, 192, 87, 0.2);
    color: var(--color-success);
  }
}

.phase-content {
  padding: 12px;
  background: var(--color-bg);
  border-radius: var(--radius-md);
}

/* Thinking Phase */
.thinking-phase {
  text-align: center;
  padding: 24px;
}

.thinking-visual {
  margin-bottom: 16px;
}

.brain-pulse {
  position: relative;
  display: inline-block;
  
  .brain-icon {
    font-size: 48px;
    position: relative;
    z-index: 1;
    animation: brain-float 2s ease-in-out infinite;
  }
  
  .pulse-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 60px;
    height: 60px;
    border: 2px solid var(--color-warning);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    animation: pulse-expand 2s ease-out infinite;
    opacity: 0;
    
    &.delay-1 { animation-delay: 0.4s; }
    &.delay-2 { animation-delay: 0.8s; }
  }
}

@keyframes brain-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes pulse-expand {
  0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.8; }
  100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
}

.phase-description {
  margin: 0;
  color: var(--color-text-light);
  font-size: 14px;
}

/* Reasoning Phase */
.reasoning-phase {
  .reasoning-box {
    margin-bottom: 12px;
  }
  
  .reasoning-text.streaming {
    position: relative;
    
    &::after {
      content: '▌';
      animation: cursor-blink 1s step-end infinite;
      color: var(--color-accent);
    }
  }
  
  .next-action {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--color-border);
    
    .action-label {
      font-size: 12px;
      color: var(--color-text-muted);
    }
    
    .action-value {
      padding: 4px 10px;
      background: var(--color-accent);
      color: white;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
  }
}

/* Acting Phase */
.acting-phase {
  .tool-executing {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
  }
  
  .tool-icon-wrapper {
    position: relative;
    
    .tool-icon {
      font-size: 32px;
      position: relative;
      z-index: 1;
    }
    
    .executing-spinner {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 50px;
      height: 50px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-accent);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      animation: spin 1s linear infinite;
    }
  }
  
  .tool-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    
    .tool-name {
      font-size: 16px;
      font-weight: 700;
      color: var(--color-text);
    }
    
    .tool-status {
      font-size: 12px;
      color: var(--color-accent);
      animation: pulse 1.5s ease-in-out infinite;
    }
  }
  
  .tool-params-preview {
    padding: 8px 12px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    
    code {
      font-size: 11px;
      color: var(--color-accent);
      font-family: var(--font-mono);
    }
  }
}

@keyframes spin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

/* Observing Phase */
.observing-phase {
  .observation-box {
    .result-preview {
      margin-top: 8px;
      max-height: 100px;
      overflow: auto;
      
      pre {
        margin: 0;
        padding: 8px;
        background: var(--color-bg-tertiary);
        border-radius: var(--radius-sm);
      }
      
      code {
        font-size: 11px;
        color: var(--color-success);
        font-family: var(--font-mono);
      }
    }
  }
}

/* 스텝 리스트 */
.steps-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-card {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all 0.2s ease;
  
  &.current {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px rgba(34, 139, 230, 0.15);
  }
}

.step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-bg-tertiary);
  cursor: pointer;
  transition: background 0.15s ease;
  
  &:hover {
    background: var(--color-bg-elevated);
  }
}

.step-number {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent);
  color: white;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.step-info {
  flex: 1;
  min-width: 0;
}

.step-phase {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.phase-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  
  &.thinking {
    background: rgba(251, 191, 36, 0.2);
    color: var(--color-warning);
  }
  
  &.acting {
    background: rgba(34, 139, 230, 0.2);
    color: var(--color-accent);
  }
  
  &.observing {
    background: rgba(64, 192, 87, 0.2);
    color: var(--color-success);
  }
}

.phase-arrow {
  color: var(--color-text-muted);
  font-size: 10px;
}

.step-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.processing {
  display: flex;
  align-items: center;
  justify-content: center;
  
  .pulse {
    width: 10px;
    height: 10px;
    background: var(--color-accent);
    border-radius: 50%;
    animation: processing-pulse 1s ease-in-out infinite;
  }
}

@keyframes processing-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(34, 139, 230, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(34, 139, 230, 0); }
}

.completed {
  color: var(--color-success);
}

.expand-icon {
  color: var(--color-text-muted);
  transition: transform 0.2s ease;
  
  &.expanded {
    transform: rotate(180deg);
  }
}

/* 스텝 본문 */
.step-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--color-border);
}

.step-section {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  
  &.thinking { border-left: 3px solid var(--color-warning); }
  &.acting { border-left: 3px solid var(--color-accent); }
  &.observing { border-left: 3px solid var(--color-success); }
  &.waiting { border-left: 3px solid var(--color-text-muted); }
}

.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 6px;
  
  .label-icon {
    font-size: 12px;
  }
}

.reasoning-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
  white-space: pre-wrap;
  
  &.typing::after {
    content: '▌';
    animation: cursor-blink 1s step-end infinite;
    color: var(--color-warning);
  }
}

@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.tool-params {
  code {
    display: block;
    padding: 8px;
    background: var(--color-bg);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-accent);
    word-break: break-all;
  }
}

.tool-result {
  pre {
    margin: 0;
    padding: 8px;
    background: var(--color-bg);
    border-radius: var(--radius-sm);
    max-height: 150px;
    overflow: auto;
  }
  
  code {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-success);
  }
}

.toggle-result-btn {
  margin-top: 8px;
  padding: 4px 10px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-light);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text);
  }
}

.waiting-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.loading-dots {
  display: flex;
  gap: 4px;
  
  span {
    width: 5px;
    height: 5px;
    background: var(--color-text-muted);
    border-radius: 50%;
    animation: dot-pulse 1.4s ease-in-out infinite;
    
    &:nth-child(2) { animation-delay: 0.2s; }
    &:nth-child(3) { animation-delay: 0.4s; }
  }
}

@keyframes dot-pulse {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

/* 우측 패널 */
.right-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  background: var(--color-bg-secondary);
}

/* 카드 공통 */
.status-card, .sql-card, .user-input-card, .result-card, .warnings-card, .error-card {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
  
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }
  
  &.warning {
    background: rgba(251, 191, 36, 0.1);
    h3 { color: var(--color-warning); }
  }
  
  &.success {
    background: rgba(64, 192, 87, 0.1);
    h3 { color: var(--color-success); }
  }
  
  &.error {
    background: rgba(250, 82, 82, 0.1);
    h3 { color: var(--color-error); }
  }
}

.card-body {
  padding: 14px;
}

/* 상태 카드 */
.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 600;
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-text-muted);
  }
  
  &.running {
    background: rgba(34, 139, 230, 0.15);
    color: var(--color-accent);
    .status-dot { background: var(--color-accent); animation: processing-pulse 1s infinite; }
  }
  
  &.completed {
    background: rgba(64, 192, 87, 0.15);
    color: var(--color-success);
    .status-dot { background: var(--color-success); }
  }
  
  &.error {
    background: rgba(250, 82, 82, 0.15);
    color: var(--color-error);
    .status-dot { background: var(--color-error); }
  }
  
  &.needs_user_input {
    background: rgba(251, 191, 36, 0.15);
    color: var(--color-warning);
    .status-dot { background: var(--color-warning); }
  }
}

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  
  .stat-label {
    font-size: 11px;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }
  
  .stat-value {
    font-size: 18px;
    font-weight: 700;
    color: var(--color-text);
  }
}

.completeness-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  
  .completeness-label {
    font-size: 12px;
    color: var(--color-text-light);
  }
  
  .completeness-value {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    
    &.high {
      background: rgba(64, 192, 87, 0.2);
      color: var(--color-success);
    }
    
    &.medium {
      background: rgba(251, 191, 36, 0.2);
      color: var(--color-warning);
    }
    
    &.low {
      background: rgba(250, 82, 82, 0.2);
      color: var(--color-error);
    }
  }
}

/* SQL 카드 */
.btn-copy {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-light);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: var(--color-bg-elevated);
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
}

.sql-preview {
  max-height: 180px;
  overflow: auto;
  
  pre {
    margin: 0;
    padding: 10px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
  }
  
  code {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-accent);
    line-height: 1.5;
  }
}

.sql-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px;
  color: var(--color-text-muted);
  text-align: center;
  font-size: 13px;
  
  .loading-icon {
    animation: spin 1.5s linear infinite;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 사용자 입력 카드 */
.question-text {
  margin: 0 0 12px 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
}

.input-group {
  display: flex;
  gap: 8px;
  
  .response-input {
    flex: 1;
    padding: 8px 12px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 13px;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
    
    &::placeholder {
      color: var(--color-text-muted);
    }
  }
}

/* 결과 카드 */
.result-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--color-text-light);
}

/* 경고 */
.warnings-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--color-warning);
  
  li {
    margin-bottom: 4px;
  }
}

/* 에러 */
.error-text {
  margin: 0;
  font-size: 13px;
  color: var(--color-error);
}

/* 액션 버튼 */
.action-buttons {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
  
  .btn {
    flex: 1;
  }
}

/* 스텝 애니메이션 */
.step-anim-enter-active {
  animation: step-in 0.3s ease-out;
}

.step-anim-leave-active {
  animation: step-out 0.2s ease-in;
}

@keyframes step-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes step-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* 반응형 */
@media (max-width: 1024px) {
  .split-layout {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
  
  .left-panel {
    border-right: none;
    border-bottom: 1px solid var(--color-border);
    max-height: 50%;
  }
  
  .right-panel {
    max-height: 50%;
  }
}
</style>
