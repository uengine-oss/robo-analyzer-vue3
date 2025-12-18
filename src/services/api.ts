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
const BACKEND_BASE_URL = '/api'

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
  throw new Error(errorText || `HTTP ${response.status}`)
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
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Session-UUID': headers['Session-UUID'] },
    body: formData
  })
  
  if (!response.ok) {
    await handleHttpError(response)
  }
  
  return response.json()
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
    if (event) {
      onEvent(event)
      if (event.type === 'complete' || event.type === 'error') {
        return ''
      }
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
  if (event) onEvent(event)
}

/**
 * JSON 라인 파싱
 */
function parseJsonLine(line: string): StreamEvent | null {
  try {
    return JSON.parse(line)
  } catch {
    console.warn('JSON 파싱 실패:', line)
    return null
  }
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
   * ANTLR 파싱
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
      `${BACKEND_BASE_URL}/cypherQuery/`,
      metadata,
      headers,
      onEvent
    )
  },
  
  /**
   * Convert (코드 변환)
   */
  async convert(
    payload: BackendRequestMetadata & { classNames?: string[] },
    headers: Headers,
    onEvent: StreamCallback
  ): Promise<void> {
    await streamFetch(
      `${BACKEND_BASE_URL}/convert/`,
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
    const response = await fetch(`${BACKEND_BASE_URL}/downloadJava/`, {
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
