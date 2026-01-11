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

// API Gateway URL - 모든 마이크로서비스 요청의 단일 진입점
// Vite 프록시를 통해 /api/gateway/* 경로로 요청
const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL ?? '/api/gateway'

const ANTLR_BASE_URL = `${API_GATEWAY_URL}/antlr`
const ROBO_BASE_URL = `${API_GATEWAY_URL}/robo`

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
 * 서버에서 반환하는 JSON 오류 응답을 파싱하여 정확한 메시지 추출
 */
async function handleHttpError(response: Response): Promise<never> {
  const errorText = await response.text().catch(() => '')
  
  // 서버 에러 상세 정보를 콘솔에 출력 (디버깅용)
  console.error(`[API Error] ${response.status} ${response.statusText}`)
  console.error(`[API Error] URL: ${response.url}`)
  console.error(`[API Error] Response body:`, errorText)
  
  // 서비스별 친절한 에러 메시지
  const url = response.url
  
  // ANTLR 서비스 관련 에러 처리
  if (url.includes('/antlr/')) {
    if (response.status === 404 || response.status === 502 || response.status === 503) {
      throw new Error(
        '🔧 ANTLR 파서 서비스가 동작하지 않습니다.\n\n' +
        '다음을 확인해주세요:\n' +
        '• ANTLR 서비스가 실행 중인지 확인 (포트 8081)\n' +
        '• API Gateway가 정상 동작하는지 확인 (포트 9000)\n\n' +
        '서비스 시작 명령어:\n' +
        'cd antlr-code-parser && mvn spring-boot:run'
      )
    }
  }
  
  // ROBO Analyzer 서비스 관련 에러 처리
  if (url.includes('/robo/')) {
    if (response.status === 404 || response.status === 502 || response.status === 503) {
      throw new Error(
        '🔧 ROBO Analyzer 서비스가 동작하지 않습니다.\n\n' +
        '다음을 확인해주세요:\n' +
        '• robo-analyzer 서비스가 실행 중인지 확인 (포트 5502)\n' +
        '• API Gateway가 정상 동작하는지 확인 (포트 9000)'
      )
    }
  }
  
  // Text2SQL 서비스 관련 에러 처리
  if (url.includes('/text2sql/')) {
    if (response.status === 404 || response.status === 502 || response.status === 503) {
      throw new Error(
        '🔧 Text2SQL 서비스가 동작하지 않습니다.\n\n' +
        '다음을 확인해주세요:\n' +
        '• neo4j-text2sql 서비스가 실행 중인지 확인 (포트 8000)\n' +
        '• API Gateway가 정상 동작하는지 확인 (포트 9000)'
      )
    }
  }
  
  // JSON 응답에서 detail 필드 추출 시도
  let errorMessage = `HTTP ${response.status}`
  try {
    const errorJson = JSON.parse(errorText)
    if (errorJson.detail) {
      // FastAPI 스타일 오류 응답
      errorMessage = errorJson.detail
      if (errorJson.error_type) {
        errorMessage = `[${errorJson.error_type}] ${errorMessage}`
      }
    } else if (errorJson.message) {
      // 일반 오류 응답
      errorMessage = errorJson.message
    } else {
      errorMessage = errorText || `HTTP ${response.status}`
    }
  } catch {
    // JSON 파싱 실패 시 원본 텍스트 사용
    errorMessage = errorText || `HTTP ${response.status}`
  }
  
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

/** 파일 타입 감지 요청 항목 */
interface FileContentForDetection {
  fileName: string
  content: string
}

/** 파일 타입 감지 결과 항목 */
export interface FileTypeResult {
  fileName: string
  fileType: 'java' | 'oracle_sp' | 'oracle_ddl' | 'postgresql_sp' | 'postgresql_ddl' | 'python' | 'xml' | 'sql_generic' | 'unknown'
  confidence: number
  details: string
  suggestedStrategy: 'framework' | 'dbms'
  suggestedTarget: 'java' | 'oracle' | 'postgresql' | 'python'
}

/** 파일 타입 감지 응답 */
export interface DetectTypesResponse {
  files: FileTypeResult[]
  summary: {
    total: number
    byType: Record<string, number>
    suggestedStrategy: 'framework' | 'dbms'
    suggestedTarget: 'java' | 'oracle' | 'postgresql' | 'python'
  }
}

export const roboApi = {
  /**
   * 파일 내용을 분석하여 소스 코드 타입 자동 감지
   * 
   * Request Body:
   *   files: [{ fileName: string, content: string }, ...]
   * 
   * Response: JSON
   *   files: [{ fileName, fileType, confidence, details, suggestedStrategy, suggestedTarget }, ...]
   *   summary: { total, byType, suggestedStrategy, suggestedTarget }
   */
  async detectTypes(files: FileContentForDetection[]): Promise<DetectTypesResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/detect-types/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

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
   * Neo4j에 기존 데이터 존재 여부 확인
   * 
   * Request Headers:
   *   Session-UUID: 세션 UUID (필수)
   * 
   * Response: JSON { hasData: boolean, nodeCount: number }
   */
  async checkData(headers: Headers): Promise<{ hasData: boolean; nodeCount: number }> {
    const response = await fetch(`${ROBO_BASE_URL}/check-data/`, {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },
  
  /**
   * Neo4j에서 기존 그래프 데이터 조회
   * 
   * Request Headers:
   *   Session-UUID: 세션 UUID (필수)
   * 
   * Response: JSON { Nodes: [...], Relationships: [...] }
   */
  async getGraphData(headers: Headers): Promise<{ 
    Nodes: Array<{ 'Node ID': string; Labels: string[]; Properties: Record<string, unknown> }>;
    Relationships: Array<{ 'Relationship ID': string; 'Start Node ID': string; 'End Node ID': string; Type: string; Properties: Record<string, unknown> }>;
  }> {
    const response = await fetch(`${ROBO_BASE_URL}/graph/`, {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
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
  },

  // ========== 파이프라인 제어 API ==========

  /**
   * 파이프라인 상태 조회
   */
  async getPipelineStatus(headers: Headers): Promise<PipelineStatus> {
    const response = await fetch(`${ROBO_BASE_URL}/pipeline/status`, {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * 파이프라인 단계 정보 조회
   */
  async getPipelinePhases(): Promise<PipelinePhaseInfo[]> {
    const response = await fetch(`${ROBO_BASE_URL}/pipeline/phases`, {
      method: 'GET'
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },

  /**
   * 파이프라인 제어 (일시정지/재개/중단)
   */
  async controlPipeline(
    action: 'pause' | 'resume' | 'stop',
    headers: Headers
  ): Promise<PipelineControlResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/pipeline/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ action })
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  }
}

// 파이프라인 타입 정의
export interface PipelinePhaseInfo {
  phase: string
  name: string
  description: string
  order: number
  canPause: boolean
}

export interface PipelineStatus {
  sessionId: string
  currentPhase: string
  phaseName: string
  phaseOrder: number
  isPaused: boolean
  isStopped: boolean
  phaseProgress: number
  phaseMessage: string
  phases: PipelinePhaseInfo[]
}

export interface PipelineControlResponse {
  success: boolean
  action: string
  status: PipelineStatus
}

// ============================================================================
// Ingest API
// ============================================================================

const INGEST_BASE_URL = `${API_GATEWAY_URL}/text2sql`

export interface IngestRequest {
  db_name?: string
  schema?: string | null
  clear_existing?: boolean
}

export interface IngestResponse {
  message: string
  status: string
  tables_loaded: number
  columns_loaded: number
  fks_loaded: number
}

export const ingestApi = {
  /**
   * 데이터베이스 스키마를 Neo4j에 인제스천
   */
  async ingest(request: IngestRequest = {}): Promise<IngestResponse> {
    const response = await fetch(`${INGEST_BASE_URL}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(errorText || `HTTP ${response.status}`)
    }
    
    return response.json()
  }
}

// ============================================================================
// ROBO Schema API (ERD 모델링용 - Neo4j 직접 조회)
// ============================================================================

export interface RoboSchemaTableInfo {
  name: string
  table_schema: string  // Renamed from 'schema' in backend
  description: string
  description_source?: string  // 설명 출처: ddl, procedure, user
  analyzed_description?: string  // 프로시저 분석에서 도출된 설명
  column_count: number
  project_name?: string
}

export interface RoboSchemaColumnInfo {
  name: string
  table_name: string
  dtype: string
  nullable: boolean
  description: string
  description_source?: string  // 설명 출처: ddl, procedure, user
  analyzed_description?: string  // 프로시저 분석에서 도출된 설명
}

export interface RoboSchemaRelationship {
  from_table: string
  from_schema: string
  from_column: string
  to_table: string
  to_schema: string
  to_column: string
  relationship_type: string
  description: string
}

/**
 * ROBO Analyzer Schema API
 * Neo4j에서 DDL 분석 결과(테이블, 컬럼, 관계)를 조회
 */
export const roboSchemaApi = {
  /**
   * 테이블 목록 조회 (Neo4j)
   */
  async getTables(
    sessionId: string,
    options?: { search?: string; schema?: string; projectName?: string; limit?: number }
  ): Promise<RoboSchemaTableInfo[]> {
    const params = new URLSearchParams()
    if (options?.search) params.append('search', options.search)
    if (options?.schema) params.append('schema', options.schema)
    if (options?.projectName) params.append('project_name', options.projectName)
    if (options?.limit) params.append('limit', options.limit.toString())
    
    const response = await fetch(`${ROBO_BASE_URL}/schema/tables?${params}`, {
      headers: { 'Session-UUID': sessionId }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },
  
  /**
   * 테이블 컬럼 목록 조회 (Neo4j)
   */
  async getTableColumns(
    sessionId: string,
    tableName: string,
    options?: { schema?: string; projectName?: string }
  ): Promise<RoboSchemaColumnInfo[]> {
    const params = new URLSearchParams()
    if (options?.schema) params.append('schema', options.schema)
    if (options?.projectName) params.append('project_name', options.projectName)
    
    const response = await fetch(`${ROBO_BASE_URL}/schema/tables/${tableName}/columns?${params}`, {
      headers: { 'Session-UUID': sessionId }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },
  
  /**
   * 테이블 관계 목록 조회 (Neo4j)
   */
  async getRelationships(
    sessionId: string,
    projectName?: string
  ): Promise<{ relationships: RoboSchemaRelationship[] }> {
    const params = new URLSearchParams()
    if (projectName) params.append('project_name', projectName)
    
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships?${params}`, {
      headers: { 'Session-UUID': sessionId }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },
  
  /**
   * 특정 테이블과 연결된 모든 테이블 조회 (Neo4j Cypher)
   */
  async getRelatedTables(
    sessionId: string,
    tableName: string
  ): Promise<{
    base_table: string
    tables: Array<{ name: string; schema: string; description?: string }>
    relationships: Array<{ 
      from_table: string
      to_table: string
      type: string
      source?: 'ddl' | 'procedure' | 'user'  // FK 관계 출처
      column_pairs?: Array<{ source: string; target: string }>
    }>
  }> {
    const response = await fetch(`${ROBO_BASE_URL}/graph/related-tables/${encodeURIComponent(tableName)}`, {
      headers: { 'Session-UUID': sessionId }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },
  
  /**
   * 테이블/컬럼이 참조된 프로시저 목록 조회
   */
  async getTableReferences(
    sessionId: string,
    tableName: string,
    options?: { schema?: string; columnName?: string }
  ): Promise<{
    references: Array<{
      procedure_name: string
      procedure_type: string  // PROCEDURE, FUNCTION 등
      start_line: number
      access_type: string  // FROM (읽기), WRITES (쓰기)
      statement_type?: string  // SELECT, INSERT, UPDATE 등
      statement_line?: number
      file_name?: string  // 파일명
      file_directory?: string  // 파일 경로
    }>
  }> {
    const params = new URLSearchParams()
    if (options?.schema) params.append('schema', options.schema)
    if (options?.columnName) params.append('column_name', options.columnName)
    
    const response = await fetch(`${ROBO_BASE_URL}/schema/tables/${encodeURIComponent(tableName)}/references?${params}`, {
      headers: { 'Session-UUID': sessionId }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },
  
  /**
   * 프로시저의 모든 Statement와 AI 설명 조회
   */
  async getProcedureStatements(
    sessionId: string,
    procedureName: string,
    fileDirectory?: string
  ): Promise<{
    statements: Array<{
      start_line: number
      end_line?: number
      statement_type: string
      summary?: string
      ai_description?: string
    }>
  }> {
    const params = new URLSearchParams()
    if (fileDirectory) params.append('file_directory', fileDirectory)
    
    const response = await fetch(`${ROBO_BASE_URL}/schema/procedures/${encodeURIComponent(procedureName)}/statements?${params}`, {
      headers: { 'Session-UUID': sessionId }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },
  
  /**
   * 테이블 관계 추가 (Neo4j)
   */
  async addRelationship(
    sessionId: string,
    relationship: {
      from_table: string
      from_schema?: string
      from_column: string
      to_table: string
      to_schema?: string
      to_column: string
      relationship_type: string
      description?: string
    }
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Session-UUID': sessionId
      },
      body: JSON.stringify(relationship)
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },
  
  /**
   * 테이블 관계 삭제 (Neo4j)
   */
  async deleteRelationship(
    sessionId: string,
    params: {
      from_table: string
      from_column: string
      to_table: string
      to_column: string
    }
  ): Promise<{ success: boolean; message: string }> {
    const searchParams = new URLSearchParams(params as Record<string, string>)
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships?${searchParams}`, {
      method: 'DELETE',
      headers: { 'Session-UUID': sessionId }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },
  
  /**
   * 시멘틱 검색: 테이블 설명의 의미적 유사도 기반 검색
   */
  async semanticSearch(
    sessionId: string,
    query: string,
    options?: { projectName?: string; limit?: number; apiKey?: string }
  ): Promise<Array<{
    name: string
    schema: string
    description: string
    similarity: number
  }>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Session-UUID': sessionId
    }
    
    if (options?.apiKey) {
      headers['X-API-Key'] = options.apiKey
    }
    
    const response = await fetch(`${ROBO_BASE_URL}/schema/semantic-search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        project_name: options?.projectName,
        limit: options?.limit || 10
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  }
}

// ============================================================================
// Text2SQL API (ReAct)
// ============================================================================

const TEXT2SQL_BASE_URL = `${API_GATEWAY_URL}/text2sql`

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
   * 테이블 설명 수정 (robo-analyzer 사용)
   */
  async updateTableDescription(
    tableName: string, 
    schema: string, 
    description: string,
    headers: Headers = {}
  ): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/tables/${tableName}/description`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ name: tableName, schema, description })
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
  },

  /**
   * 컬럼 설명 수정 (robo-analyzer 사용)
   */
  async updateColumnDescription(
    tableName: string, 
    columnName: string, 
    schema: string, 
    description: string,
    headers: Headers = {}
  ): Promise<void> {
    const response = await fetch(
      `${ROBO_BASE_URL}/schema/tables/${tableName}/columns/${columnName}/description`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          table_name: tableName,
          table_schema: schema,
          column_name: columnName,
          description
        })
      }
    )
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
  },

  /**
   * 릴레이션 추가 (robo-analyzer 사용)
   */
  async addRelationship(
    relationship: {
      from_table: string
      from_schema: string
      from_column: string
      to_table: string
      to_schema: string
      to_column: string
      relationship_type: string
      description?: string
    },
    headers: Headers = {}
  ): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(relationship)
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
  },

  /**
   * 릴레이션 삭제 (robo-analyzer 사용)
   */
  async removeRelationship(
    params: {
      from_table: string
      from_schema: string
      from_column: string
      to_table: string
      to_schema: string
      to_column: string
    },
    headers: Headers = {}
  ): Promise<void> {
    const searchParams = new URLSearchParams(params as Record<string, string>)
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships?${searchParams}`, {
      method: 'DELETE',
      headers
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
  },

  /**
   * 사용자 추가 릴레이션 목록 (robo-analyzer 사용)
   */
  async getUserRelationships(headers: Headers = {}): Promise<{ relationships: unknown[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/schema/relationships`, { headers })
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

// ============================================================================
// Lineage API (데이터 리니지)
// ============================================================================

export interface LineageNode {
  id: string
  name: string
  type: 'SOURCE' | 'TARGET' | 'ETL'
  properties: Record<string, unknown>
}

export interface LineageEdge {
  id: string
  source: string
  target: string
  type: string
  properties: Record<string, unknown>
}

export interface LineageStats {
  etlCount: number
  sourceCount: number
  targetCount: number
  flowCount: number
}

export interface LineageGraphResponse {
  nodes: LineageNode[]
  edges: LineageEdge[]
  stats: LineageStats
}

export interface LineageAnalyzeRequest {
  projectName: string
  sqlContent: string
  fileName?: string
  dbms?: string
}

export interface LineageInfo {
  etl_name: string
  source_tables: string[]
  target_tables: string[]
  operation_type: string
}

export interface LineageAnalyzeResponse {
  lineages: LineageInfo[]
  stats: {
    etl_nodes: number
    data_sources: number
    data_flows: number
  }
}

// ============================================================================
// Glossary API (용어 관리)
// ============================================================================

export interface Glossary {
  id: string
  name: string
  description: string
  type: string
  termCount: number
  createdAt?: string
  updatedAt?: string
}

export interface Term {
  id: string
  name: string
  description: string
  status: 'Draft' | 'Pending' | 'Approved' | 'Deprecated'
  synonyms: string[]
  owners: { id: string; name: string; email?: string }[]
  reviewers?: { id: string; name: string; email?: string }[]
  domains: { id: string; name: string }[]
  tags: { id: string; name: string; color: string }[]
  relatedTerms?: { id: string; name: string }[]
  glossaryId?: string
  glossaryName?: string
  createdAt?: string
  updatedAt?: string
}

export interface GlossaryDomain {
  id: string
  name: string
  description?: string
  termCount?: number
}

export interface GlossaryOwner {
  id: string
  name: string
  email?: string
}

export interface GlossaryTag {
  id: string
  name: string
  color: string
  termCount?: number
}

export interface CreateGlossaryRequest {
  name: string
  description?: string
  type?: string
}

export interface CreateTermRequest {
  name: string
  description?: string
  status?: string
  synonyms?: string[]
  domains?: string[]
  owners?: string[]
  reviewers?: string[]
  tags?: string[]
}

export interface UpdateTermRequest {
  name?: string
  description?: string
  status?: string
  synonyms?: string[]
  domains?: string[]
  owners?: string[]
  reviewers?: string[]
  tags?: string[]
}

export const glossaryApi = {
  /**
   * 용어집 목록 조회
   */
  async getGlossaries(headers: Headers): Promise<{ glossaries: Glossary[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 용어집 생성
   */
  async createGlossary(headers: Headers, data: CreateGlossaryRequest): Promise<{ id: string; name: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 용어집 상세 조회
   */
  async getGlossary(headers: Headers, glossaryId: string): Promise<Glossary> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 용어집 수정
   */
  async updateGlossary(headers: Headers, glossaryId: string, data: Partial<CreateGlossaryRequest>): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /**
   * 용어집 삭제
   */
  async deleteGlossary(headers: Headers, glossaryId: string): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}`, {
      method: 'DELETE',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /**
   * 용어 목록 조회
   */
  async getTerms(headers: Headers, glossaryId: string, options?: { status?: string; search?: string }): Promise<{ terms: Term[] }> {
    const params = new URLSearchParams()
    if (options?.status) params.append('status', options.status)
    if (options?.search) params.append('search', options.search)
    
    const queryString = params.toString()
    const url = `${ROBO_BASE_URL}/glossary/${glossaryId}/terms${queryString ? '?' + queryString : ''}`
    
    const response = await fetch(url, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 용어 생성
   */
  async createTerm(headers: Headers, glossaryId: string, data: CreateTermRequest): Promise<{ id: string; name: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}/terms`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 용어 상세 조회
   */
  async getTerm(headers: Headers, glossaryId: string, termId: string): Promise<Term> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}/terms/${termId}`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 용어 수정
   */
  async updateTerm(headers: Headers, glossaryId: string, termId: string, data: UpdateTermRequest): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}/terms/${termId}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /**
   * 용어 삭제
   */
  async deleteTerm(headers: Headers, glossaryId: string, termId: string): Promise<void> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/${glossaryId}/terms/${termId}`, {
      method: 'DELETE',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
  },

  /**
   * 도메인 목록 조회
   */
  async getDomains(headers: Headers): Promise<{ domains: GlossaryDomain[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/domains`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 소유자 목록 조회
   */
  async getOwners(headers: Headers): Promise<{ owners: GlossaryOwner[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/owners`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 태그 목록 조회
   */
  async getTags(headers: Headers): Promise<{ tags: GlossaryTag[] }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/tags`, {
      method: 'GET',
      headers
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 도메인 생성
   */
  async createDomain(headers: Headers, data: { name: string; description?: string }): Promise<{ id: string; name: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/domains`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 소유자 생성
   */
  async createOwner(headers: Headers, data: { name: string; email?: string }): Promise<{ id: string; name: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/owners`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  },

  /**
   * 태그 생성
   */
  async createTag(headers: Headers, data: { name: string; color?: string }): Promise<{ id: string; name: string; color: string }> {
    const response = await fetch(`${ROBO_BASE_URL}/glossary/meta/tags`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      await handleHttpError(response)
    }
    return response.json()
  }
}

export const lineageApi = {
  /**
   * 데이터 리니지 그래프 조회
   */
  async getLineageGraph(
    headers: Headers,
    projectName?: string
  ): Promise<LineageGraphResponse> {
    const params = projectName ? `?projectName=${encodeURIComponent(projectName)}` : ''
    const response = await fetch(`${ROBO_BASE_URL}/lineage/${params}`, {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  },
  
  /**
   * ETL 코드에서 리니지 분석
   */
  async analyzeLineage(
    headers: Headers,
    request: LineageAnalyzeRequest
  ): Promise<LineageAnalyzeResponse> {
    const response = await fetch(`${ROBO_BASE_URL}/lineage/analyze/`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    })
    
    if (!response.ok) {
      await handleHttpError(response)
    }
    
    return response.json()
  }
}

// ============================================================================
// Event Detection API (이벤트 감지 및 조치)
// ============================================================================

export interface AlertConfig {
  channels: string[]
  message: string
}

export interface ProcessConfig {
  process_name: string
  process_params: Record<string, unknown>
}

export interface EventRule {
  id: string
  name: string
  description: string
  natural_language_condition: string
  sql: string
  check_interval_minutes: number
  condition_threshold: string
  action_type: 'alert' | 'process'
  alert_config?: AlertConfig
  process_config?: ProcessConfig
  is_active: boolean
  last_checked_at: string | null
  last_triggered_at: string | null
  trigger_count: number
  created_at: string
  updated_at: string
}

export interface EventRuleCreate {
  name: string
  description?: string
  natural_language_condition: string
  sql: string
  check_interval_minutes?: number
  condition_threshold?: string
  action_type?: 'alert' | 'process'
  alert_config?: AlertConfig
  process_config?: ProcessConfig
}

export interface EventRuleUpdate {
  name?: string
  description?: string
  natural_language_condition?: string
  sql?: string
  check_interval_minutes?: number
  condition_threshold?: string
  action_type?: 'alert' | 'process'
  alert_config?: AlertConfig
  process_config?: ProcessConfig
  is_active?: boolean
}

export interface EventExecutionResult {
  event_id: string
  executed_at: string
  sql_result: Record<string, unknown>
  condition_met: boolean
  action_taken?: string
  error?: string
}

export interface EventNotification {
  id: string
  event_id: string
  event_name: string
  message: string
  triggered_at: string
  acknowledged: boolean
  data?: Record<string, unknown>
}

export interface SchedulerStatus {
  running: boolean
  active_tasks: number
  scheduled_events: string[]
}

// 대화형 이벤트 설정 타입
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ExtractedEventConfig {
  name?: string
  description?: string
  condition?: string
  interval?: number
  threshold?: string
  action_type?: 'alert' | 'process'
  process_name?: string
}

export interface EventChatRequest {
  message: string
  history?: ChatMessage[]
  current_config?: Record<string, unknown>
  step?: string
}

export interface EventChatResponse {
  response: string
  extracted_config?: ExtractedEventConfig
  ready_to_confirm: boolean
  event_created: boolean
  next_step?: string
}

// CEP 상태 타입
export interface CEPStatus {
  cep_available: boolean
  cep_status?: {
    status: string
    activeRules?: number
    engine?: string
    error?: string
  }
  local_scheduler_running: boolean
  local_active_tasks: number
}

// 시뮬레이션 요청 타입
export interface SimulationRequest {
  rule_name: string
  natural_language_condition: string
  field_name?: string
  threshold: number
  duration_minutes?: number
  simulated_value: number
  simulated_duration_minutes?: number
  station_id?: string
}

// 시뮬레이션 결과 타입
export interface SimulationResult {
  rule_id: string
  rule_name: string
  events_generated: number
  alarms_triggered: number
  alarms: Array<{
    rule_id: string
    rule_name: string
    triggered_at: string
    duration: string
    matching_events: number
  }>
  condition_details: {
    field: string
    operator: string
    threshold: number
    required_duration_minutes: number
    simulated_value: number
    simulated_duration_minutes: number
  }
}

// SimpleCEP 상태 타입
export interface SimpleCEPStatus {
  available: boolean
  status?: string
  active_rules?: number
  total_rules?: number
  buffered_events?: number
  engine?: string
}

export const eventApi = {
  // ========== 이벤트 규칙 CRUD ==========
  
  /**
   * 이벤트 규칙 목록 조회
   */
  async listRules(): Promise<EventRule[]> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 이벤트 규칙 상세 조회
   */
  async getRule(eventId: string): Promise<EventRule> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules/${eventId}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 이벤트 규칙 생성
   */
  async createRule(data: EventRuleCreate): Promise<EventRule> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 이벤트 규칙 수정
   */
  async updateRule(eventId: string, data: EventRuleUpdate): Promise<EventRule> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules/${eventId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 이벤트 규칙 삭제
   */
  async deleteRule(eventId: string): Promise<void> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules/${eventId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  },

  /**
   * 이벤트 규칙 활성/비활성 토글
   */
  async toggleRule(eventId: string): Promise<{ message: string; is_active: boolean }> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules/${eventId}/toggle`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 이벤트 규칙 수동 실행
   */
  async runRule(eventId: string): Promise<EventExecutionResult> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/rules/${eventId}/run`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  // ========== 알림 관리 ==========

  /**
   * 알림 목록 조회
   */
  async listNotifications(options?: { 
    limit?: number
    unacknowledged_only?: boolean 
  }): Promise<EventNotification[]> {
    const params = new URLSearchParams()
    if (options?.limit) params.append('limit', options.limit.toString())
    if (options?.unacknowledged_only) params.append('unacknowledged_only', 'true')
    
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/notifications?${params}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 알림 확인 처리
   */
  async acknowledgeNotification(notificationId: string): Promise<void> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/notifications/${notificationId}/acknowledge`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  },

  /**
   * 알림 삭제
   */
  async deleteNotification(notificationId: string): Promise<void> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/notifications/${notificationId}`, {
      method: 'DELETE'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  },

  // ========== 스케줄러 관리 ==========

  /**
   * 스케줄러 시작
   */
  async startScheduler(): Promise<{ message: string; active_rules: number }> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/scheduler/start`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 스케줄러 중지
   */
  async stopScheduler(): Promise<{ message: string }> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/scheduler/stop`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 스케줄러 상태 조회
   */
  async getSchedulerStatus(): Promise<SchedulerStatus> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/scheduler/status`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  // ========== 대화형 이벤트 설정 ==========

  /**
   * 대화형 이벤트 설정 API
   * 
   * 사용자의 자연어 설명을 분석하여 이벤트 규칙 설정을 도와줍니다.
   */
  async chat(request: EventChatRequest): Promise<EventChatResponse> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
    return response.json()
  },

  // ========== CEP 상태 ==========

  /**
   * CEP 서비스 상태 조회
   */
  async getCepStatus(): Promise<CEPStatus> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/cep/status`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  // ========== 시뮬레이션 ==========

  /**
   * CEP 시뮬레이션 실행
   * 
   * 가짜 타임스탬프 데이터로 10분 지속 조건 등을 테스트합니다.
   */
  async runSimulation(request: SimulationRequest): Promise<SimulationResult> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(errorText || `HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * SimpleCEP 상태 조회
   */
  async getSimpleCepStatus(): Promise<SimpleCEPStatus> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/simple-cep/status`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  }
}

// ============================================================================
// Event Templates API (이벤트 템플릿)
// ============================================================================

export interface EventTemplate {
  id: string
  category: string
  name: string
  description: string
  rule_description: string
  sample_sql: string
  default_interval_minutes: number
  default_threshold: string
  recommended_action: 'alert' | 'process'
  diagnostic_questions: string[]
  simple_questions: string[]
  action_questions: string[]
  suggested_process?: string
}

export const eventTemplateApi = {
  /**
   * 템플릿 목록 조회
   */
  async listTemplates(category?: string): Promise<EventTemplate[]> {
    const params = category ? `?category=${encodeURIComponent(category)}` : ''
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/templates${params}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 카테고리 목록 조회
   */
  async listCategories(): Promise<{ categories: string[] }> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/templates/categories`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 카테고리별 그룹화된 템플릿 조회
   */
  async getTemplatesGrouped(): Promise<Record<string, EventTemplate[]>> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/templates/by-category`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 템플릿 상세 조회
   */
  async getTemplate(templateId: string): Promise<EventTemplate> {
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/templates/${templateId}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  },

  /**
   * 템플릿으로 이벤트 규칙 생성
   */
  async createRuleFromTemplate(
    templateId: string,
    options?: {
      name?: string
      description?: string
      check_interval_minutes?: number
    }
  ): Promise<EventRule> {
    const params = new URLSearchParams()
    if (options?.name) params.append('name', options.name)
    if (options?.description) params.append('description', options.description)
    if (options?.check_interval_minutes) params.append('check_interval_minutes', options.check_interval_minutes.toString())
    
    const response = await fetch(`${TEXT2SQL_BASE_URL}/events/templates/${templateId}/create-rule?${params}`, {
      method: 'POST'
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response.json()
  }
}
