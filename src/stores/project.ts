/**
 * project.ts
 * 프로젝트 상태 관리 스토어
 * 
 * 주요 기능:
 * - 프로젝트 메타데이터 관리
 * - 파일 업로드/파싱/분석/인제스천 (순차 파이프라인)
 * - 통합 콘솔 메시지
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  ProjectMetadata,
  BackendRequestMetadata,
  SourceType,
  UploadedFile, 
  GraphData,
  GraphNode,
  GraphLink,
  Neo4jNode,
  Neo4jRelationship,
  StreamMessage
} from '@/types'

import { useSessionStore } from './session'
import { antlrApi, roboApi, ingestApi } from '@/services/api'

// ============================================================================
// 타입 정의
// ============================================================================

type MessageType = StreamMessage['type']

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * Neo4j 노드를 내부 형식으로 변환
 */
function convertNeo4jNode(node: Neo4jNode): GraphNode {
  return {
  id: node['Node ID'],
  labels: node['Labels'],
  properties: node['Properties']
  }
}

/**
 * Neo4j 관계를 내부 형식으로 변환
 */
function convertNeo4jRelationship(rel: Neo4jRelationship): GraphLink {
  return {
  id: rel['Relationship ID'],
  source: rel['Start Node ID'],
  target: rel['End Node ID'],
  type: rel['Type'],
  properties: rel['Properties']
  }
}

/**
 * 현재 타임스탬프 생성
 */
function createTimestamp(): string {
  return new Date().toISOString()
}

// [REMOVED] deduplicateClasses - UML은 이제 VueFlow로 로컬 처리

// ============================================================================
// 스토어 정의
// ============================================================================

