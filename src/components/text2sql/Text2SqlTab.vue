<template>
  <div class="text2sql-tab">
    <!-- 히스토리 패널 -->
    <HistoryPanel 
      :is-open="historyOpen" 
      @toggle="historyOpen = !historyOpen"
      @select="handleHistorySelect"
    />

    <!-- Direct SQL 모드 -->
    <DirectSqlInput v-if="mode === 'direct'" class="direct-sql-full" @change-mode="(m) => mode = m" />

    <!-- 채팅 컨테이너 (자연어/LangChain 모드) -->
    <div v-else class="chat-container">
      <!-- 우상단 모드 선택기 -->
      <div class="mode-selector-container">
        <button 
          v-for="opt in modeOptions" 
          :key="opt.value"
          :class="['mode-option', { active: mode === opt.value }]"
          @click="mode = opt.value"
          :title="opt.desc"
        >
          <span class="opt-icon">{{ opt.icon }}</span>
          <span class="opt-label">{{ opt.label }}</span>
        </button>
      </div>
      <!-- 채팅 메시지 영역 -->
      <div class="chat-messages" ref="chatContainer" @scroll="handleScroll">
        <!-- 초기 안내 메시지 -->
        <div v-if="chatMessages.length === 0 && !reactStore.isRunning" class="welcome-message">
          <h1 class="gradient-title">자연어로 데이터를 분석하세요</h1>
          <p class="subtitle">질문을 입력하면 AI가 최적의 SQL 쿼리를 생성합니다</p>
          <div class="examples">
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
                      <details v-if="(getLiveForStep(msg.step)?.sections?.exploring ?? '').trim().length > 0"
                        :open="!!getLiveForStep(msg.step)?.exploringOpen" class="live-section"
                        @toggle="(e) => toggleExploringOpen(msg.step as number, e)">
                        <summary>탐색(Exploring)</summary>
                        <div class="live-text">{{ getLiveForStep(msg.step)?.sections?.exploring }}</div>
                      </details>
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
                  
                  <!-- OLAP 내보내기 버튼 (복잡한 쿼리일 때) -->
                  <button 
                    v-if="getResultSql(msg) && isComplexQuery(getResultSql(msg))"
                    class="olap-export-btn"
                    @click="exportToOlapFromMsg(msg)"
                    title="OLAP으로 내보내기 - DW 스키마 설계"
                  >
                    <IconBarChart :size="14" />
                    <span>OLAP 큐브 설계</span>
                  </button>
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
              <details v-if="liveExploring.trim().length > 0" :open="!!liveCurrent?.exploringOpen" class="live-section"
                @toggle="(e) => toggleExploringOpen(reactStore.currentIteration, e)">
                <summary>탐색(Exploring)</summary>
                <div class="live-text">
                  <span>{{ liveExploring }}</span><span class="cursor"
                    v-if="reactStore.currentPhase === 'thinking'">▌</span>
                </div>
              </details>
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
        <div v-if="isAnyRunning && !reactStore.isWaitingUser" class="status-bar">
          <span class="status-dot running"></span>
          <span>{{ mode === 'langchain' ? '⚡ 빠른 검색 중...' : '🧠 AI가 분석 중...' }}</span>
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
        <button v-if="displaySql" class="copy-btn" @click="copySql(displaySql)">
          <IconCopy :size="14" />
        </button>
      </div>
      <div class="sql-preview">
        <TransitionGroup
          v-if="sqlDisplayLines.length"
          name="sql-line"
          tag="pre"
          class="sql-diff"
        >
          <code
            v-for="line in sqlDisplayLines"
            :key="line.id"
            :class="['sql-line', line.status]"
          >{{ line.content }}</code>
        </TransitionGroup>

        <!-- fallback: diff 라인 생성 전/타이머 중 안전장치 -->
        <pre v-else-if="displaySql"><code>{{ displaySql }}</code></pre>

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
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useReactStore, useHistoryStore, type QueryHistoryItem } from '@/stores/text2sql'
import { useSessionStore } from '@/stores/session'
import ResultTable from './ResultTable.vue'
import TypeWriter from './TypeWriter.vue'
import HistoryPanel from './HistoryPanel.vue'
import DirectSqlInput from './DirectSqlInput.vue'
import { useLangChainStore } from '@/stores/langchain'
import type { ReactExecutionResult } from '@/types'
import { buildSqlLineDiff, type PreviousSqlLine, type SqlDiffLine } from '@/utils/sqlLineDiff'
import {
  IconPlay, IconUpload, IconSettings, IconChevronDown,
  IconCopy, IconBarChart
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
  sql?: string  // 결과에 연결된 SQL (히스토리 선택 시 사용)
  question?: string  // 원본 질문 (OLAP 내보내기 시 사용)
}

