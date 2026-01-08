<template>
  <div class="text2sql-tab">
    <!-- 채팅 컨테이너 -->
    <div class="chat-container">
      <!-- 채팅 메시지 영역 -->
      <div class="chat-messages" ref="chatContainer">
        <!-- 초기 안내 메시지 -->
        <div v-if="chatMessages.length === 0 && !reactStore.isRunning" class="welcome-message">
          <div class="welcome-icon">🤖</div>
          <h2>ReAct Text2SQL</h2>
          <p>자연어로 질문하면 AI가 SQL을 생성합니다.</p>
          <div class="examples">
            <span class="example-label">예시:</span>
            <button v-for="example in exampleQueries" :key="example" class="example-btn" @click="setQuestion(example)">
              {{ example }}
            </button>
          </div>
        </div>

        <!-- 채팅 메시지들 -->
        <TransitionGroup name="message-anim">
          <div v-for="msg in chatMessages" :key="msg.id" :class="['chat-message', msg.type]">
            <!-- 사용자 메시지 -->
            <template v-if="msg.type === 'user'">
              <div class="message-avatar user">👤</div>
              <div class="message-content">
                <div class="message-text">{{ msg.content }}</div>
              </div>
            </template>

            <!-- AI 사고 과정 -->
            <template v-else-if="msg.type === 'thinking'">
              <div class="message-avatar ai">🧠</div>
              <div class="message-content">
                <div class="message-header">
                  <span class="step-badge">Step {{ msg.step }}</span>
                  <span class="phase-label thinking">사고 중...</span>
                </div>
                <div class="message-text typing-effect">
                  <span class="typing-dots"><span></span><span></span><span></span></span>
                  LLM이 질문을 분석하고 있습니다...
                </div>
              </div>
            </template>

            <!-- AI 추론 -->
            <template v-else-if="msg.type === 'reasoning'">
              <div class="message-avatar ai">💭</div>
              <div class="message-content">
                <div class="message-header">
                  <span class="step-badge">Step {{ msg.step }}</span>
                  <span class="phase-label reasoning">추론</span>
                </div>
                <div class="message-text" :class="{ 'typing-active': msg.isStreaming }">
                  <TypeWriter v-if="msg.isStreaming" :text="msg.content" :speed="20" />
                  <span v-else>{{ msg.content }}</span>
                </div>
                <div v-if="msg.nextTool" class="next-action-badge">
                  ⚡ 다음: {{ msg.nextTool }}
                </div>
              </div>
            </template>

            <!-- 도구 실행 -->
            <template v-else-if="msg.type === 'tool'">
              <div class="message-avatar ai">⚡</div>
              <div class="message-content">
                <div class="message-header">
                  <span class="step-badge">Step {{ msg.step }}</span>
                  <span class="phase-label tool">{{ msg.toolName }}</span>
                  <span v-if="msg.isExecuting" class="executing-indicator">
                    <span class="spinner-small"></span>
                  </span>
                  <span v-else class="completed-indicator">✓</span>
                </div>
                <div v-if="msg.params" class="tool-params-inline">
                  <code>{{ msg.params }}</code>
                </div>
                <div v-if="msg.result" class="tool-result-inline">
                  <div class="result-header" @click="toggleMessageExpand(msg.id)">
                    <span>결과</span>
                    <IconChevronDown :size="12" :class="{ rotated: expandedMessages.has(msg.id) }" />
                  </div>
                  <pre
                    v-if="expandedMessages.has(msg.id) || !isResultLong(msg.result)"><code>{{ msg.result }}</code></pre>
                  <pre v-else><code>{{ truncateResult(msg.result) }}</code></pre>
                </div>

                <!-- 스텝 상세(섹션별) -->
                <div v-if="msg.step" class="step-details">
                  <div class="step-details-header" @click="toggleStepDetails(msg.id)">
                    <span>스텝 상세</span>
                    <IconChevronDown :size="12" :class="{ rotated: expandedStepDetails.has(msg.id) }" />
                  </div>
                  <div v-if="expandedStepDetails.has(msg.id)" class="step-details-body">
                    <template v-if="getLiveForStep(msg.step)">
                      <details v-if="(getLiveForStep(msg.step)?.sections?.reasoning ?? '').trim().length > 0" open
                        class="live-section">
                        <summary>추론</summary>
                        <div class="live-text">{{ getLiveForStep(msg.step)?.sections?.reasoning }}</div>
                      </details>
                      <!-- Metadata를 추론 바로 아래로 이동 (XML 구조와 동일한 순서) -->
                      <details
                        v-if="(getLiveForStep(msg.step)?.metadata?.table?.length || 0) + (getLiveForStep(msg.step)?.metadata?.column?.length || 0) + (getLiveForStep(msg.step)?.metadata?.value?.length || 0) + (getLiveForStep(msg.step)?.metadata?.relationship?.length || 0) + (getLiveForStep(msg.step)?.metadata?.constraint?.length || 0) > 0"
                        class="live-section">
                        <summary>
                          Metadata
                          <span class="meta-counts">
                            T{{ getLiveForStep(msg.step)?.metadata?.table?.length || 0 }} ·
                            C{{ getLiveForStep(msg.step)?.metadata?.column?.length || 0 }} ·
                            V{{ getLiveForStep(msg.step)?.metadata?.value?.length || 0 }} ·
                            R{{ getLiveForStep(msg.step)?.metadata?.relationship?.length || 0 }} ·
                            K{{ getLiveForStep(msg.step)?.metadata?.constraint?.length || 0 }}
                          </span>
                        </summary>
                        <div class="meta-groups">
                          <div class="meta-group" v-for="t in availableMetaTypesForStep(msg.step)" :key="t">
                            <button class="meta-toggle" type="button" @click="toggleMetaType(t)">
                              {{ metaTypeLabel(t) }}
                              <span class="meta-badge">{{ (getLiveForStep(msg.step)?.metadata?.[t]?.length ?? 0)
                              }}</span>
                            </button>
                            <div v-if="expandedMetaTypes.has(t)" class="meta-items">
                              <div v-for="(item, i) in (getLiveForStep(msg.step)?.metadata?.[t] ?? [])"
                                :key="`${t}-${i}`" class="meta-item">
                                <div class="meta-item-kv" v-for="(v, k) in item" :key="String(k)">
                                  <span class="meta-item-key">{{ k }}</span>
                                  <span class="meta-item-val">{{ String(v) }}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </details>

                      <details v-if="(getLiveForStep(msg.step)?.sections?.partial_sql ?? '').trim().length > 0"
                        class="live-section">
                        <summary>부분 SQL</summary>
                        <pre class="live-code"><code>{{ getLiveForStep(msg.step)?.sections?.partial_sql }}</code></pre>
                      </details>
                      <details
                        v-if="((getLiveForStep(msg.step)?.sections?.['sql_completeness_check.confidence_level'] ?? '').trim().length > 0) || ((getLiveForStep(msg.step)?.sections?.['sql_completeness_check.missing_info'] ?? '').trim().length > 0)"
                        class="live-section">
                        <summary>완성도</summary>
                        <div class="live-kv">
                          <div class="kv-row">
                            <span class="kv-key">confidence</span>
                            <span class="kv-val">{{
                              getLiveForStep(msg.step)?.sections?.['sql_completeness_check.confidence_level'] || '-'
                            }}</span>
                          </div>
                          <div class="kv-row">
                            <span class="kv-key">missing_info</span>
                            <span class="kv-val">{{
                              getLiveForStep(msg.step)?.sections?.['sql_completeness_check.missing_info'] || '-'
                            }}</span>
                          </div>
                        </div>
                      </details>
                      <details
                        v-if="((getLiveForStep(msg.step)?.sections?.['tool_call.tool_name'] ?? '').trim().length > 0) || ((getLiveForStep(msg.step)?.sections?.['tool_call.parameters'] ?? '').trim().length > 0)"
                        class="live-section">
                        <summary>Tool Call</summary>
                        <div class="live-kv">
                          <div class="kv-row">
                            <span class="kv-key">tool</span>
                            <span class="kv-val">{{ getLiveForStep(msg.step)?.sections?.['tool_call.tool_name'] || '-'
                            }}</span>
                          </div>
                          <div class="kv-row">
                            <span class="kv-key">params</span>
                            <span class="kv-val mono">{{ getLiveForStep(msg.step)?.sections?.['tool_call.parameters'] ||
                              '-' }}</span>
                          </div>
                        </div>
                      </details>
                    </template>
                    <div v-else class="meta-empty">스텝 상세 데이터가 아직 없습니다.</div>
                  </div>
                </div>
              </div>
            </template>

            <!-- AI 질문 (사용자 입력 필요) -->
            <template v-else-if="msg.type === 'question'">
              <div class="message-avatar ai">❓</div>
              <div class="message-content question-content">
                <div class="message-header">
                  <span class="phase-label question">질문</span>
                </div>
                <div class="message-text">
                  <TypeWriter v-if="msg.isStreaming" :text="msg.content" :speed="15" />
                  <span v-else>{{ msg.content }}</span>
                </div>
              </div>
            </template>

            <!-- SQL 결과 -->
            <template v-else-if="msg.type === 'sql'">
              <div class="message-avatar ai">📝</div>
              <div class="message-content sql-content">
                <div class="message-header">
                  <span class="phase-label sql">최종 SQL</span>
                  <button class="copy-btn" @click="copySql(msg.content)">
                    <IconCopy :size="12" />
                  </button>
                </div>
                <pre class="sql-code"><code>{{ msg.content }}</code></pre>
              </div>
            </template>

            <!-- 실행 결과 -->
            <template v-else-if="msg.type === 'result'">
              <div class="message-avatar ai">📊</div>
              <div class="message-content result-content">
                <div class="message-header">
                  <span class="phase-label result">실행 결과</span>
                  <span class="result-meta">{{ msg.rowCount }}개 행 · {{ msg.execTime }}ms</span>
                </div>
                <ResultTable v-if="msg.data" :data="msg.data" />
              </div>
            </template>

            <!-- 에러 -->
            <template v-else-if="msg.type === 'error'">
              <div class="message-avatar error">⚠️</div>
              <div class="message-content error-content">
                <div class="message-text">{{ msg.content }}</div>
              </div>
            </template>
          </div>
        </TransitionGroup>

        <!-- Live 스트리밍 패널 (섹션별) -->
        <div v-if="reactStore.isRunning && liveCurrent" class="chat-message ai live">
          <div class="message-avatar ai">🧩</div>
          <div class="message-content live-content">
            <div class="message-header">
              <span class="step-badge">Step {{ reactStore.currentIteration }}</span>
              <span class="phase-label thinking">실시간 생성 중</span>
              <span v-if="liveRepairing" class="repair-badge">출력 포맷 정리 중...</span>
            </div>

            <div class="live-sections">
              <details v-if="liveReasoning.trim().length > 0" open class="live-section">
                <summary>추론(Reasoning)</summary>
                <div class="live-text">
                  <span>{{ liveReasoning }}</span><span class="cursor"
                    v-if="reactStore.currentPhase === 'thinking'">▌</span>
                </div>
              </details>

              <!-- Metadata를 추론 바로 아래로 이동 (XML 구조와 동일한 순서) -->
              <details
                v-if="(liveMetaCounts.table + liveMetaCounts.column + liveMetaCounts.value + liveMetaCounts.relationship + liveMetaCounts.constraint) > 0"
                open class="live-section">
                <summary>
                  메타데이터(Collected Metadata)
                  <span class="meta-counts">
                    T{{ liveMetaCounts.table }} · C{{ liveMetaCounts.column }} · V{{ liveMetaCounts.value }} · R{{
                      liveMetaCounts.relationship }} · K{{ liveMetaCounts.constraint }}
                  </span>
                </summary>
                <div class="meta-groups">
                  <div class="meta-group" v-for="t in availableMetaTypesLive" :key="t">
                    <button class="meta-toggle" type="button" @click="toggleMetaType(t)">
                      {{ metaTypeLabel(t) }}
                      <span class="meta-badge">{{ (liveCurrent?.metadata?.[t]?.length ?? 0) }}</span>
                    </button>
                    <div v-if="expandedMetaTypes.has(t)" class="meta-items">
                      <div v-for="(item, i) in (liveCurrent?.metadata?.[t] ?? [])" :key="`${t}-${i}`" class="meta-item">
                        <div class="meta-item-kv" v-for="(v, k) in item" :key="String(k)">
                          <span class="meta-item-key">{{ k }}</span>
                          <span class="meta-item-val">{{ String(v) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </details>

              <details v-if="livePartialSql.trim().length > 0" open class="live-section">
                <summary>부분 SQL(Partial SQL)</summary>
                <pre class="live-code"><code>{{ livePartialSql }}</code><span class="cursor"
            v-if="reactStore.currentPhase === 'thinking'">▌</span></pre>
              </details>

              <details v-if="(liveConfidence || '').trim().length > 0 || (liveMissingInfo || '').trim().length > 0" open
                class="live-section">
                <summary>완성도(SQL Completeness)</summary>
                <div class="live-kv">
                  <div class="kv-row">
                    <span class="kv-key">confidence</span>
                    <span class="kv-val">{{ liveConfidence || '-' }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-key">missing_info</span>
                    <span class="kv-val">{{ liveMissingInfo || '-' }}</span>
                  </div>
                </div>
              </details>

              <details v-if="(liveToolName || '').trim().length > 0 || (liveToolParams || '').trim().length > 0" open
                class="live-section">
                <summary>다음 액션(Next Tool)</summary>
                <div class="live-kv">
                  <div class="kv-row">
                    <span class="kv-key">tool</span>
                    <span class="kv-val">{{ liveToolName || '-' }}</span>
                  </div>
                  <div class="kv-row">
                    <span class="kv-key">params</span>
                    <span class="kv-val mono">{{ liveToolParams || '-' }}</span>
                  </div>
                </div>
              </details>

              <!-- Raw XML 토큰(디버그) -->
              <details v-if="reactStore.debugStreamRawXmlTokens && reactStore.streamingText" class="live-section">
                <summary>Raw XML (디버그)</summary>
                <pre class="live-code raw"><code>{{ reactStore.streamingText }}</code><span class="cursor"
            v-if="reactStore.isStreaming">▌</span></pre>
              </details>
            </div>
          </div>
        </div>
      </div>

      <!-- 입력 영역 -->
      <div class="chat-input-area">
        <!-- 진행 중 상태 표시 -->
        <div v-if="reactStore.isRunning && !reactStore.isWaitingUser" class="status-bar">
          <span class="status-dot running"></span>
          <span>AI가 작업 중입니다...</span>
          <button class="cancel-btn" @click="handleCancel">중단</button>
        </div>

        <!-- 입력창 -->
        <div class="input-wrapper">
          <textarea v-model="inputText" :placeholder="inputPlaceholder"
            :disabled="reactStore.isRunning && !reactStore.isWaitingUser" rows="1"
            @keydown.enter.exact.prevent="handleSubmit" @keydown.shift.enter="handleNewline" @input="autoResize"
            ref="inputRef"></textarea>
          <button class="send-btn" :disabled="!canSubmit" @click="handleSubmit">
            <IconPlay v-if="!reactStore.isRunning" :size="18" />
            <IconUpload v-else :size="18" />
          </button>
        </div>

        <!-- 고급 설정 토글 -->
        <div class="settings-toggle" @click="showSettings = !showSettings">
          <IconSettings :size="12" />
          <span>고급 설정</span>
          <IconChevronDown :size="12" :class="{ rotated: showSettings }" />
        </div>

        <transition name="slide">
          <div v-if="showSettings" class="settings-panel">
            <div class="setting-row">
              <label>최대 도구 호출</label>
              <input v-model.number="maxToolCalls" type="number" min="1" max="100" />
            </div>
            <div class="setting-row">
              <label>SQL 실행 제한(초)</label>
              <input v-model.number="maxSqlSeconds" type="number" min="1" max="3600" />
            </div>
            <div class="setting-row">
              <label>Raw XML(디버그)</label>
              <input v-model="debugRawXml" type="checkbox" />
            </div>
          </div>
        </transition>
      </div>
    </div>

    <!-- 우측 SQL 패널 (선택적) -->
    <div v-if="reactStore.hasSteps" class="sql-side-panel">
      <div class="panel-header">
        <h3>현재 SQL</h3>
        <button v-if="currentSql" class="copy-btn" @click="copySql(currentSql)">
          <IconCopy :size="14" />
        </button>
      </div>
      <div class="sql-preview">
        <pre v-if="currentSql"><code>{{ currentSql }}</code></pre>
        <div v-else class="sql-placeholder">SQL 생성 대기 중...</div>
      </div>
      <div v-if="latestCompleteness" class="completeness-bar">
        <span>완성도:</span>
        <span :class="['level', getConfidenceClass(latestCompleteness.confidence_level)]">
          {{ latestCompleteness.confidence_level }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { useReactStore } from '@/stores/text2sql'
import ResultTable from './ResultTable.vue'
import TypeWriter from './TypeWriter.vue'
import type { ReactExecutionResult } from '@/types'
import {
  IconPlay, IconUpload, IconSettings, IconChevronDown,
  IconCopy
} from '@/components/icons'

// Types
interface ChatMessage {
  id: string
  type: 'user' | 'thinking' | 'reasoning' | 'tool' | 'question' | 'sql' | 'result' | 'error'
  content: string
  step?: number
  isStreaming?: boolean
  nextTool?: string
  toolName?: string
  params?: string
  result?: string
  isExecuting?: boolean
  rowCount?: number
  execTime?: number
  data?: ReactExecutionResult
  icon?: string
}

const reactStore = useReactStore()

// Refs
const chatContainer = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const inputText = ref('')
const showSettings = ref(false)
const maxToolCalls = ref(30)
const maxSqlSeconds = ref(60)
const debugRawXml = ref(false)
const expandedMessages = ref<Set<string>>(new Set())
const expandedStepDetails = ref<Set<string>>(new Set())
type MetadataItemType = 'table' | 'column' | 'value' | 'relationship' | 'constraint'
const expandedMetaTypes = ref<Set<MetadataItemType>>(new Set())
const metaTypesAll: MetadataItemType[] = ['table', 'column', 'value', 'relationship', 'constraint']

const availableMetaTypesLive = computed(() => {
  return metaTypesAll.filter(t => (liveCurrent.value?.metadata?.[t]?.length ?? 0) > 0)
})

// Chat messages
const chatMessages = ref<ChatMessage[]>([])
let messageIdCounter = 0

// Example queries
const exampleQueries = [
  '회의실 예약 현황을 보여줘',
  '오늘 예약된 회의 목록',
  '가장 많이 사용되는 회의실 Top 5'
]

// Computed
const canSubmit = computed(() =>
  inputText.value.trim() && (!reactStore.isRunning || reactStore.isWaitingUser)
)

const inputPlaceholder = computed(() =>
  reactStore.isWaitingUser
    ? '답변을 입력하세요...'
    : '질문을 입력하세요... (Enter로 전송)'
)

const currentSql = computed(() =>
  reactStore.finalSql || reactStore.latestPartialSql || ''
)

const latestCompleteness = computed(() =>
  reactStore.latestStep?.sql_completeness ?? null
)

const liveCurrent = computed(() => reactStore.liveByIteration[reactStore.currentIteration] ?? null)
const liveReasoning = computed(() => liveCurrent.value?.sections?.reasoning ?? '')
const livePartialSql = computed(() => liveCurrent.value?.sections?.partial_sql ?? '')
const liveToolName = computed(() => liveCurrent.value?.sections?.['tool_call.tool_name'] ?? '')
const liveToolParams = computed(() => liveCurrent.value?.sections?.['tool_call.parameters'] ?? '')
const liveMissingInfo = computed(() => liveCurrent.value?.sections?.['sql_completeness_check.missing_info'] ?? '')
const liveConfidence = computed(() => liveCurrent.value?.sections?.['sql_completeness_check.confidence_level'] ?? '')
const liveRepairing = computed(() => !!liveCurrent.value?.isRepairing)
const liveMetaCounts = computed(() => {
  const m = liveCurrent.value?.metadata
  if (!m) return { table: 0, column: 0, value: 0, relationship: 0, constraint: 0 }
  return {
    table: m.table?.length ?? 0,
    column: m.column?.length ?? 0,
    value: m.value?.length ?? 0,
    relationship: m.relationship?.length ?? 0,
    constraint: m.constraint?.length ?? 0
  }
})

function toggleMetaType(t: MetadataItemType) {
  if (expandedMetaTypes.value.has(t)) {
    expandedMetaTypes.value.delete(t)
  } else {
    expandedMetaTypes.value.add(t)
  }
}

function metaTypeLabel(t: MetadataItemType): string {
  switch (t) {
    case 'table': return 'Tables'
    case 'column': return 'Columns'
    case 'value': return 'Values'
    case 'relationship': return 'Relationships'
    case 'constraint': return 'Constraints'
  }
}

function availableMetaTypesForStep(step?: number): MetadataItemType[] {
  const s = getLiveForStep(step)
  if (!s) return []
  return metaTypesAll.filter(t => (s.metadata?.[t]?.length ?? 0) > 0)
}

// Helper functions
function generateId(): string {
  return `msg-${++messageIdCounter}-${Date.now()}`
}

function addMessage(msg: Omit<ChatMessage, 'id'>): string {
  const id = generateId()
  chatMessages.value.push({ ...msg, id })
  scrollToBottom()
  return id
}

function updateMessage(id: string, updates: Partial<ChatMessage>) {
  const idx = chatMessages.value.findIndex(m => m.id === id)
  if (idx !== -1) {
    chatMessages.value[idx] = { ...chatMessages.value[idx], ...updates }
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
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

function truncateResult(result: string): string {
  const lines = result.split('\n')
  if (lines.length > 5) {
    return lines.slice(0, 5).join('\n') + '\n...'
  }
  if (result.length > 300) {
    return result.slice(0, 300) + '...'
  }
  return result
}

function isResultLong(result: string): boolean {
  return result.split('\n').length > 5 || result.length > 300
}

function toggleMessageExpand(id: string) {
  if (expandedMessages.value.has(id)) {
    expandedMessages.value.delete(id)
  } else {
    expandedMessages.value.add(id)
  }
}

function toggleStepDetails(id: string) {
  if (expandedStepDetails.value.has(id)) {
    expandedStepDetails.value.delete(id)
  } else {
    expandedStepDetails.value.add(id)
  }
}

function getLiveForStep(step?: number) {
  if (!step) return null
  return reactStore.liveByIteration[step] ?? null
}

function getConfidenceClass(level: string): string {
  const lower = level.toLowerCase()
  if (lower.includes('high')) return 'high'
  if (lower.includes('medium')) return 'medium'
  return 'low'
}

function copySql(sql: string) {
  navigator.clipboard.writeText(sql)
}

function setQuestion(q: string) {
  inputText.value = q
  inputRef.value?.focus()
}

function autoResize(e: Event) {
  const target = e.target as HTMLTextAreaElement
  target.style.height = 'auto'
  target.style.height = Math.min(target.scrollHeight, 120) + 'px'
}

// Event handlers
async function handleSubmit() {
  if (!canSubmit.value) return

  const text = inputText.value.trim()
  inputText.value = ''

  if (reactStore.isWaitingUser) {
    // 사용자 응답
    addMessage({ type: 'user', content: text })
    await reactStore.continueWithResponse(text)
  } else {
    // 새 질문
    chatMessages.value = []
    addMessage({ type: 'user', content: text })
    await reactStore.start(text, {
      maxToolCalls: maxToolCalls.value,
      maxSqlSeconds: maxSqlSeconds.value,
      debugStreamRawXmlTokens: debugRawXml.value
    })
  }
}

function handleNewline(_e: KeyboardEvent) {
  // Shift+Enter는 줄바꿈
}

function handleCancel() {
  reactStore.cancel()
  addMessage({ type: 'error', content: '작업이 중단되었습니다.' })
}

// Watch for phase changes
watch(() => reactStore.currentPhase, (phase) => {
  if (phase === 'idle') {
    return
  }

  const step = reactStore.currentIteration
  const data = reactStore.currentPhaseData

  if (phase === 'acting' && data?.tool_name) {
    addMessage({
      type: 'tool',
      content: '',
      step,
      toolName: data.tool_name,
      params: data.tool_parameters ? formatParams(data.tool_parameters) : undefined,
      isExecuting: true
    })
  } else if (phase === 'reasoning') {
    // reasoning은 토큰 스트림 대신 section_delta로 실시간 누적되므로, 빈 메시지만 먼저 두고 이후 UI에서 live 패널로 노출
    // (추가로 필요하면 chatMessages에 reasoning 요약을 넣는 방식으로 확장 가능)
  } else if (phase === 'observing' && data?.tool_result_preview) {
    // 마지막 tool 메시지 업데이트
    const toolMsg = [...chatMessages.value].reverse().find(
      m => m.type === 'tool' && m.step === step
    )
    if (toolMsg) {
      updateMessage(toolMsg.id, {
        result: data.tool_result_preview,
        isExecuting: false
      })
    }
  }
}, { immediate: true })

// Watch for streaming text (실시간 LLM 토큰)
watch(() => reactStore.streamingText, () => {
  scrollToBottom()
})

// Watch for live section deltas (섹션별 스트리밍)
watch(() => reactStore.liveByIteration, () => {
  scrollToBottom()
}, { deep: true })

// Watch for steps completion
watch(() => reactStore.steps, (steps) => {
  // 스텝이 완료되면 reasoning 메시지의 스트리밍 종료
  steps.forEach(step => {
    const reasoningMsg = chatMessages.value.find(
      m => m.type === 'reasoning' && m.step === step.iteration && m.isStreaming
    )
    if (reasoningMsg && step.tool_result) {
      updateMessage(reasoningMsg.id, { isStreaming: false })
    }
  })
}, { deep: true })

// Watch for ask_user
watch(() => reactStore.questionToUser, (question) => {
  if (question) {
    addMessage({
      type: 'question',
      content: question,
      isStreaming: true
    })
  }
})

// Watch for completion
watch(() => reactStore.status, (status) => {
  if (status === 'completed') {
    if (reactStore.finalSql) {
      addMessage({
        type: 'sql',
        content: reactStore.finalSql
      })
    }

    if (reactStore.executionResult) {
      addMessage({
        type: 'result',
        content: '',
        rowCount: reactStore.executionResult.row_count,
        execTime: Math.round(reactStore.executionResult.execution_time_ms),
        data: reactStore.executionResult
      })
    }
  } else if (status === 'error' && reactStore.error) {
    addMessage({
      type: 'error',
      content: reactStore.error
    })
  }
})

onMounted(() => {
  inputRef.value?.focus()
})
</script>

<style scoped lang="scss">
.text2sql-tab {
  display: flex;
  height: 100%;
  background: var(--color-bg);
  overflow: hidden;
}

/* 채팅 컨테이너 */
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 메시지 영역 */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 환영 메시지 */
.welcome-message {
  text-align: center;
  padding: 60px 24px;
  color: var(--color-text-light);

  .welcome-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  h2 {
    margin: 0 0 8px 0;
    color: var(--color-text);
    font-size: 24px;
  }

  p {
    margin: 0 0 24px 0;
    font-size: 14px;
  }

  .examples {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    align-items: center;
  }

  .example-label {
    font-size: 12px;
    color: var(--color-text-muted);
  }

  .example-btn {
    padding: 8px 16px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 20px;
    color: var(--color-text);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: var(--color-accent);
      border-color: var(--color-accent);
      color: white;
    }
  }
}

/* 채팅 메시지 */
.chat-message {
  display: flex;
  gap: 12px;
  max-width: 85%;
  animation: message-in 0.3s ease-out;

  &.user {
    align-self: flex-end;
    flex-direction: row-reverse;

    .message-content {
      background: var(--color-accent);
      color: white;
      border-radius: 16px 16px 4px 16px;
    }
  }

  &.ai,
  &.thinking,
  &.reasoning,
  &.tool,
  &.question,
  &.sql,
  &.result {
    align-self: flex-start;

    .message-content {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 16px 16px 16px 4px;
    }
  }

  &.error {
    align-self: flex-start;

    .message-content {
      background: rgba(250, 82, 82, 0.1);
      border: 1px solid var(--color-error);
      border-radius: 16px;
    }
  }

  &.streaming {
    .message-content {
      border-color: var(--color-accent);
    }
  }
}

@keyframes message-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;

  &.user {
    background: var(--color-accent);
  }

  &.ai {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
  }

  &.error {
    background: rgba(250, 82, 82, 0.2);
  }
}

.message-content {
  padding: 12px 16px;
  min-width: 100px;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.step-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  background: var(--color-accent);
  color: white;
  border-radius: 10px;
}

.phase-label {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;

  &.thinking {
    background: rgba(251, 191, 36, 0.2);
    color: var(--color-warning);
  }

  &.reasoning {
    background: rgba(168, 85, 247, 0.2);
    color: #a855f7;
  }

  &.tool {
    background: rgba(34, 139, 230, 0.2);
    color: var(--color-accent);
  }

  &.question {
    background: rgba(251, 191, 36, 0.2);
    color: var(--color-warning);
  }

  &.sql {
    background: rgba(64, 192, 87, 0.2);
    color: var(--color-success);
  }

  &.result {
    background: rgba(64, 192, 87, 0.2);
    color: var(--color-success);
  }
}

.message-text {
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;

  &.typing-active {
    .cursor {
      animation: blink 1s step-end infinite;
      color: var(--color-accent);
    }
  }
}

@keyframes blink {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}

.typing-effect {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-light);
}

.typing-dots {
  display: flex;
  gap: 4px;

  span {
    width: 6px;
    height: 6px;
    background: var(--color-text-muted);
    border-radius: 50%;
    animation: typing-bounce 1.4s ease-in-out infinite;

    &:nth-child(2) {
      animation-delay: 0.2s;
    }

    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

@keyframes typing-bounce {

  0%,
  80%,
  100% {
    transform: scale(0.8);
    opacity: 0.5;
  }

  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.next-action-badge {
  margin-top: 8px;
  padding: 4px 10px;
  background: rgba(34, 139, 230, 0.1);
  border: 1px solid var(--color-accent);
  border-radius: 12px;
  font-size: 11px;
  color: var(--color-accent);
  display: inline-block;
}

.tool-params-inline {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--color-bg-tertiary);
  border-radius: 6px;

  code {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--color-accent);
    word-break: break-all;
  }
}

.tool-result-inline {
  margin-top: 8px;

  .result-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--color-text-muted);
    cursor: pointer;
    margin-bottom: 4px;

    svg {
      transition: transform 0.2s;

      &.rotated {
        transform: rotate(180deg);
      }
    }
  }

  pre {
    margin: 0;
    padding: 8px;
    background: var(--color-bg-tertiary);
    border-radius: 6px;
    max-height: 150px;
    overflow: auto;
  }

  code {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--color-success);
  }
}

.step-details {
  margin-top: 10px;
}

.step-details-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
  cursor: pointer;
  user-select: none;
}

