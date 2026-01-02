/**
 * api.ts
 * API 서비스 모듈
 * 
 * 주요 기능:
 * - ANTLR Server API (파일 업로드, 파싱)
 * - ROBO Analyzer API (소스 분석, 데이터 삭제)
 * - NDJSON 스트림 처리
 */

import type { 
  BackendRequestMetadata, 
  FileUploadResponse, 
  ParseResponse,
  StreamEvent,
  Text2SqlTableInfo,
  Text2SqlColumnInfo,
  ReactRequest,
  ReactStreamEvent
} from '@/types'
import { getNormalizedUploadPath } from '@/utils/upload'

// ============================================================================
// 상수 정의
// ============================================================================

const ANTLR_BASE_URL = '/antlr'
const ROBO_BASE_URL = '/robo'

// ============================================================================
// 타입 정의
// ============================================================================

type StreamCallback = (event: StreamEvent) => void
type Headers = Record<string, string>

// ============================================================================
// HTTP 유틸리티
// ============================================================================

/**
 * HTTP 에러 처리
 */
async function handleHttpError(response: Response): Promise<never> {
  const errorText = await response.text().catch(() => '')
  const errorMessage = errorText || `HTTP ${response.status}`
  
  // 서버 에러 상세 정보를 콘솔에 출력 (디버깅용)
  console.error(`[API Error] ${response.status} ${response.statusText}`)
  console.error(`[API Error] URL: ${response.url}`)
  console.error(`[API Error] Response body:`, errorMessage)
  console.error(`[API Error] Response headers:`, Object.fromEntries(response.headers.entries()))
  
  throw new Error(errorMessage)
}

/**
 * JSON POST 요청
 */
async function postJson<T>(
  url: string, 
  body: unknown, 
  headers: Headers
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    await handleHttpError(response)
  }
  
  return response.json()
}

/**
 * FormData POST 요청
 */
async function postFormData<T>(
  url: string, 
  formData: FormData, 
  headers: Headers
): Promise<T> {
  // 디버깅: FormData 내용 확인
  console.log(`[API] POST ${url}`)
  console.log('[API] Headers:', headers)
  console.log('[API] Full URL:', window.location.origin + url)
  
  try {
    // FormData 전송 시 브라우저가 자동으로 Content-Type을 설정하므로 명시하지 않음
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Session-UUID': headers['Session-UUID'],
        ...(headers['OpenAI-Api-Key'] ? { 'OpenAI-Api-Key': headers['OpenAI-Api-Key'] } : {}),
        'Accept-Language': headers['Accept-Language'] || 'ko'
        // Content-Type은 명시하지 않음 (브라우저가 multipart/form-data로 자동 설정)
      },
      body: formData
    })
    
    console.log(`[API] Response status: ${response.status} ${response.statusText}`)
    console.log(`[API] Response headers:`, Object.fromEntries(response.headers.entries()))
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  } catch (error) {
    // 네트워크 오류 처리
    console.error('[API] Network error:', error)
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `서버에 연결할 수 없습니다. ANTLR Server(http://127.0.0.1:8081)가 실행 중인지 확인해주세요.\n` +
        `원본 오류: ${error.message}`
      )
    }
    
    if (error instanceof Error) {
      throw new Error(
        `파일 업로드 중 오류가 발생했습니다: ${error.message}\n` +
        `서버 상태를 확인해주세요.`
      )
    }
    
    throw error
  }
}

// ============================================================================
// NDJSON 스트림 처리
// ============================================================================

/**
 * NDJSON 스트림 fetch 유틸리티
 */
async function streamFetch(
  url: string,
  body: unknown,
  headers: Headers,
  onEvent: StreamCallback
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
  
  if (!response.ok) {
    await handleHttpError(response)
  }
  
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }
  
  await processStream(reader, onEvent)
}

/**
 * 스트림 데이터 처리
 */
