<template>
  <div class="react-input">
    <div v-if="!waitingForUser" class="input-container">
      <textarea 
        v-model="question" 
        @keydown.ctrl.enter.prevent="submitQuestion"
        placeholder="질문을 입력하세요... 예: '지난 분기 매출 Top 5 제품을 보여줘'" 
        rows="3" 
        :disabled="loading"
      ></textarea>
      <div class="action-buttons">
        <button v-if="!loading" class="btn-primary" @click="submitQuestion" :disabled="!canSubmitQuestion">
          <span class="btn-icon">🚀</span>
          <span class="btn-text">실행</span>
        </button>
        <button v-if="loading" class="btn-secondary" type="button" @click="emit('cancel')">
          <span class="btn-icon">✕</span>
          <span class="btn-text">중단</span>
        </button>
      </div>
    </div>

    <!-- 고급 설정 -->
    <div v-if="!waitingForUser" class="settings-section">
      <button class="settings-toggle" type="button" @click="showSettings = !showSettings">
        <span class="toggle-icon">⚙️</span>
        <span class="toggle-text">고급 설정</span>
        <span class="toggle-arrow" :class="{ expanded: showSettings }">▼</span>
      </button>
      <transition name="slide">
        <div v-if="showSettings" class="settings-panel">
          <div class="setting-item">
            <label for="maxToolCalls">
              <span class="setting-label">최대 도구 호출 횟수</span>
              <span class="setting-hint">에이전트가 사용할 수 있는 도구 호출 수 (1~100)</span>
            </label>
            <div class="setting-input-group">
              <input 
                id="maxToolCalls" 
                v-model.number="maxToolCalls" 
                type="number" 
                min="1" 
                max="100"
                :disabled="loading" 
              />
              <span class="setting-unit">회</span>
            </div>
          </div>
          <div class="setting-item">
            <label for="maxSqlSeconds">
              <span class="setting-label">SQL 실행 제한 시간</span>
              <span class="setting-hint">최종 SQL 실행 최대 허용 시간 (1~3600초)</span>
            </label>
            <div class="setting-input-group">
              <input 
                id="maxSqlSeconds" 
                v-model.number="maxSqlSeconds" 
                type="number" 
                min="1" 
                max="3600"
                :disabled="loading" 
              />
              <span class="setting-unit">초</span>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <div v-else class="follow-up-wrapper">
      <div class="follow-up-question">
        <strong>에이전트 질문:</strong>
        <p>{{ questionToUser }}</p>
      </div>
      <div class="follow-up-container">
        <textarea 
          v-model="userResponse" 
          @keydown.ctrl.enter.prevent="submitUserResponse"
          placeholder="추가 정보를 입력해주세요. (Ctrl+Enter 전송)" 
          rows="3" 
          :disabled="loading"
        ></textarea>
        <div class="action-buttons">
          <button class="btn-secondary" type="button" @click="emit('cancel')">
            <span class="btn-icon">✕</span>
            <span class="btn-text">중단</span>
          </button>
          <button class="btn-primary" @click="submitUserResponse" :disabled="!canSubmitUserResponse">
            <span class="btn-icon">📤</span>
            <span class="btn-text">{{ loading ? '전송 중...' : '답변 보내기' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

export interface ReactStartOptions {
  maxToolCalls: number
  maxSqlSeconds: number
}

const emit = defineEmits<{
  start: [question: string, options: ReactStartOptions]
  respond: [answer: string]
  cancel: []
}>()

const props = defineProps<{
  loading: boolean
  waitingForUser: boolean
  questionToUser: string | null
  currentQuestion: string
}>()

const question = ref(props.currentQuestion ?? '')
const userResponse = ref('')
const showSettings = ref(false)
const maxToolCalls = ref(30)
const maxSqlSeconds = ref(60)

const waitingForUser = computed(() => props.waitingForUser)

const canSubmitQuestion = computed(() => !!question.value.trim() && !props.loading)
const canSubmitUserResponse = computed(() => !!userResponse.value.trim() && !props.loading)

watch(
  () => props.currentQuestion,
  newVal => {
    if (!props.loading && !waitingForUser.value) {
      question.value = newVal
    }
  }
)

watch(waitingForUser, isWaiting => {
  if (!isWaiting) {
    userResponse.value = ''
  }
})

function submitQuestion() {
  if (!canSubmitQuestion.value) return
  const trimmed = question.value.trim()
  question.value = trimmed
  emit('start', trimmed, {
    maxToolCalls: maxToolCalls.value,
    maxSqlSeconds: maxSqlSeconds.value
  })
}

function submitUserResponse() {
  if (!canSubmitUserResponse.value) return
  const trimmed = userResponse.value.trim()
  userResponse.value = trimmed
  emit('respond', trimmed)
}
</script>

<style scoped>
.react-input {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

.input-container,
.follow-up-container {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  align-items: stretch;
}

.follow-up-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

textarea {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  resize: none;
  min-height: 80px;
  transition: all 0.2s;
  background: #fafbfc;
}

textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  background: white;
}

textarea:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.7;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 100px;
}

.btn-primary {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.75rem 0.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.btn-primary .btn-icon {
  font-size: 1.2rem;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-primary:disabled {
  background: linear-gradient(135deg, #cbd5e0 0%, #a0aec0 100%);
  cursor: not-allowed;
  box-shadow: none;
}

.btn-secondary {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.75rem 0.5rem;
  background: white;
  color: #4a5568;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover:not(:disabled) {
  background: #f7fafc;
  border-color: #cbd5e0;
}

.follow-up-question {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border-left: 3px solid #f59e0b;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  color: #78350f;
}

.follow-up-question strong {
  font-size: 0.9rem;
}

.follow-up-question p {
  margin: 0.5rem 0 0 0;
  white-space: pre-wrap;
  font-size: 0.9rem;
}

.settings-section {
  margin-top: 0.25rem;
}

.settings-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: transparent;
  border: 1px dashed #cbd5e0;
  border-radius: 6px;
  color: #718096;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  justify-content: center;
}

.settings-toggle:hover {
  background: #f7fafc;
  border-color: #a0aec0;
}

.toggle-arrow {
  font-size: 0.65rem;
  transition: transform 0.2s;
  margin-left: auto;
}

.toggle-arrow.expanded {
  transform: rotate(180deg);
}

.settings-panel {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.setting-item label {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.setting-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #2d3748;
}

.setting-hint {
  font-size: 0.7rem;
  color: #718096;
}

.setting-input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.setting-input-group input {
  flex: 1;
  padding: 0.4rem 0.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  font-size: 0.85rem;
  max-width: 80px;
}

.setting-unit {
  font-size: 0.8rem;
  color: #718096;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}

.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 200px;
}
</style>

