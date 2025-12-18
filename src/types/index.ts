/**
 * types/index.ts
 * 애플리케이션 전역 타입 정의
 */

// ============================================================================
// 기본 타입
// ============================================================================

/** 소스 코드 타입 */
export type SourceType = 'oracle' | 'postgresql' | 'java' | 'python'

/** 변환 대상 타입 */
export type ConvertTarget = 'oracle' | 'postgresql' | 'java' | 'python'

/** 백엔드 전략 타입 */
export type Strategy = 'dbms' | 'framework' | 'architecture'

// ============================================================================
// 프로젝트 메타데이터
// ============================================================================

/** 프로젝트 메타데이터 (프론트엔드용) */
export interface ProjectMetadata {
  sourceType: SourceType
  convertTarget: ConvertTarget
  projectName: string
  /** ddl 폴더 하위 상대경로 목록 (예: 'tables/a.sql') */
  ddl: string[]
}

/** 백엔드 API 요청용 메타데이터 */
export interface BackendRequestMetadata {
  strategy: Strategy
  target: string
  projectName: string
  /** ddl 폴더 하위 상대경로 목록 (예: 'tables/a.sql') */
  ddl: string[]
}

// ============================================================================
// 파일
// ============================================================================

/** 업로드된 파일 */
export interface UploadedFile {
  fileName: string
  fileContent: string
}

/** 파싱된 파일 */
export interface ParsedFile {
  fileName: string
  analysisResult: string
}

/** 변환된 파일 */
export interface ConvertedFile {
  fileName: string
  fileType: string
  code: string
  folderName?: string
  summary?: string
}

// ============================================================================
// Neo4j 응답 (백엔드 원본 형식)
// ============================================================================

/** Neo4j 노드 */
export interface Neo4jNode {
  'Node ID': string
  'Labels': string[]
  'Properties': Record<string, unknown>
}

/** Neo4j 관계 */
export interface Neo4jRelationship {
  'Relationship ID': string
  'Type': string
  'Properties': Record<string, unknown>
  'Start Node ID': string
  'End Node ID': string
}

/** Neo4j 그래프 응답 */
export interface Neo4jGraphResponse {
  Nodes: Neo4jNode[]
  Relationships: Neo4jRelationship[]
}

// ============================================================================
// 내부 그래프 데이터
// ============================================================================

/** 그래프 노드 */
export interface GraphNode {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

/** 그래프 링크 */
export interface GraphLink {
  id: string
  source: string
  target: string
  type: string
  properties: Record<string, unknown>
}

/** 그래프 데이터 */
export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

// ============================================================================
// NVL (Neo4j Visualization Library)
// ============================================================================

/** NVL 노드 */
export interface NvlNode {
  id: string
  caption?: string
  color?: string
  size?: number
  properties?: Record<string, unknown>
}

/** NVL 관계 */
export interface NvlRelationship {
  id: string
  from: string
  to: string
  caption?: string
  color?: string
  properties?: Record<string, unknown>
}

// ============================================================================
// 다이어그램
// ============================================================================

/** 다이어그램 히스토리 항목 */
export interface DiagramHistoryItem {
  diagram: string
  classNames: string[]
}

/** 다이어그램 상태 */
export interface DiagramState {
  diagram: string
  classNames: string[]
  history: DiagramHistoryItem[]
}

/** 클래스 정보 (다이어그램 검색용) */
export interface ClassInfo {
  className: string
  folderName: string
  fileName: string
  type: 'CLASS' | 'INTERFACE'
}

// ============================================================================
// 스트리밍
// ============================================================================

/** 스트림 메시지 타입 */
export type StreamMessageType = 'message' | 'error' | 'data' | 'status'

/** 스트림 이벤트 타입 */
export type StreamEventType = 'message' | 'data' | 'status' | 'complete' | 'error'

/** 스트림 메시지 (UI 표시용) */
export interface StreamMessage {
  type: StreamMessageType
  content: string
  timestamp: string
}

/** 스트림 이벤트 (백엔드 응답) */
export interface StreamEvent {
  type: StreamEventType
  content?: string
  
  // Neo4j 그래프 데이터
  Nodes?: Neo4jNode[]
  Relationships?: Neo4jRelationship[]
  graph?: Neo4jGraphResponse
  
  // 파일 데이터
  file_type?: string
  file_name?: string
  folder_name?: string
  code?: string
  diagram?: string
  
  // 진행 상태 (status 이벤트용)
  step?: number
  done?: boolean
  
  // 에러 정보
  errorType?: string
  traceId?: string
  summary?: string
}

// ============================================================================
// API 응답
// ============================================================================

/** 파일 업로드 응답 */
export interface FileUploadResponse {
  projectName: string
  files: UploadedFile[]
  ddlFiles: UploadedFile[]
}

/** 파싱 응답 */
export interface ParseResponse {
  projectName: string
  files: ParsedFile[]
}

/** 삭제 응답 */
export interface DeleteResponse {
  message: string
}