async function processStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: StreamCallback
): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      buffer = processBuffer(buffer, onEvent)
    }
    
    // 남은 버퍼 처리
    processFinalBuffer(buffer, onEvent)
  } finally {
    reader.releaseLock()
  }
}

/**
 * 버퍼에서 완전한 JSON 라인 추출 및 처리
 */
function processBuffer(buffer: string, onEvent: StreamCallback): string {
  const lines = buffer.split('\n')
  const remaining = lines.pop() || ''
  
  for (const line of lines) {
    if (!line.trim()) continue
    
    const event = parseJsonLine(line)
    onEvent(event)
    if (event.type === 'complete' || event.type === 'error') {
      return ''
    }
  }
  
  return remaining
}

/**
 * 최종 버퍼 처리
 */
function processFinalBuffer(buffer: string, onEvent: StreamCallback): void {
  if (!buffer.trim()) return
  
  const event = parseJsonLine(buffer)
  onEvent(event)
}

/**
 * JSON 라인 파싱
 */
function parseJsonLine(line: string): StreamEvent {
  return JSON.parse(line)
}

// ============================================================================
// ANTLR Server API
// ============================================================================

export const antlrApi = {
  /**
   * 파일 업로드
   */
  async uploadFiles(
    metadata: BackendRequestMetadata,
    files: File[],
    headers: Headers
  ): Promise<FileUploadResponse> {
    const formData = new FormData()
    formData.append('metadata', JSON.stringify(metadata))
    
    for (const file of files) {
      // 서버가 폴더 구조를 그대로 저장/복원할 수 있도록 "파일명" 자리에 상대경로를 넣어 전송
      // (프로젝트 최상위 폴더는 항상 metadata.projectName 으로 고정)
      const path = getNormalizedUploadPath(file, metadata.projectName)
      formData.append('files', file, path)
    }
    
    return postFormData<FileUploadResponse>(
      `${ANTLR_BASE_URL}/fileUpload`, 
      formData, 
      headers
    )
  },
  
  /**
   * ANTLR 파싱 (일반 JSON 응답)
   */
  async parse(
    metadata: BackendRequestMetadata,
    headers: Headers
  ): Promise<ParseResponse> {
    return postJson<ParseResponse>(
      `${ANTLR_BASE_URL}/parsing`, 
      metadata, 
      headers
    )
  },
  
  /**
   * ANTLR 파싱 (스트림 방식)
   * ANTLR 서버가 스트림을 지원할 때 사용
   */
  async parseStream(
    metadata: BackendRequestMetadata,
    headers: Headers,
    onEvent: StreamCallback
  ): Promise<void> {
    await streamFetch(
      `${ANTLR_BASE_URL}/parsing`,
      metadata,
      headers,
      onEvent
    )
  }
}

// ============================================================================
// ROBO Analyzer API
// ============================================================================

