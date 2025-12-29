/**
 * api.ts
 * API 서비스 모듈
 * 
 * 주요 기능:
 * - ANTLR Server API (파일 업로드, 파싱)
 * - Backend Server API (Understanding, Convert, 다운로드)
 * - NDJSON 스트림 처리
 */

import type { 
  BackendRequestMetadata, 
  FileUploadResponse, 
  ParseResponse,
  StreamEvent,
  DeleteResponse
} from '@/types'
import { getNormalizedUploadPath } from '@/utils/upload'

// ============================================================================
// 상수 정의
// ============================================================================

const ANTLR_BASE_URL = '/antlr'
const BACKEND_BASE_URL = '/backend'

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
// 파일 다운로드 유틸리티
// ============================================================================

/**
 * Blob을 파일로 다운로드
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  
  window.URL.revokeObjectURL(url)
  document.body.removeChild(link)
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
// Backend Server API
// ============================================================================

export const backendApi = {
  /**
   * Understanding (그래프 생성)
   */
  async cypherQuery(
    metadata: BackendRequestMetadata,
    headers: Headers,
    onEvent: StreamCallback
  ): Promise<void> {
    await streamFetch(
      `${BACKEND_BASE_URL}/understanding/`,
      metadata,
      headers,
      onEvent
    )
  },
  
  /**
   * Convert (코드 변환)
   */
  async convert(
    payload: BackendRequestMetadata & { directory?: string[] },
    headers: Headers,
    onEvent: StreamCallback
  ): Promise<void> {
    await streamFetch(
      `${BACKEND_BASE_URL}/converting/`,
      payload,
      headers,
      onEvent
    )
  },
  
  /**
   * ZIP 다운로드
   */
  async downloadJava(
    projectName: string,
    headers: Headers
  ): Promise<void> {
    const response = await fetch(`${BACKEND_BASE_URL}/download/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ projectName })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const blob = await response.blob()
    downloadBlob(blob, `${projectName}.zip`)
  },
  
  /**
   * 데이터 삭제
   */
  async deleteAll(headers: Headers): Promise<DeleteResponse> {
    const response = await fetch(`${BACKEND_BASE_URL}/deleteAll/`, {
      method: 'DELETE',
      headers
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    return response.json()
  }
}