export const useProjectStore = defineStore('project', () => {
  const sessionStore = useSessionStore()
  
  // ==========================================================================
  // 상태 - 프로젝트 메타데이터
  // ==========================================================================
  
  const projectName = ref('')
  const sourceType = ref<SourceType>('java')
  const ddl = ref<string[]>([])
  
  // ==========================================================================
  // 상태 - 파일
  // ==========================================================================
  
  const uploadedFiles = ref<UploadedFile[]>([])
  const uploadedDdlFiles = ref<UploadedFile[]>([])
  // 파싱 결과는 더 이상 JSON으로 받지 않음
  
  // ==========================================================================
  // 상태 - 그래프 (Map으로 관리하여 ID 기반 덮어쓰기)
  // ==========================================================================
  
  const nodeMap = ref<Map<string, GraphNode>>(new Map())
  const linkMap = ref<Map<string, GraphLink>>(new Map())
  
  // ==========================================================================
  // 상태 - 프로세스
  // ==========================================================================
  
  const isProcessing = ref(false)
  const currentStep = ref('')
  
  // ==========================================================================
  // 상태 - 통합 콘솔 메시지
  // ==========================================================================
  
  const consoleMessages = ref<StreamMessage[]>([])
  
  // ==========================================================================
  // Computed - 그래프 데이터
  // ==========================================================================
  
  const graphData = computed<GraphData>(() => ({
    nodes: Array.from(nodeMap.value.values()),
    links: Array.from(linkMap.value.values())
  }))
  
  // ==========================================================================
  // Computed - 메타데이터
  // ==========================================================================
  
  const metadata = computed<ProjectMetadata>(() => ({
    sourceType: sourceType.value,
    projectName: projectName.value,
    ddl: ddl.value
  }))
  
  const analyzeMeta = computed<BackendRequestMetadata>(() => ({
    strategy: (sourceType.value === 'oracle' || sourceType.value === 'postgresql') ? 'dbms' : 'framework',
    target: sourceType.value,
    projectName: projectName.value
  }))
  
  const isValidConfig = computed(() => 
    Boolean(projectName.value && (uploadedFiles.value.length > 0 || uploadedDdlFiles.value.length > 0))
  )
  
  // ==========================================================================
  // 내부 함수 - 그래프 데이터
  // ==========================================================================
  
  /**
   * 그래프 데이터 업데이트 (점진적 추가)
   */
  function updateGraphData(nodes: Neo4jNode[], relationships: Neo4jRelationship[]): void {
    const newNodeMap = new Map(nodeMap.value)
    const newLinkMap = new Map(linkMap.value)
    
    for (const node of nodes) {
      const converted = convertNeo4jNode(node)
      newNodeMap.set(converted.id, converted)
    }
    
    for (const rel of relationships) {
      const converted = convertNeo4jRelationship(rel)
      newLinkMap.set(converted.id, converted)
    }
    
    nodeMap.value = newNodeMap
    linkMap.value = newLinkMap
  }
  
  /**
   * 그래프 데이터 초기화
   */
  function clearGraphData(): void {
    nodeMap.value = new Map()
    linkMap.value = new Map()
  }
  
  /**
   * 노드와 연결된 관계 삭제
   */
  function deleteNodeAndRelationships(nodeId: string): void {
    const newNodeMap = new Map(nodeMap.value)
    const newLinkMap = new Map(linkMap.value)
    
    // 노드 삭제
    newNodeMap.delete(nodeId)
    
    // 연결된 관계 삭제
    for (const [linkId, link] of linkMap.value.entries()) {
      if (link.source === nodeId || link.target === nodeId) {
        newLinkMap.delete(linkId)
      }
    }
    
    nodeMap.value = newNodeMap
    linkMap.value = newLinkMap
  }
  
  // ==========================================================================
  // 내부 함수 - 통합 콘솔 메시지
  // ==========================================================================
  
  function addMessage(type: MessageType, content: string): void {
    consoleMessages.value.push({ type, content, timestamp: createTimestamp() })
  }
  
  function clearMessages(): void {
    consoleMessages.value = []
  }
  
  
  // ==========================================================================
  // Actions - Setters
  // ==========================================================================
  
  function setProjectName(name: string): void {
    projectName.value = name
  }
  
  function setSourceType(type: SourceType): void {
    sourceType.value = type
  }
  
  function setDdl(d: string[]): void {
    ddl.value = d
  }
  
  // ==========================================================================
  // Actions - 개별 단계 함수
  // ==========================================================================
  
  /**
   * 파일 업로드 (내부용)
   */
  async function doUpload(files: File[], meta: BackendRequestMetadata) {
    currentStep.value = '파일 업로드 중...'
    addMessage('message', `🚀 파일 업로드 시작 (${files.length}개 파일)`)
    
    const result = await antlrApi.uploadFiles(meta, files, sessionStore.getHeaders())
    
    projectName.value = result.projectName
    uploadedFiles.value = result.files
    uploadedDdlFiles.value = result.ddlFiles
    
    addMessage('message', `✅ 업로드 완료: 소스 ${result.files.length}개, DDL ${result.ddlFiles.length}개`)
    return result
  }
  
  /**
   * 파싱 요청 (내부용)
   */
  async function doParse() {
    currentStep.value = '파싱 중...'
    addMessage('message', '🔧 파싱 시작...')
    
    await antlrApi.parseStream(
      analyzeMeta.value,
      sessionStore.getHeaders(),
      (event) => {
        if (event.content) {
          addMessage(event.type === 'error' ? 'error' : 'message', event.content)
        }
      }
    )
    
    addMessage('message', '✅ 파싱 완료')
  }
  
  /**
   * 분석 실행 (내부용)
   */
  async function doAnalyze(): Promise<void> {
    currentStep.value = '분석 진행 중...'
    clearGraphData()
    addMessage('message', '🔍 분석 시작...')
    
    await roboApi.analyze(
      analyzeMeta.value,
      sessionStore.getHeaders(),
      (event) => {
        if (event.content) {
          addMessage(event.type === 'error' ? 'error' : 'message', event.content)
        }
        
        const graph = event.graph
        if (graph?.Nodes || graph?.Relationships) {
          updateGraphData(graph.Nodes || [], graph.Relationships || [])
        }
      }
    )
    
    addMessage('message', '✅ 분석 완료')
  }
  
  /**
   * 인제스천 실행 (내부용)
   */
  async function doIngest(): Promise<void> {
    currentStep.value = '인제스천 중...'
    addMessage('message', '📦 스키마 인제스천 시작...')
    
    const result = await ingestApi.ingest({
      db_name: 'postgres',
      schema: 'rwis',
      clear_existing: false
    })
    
    addMessage('message', `✅ 인제스천 완료: 테이블 ${result.tables_loaded}개, 컬럼 ${result.columns_loaded}개, FK ${result.fks_loaded}개`)
  }
  
  // ==========================================================================
  // Actions - 통합 파이프라인
  // ==========================================================================
  
  /**
   * 파일 업로드 후 파싱 → 분석 → 인제스천 순차 실행
   */
  async function uploadFiles(files: File[], meta: BackendRequestMetadata) {
    isProcessing.value = true
    clearMessages()
    
    try {
      // 1. 업로드
      await doUpload(files, meta)
      
      // 2. 파싱
      await doParse()
      
      // 3. 분석
      await doAnalyze()
      
      // 4. 인제스천
      await doIngest()
      
      currentStep.value = '전체 처리 완료'
      addMessage('message', '🎉 전체 처리가 완료되었습니다!')
    } catch (error) {
      addMessage('error', `❌ 처리 실패: ${error}`)
      currentStep.value = '처리 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  // ==========================================================================
  // Actions - 기타
  // ==========================================================================
  
  /**
   * 모든 데이터 삭제
   */
  async function deleteAllData(): Promise<void> {
    try {
      await roboApi.delete(sessionStore.getHeaders())
      reset()
    } catch (error) {
      console.error('삭제 실패:', error)
      throw error
    }
  }
  
  /**
   * 전체 상태 리셋
   */
  function reset(): void {
    // 메타데이터
    projectName.value = ''
    ddl.value = []
    
    // 파일
    uploadedFiles.value = []
    uploadedDdlFiles.value = []
    
    // 그래프
    clearGraphData()
    
    // 프로세스
    isProcessing.value = false
    currentStep.value = ''
    
    // 메시지
    consoleMessages.value = []
  }
  
  // ==========================================================================
  // Return
  // ==========================================================================
  
  return {
    // State
    projectName,
    sourceType,
    ddl,
    uploadedFiles,
    uploadedDdlFiles,
    graphData,
    isProcessing,
    currentStep,
    consoleMessages,
    
    // Computed (하위호환성: uploadMessages로도 접근 가능)
    uploadMessages: consoleMessages,
    metadata,
    analyzeMeta,
    isValidConfig,
    
    // Actions - Setters
    setProjectName,
    setSourceType,
    setDdl,
    
    // Actions - Messages
    addMessage,
    clearMessages,
    
    // Actions - Pipeline
    uploadFiles,
    
    // Actions - Misc
    deleteAllData,
    deleteNodeAndRelationships,
    reset
  }
})