export const roboApi = {
  /**
   * 소스 파일 분석 → Neo4j 그래프 생성
   * 
   * Request Body:
   *   projectName: 프로젝트명 (필수)
   *   strategy: "framework" | "dbms" (기본: framework)
   *   target: "java" | "oracle" | ... (기본: java)
   * 
   * Response: NDJSON 스트림
   */
  async analyze(
    metadata: BackendRequestMetadata,
    headers: Headers,
    onEvent: StreamCallback
  ): Promise<void> {
    await streamFetch(
      `${ROBO_BASE_URL}/analyze/`,
      metadata,
      headers,
      onEvent
    )
  },
  
  /**
   * 사용자 데이터 전체 삭제 (임시 파일 + Neo4j 그래프)
   * 
   * Request Headers:
   *   Session-UUID: 세션 UUID (필수)
   * 
   * Response: JSON
   */
  async delete(headers: Headers): Promise<{ message: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/delete/`, {
      method: 'DELETE',
      headers
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  }
}

// ============================================================================
// Text2SQL API (ReAct)
// ============================================================================

const TEXT2SQL_BASE_URL = '/text2sql'

export const text2sqlApi = {
  /**
   * 테이블 목록 조회
   */
  async getTables(search?: string, schema?: string, limit: number = 50): Promise<Text2SqlTableInfo[]> {
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (schema) params.append('schema', schema)
    params.append('limit', limit.toString())
    
    const response = await fetch(`${TEXT2SQL_BASE_URL}/meta/tables?${params}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 테이블 컬럼 조회
   */
  async getTableColumns(tableName: string, schema: string = 'public'): Promise<Text2SqlColumnInfo[]> {
    const params = new URLSearchParams({ schema })
    const response = await fetch(`${TEXT2SQL_BASE_URL}/meta/tables/${tableName}/columns?${params}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 컬럼 검색
   */
  async searchColumns(search: string, limit: number = 50): Promise<Text2SqlColumnInfo[]> {
    const params = new URLSearchParams({ search, limit: limit.toString() })
    const response = await fetch(`${TEXT2SQL_BASE_URL}/meta/columns?${params}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 테이블 설명 수정
   */
  async updateTableDescription(tableName: string, schema: string, description: string): Promise<void> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/schema-edit/tables/${tableName}/description`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tableName, schema, description })
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  },

  /**
   * 컬럼 설명 수정
   */
  async updateColumnDescription(
    tableName: string, 
    columnName: string, 
    schema: string, 
    description: string
  ): Promise<void> {
    const response = await fetch(
      `${TEXT2SQL_BASE_URL}/schema-edit/tables/${tableName}/columns/${columnName}/description`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          table_schema: schema,
          column_name: columnName,
          description
        })
      }
    )
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  },

  /**
   * 릴레이션 추가
   */
  async addRelationship(relationship: {
    from_table: string
    from_schema: string
    from_column: string
    to_table: string
    to_schema: string
    to_column: string
    relationship_type: string
    description?: string
  }): Promise<void> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/schema-edit/relationships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(relationship)
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  },

  /**
   * 릴레이션 삭제
   */
  async removeRelationship(params: {
    from_table: string
    from_schema: string
    from_column: string
    to_table: string
    to_schema: string
    to_column: string
  }): Promise<void> {
    const searchParams = new URLSearchParams(params as Record<string, string>)
    const response = await fetch(`${TEXT2SQL_BASE_URL}/schema-edit/relationships?${searchParams}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  },

  /**
   * 사용자 추가 릴레이션 목록
   */
  async getUserRelationships(): Promise<{ relationships: unknown[] }> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/schema-edit/relationships/user-added`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * ReAct 스트리밍 실행
   */
  async *reactStream(
    request: ReactRequest,
    options: { signal?: AbortSignal } = {}
  ): AsyncGenerator<ReactStreamEvent, void, unknown> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: options.signal
    })

    if (!response.ok || !response.body) {
      const message = await response.text()
      throw new Error(message || 'ReAct 요청에 실패했습니다.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        let newlineIndex = buffer.indexOf('\n')
        
        while (newlineIndex !== -1) {
          const rawLine = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          
          if (rawLine) {
            try {
              const parsed = JSON.parse(rawLine) as ReactStreamEvent
              yield parsed
            } catch (error) {
              console.warn('ReAct 이벤트 파싱 실패', error, rawLine)
            }
          }
          newlineIndex = buffer.indexOf('\n')
        }
      }

      const remaining = buffer.trim()
      if (remaining) {
        try {
          const parsed = JSON.parse(remaining) as ReactStreamEvent
          yield parsed
        } catch (error) {
          console.warn('ReAct 마지막 이벤트 파싱 실패', error, remaining)
        }
      }
    } finally {
      reader.releaseLock()
    }
  },

  /**
   * 헬스체크
   */
  async healthCheck(): Promise<unknown> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/health`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  }
}