const reactStore = useReactStore()
const historyStore = useHistoryStore()
const sessionStore = useSessionStore()
const langchainStore = useLangChainStore()

// 모드: 'react' | 'langchain' | 'direct'
type QueryMode = 'react' | 'langchain' | 'direct'
const mode = ref<QueryMode>('react')

const modeOptions: { value: QueryMode; label: string; icon: string; desc: string }[] = [
  { value: 'react', label: '자연어 검색', icon: '🧠', desc: '정밀한 AI 분석' },
  { value: 'langchain', label: '빠른 검색', icon: '⚡', desc: '빠른 단순 검색' },
  { value: 'direct', label: 'SQL', icon: '📝', desc: '직접 입력' },
]

// 복잡한 쿼리 판별 (1개 이상 JOIN, 서브쿼리 등)
function isComplexQuery(sql: string | null): boolean {
  if (!sql) return false
  const upperSql = sql.toUpperCase()
  
  const joinCount = (upperSql.match(/\bJOIN\b/g) || []).length
  
  return (
    joinCount >= 1 ||  // 1개 이상 JOIN
    (upperSql.match(/SELECT/g) || []).length > 1 || // 서브쿼리
    upperSql.includes('GROUP BY') ||  // 집계 쿼리
    upperSql.includes('HAVING') ||
    upperSql.includes('UNION') ||
    upperSql.includes('WITH ')  // CTE
  )
}

// OLAP으로 내보내기
function exportToOlap() {
  if (!reactStore.finalSql) return
  sessionStore.navigateToOlapWithSQL(reactStore.currentQuestion, reactStore.finalSql)
}

// 메시지에서 SQL 가져오기 (store 또는 msg.sql)
function getResultSql(msg: ChatMessage): string | null {
  return msg.sql || reactStore.finalSql || null
}

// 메시지에서 OLAP으로 내보내기
function exportToOlapFromMsg(msg: ChatMessage) {
  const sql = getResultSql(msg)
  const question = msg.question || reactStore.currentQuestion
  
  console.log('[OLAP Export from Result] msg:', msg)
  console.log('[OLAP Export from Result] sql:', sql)
  console.log('[OLAP Export from Result] question:', question)
  
  if (!sql) {
    alert('SQL 쿼리가 없습니다.')
    return
  }
  sessionStore.navigateToOlapWithSQL(question, sql)
}

// Refs
const historyOpen = ref(true)
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
const isAnyRunning = computed(() => reactStore.isRunning || langchainStore.isRunning)
const canSubmit = computed(() =>
  inputText.value.trim() && (!isAnyRunning.value || reactStore.isWaitingUser)
)

const inputPlaceholder = computed(() =>
  reactStore.isWaitingUser
    ? '답변을 입력하세요...'
    : '질문을 입력하세요... (Enter로 전송)'
)

// 스텝 단위 diff를 위해 latestStep.partial_sql만 사용하고,
// finalSql 도착 시에도 동일한 패널에서 마지막 diff 애니메이션을 보여준다.
const displaySql = computed(() =>
  reactStore.finalSql || reactStore.latestStep?.partial_sql || ''
)

const latestCompleteness = computed(() =>
  reactStore.latestStep?.sql_completeness ?? null
)

// ============================================================================
// Current SQL diff (right panel only)
// ============================================================================

const sqlDisplayLines = ref<SqlDiffLine[]>([])
const previousSqlLines = ref<PreviousSqlLine[]>([])
const diffTimers = ref<number[]>([])

function clearDiffTimers() {
  diffTimers.value.forEach(t => window.clearTimeout(t))
  diffTimers.value = []
}

watch(
  () => displaySql.value,
  (newSql) => {
    clearDiffTimers()

    if (!newSql) {
      sqlDisplayLines.value = []
      previousSqlLines.value = []
      return
    }

    const { displayLines, nextPrevious } = buildSqlLineDiff(previousSqlLines.value, newSql, {
      modifiedSimilarityThreshold: 0.62,
      modifiedLookahead: 3
    })

    sqlDisplayLines.value = displayLines
    previousSqlLines.value = nextPrevious

    // 삭제 라인을 원래 위치에서 잠깐 보여준 후 제거
    diffTimers.value.push(window.setTimeout(() => {
      sqlDisplayLines.value = sqlDisplayLines.value.filter(l => l.status !== 'removed')
    }, 1000))

    // added/modified 하이라이트를 잠시 후 해제
    diffTimers.value.push(window.setTimeout(() => {
      sqlDisplayLines.value = sqlDisplayLines.value.map(l => ({
        ...l,
        status: l.status === 'added' || l.status === 'modified' ? 'unchanged' : l.status
      }))
    }, 2500))
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearDiffTimers()
})

