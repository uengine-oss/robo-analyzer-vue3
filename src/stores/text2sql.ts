/**
 * text2sql.ts
 * Text2SQL (ReAct) 상태 관리 스토어
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { text2sqlApi } from '@/services/api'
import type {
  ReactStatus,
  ReactStepModel,
  ReactExecutionResult,
  ReactResponseModel,
  ReactRequest,
  Text2SqlTableInfo,
  Text2SqlColumnInfo
} from '@/types'

// ============================================================================
// 헬퍼 함수
// ============================================================================

function sortSteps(steps: ReactStepModel[]): ReactStepModel[] {
  return [...steps].sort((a, b) => a.iteration - b.iteration)
}

function mergeSteps(existing: ReactStepModel[], incoming: ReactStepModel[]): ReactStepModel[] {
  const byIteration = new Map<number, ReactStepModel>()
  for (const step of existing) {
    byIteration.set(step.iteration, step)
  }
  for (const step of incoming) {
    byIteration.set(step.iteration, step)
  }
  return sortSteps(Array.from(byIteration.values()))
}

// ============================================================================
// ReAct 스토어
// ============================================================================

export const useReactStore = defineStore('react', () => {
  // 상태
  const currentQuestion = ref('')
  const status = ref<ReactStatus>('idle')
  const steps = ref<ReactStepModel[]>([])
  const partialSql = ref<string>('')
  const finalSql = ref<string | null>(null)
  const validatedSql = ref<string | null>(null)
  const executionResult = ref<ReactExecutionResult | null>(null)
  const collectedMetadata = ref<string>('')
  const warnings = ref<string[]>([])
  const error = ref<string | null>(null)
  const sessionState = ref<string | null>(null)
  const questionToUser = ref<string | null>(null)
  const remainingToolCalls = ref<number>(0)
  const abortController = ref<AbortController | null>(null)

  // Computed
  const isRunning = computed(() => status.value === 'running')
  const isWaitingUser = computed(() => status.value === 'needs_user_input')
  const hasSteps = computed(() => steps.value.length > 0)
  const hasExecutionResult = computed(() => executionResult.value !== null)
  const latestStep = computed(() =>
    steps.value.length > 0 ? steps.value[steps.value.length - 1] : null
  )
  const latestPartialSql = computed(() => latestStep.value?.partial_sql || partialSql.value)

  // 내부 함수
  function resetState() {
    steps.value = []
    partialSql.value = ''
    finalSql.value = null
    validatedSql.value = null
    executionResult.value = null
    collectedMetadata.value = ''
    warnings.value = []
    error.value = null
    sessionState.value = null
    questionToUser.value = null
    remainingToolCalls.value = 0
  }

  function cancelOngoing() {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
    }
  }

  function applyStateSnapshot(snapshot?: Record<string, unknown>) {
    if (!snapshot) return
    if (typeof snapshot.remaining_tool_calls === 'number') {
      remainingToolCalls.value = snapshot.remaining_tool_calls
    }
    if (typeof snapshot.partial_sql === 'string') {
      partialSql.value = snapshot.partial_sql
    }
  }

  function upsertStep(step: ReactStepModel) {
    steps.value = mergeSteps(steps.value, [step])
  }

  function applyResponse(response: ReactResponseModel) {
    steps.value = mergeSteps(steps.value, response.steps)
    collectedMetadata.value = response.collected_metadata
    partialSql.value = response.partial_sql
    remainingToolCalls.value = response.remaining_tool_calls
    sessionState.value = response.session_state ?? null
    questionToUser.value = response.question_to_user ?? null
    warnings.value = response.warnings ?? []
    if (response.final_sql !== undefined) {
      finalSql.value = response.final_sql ?? null
    }
    if (response.validated_sql !== undefined) {
      validatedSql.value = response.validated_sql ?? null
    }
    executionResult.value = response.execution_result ?? null
  }

  async function consumeStream(request: ReactRequest, controller: AbortController) {
    try {
      for await (const event of text2sqlApi.reactStream(request, { signal: controller.signal })) {
        switch (event.event) {
          case 'step': {
            upsertStep(event.step)
            applyStateSnapshot(event.state)
            break
          }
          case 'needs_user_input': {
            applyResponse(event.response)
            status.value = 'needs_user_input'
            return
          }
          case 'completed': {
            applyResponse(event.response)
            status.value = 'completed'
            return
          }
          case 'error': {
            error.value = event.message
            status.value = 'error'
            return
          }
          default:
            break
        }
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        return
      }
      console.error('ReAct 스트리밍 중 오류', err)
      error.value = err instanceof Error ? err.message : 'ReAct 실행 중 오류가 발생했습니다.'
      status.value = 'error'
    }
  }

  // 공개 함수
  async function start(
    question: string,
    options?: {
      maxToolCalls?: number
      maxSqlSeconds?: number
    }
  ) {
    cancelOngoing()
    resetState()
    currentQuestion.value = question
    status.value = 'running'
    error.value = null

    const controller = new AbortController()
    abortController.value = controller
    await consumeStream(
      {
        question,
        max_tool_calls: options?.maxToolCalls,
        max_sql_seconds: options?.maxSqlSeconds
      },
      controller
    )
    if (abortController.value === controller) {
      abortController.value = null
    }
  }

  async function continueWithResponse(userResponse: string) {
    if (!sessionState.value) {
      throw new Error('세션 상태가 없습니다.')
    }
    cancelOngoing()
    status.value = 'running'
    error.value = null
    questionToUser.value = null

    const controller = new AbortController()
    abortController.value = controller
    await consumeStream(
      {
        question: currentQuestion.value,
        session_state: sessionState.value,
        user_response: userResponse
      },
      controller
    )
    if (abortController.value === controller) {
      abortController.value = null
    }
  }

  function cancel() {
    cancelOngoing()
    status.value = 'idle'
  }

  function clear() {
    cancelOngoing()
    resetState()
    currentQuestion.value = ''
    status.value = 'idle'
  }

  return {
    currentQuestion,
    status,
    steps,
    partialSql,
    finalSql,
    validatedSql,
    executionResult,
    collectedMetadata,
    warnings,
    error,
    sessionState,
    questionToUser,
    remainingToolCalls,
    isRunning,
    isWaitingUser,
    hasSteps,
    hasExecutionResult,
    latestStep,
    latestPartialSql,
    start,
    continueWithResponse,
    cancel,
    clear
  }
})

// ============================================================================
// Schema 스토어
// ============================================================================

export const useText2SqlSchemaStore = defineStore('text2sql-schema', () => {
  // 상태
  const tables = ref<Text2SqlTableInfo[]>([])
  const selectedTable = ref<Text2SqlTableInfo | null>(null)
  const selectedTableColumns = ref<Text2SqlColumnInfo[]>([])
  const allColumnsMap = ref<Record<string, Text2SqlColumnInfo[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 테이블 목록 로드
  async function loadTables(search?: string, schema?: string) {
    loading.value = true
    error.value = null

    try {
      tables.value = await text2sqlApi.getTables(search, schema)
    } catch (err: unknown) {
      // 에러 상태만 저장하고 다시 throw하지 않음 (조용히 처리)
      error.value = err instanceof Error ? err.message : 'Failed to load tables'
      // 빈 배열로 초기화하여 UI가 깨지지 않도록 함
      tables.value = []
    } finally {
      loading.value = false
    }
  }

  // 테이블 컬럼 로드
  async function loadTableColumns(tableName: string, schema: string = 'public') {
    loading.value = true
    error.value = null

    try {
      selectedTableColumns.value = await text2sqlApi.getTableColumns(tableName, schema)
      allColumnsMap.value[tableName] = selectedTableColumns.value
      return selectedTableColumns.value
    } catch (err: unknown) {
      error.value = err instanceof Error ? err.message : 'Failed to load columns'
      throw err
    } finally {
      loading.value = false
    }
  }

  // 모든 테이블의 컬럼 로드 (ERD용)
  async function loadAllColumns() {
    for (const table of tables.value) {
      try {
        const columns = await text2sqlApi.getTableColumns(table.name, table.schema)
        allColumnsMap.value[table.name] = columns
      } catch (err) {
        console.error(`Failed to load columns for ${table.name}:`, err)
      }
    }
  }

  // 테이블 선택
  function selectTable(table: Text2SqlTableInfo) {
    selectedTable.value = table
    loadTableColumns(table.name, table.schema)
  }

  // 테이블 컬럼 가져오기 (캐시된)
  function getTableColumns(tableName: string): Text2SqlColumnInfo[] {
    return allColumnsMap.value[tableName] || []
  }

  return {
    tables,
    selectedTable,
    selectedTableColumns,
    allColumnsMap,
    loading,
    error,
    loadTables,
    loadTableColumns,
    loadAllColumns,
    selectTable,
    getTableColumns
  }
})