.step-details-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meta-empty {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 8px 0;
}

.chat-message.live {
  max-width: 95%;
}

.live-content {
  width: 100%;
}

.repair-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(251, 191, 36, 0.2);
  color: var(--color-warning);
}

.live-sections {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.live-section {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 8px 10px;

  summary {
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    color: var(--color-text);
    display: flex;
    align-items: center;
    gap: 8px;
    user-select: none;
  }
}

.live-text {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.live-code {
  margin: 8px 0 0 0;
  padding: 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.12);
  overflow: auto;
  max-height: 220px;

  code {
    font-family: var(--font-mono);
    font-size: 12px;
    white-space: pre;
  }

  &.raw code {
    font-size: 10px;
  }
}

.live-kv {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kv-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.kv-key {
  font-size: 11px;
  color: var(--color-text-muted);
  min-width: 90px;
  font-family: var(--font-mono);
}

.kv-val {
  font-size: 12px;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;

  &.mono {
    font-family: var(--font-mono);
    font-size: 11px;
  }
}

.meta-counts {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.meta-groups {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.meta-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 12px;
  cursor: pointer;
}

.meta-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(34, 139, 230, 0.15);
  color: var(--color-accent);
  font-family: var(--font-mono);
}

.meta-items {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-item {
  padding: 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.12);
  border: 1px solid var(--color-border);
}

.meta-item-kv {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 10px;
  padding: 2px 0;
}

.meta-item-key {
  font-size: 10px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.meta-item-val {
  font-size: 12px;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.executing-indicator {
  .spinner-small {
    width: 12px;
    height: 12px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.completed-indicator {
  color: var(--color-success);
  font-size: 12px;
}

.question-content {
  border-color: var(--color-warning) !important;
  background: rgba(251, 191, 36, 0.05) !important;
}

.sql-content {
  .sql-code {
    margin: 0;
    padding: 12px;
    background: var(--color-bg-tertiary);
    border-radius: 8px;
    overflow-x: auto;

    code {
      font-size: 12px;
      font-family: var(--font-mono);
      color: var(--color-accent);
    }
  }
}

.result-content {
  min-width: 300px;

  .result-meta {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-left: auto;
  }
}

.error-content {
  .message-text {
    color: var(--color-error);
  }
}

.copy-btn {
  padding: 4px;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: 4px;

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }
}

/* 입력 영역 */
.chat-input-area {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(34, 139, 230, 0.1);
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--color-accent);

  .status-dot {
    width: 8px;
    height: 8px;
    background: var(--color-accent);
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .cancel-btn {
    margin-left: auto;
    padding: 4px 12px;
    background: transparent;
    border: 1px solid var(--color-accent);
    border-radius: 4px;
    color: var(--color-accent);
    font-size: 12px;
    cursor: pointer;

    &:hover {
      background: var(--color-accent);
      color: white;
    }
  }
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

.input-wrapper {
  display: flex;
  gap: 8px;
  align-items: flex-end;

  textarea {
    flex: 1;
    padding: 12px 16px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 24px;
    color: var(--color-text);
    font-size: 14px;
    font-family: var(--font-main);
    resize: none;
    min-height: 44px;
    max-height: 120px;

    &::placeholder {
      color: var(--color-text-muted);
    }

    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .send-btn {
    width: 44px;
    height: 44px;
    background: var(--color-accent);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;

    &:hover:not(:disabled) {
      background: var(--color-accent-hover);
      transform: scale(1.05);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.settings-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 6px 12px;
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  svg.rotated {
    transform: rotate(180deg);
  }
}

.settings-panel {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  padding: 12px;
  background: var(--color-bg);
  border-radius: 8px;

  .setting-row {
    display: flex;
    align-items: center;
    gap: 8px;

    label {
      font-size: 12px;
      color: var(--color-text-light);
    }

    input {
      width: 70px;
      padding: 6px 10px;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: 4px;
      color: var(--color-text);
      font-size: 12px;

      &:focus {
        outline: none;
        border-color: var(--color-accent);
      }
    }
  }
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}

/* SQL 사이드 패널 */
.sql-side-panel {
  width: 320px;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border);

    h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text);
    }
  }

  .sql-preview {
    flex: 1;
    padding: 16px;
    overflow: auto;

    pre {
      margin: 0;
      padding: 12px;
      background: var(--color-bg-tertiary);
      border-radius: 8px;
      overflow-x: auto;
    }

    code {
      font-size: 12px;
      font-family: var(--font-mono);
      color: var(--color-accent);
      line-height: 1.5;
    }
  }

  .sql-placeholder {
    color: var(--color-text-muted);
    font-size: 13px;
    text-align: center;
    padding: 40px 20px;
  }

  .completeness-bar {
    padding: 12px 16px;
    border-top: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-text-light);

    .level {
      padding: 2px 8px;
      border-radius: 4px;
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
}

/* 메시지 애니메이션 */
.message-anim-enter-active {
  animation: message-in 0.3s ease-out;
}

.message-anim-leave-active {
  animation: message-out 0.2s ease-in;
}

@keyframes message-out {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

/* 반응형 */
@media (max-width: 1024px) {
  .sql-side-panel {
    display: none;
  }
}
</style>