const liveCurrent = computed(() => reactStore.liveByIteration[reactStore.currentIteration] ?? null)
const liveExploring = computed(() => liveCurrent.value?.sections?.exploring ?? '')
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

// 사용자가 스크롤을 위로 올렸는지 추적
const isUserScrolledUp = ref(false)

function handleScroll() {
  if (!chatContainer.value) return
  const { scrollTop, scrollHeight, clientHeight } = chatContainer.value
  // 바닥에서 50px 이내면 바닥으로 간주
  isUserScrolledUp.value = scrollHeight - scrollTop - clientHeight > 50
}

function scrollToBottom(force = false) {
  // 사용자가 위로 스크롤한 경우 자동 스크롤 안함 (force가 아닌 경우)
  if (isUserScrolledUp.value && !force) return
  
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

function toggleExploringOpen(iteration: number, e: Event) {
  const el = e.target as HTMLDetailsElement
  reactStore.setExploringOpen(iteration, !!el.open)
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
    // 사용자 응답 (ReAct 모드)
    addMessage({ type: 'user', content: text })
    await reactStore.continueWithResponse(text)
  } else if (mode.value === 'langchain') {
    // LangChain 빠른 검색 모드
    chatMessages.value = []
    addMessage({ type: 'user', content: text })
    await langchainStore.start(text, {
      maxIterations: maxToolCalls.value,
      maxSqlSeconds: maxSqlSeconds.value,
    })
  } else {
    // ReAct 자연어 검색 모드
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
  if (mode.value === 'langchain') {
    langchainStore.cancel()
  } else {
    reactStore.cancel()
  }
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

// Watch for completion (ReAct)
watch(() => reactStore.status, (status) => {
  if (mode.value !== 'react') return
  
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
        data: reactStore.executionResult,
        sql: reactStore.finalSql || undefined,
        question: reactStore.currentQuestion
      })
    }
  } else if (status === 'error' && reactStore.error) {
    addMessage({
      type: 'error',
      content: reactStore.error
    })
  }
})

// Watch for completion (LangChain)
watch(() => langchainStore.status, (status) => {
  if (mode.value !== 'langchain') return
  
  if (status === 'completed' && langchainStore.finalOutput) {
    addMessage({
      type: 'sql',
      content: langchainStore.finalOutput
    })
  } else if (status === 'error' && langchainStore.error) {
    addMessage({
      type: 'error',
      content: langchainStore.error
    })
  }
})

// Watch for LangChain phase changes
watch(() => langchainStore.currentPhase, (phase) => {
  if (mode.value !== 'langchain') return
  
  const currentStep = langchainStore.currentStep
  
  if (phase === 'thinking') {
    addMessage({
      type: 'thinking',
      content: 'AI가 분석 중입니다...',
      step: currentStep,
    })
  } else if (phase === 'acting' && langchainStore.currentTool) {
    addMessage({
      type: 'tool',
      content: '',
      step: currentStep,
      toolName: langchainStore.currentTool,
      params: langchainStore.currentToolInput || undefined,
      isExecuting: true
    })
  }
})

// Watch for LangChain tool results
watch(() => langchainStore.currentToolResult, (result) => {
  if (mode.value !== 'langchain' || !result) return
  
  const step = langchainStore.currentStep
  const toolMsg = [...chatMessages.value].reverse().find(
    m => m.type === 'tool' && m.step === step
  )
  if (toolMsg) {
    updateMessage(toolMsg.id, {
      result: result,
      isExecuting: false
    })
  }
})

// 히스토리 항목 선택 핸들러
function handleHistorySelect(item: QueryHistoryItem) {
  // 선택한 히스토리의 질문과 결과를 표시
  chatMessages.value = []
  
  // 사용자 질문 추가
  addMessage({ type: 'user', content: item.question })
  
  // SQL이 있으면 표시
  if (item.final_sql) {
    addMessage({ type: 'sql', content: item.final_sql })
  }
  
  // 실행 결과가 있으면 표시
  if (item.execution_result) {
    addMessage({
      type: 'result',
      content: '',
      rowCount: item.execution_result.row_count,
      execTime: Math.round(item.execution_result.execution_time_ms),
      data: item.execution_result,
      sql: item.final_sql || undefined,  // OLAP 버튼용 SQL
      question: item.question  // OLAP 버튼용 질문
    })
  }
  
  // 에러가 있으면 표시
  if (item.status === 'error' && item.error_message) {
    addMessage({ type: 'error', content: item.error_message })
  }
}

// 쿼리 완료 시 히스토리 자동 저장
let saveStartTime = 0

