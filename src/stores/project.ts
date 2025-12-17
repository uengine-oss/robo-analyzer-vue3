/**
 * project.ts
 * 프로젝트 상태 관리 스토어
 * 
 * 주요 기능:
 * - 프로젝트 메타데이터 관리
 * - 파일 업로드/파싱
 * - Understanding (그래프 생성)
 * - Convert (코드 변환)
 * - 다이어그램 생성
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  ProjectMetadata,
  BackendRequestMetadata,
  SourceType,
  ConvertTarget,
  SystemInfo, 
  UploadedFile, 
  ParsedFile,
  GraphData,
  GraphNode,
  GraphLink,
  ConvertedFile,
  DiagramState,
  Neo4jNode,
  Neo4jRelationship,
  StreamMessage
} from '@/types'
import { useSessionStore } from './session'
import { antlrApi, backendApi } from '@/services/api'

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
 * 타겟에서 백엔드 strategy 추론
 */
function getStrategyFromTarget(target: ConvertTarget): Strategy {
  return (target === 'oracle' || target === 'postgresql') ? 'dbms' : 'framework'
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

/**
 * 전략별 초기 단계 생성
 */
function createInitialSteps(strategy: Strategy): { step: number; done: boolean }[] {
  if (strategy === 'dbms') {
    return [{ step: 1, done: false }, { step: 2, done: false }]
  }
  return Array.from({ length: 5 }, (_, i) => ({ step: i + 1, done: false }))
}

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
  const convertTarget = ref<ConvertTarget>('java')
  const systems = ref<SystemInfo[]>([])
  const ddl = ref<string[]>([])
  
  // ==========================================================================
  // 상태 - 파일
  // ==========================================================================
  
  const uploadedSystemFiles = ref<UploadedFile[]>([])
  const uploadedDdlFiles = ref<UploadedFile[]>([])
  const parsedFiles = ref<ParsedFile[]>([])
  
  // ==========================================================================
  // 상태 - 그래프 (Map으로 관리하여 ID 기반 덮어쓰기)
  // ==========================================================================
  
  const nodeMap = ref<Map<string, GraphNode>>(new Map())
  const linkMap = ref<Map<string, GraphLink>>(new Map())
  
  // ==========================================================================
  // 상태 - 변환 결과
  // ==========================================================================
  
  const convertedFiles = ref<ConvertedFile[]>([])
  const diagramState = ref<DiagramState>({
    diagram: '',
    classNames: [],
    history: []
  })
  
  // ==========================================================================
  // 상태 - 프로세스
  // ==========================================================================
  
  const isProcessing = ref(false)
  const currentStep = ref('')
  
  // ==========================================================================
  // 상태 - 메시지 (그래프용 / 전환용 분리)
  // ==========================================================================
  
  const graphMessages = ref<StreamMessage[]>([])
  const convertMessages = ref<StreamMessage[]>([])
  
  // ==========================================================================
  // 상태 - 프레임워크 단계
  // ==========================================================================
  
  const frameworkSteps = ref(createInitialSteps('framework'))
  
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
    convertTarget: convertTarget.value,
    projectName: projectName.value,
    systems: systems.value,
    ddl: ddl.value
  }))
  
  const understandingMeta = computed<BackendRequestMetadata>(() => ({
    strategy: getStrategyFromSource(sourceType.value),
    target: sourceType.value,
    projectName: projectName.value,
    systems: systems.value,
    ddl: ddl.value
  }))
  
  const convertingMeta = computed<BackendRequestMetadata>(() => ({
    strategy: getStrategyFromTarget(convertTarget.value),
    target: convertTarget.value,
    projectName: projectName.value,
    systems: systems.value,
    ddl: ddl.value
  }))
  
  const isValidConfig = computed(() => 
    Boolean(projectName.value && (systems.value.length > 0 || ddl.value.length > 0))
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
  
  // ==========================================================================
  // 내부 함수 - 메시지
  // ==========================================================================
  
  function addGraphMessage(type: MessageType, content: string): void {
    graphMessages.value.push({ type, content, timestamp: createTimestamp() })
  }
  
  function addConvertMessage(type: MessageType, content: string): void {
    convertMessages.value.push({ type, content, timestamp: createTimestamp() })
  }
  
  function clearGraphMessages(): void {
    graphMessages.value = []
  }
  
  function clearConvertMessages(): void {
    convertMessages.value = []
  }
  
  // ==========================================================================
  // 내부 함수 - 다이어그램
  // ==========================================================================
  
  /**
   * 다이어그램 상태 초기화
   */
  function resetDiagramState(): void {
    diagramState.value = { diagram: '', classNames: [], history: [] }
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
  
  function setConvertTarget(target: ConvertTarget): void {
    convertTarget.value = target
    frameworkSteps.value = createInitialSteps(getStrategyFromTarget(target))
  }
  
  function setSystems(s: SystemInfo[]): void {
    systems.value = s
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
    
    try {
      const result = await antlrApi.uploadFiles(meta, files, sessionStore.getHeaders())
      
      projectName.value = result.projectName
      uploadedSystemFiles.value = result.systemFiles
      uploadedDdlFiles.value = result.ddlFiles
      
      currentStep.value = '업로드 완료'
      return result
    } catch (error) {
      currentStep.value = '업로드 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 파싱 요청
   */
  async function parseFiles() {
    isProcessing.value = true
    currentStep.value = '파싱 중...'
    
    try {
      const result = await antlrApi.parse(understandingMeta.value, sessionStore.getHeaders())
      parsedFiles.value = result.files
      currentStep.value = '파싱 완료'
      return result
    } catch (error) {
      currentStep.value = '파싱 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  // ==========================================================================
  // Actions - Understanding (그래프 생성)
  // ==========================================================================
  
  /**
   * Understanding 실행
   */
  async function runUnderstanding(): Promise<void> {
    isProcessing.value = true
    currentStep.value = 'Understanding 진행 중...'
    
    clearGraphMessages()
    clearGraphData()
    resetDiagramState()
    
    try {
      await backendApi.cypherQuery(
        understandingMeta.value,
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
            currentStep.value = 'Understanding 완료'
          } else if (event.type === 'error') {
            currentStep.value = `에러: ${event.content}`
          }
        }
      )
    } catch (error) {
      currentStep.value = 'Understanding 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  // ==========================================================================
  // Actions - Convert (코드 변환)
  // ==========================================================================
  
  /**
   * Convert 실행
   */
  async function runConvert(classNames?: string[]): Promise<void> {
    isProcessing.value = true
    currentStep.value = 'Convert 진행 중...'
    clearConvertMessages()
    
    // 단계 초기화
    frameworkSteps.value = frameworkSteps.value.map(s => ({ ...s, done: false }))
    
    try {
      const payload = classNames 
        ? { ...convertingMeta.value, classNames }
        : convertingMeta.value
        
      await backendApi.convert(payload, sessionStore.getHeaders(), (event) => {
        handleConvertEvent(event, classNames)
      })
    } catch (error) {
      currentStep.value = 'Convert 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * Convert 이벤트 핸들러
   */
  function handleConvertEvent(event: any, classNames?: string[]): void {
    switch (event.type) {
      case 'message':
        addConvertMessage('message', event.content || '')
        break
        
      case 'data':
        if (event.file_type === 'mermaid_diagram') {
          diagramState.value.diagram = event.diagram || ''
          if (classNames) {
            diagramState.value.classNames = classNames
          }
        } else if (event.code && event.file_name) {
          updateConvertedFile(event)
        }
        break
        
      case 'status':
        if (event.step !== undefined) {
          updateFrameworkStep(event.step, event.done || false)
        }
        break
        
      case 'complete':
        currentStep.value = 'Convert 완료'
        break
        
      case 'error':
        currentStep.value = `에러: ${event.content}`
        break
    }
  }
  
  /**
   * 변환된 파일 업데이트
   */
  function updateConvertedFile(event: any): void {
    const file: ConvertedFile = {
      fileName: event.file_name,
      fileType: event.file_type || 'unknown',
      code: event.code,
      folderName: event.folder_name
    }
    
    const existingIndex = convertedFiles.value.findIndex(
      f => f.fileName === event.file_name
    )
    
    if (existingIndex >= 0) {
      convertedFiles.value[existingIndex] = file
    } else {
      convertedFiles.value.push(file)
    }
  }
  
  /**
   * 프레임워크 단계 업데이트
   */
  function updateFrameworkStep(step: number, done: boolean): void {
    const stepIndex = frameworkSteps.value.findIndex(s => s.step === step)
    if (stepIndex >= 0) {
      frameworkSteps.value[stepIndex].done = done
    }
  }
  
  // ==========================================================================
  // Actions - 다이어그램
  // ==========================================================================
  
  /**
   * 다이어그램 생성 (Understanding 단계용)
   */
  async function generateDiagram(classNames: string[]): Promise<void> {
    isProcessing.value = true
    currentStep.value = '다이어그램 생성 중...'
    
    try {
      const payload = {
        strategy: 'architecture' as const,
        target: 'mermaid',
        projectName: projectName.value,
        systems: systems.value,
        ddl: ddl.value,
        classNames
      }
      
      await backendApi.convert(payload as any, sessionStore.getHeaders(), (event) => {
        // 메시지는 그래프 탭 콘솔에 표시
        if (event.content) {
          addGraphMessage(event.type === 'error' ? 'error' : 'message', event.content)
        }
        
        // 다이어그램 데이터 처리
        if (event.type === 'data' && event.file_type === 'mermaid_diagram') {
          diagramState.value.diagram = event.diagram || ''
          diagramState.value.classNames = classNames
        }
        
        // 완료/에러
        if (event.type === 'complete') {
          currentStep.value = '다이어그램 생성 완료'
        } else if (event.type === 'error') {
          currentStep.value = `에러: ${event.content}`
        }
      })
    } catch (error) {
      currentStep.value = '다이어그램 생성 실패'
      throw error
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 다이어그램 확장
   */
  async function expandDiagram(className: string): Promise<void> {
    // 현재 상태 히스토리에 저장
    diagramState.value.history.push({
      diagram: diagramState.value.diagram,
      classNames: [...diagramState.value.classNames]
    })
    
    await generateDiagram([...diagramState.value.classNames, className])
  }
  
  /**
   * 다이어그램 축소 (이전 상태로 복원)
   */
  function collapseDiagram(): void {
    const previous = diagramState.value.history.pop()
    if (previous) {
      diagramState.value.diagram = previous.diagram
      diagramState.value.classNames = previous.classNames
    }
  }
  
  // ==========================================================================
  // Actions - 시스템/파일 관리
  // ==========================================================================
  
  /**
   * 시스템 추가
   */
  function addSystem(system: SystemInfo): void {
    if (!systems.value.find(s => s.name === system.name)) {
      systems.value.push(system)
    }
  }
  
  /**
   * 시스템에 파일 추가
   */
  async function addFilesToSystem(systemName: string, files: File[]): Promise<void> {
    try {
      const meta = {
        ...understandingMeta.value,
        systems: [{ name: systemName, sp: files.map(f => f.name) }]
      }
      
      const result = await antlrApi.uploadFiles(meta, files, sessionStore.getHeaders())
      
      // 파일 목록 업데이트
      for (const file of result.systemFiles) {
        const exists = uploadedSystemFiles.value.find(
          f => f.fileName === file.fileName && f.system === file.system
        )
        if (!exists) {
          uploadedSystemFiles.value.push(file)
        }
      }
      
      // 시스템 파일 목록 업데이트
      const existingSystem = systems.value.find(s => s.name === systemName)
      if (existingSystem) {
        for (const file of files) {
          if (!existingSystem.sp.includes(file.name)) {
            existingSystem.sp.push(file.name)
          }
        }
      }
    } catch (error) {
      console.error('파일 추가 실패:', error)
      throw error
    }
  }
  
  /**
   * DDL에 파일 추가
   */
  async function addFilesToDdl(files: File[]): Promise<void> {
    try {
      const meta = {
        ...understandingMeta.value,
        ddl: files.map(f => f.name)
      }
      
      const result = await antlrApi.uploadFiles(meta, files, sessionStore.getHeaders())
      
      // 파일 목록 업데이트
      for (const file of result.ddlFiles) {
        if (!uploadedDdlFiles.value.find(f => f.fileName === file.fileName)) {
          uploadedDdlFiles.value.push(file)
        }
      }
      
      // DDL 목록 업데이트
      for (const file of files) {
        if (!ddl.value.includes(file.name)) {
          ddl.value.push(file.name)
        }
      }
    } catch (error) {
      console.error('DDL 추가 실패:', error)
      throw error
    }
  }
  
  // ==========================================================================
  // Actions - 기타
  // ==========================================================================
  
  /**
   * ZIP 다운로드
   */
  async function downloadZip(): Promise<void> {
    try {
      await backendApi.downloadJava(projectName.value, sessionStore.getHeaders())
    } catch (error) {
      console.error('다운로드 실패:', error)
      throw error
    }
  }
  
  /**
   * 모든 데이터 삭제
   */
  async function deleteAllData(): Promise<void> {
    try {
      await backendApi.deleteAll(sessionStore.getHeaders())
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
    systems.value = []
    ddl.value = []
    
    // 파일
    uploadedSystemFiles.value = []
    uploadedDdlFiles.value = []
    parsedFiles.value = []
    
    // 그래프
    clearGraphData()
    
    // 변환 결과
    convertedFiles.value = []
    resetDiagramState()
    
    // 프로세스
    isProcessing.value = false
    currentStep.value = ''
    
    // 메시지
    graphMessages.value = []
    convertMessages.value = []
    
    // 단계
    frameworkSteps.value = frameworkSteps.value.map(s => ({ ...s, done: false }))
  }
  
  // ==========================================================================
  // Return
  // ==========================================================================
  
  return {
    // State
    projectName,
    sourceType,
    convertTarget,
    systems,
    ddl,
    uploadedSystemFiles,
    uploadedDdlFiles,
    parsedFiles,
    graphData,
    convertedFiles,
    diagramState,
    isProcessing,
    currentStep,
    graphMessages,
    convertMessages,
    frameworkSteps,
    
    // Computed
    metadata,
    understandingMeta,
    convertingMeta,
    isValidConfig,
    
    // Actions - Setters
    setProjectName,
    setSourceType,
    setConvertTarget,
    setSystems,
    setDdl,
    
    // Actions - Messages
    addGraphMessage,
    addConvertMessage,
    clearGraphMessages,
    clearConvertMessages,
    
    // Actions - File
    uploadFiles,
    parseFiles,
    
    // Actions - Understanding/Convert
    runUnderstanding,
    runConvert,
    
    // Actions - Diagram
    generateDiagram,
    expandDiagram,
    collapseDiagram,
    
    // Actions - System/File Management
    addSystem,
    addFilesToSystem,
    addFilesToDdl,
    
    // Actions - Misc
    downloadZip,
    deleteAllData,
    reset
  }
})
