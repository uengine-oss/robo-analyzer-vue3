/**
 * project.ts
 * 프로젝트 상태 관리 스토어
 * 
 * 주요 기능:
 * - 프로젝트 메타데이터 관리
 * - 파일 업로드/파싱
 * - 분석 (그래프 생성)
 * - 다이어그램 생성
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

// UML 다이어그램은 이제 VueFlow로 로컬에서 처리 (서버 API 요청 제거)
import { useSessionStore } from './session'
import { antlrApi, roboApi } from '@/services/api'

// ============================================================================
// 타입 정의
// ============================================================================

type Strategy = 'dbms' | 'framework'
type MessageType = StreamMessage['type']

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 소스 타입에서 백엔드 strategy 추론
 */
function getStrategyFromSource(source: SourceType): Strategy {
  return (source === 'oracle' || source === 'postgresql') ? 'dbms' : 'framework'
}

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
  // 상태 - 메시지 (업로드용 / 그래프용)
  // ==========================================================================
  
  const uploadMessages = ref<StreamMessage[]>([])
  const graphMessages = ref<StreamMessage[]>([])
  
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
    strategy: getStrategyFromSource(sourceType.value),
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
  // 내부 함수 - 메시지
  // ==========================================================================
  
  function addUploadMessage(type: MessageType, content: string): void {
    uploadMessages.value.push({ type, content, timestamp: createTimestamp() })
  }
  
  function addGraphMessage(type: MessageType, content: string): void {
    graphMessages.value.push({ type, content, timestamp: createTimestamp() })
  }
  
  function clearUploadMessages(): void {
    uploadMessages.value = []
  }
  
  function clearGraphMessages(): void {
    graphMessages.value = []
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
  // Actions - 파일 업로드/파싱
  // ==========================================================================
  
  /**
   * 파일 업로드
   */
  async function uploadFiles(files: File[], meta: BackendRequestMetadata) {
    isProcessing.value = true
    currentStep.value = '파일 업로드 중...'
    addUploadMessage('message', `🚀 파일 업로드 시작 (${files.length}개 파일)`)
    
    try {
      const result = await antlrApi.uploadFiles(meta, files, sessionStore.getHeaders())
      
      projectName.value = result.projectName
      uploadedFiles.value = result.files
      uploadedDdlFiles.value = result.ddlFiles
      
      addUploadMessage('message', `✅ 업로드 완료: 소스 ${result.files.length}개, DDL ${result.ddlFiles.length}개`)
      currentStep.value = '업로드 완료'
      return result
    } catch (error) {
      addUploadMessage('error', `❌ 업로드 실패: ${error}`)
      currentStep.value = '업로드 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 파싱 요청 (스트림 방식 - NDJSON)
   */
  async function parseFiles() {
    isProcessing.value = true
    currentStep.value = '파싱 중...'
    
    try {
      await antlrApi.parseStream(
        analyzeMeta.value,
        sessionStore.getHeaders(),
        (event) => {
          // 메시지 처리
          if (event.content) {
            addUploadMessage(event.type === 'error' ? 'error' : 'message', event.content)
          }
          
          // 완료/에러
          if (event.type === 'complete') {
            currentStep.value = '파싱 완료'
          } else if (event.type === 'error') {
            currentStep.value = '파싱 에러'
          }
        }
      )
    } catch (error) {
      addUploadMessage('error', `❌ 파싱 실패: ${error}`)
      currentStep.value = '파싱 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  // ==========================================================================
  // Actions - 분석 (그래프 생성)
  // ==========================================================================
  
  /**
   * 분석 실행
   */
  async function runAnalysis(): Promise<void> {
    isProcessing.value = true
    currentStep.value = '분석 진행 중...'
    
    clearGraphMessages()
    clearGraphData()
    
    try {
      await roboApi.analyze(
        analyzeMeta.value,
        sessionStore.getHeaders(),
        (event) => {
          // 메시지 처리 (자연어 상태 메시지)
          if (event.content) {
            addGraphMessage(event.type === 'error' ? 'error' : 'message', event.content)
          }
          
          // 그래프 데이터 처리
          const graph = event.graph
          if (graph?.Nodes || graph?.Relationships) {
            updateGraphData(graph.Nodes || [], graph.Relationships || [])
          }
          
          // 완료/에러
          if (event.type === 'complete') {
            currentStep.value = '분석 완료'
          } else if (event.type === 'error') {
            // 상단 상태바에는 상세 에러(JSON 등)를 노출하지 않고,
            // 간단한 메시지만 표시하고 상세 내용은 로그 패널에서만 보여준다.
            currentStep.value = '분석 에러 (상세 내용은 로그 패널 참고)'
          }
        }
      )
    } catch (error) {
      currentStep.value = '분석 실패'
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
    uploadMessages.value = []
    graphMessages.value = []
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
    uploadMessages,
    graphMessages,
    
    // Computed
    metadata,
    analyzeMeta,
    isValidConfig,
    
    // Actions - Setters
    setProjectName,
    setSourceType,
    setDdl,
    
    // Actions - Messages
    addUploadMessage,
    addGraphMessage,
    clearUploadMessages,
    clearGraphMessages,
    
    // Actions - File
    uploadFiles,
    parseFiles,
    
    // Actions - 분석
    runAnalysis,
    
    // Actions - Misc
    deleteAllData,
    deleteNodeAndRelationships,
    reset
  }
})