watch(() => reactStore.status, async (status, oldStatus) => {
  // running 시작 시 시간 기록
  if (status === 'running' && oldStatus !== 'running') {
    saveStartTime = Date.now()
  }
  
  // 완료 또는 에러 시 저장
  if (status === 'completed' || status === 'error') {
    const executionTimeMs = Date.now() - saveStartTime
    
    await historyStore.saveToHistory({
      question: reactStore.currentQuestion,
      final_sql: reactStore.finalSql,
      validated_sql: reactStore.validatedSql,
      execution_result: reactStore.executionResult,
      row_count: reactStore.executionResult?.row_count ?? null,
      status: status === 'completed' ? 'completed' : 'error',
      error_message: reactStore.error,
      steps_count: reactStore.steps.length,
      execution_time_ms: executionTimeMs
    })
  }
})

onMounted(() => {
  inputRef.value?.focus()
  
  // 상단 검색창에서 전달된 자연어 질문 처리
  const pendingQuery = sessionStore.consumeNLSearch()
  if (pendingQuery) {
    inputText.value = pendingQuery
    // 약간의 딜레이 후 자동 검색 시작
    setTimeout(() => {
      handleSubmit()
    }, 100)
  }
})

// 탭 전환 시에도 pendingNLSearch 체크
watch(() => sessionStore.activeTab, (tab) => {
  if (tab === 'text2sql') {
    const pendingQuery = sessionStore.consumeNLSearch()
    if (pendingQuery) {
      inputText.value = pendingQuery
      setTimeout(() => {
        handleSubmit()
      }, 100)
    }
  }
})
</script>

