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
export type Strategy = 'dbms' | 'framework'

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
  // ddl은 multipart filename 경로(ddl/...)로 서버가 자동 구분하므로 메타데이터에서 제거
}

// ============================================================================
// 파일
// ============================================================================

/** 업로드된 파일 */
export interface UploadedFile {
  fileName: string
  fileContent: string
}

// 파싱 결과는 더 이상 JSON으로 받지 않음 (파싱 완료만 표시)

/** 변환된 파일 */
export interface ConvertedFile {
  fileName: string
  fileType: string
  code: string
  directory?: string
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
  selected?: boolean  // NVL이 지원하는 selected 속성
  properties?: Record<string, unknown>
}

/** NVL 관계 */
export interface NvlRelationship {
  id: string
  from: string
  to: string
  caption?: string
  color?: string
  selected?: boolean  // NVL이 지원하는 selected 속성
  properties?: Record<string, unknown>
}

// ============================================================================
// 다이어그램 (VueFlow 기반)
// ============================================================================

/** 클래스 정보 (다이어그램 검색용) */
export interface ClassInfo {
  className: string
  directory: string
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
  directory?: string
  code?: string
  
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

/** 파싱 응답 (단순 완료 상태만) */
export interface ParseResponse {
  projectName: string
  status?: 'complete'
}

/** 삭제 응답 */
export interface DeleteResponse {
  message: string
}

// ============================================================================
// VueFlow UML 클래스 다이어그램
// ============================================================================

/** UML 클래스 다이어그램에서 선택된 클래스 정보 */
export interface SelectedClassInfo {
  className: string
  directory: string
}

/** UML 클래스 다이어그램 상태 */
export interface UmlDiagramState {
  selectedClasses: SelectedClassInfo[]
  depth: number
}