<style scoped lang="scss">
// ═══════════════════════════════════════════════════════════════
// Design System Variables - Cohesive Theme (using CSS vars)
// ═══════════════════════════════════════════════════════════════
$primary-gradient: linear-gradient(135deg, #00d4aa 0%, #00a8cc 50%, #7c3aed 100%);
$accent-glow: rgba(0, 212, 170, 0.4);
$card-glass: var(--chat-card-bg, rgba(255, 255, 255, 0.03));
$card-glass-hover: var(--chat-card-hover, rgba(255, 255, 255, 0.06));
$border-subtle: var(--chat-border, rgba(255, 255, 255, 0.08));
$border-active: rgba(0, 212, 170, 0.3);
$text-primary: var(--color-text-bright, #f0f4f8);
$text-secondary: var(--color-text-light, #94a3b8);
$text-muted: var(--color-text-muted, #64748b);

// Unified Badge Colors
$badge-reasoning: #a78bfa;
$badge-tool: #38bdf8;
$badge-success: #34d399;
$badge-warning: #fbbf24;
$badge-error: #f87171;

.text2sql-tab {
  display: flex;
  height: 100%;
  background: var(--color-bg);
  overflow: hidden;
  font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  color: var(--color-text);
}

// Direct SQL 전체 화면
.direct-sql-full {
  flex: 1;
  display: flex;
  flex-direction: column;
}

// ═══════════════════════════════════════════════════════════════
// Mode Selector (우상단 세그먼트 버튼)
// ═══════════════════════════════════════════════════════════════
.mode-selector-container {
  position: absolute;
  top: 12px;
  right: 24px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--color-bg-secondary);
  backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: var(--shadow-md);
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 7px;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  
  .opt-icon {
    font-size: 12px;
  }
  
  .opt-label {
    font-size: 11px;
  }
  
  &:hover {
    background: var(--color-bg-hover);
    color: var(--color-text);
  }
  
  &.active {
    background: var(--color-accent);
    color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    
    .opt-icon {
      filter: drop-shadow(0 0 3px rgba(0, 212, 170, 0.5));
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Chat Container
// ═══════════════════════════════════════════════════════════════
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 400px;
    background: radial-gradient(ellipse, rgba(0, 212, 170, 0.08) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// Messages Area
// ═══════════════════════════════════════════════════════════════
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
  padding-top: 56px; // 모드 스위치 공간 확보
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  z-index: 1;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Welcome Message
// ═══════════════════════════════════════════════════════════════
@keyframes gradient-flow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.welcome-message {
  text-align: center;
  padding: 100px 32px 60px;
  animation: fadeInUp 0.6s ease-out;

  .gradient-title {
    margin: 0 0 16px 0;
    font-size: 36px;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.3;
    background: linear-gradient(
      90deg,
      #667eea 0%,
      #764ba2 15%,
      #f093fb 30%,
      #f5576c 45%,
      #fda085 60%,
      #f6d365 75%,
      #667eea 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: gradient-flow 4s ease infinite;
  }

  .subtitle {
    margin: 0 0 48px 0;
    font-size: 16px;
    color: var(--color-text-muted);
    font-weight: 400;
    letter-spacing: 0.01em;
  }

  .examples {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
    align-items: center;
  }

  .example-btn {
    padding: 10px 20px;
    background: var(--chat-card-bg);
    backdrop-filter: blur(12px);
    border: 1px solid var(--color-border);
    border-radius: 24px;
    color: var(--color-text);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: var(--shadow-sm);

    &:hover {
      background: var(--chat-card-hover);
      border-color: var(--color-accent);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// ═══════════════════════════════════════════════════════════════
// Chat Messages - Unified Card System
// ═══════════════════════════════════════════════════════════════
.chat-message {
  display: flex;
  gap: 14px;
  max-width: 88%;
  animation: messageSlide 0.35s cubic-bezier(0.4, 0, 0.2, 1);

  &.user {
    align-self: flex-end;
    flex-direction: row-reverse;

    .message-content {
      background: var(--chat-user-msg-bg);
      border: none;
      border-radius: 20px 20px 6px 20px;
      box-shadow: 0 4px 24px rgba(0, 212, 170, 0.25);
    }

    .message-text {
      color: var(--chat-user-msg-text);
      font-weight: 500;
    }
  }

  &.ai,
  &.thinking,
  &.reasoning,
  &.tool,
  &.tool,
  &.question,
  &.sql,
  &.result {
    align-self: flex-start;

    .message-content {
      background: var(--chat-msg-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--chat-msg-border);
      border-radius: 6px 20px 20px 20px;
      box-shadow: var(--chat-msg-shadow);
    }
  }

  &.error {
    align-self: flex-start;

    .message-content {
      background: rgba(248, 113, 113, 0.08);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(248, 113, 113, 0.3);
      border-radius: 6px 20px 20px 20px;
    }
  }

  &.live {
    max-width: 95%;

    .message-content {
      border-color: $border-active;
      box-shadow: 0 4px 32px rgba(0, 212, 170, 0.12);
    }
  }
}

@keyframes messageSlide {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

// ═══════════════════════════════════════════════════════════════
// Message Avatar
// ═══════════════════════════════════════════════════════════════
.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  transition: transform 0.2s ease;

  &.user {
    background: linear-gradient(135deg, #00d4aa 0%, #00a8cc 100%);
    box-shadow: 0 4px 16px rgba(0, 212, 170, 0.3);
  }

  &.ai {
    background: var(--chat-msg-bg);
    backdrop-filter: blur(8px);
    border: 1px solid var(--chat-msg-border);
    box-shadow: var(--chat-msg-shadow);
  }

  &.error {
    background: rgba(248, 113, 113, 0.15);
    border: 1px solid rgba(248, 113, 113, 0.3);
  }
}

// ═══════════════════════════════════════════════════════════════
// Message Content
// ═══════════════════════════════════════════════════════════════
.message-content {
  padding: 16px 20px;
  min-width: 120px;
}

.live-content {
  width: 100%;
}

.message-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

// ═══════════════════════════════════════════════════════════════
// Unified Badge System
// ═══════════════════════════════════════════════════════════════
.step-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 4px 10px;
  background: linear-gradient(135deg, rgba(0, 212, 170, 0.2) 0%, rgba(0, 168, 204, 0.2) 100%);
  color: #00d4aa;
  border-radius: 20px;
  border: 1px solid rgba(0, 212, 170, 0.3);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.phase-label {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 6px;
  letter-spacing: 0.02em;

  &.thinking {
    background: rgba($badge-warning, 0.12);
    color: $badge-warning;
    border: 1px solid rgba($badge-warning, 0.25);
  }

  &.reasoning {
    background: rgba($badge-reasoning, 0.12);
    color: $badge-reasoning;
    border: 1px solid rgba($badge-reasoning, 0.25);
  }

  &.tool {
    background: rgba($badge-tool, 0.12);
    color: $badge-tool;
    border: 1px solid rgba($badge-tool, 0.25);
  }

  &.question {
    background: rgba($badge-warning, 0.12);
    color: $badge-warning;
    border: 1px solid rgba($badge-warning, 0.25);
  }

  &.sql,
  &.result {
    background: rgba($badge-success, 0.12);
    color: $badge-success;
    border: 1px solid rgba($badge-success, 0.25);
  }
}

.repair-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba($badge-warning, 0.12);
  color: $badge-warning;
  border: 1px solid rgba($badge-warning, 0.25);
  animation: pulse-soft 2s ease-in-out infinite;
}

@keyframes pulse-soft {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.7;
  }
}

// ═══════════════════════════════════════════════════════════════
// Message Text
// ═══════════════════════════════════════════════════════════════
.message-text {
  font-size: 14px;
  line-height: 1.65;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
  letter-spacing: 0.01em;
}

.cursor {
  color: #00d4aa;
  animation: cursor-blink 1s step-end infinite;
  font-weight: 400;
}

@keyframes cursor-blink {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}

// ═══════════════════════════════════════════════════════════════
// Typing Animation
// ═══════════════════════════════════════════════════════════════
.typing-effect {
  display: flex;
  align-items: center;
  gap: 12px;
  color: $text-secondary;
}

.typing-dots {
  display: flex;
  gap: 5px;

  span {
    width: 7px;
    height: 7px;
    background: linear-gradient(135deg, #00d4aa, #00a8cc);
    border-radius: 50%;
    animation: typing-wave 1.4s ease-in-out infinite;

    &:nth-child(2) {
      animation-delay: 0.15s;
    }

    &:nth-child(3) {
      animation-delay: 0.3s;
    }
  }
}

@keyframes typing-wave {

  0%,
  80%,
  100% {
    transform: scale(0.8);
    opacity: 0.4;
  }

  40% {
    transform: scale(1.1);
    opacity: 1;
  }
}

// ═══════════════════════════════════════════════════════════════
// Tool & Result Cards (Unified Style)
// ═══════════════════════════════════════════════════════════════
.next-action-badge {
  margin-top: 12px;
  padding: 6px 14px;
  background: rgba($badge-tool, 0.08);
  border: 1px solid rgba($badge-tool, 0.25);
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  color: $badge-tool;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tool-params-inline {
  margin-top: 12px;
  padding: 12px 14px;
  background: var(--chat-tool-bg);
  border-radius: 10px;
  border: 1px solid var(--chat-tool-border);

  code {
    font-size: 12px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: var(--chat-badge-tool);
    word-break: break-all;
    line-height: 1.5;
  }
}

.tool-result-inline {
  margin-top: 12px;

  .result-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    color: $text-muted;
    cursor: pointer;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.05em;

    svg {
      transition: transform 0.25s ease;

      &.rotated {
        transform: rotate(180deg);
      }
    }

    &:hover {
      color: $text-secondary;
    }
  }

  pre {
    margin: 0;
    padding: 12px 14px;
    background: var(--chat-code-bg);
    border-radius: 10px;
    border: 1px solid var(--chat-tool-border);
    max-height: 180px;
    overflow: auto;

    &::-webkit-scrollbar {
      width: 4px;
      height: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
    }
  }

  code {
    font-size: 11px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: var(--chat-code-text);
    line-height: 1.5;
  }
}

// ═══════════════════════════════════════════════════════════════
// Step Details (Expandable Sections)
// ═══════════════════════════════════════════════════════════════
.step-details {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
}

.step-details-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
  cursor: pointer;
  user-select: none;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: color 0.2s ease;

  &:hover {
    color: $text-secondary;
  }

  svg {
    transition: transform 0.25s ease;

    &.rotated {
      transform: rotate(180deg);
    }
  }
}

.step-details-body {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meta-empty {
  font-size: 12px;
  color: $text-muted;
  padding: 12px 0;
  font-style: italic;
}

// ═══════════════════════════════════════════════════════════════
// Live Sections (Streaming Content)
// ═══════════════════════════════════════════════════════════════
.live-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.live-section {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid $border-subtle;
  border-radius: 12px;
  padding: 12px 14px;
  transition: border-color 0.2s ease;

  &[open] {
    border-color: rgba(0, 212, 170, 0.2);
  }

  summary {
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    color: $text-primary;
    display: flex;
    align-items: center;
    gap: 10px;
    user-select: none;
    letter-spacing: 0.02em;
    list-style: none;

    &::marker,
    &::-webkit-details-marker {
      display: none;
    }

    &::before {
      content: '▸';
      font-size: 10px;
      color: $text-muted;
      transition: transform 0.2s ease;
    }
  }

  &[open]>summary::before {
    transform: rotate(90deg);
  }
}

.live-text {
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.7;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
}

.live-code {
  margin: 12px 0 0 0;
  padding: 14px;
  border-radius: 10px;
  background: var(--chat-code-bg);
  border: 1px solid var(--chat-tool-border);
  overflow: auto;
  max-height: 240px;

  &::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }

  code {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: var(--chat-code-text);
    white-space: pre;
    line-height: 1.6;
  }

  &.raw code {
    font-size: 10px;
    color: var(--color-text-muted);
  }
}

.live-kv {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kv-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.kv-key {
  font-size: 11px;
  color: $text-muted;
  min-width: 100px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.kv-val {
  font-size: 13px;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
  flex: 1;

  &.mono {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: $badge-tool;
  }
}

// ═══════════════════════════════════════════════════════════════
// Metadata Section
// ═══════════════════════════════════════════════════════════════
.meta-counts {
  margin-left: auto;
  font-size: 10px;
  color: $text-muted;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  letter-spacing: 0.02em;
}

.meta-groups {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meta-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid $border-subtle;
  color: $text-primary;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: var(--chat-code-bg);
    border-color: $border-active;
  }
}

.meta-badge {
  font-size: 10px;
  padding: 3px 10px;
  border-radius: 20px;
  background: rgba(0, 212, 170, 0.12);
  color: #00d4aa;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-weight: 600;
}

.meta-items {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-item {
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid $border-subtle;
}

.meta-item-kv {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 12px;
  padding: 4px 0;
}

.meta-item-key {
  font-size: 10px;
  color: $text-muted;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.meta-item-val {
  font-size: 12px;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
}

// ═══════════════════════════════════════════════════════════════
// Status Indicators
// ═══════════════════════════════════════════════════════════════
.executing-indicator {
  .spinner-small {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(0, 212, 170, 0.2);
    border-top-color: #00d4aa;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.completed-indicator {
  color: $badge-success;
  font-size: 14px;
}

// ═══════════════════════════════════════════════════════════════
// Special Content Types
// ═══════════════════════════════════════════════════════════════
.question-content {
  border-color: rgba($badge-warning, 0.3) !important;
  background: rgba($badge-warning, 0.05) !important;
}

.sql-content {
  .sql-code {
    margin: 0;
    padding: 16px;
    background: var(--chat-code-bg);
    border-radius: 12px;
    border: 1px solid var(--chat-tool-border);
    overflow-x: auto;

    code {
      font-size: 13px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: var(--chat-code-text);
      line-height: 1.6;
    }
  }
}

.result-content {
  min-width: 320px;

  .result-meta {
    font-size: 11px;
    color: $text-muted;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }
}

// OLAP 내보내기 버튼
.olap-export-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 8px 14px;
  background: linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(124, 58, 237, 0.15) 100%);
  border: 1px solid rgba(34, 139, 230, 0.3);
  border-radius: 8px;
  color: #38bdf8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  animation: pulse-glow 2s ease-in-out infinite;

  &:hover {
    background: linear-gradient(135deg, rgba(34, 139, 230, 0.25) 0%, rgba(124, 58, 237, 0.25) 100%);
    border-color: rgba(34, 139, 230, 0.5);
    box-shadow: 0 4px 16px rgba(34, 139, 230, 0.25);
    transform: translateY(-1px);
  }

  svg {
    color: #38bdf8;
  }
}

@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(34, 139, 230, 0);
  }
  50% {
    box-shadow: 0 0 12px 2px rgba(34, 139, 230, 0.2);
  }
}

.error-content {
  .message-text {
    color: $badge-error;
  }
}

// ═══════════════════════════════════════════════════════════════
// Copy Button
// ═══════════════════════════════════════════════════════════════
.copy-btn {
  padding: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid $border-subtle;
  color: $text-muted;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(0, 212, 170, 0.1);
    border-color: $border-active;
    color: #00d4aa;
  }
}

// ═══════════════════════════════════════════════════════════════
// Input Area
// ═══════════════════════════════════════════════════════════════
.chat-input-area {
  padding: 20px 32px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  backdrop-filter: blur(20px);
  position: relative;
  z-index: 10;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(0, 212, 170, 0.08);
  border: 1px solid rgba(0, 212, 170, 0.2);
  border-radius: 12px;
  margin-bottom: 16px;
  font-size: 13px;
  font-weight: 500;
  color: #00d4aa;

  .status-dot {
    width: 10px;
    height: 10px;
    background: #00d4aa;
    border-radius: 50%;
    animation: status-pulse 1.5s ease-in-out infinite;
    box-shadow: 0 0 12px rgba(0, 212, 170, 0.5);
  }

  .cancel-btn {
    margin-left: auto;
    padding: 6px 16px;
    background: transparent;
    border: 1px solid rgba(0, 212, 170, 0.4);
    border-radius: 8px;
    color: #00d4aa;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(0, 212, 170, 0.15);
      border-color: #00d4aa;
    }
  }
}

@keyframes status-pulse {

  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.6;
    transform: scale(0.9);
  }
}

.input-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-end;

  textarea {
    flex: 1;
    padding: 14px 20px;
    background: var(--chat-input-bg);
    border: 1px solid var(--color-border);
    border-radius: 28px;
    color: var(--color-text);
    font-size: 14px;
    font-family: inherit;
    resize: none;
    min-height: 48px;
    max-height: 140px;
    transition: all 0.25s ease;
    line-height: 1.5;
    box-shadow: var(--shadow-sm);

    &::placeholder {
      color: var(--color-text-muted);
    }

    &:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .send-btn {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #00d4aa 0%, #00a8cc 100%);
    border: none;
    border-radius: 50%;
    color: #0a1628;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 20px rgba(0, 212, 170, 0.3);

    &:hover:not(:disabled) {
      transform: scale(1.08);
      box-shadow: 0 6px 28px rgba(0, 212, 170, 0.4);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      box-shadow: none;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Settings Panel
// ═══════════════════════════════════════════════════════════════
.settings-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 8px 14px;
  color: $text-muted;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: $text-secondary;
  }

  svg {
    transition: transform 0.25s ease;

    &.rotated {
      transform: rotate(180deg);
    }
  }
}

.settings-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-top: 14px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid $border-subtle;
  border-radius: 14px;

  .setting-row {
    display: flex;
    align-items: center;
    gap: 10px;

    label {
      font-size: 12px;
      font-weight: 500;
      color: $text-secondary;
    }

    input[type="number"] {
      width: 80px;
      padding: 8px 12px;
      background: var(--chat-code-bg);
      border: 1px solid $border-subtle;
      border-radius: 8px;
      color: $text-primary;
      font-size: 12px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      transition: border-color 0.2s ease;

      &:focus {
        outline: none;
        border-color: rgba(0, 212, 170, 0.5);
      }
    }

    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: #00d4aa;
      cursor: pointer;
    }
  }
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

// ═══════════════════════════════════════════════════════════════
// SQL Side Panel
// ═══════════════════════════════════════════════════════════════
.sql-side-panel {
  width: 340px;
  border-left: 1px solid $border-subtle;
  background: linear-gradient(180deg, rgba(15, 20, 25, 0.95) 0%, rgba(26, 31, 46, 0.95) 100%);
  backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid $border-subtle;

    h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: $text-primary;
      letter-spacing: 0.02em;
    }
  }

  .sql-preview {
    flex: 1;
    padding: 20px;
    overflow: auto;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
    }

    pre {
      margin: 0;
      padding: 16px;
      background: var(--chat-code-bg);
      border: 1px solid $border-subtle;
      border-radius: 12px;
      overflow-x: auto;
      white-space: pre-wrap;
    }

    // diff view
    .sql-diff {
      margin: 0;
      padding: 16px;
      background: var(--chat-code-bg);
      border: 1px solid $border-subtle;
      border-radius: 12px;
      overflow-x: auto;
      white-space: pre-wrap;
    }

    .sql-line {
      display: block;
      padding: 2px 8px;
      margin: 2px 0;
      border-radius: 6px;
      transition: all 0.25s ease;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      line-height: 1.6;
      color: $badge-tool;
    }

    .sql-line.added {
      background: rgba($badge-success, 0.14);
      border-left: 3px solid $badge-success;
    }

    .sql-line.removed {
      background: rgba($badge-error, 0.14);
      border-left: 3px solid $badge-error;
      text-decoration: line-through;
      opacity: 0.75;
    }

    .sql-line.modified {
      background: rgba($badge-warning, 0.14);
      border-left: 3px solid $badge-warning;
    }

    // TransitionGroup name="sql-line"
    .sql-line-enter-active,
    .sql-line-leave-active,
    .sql-line-move {
      transition: all 0.25s ease;
    }

    .sql-line-enter-from {
      opacity: 0;
      transform: translateX(-8px);
    }

    .sql-line-leave-to {
      opacity: 0;
      transform: translateX(8px);
    }

    code {
      font-size: 12px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: $badge-tool;
      line-height: 1.6;
    }
  }

  .sql-placeholder {
    color: $text-muted;
    font-size: 13px;
    text-align: center;
    padding: 48px 24px;
    font-style: italic;
  }

  .completeness-bar {
    padding: 14px 20px;
    border-top: 1px solid $border-subtle;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    font-weight: 500;
    color: $text-secondary;

    .level {
      padding: 4px 12px;
      border-radius: 6px;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.03em;

      &.high {
        background: rgba($badge-success, 0.12);
        color: $badge-success;
        border: 1px solid rgba($badge-success, 0.3);
      }

      &.medium {
        background: rgba($badge-warning, 0.12);
        color: $badge-warning;
        border: 1px solid rgba($badge-warning, 0.3);
      }

      &.low {
        background: rgba($badge-error, 0.12);
        color: $badge-error;
        border: 1px solid rgba($badge-error, 0.3);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Message Animations
// ═══════════════════════════════════════════════════════════════
.message-anim-enter-active {
  animation: messageSlide 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.message-anim-leave-active {
  animation: messageFade 0.2s ease-out forwards;
}

@keyframes messageFade {
  from {
    opacity: 1;
    transform: scale(1);
  }

  to {
    opacity: 0;
    transform: scale(0.98);
  }
}

// ═══════════════════════════════════════════════════════════════
// Responsive
// ═══════════════════════════════════════════════════════════════
@media (max-width: 1024px) {
  .sql-side-panel {
    display: none;
  }

  .chat-messages {
    padding: 20px;
  }

  .chat-input-area {
    padding: 16px 20px;
  }

  .chat-message {
    max-width: 95%;
  }
}
</style>
