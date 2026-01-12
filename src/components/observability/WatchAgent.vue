<script setup lang="ts">
/**
 * WatchAgent.vue
 * 감시 에이전트 - Vue Flow 워크플로우 기반 편집기
 * 
 * 구조:
 * - 왼쪽: 에이전트 목록
 * - 중앙: Vue Flow 워크플로우 (3단계 파이프라인)
 * - 오른쪽: 선택된 노드 설정 패널
 * - 하단: 실행 결과 패널
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { VueFlow, useVueFlow, Position, MarkerType } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useSessionStore } from '@/stores/session'
import { 
  IconPlay, 
  IconRefresh,
  IconTrash,
  IconCheck,
  IconCode,
  IconEdit,
  IconPlus,
  IconSettings,
  IconChevronRight
} from '@/components/icons'

import SqlNode from './nodes/SqlNode.vue'
import ConditionNode from './nodes/ConditionNode.vue'
import ActionNode from './nodes/ActionNode.vue'
import ResultTable from '@/components/text2sql/ResultTable.vue'

// 파이프라인 스텝 타입
interface PipelineStep {
  id: string
  type: string  // SQL_QUERY, CONDITION_EVALUATION, PROCESS_START, ALARM
  name: string
  config: Record<string, any>
  position?: { x: number, y: number }
}

// 파이프라인 연결 타입
interface PipelineConnection {
  source: string
  target: string
  condition?: string | null
  label?: string | null
}

// 파이프라인 데이터 타입
interface PipelineData {
  id: string
  name: string
  steps: PipelineStep[]
  connections: PipelineConnection[]
  start_step_id: string
}

// 에이전트 프로필 타입
interface AgentProfile {
  id: string
  name: string
  description: string
  natural_language_query: string
  generated_sql: string
  check_interval_minutes: number
  condition_type: string
  condition_expression: string
  condition_description: string
  process_id: string
  process_name: string
  action_type: 'process' | 'alarm'
  is_active: boolean
  created_at: string
  last_executed_at?: string
  execution_count: number
  last_result?: 'success' | 'triggered' | 'error'
  // 그래프 기반 파이프라인 원본 데이터
  _pipeline?: PipelineData
}

// 실행 로그 타입
interface ExecutionLog {
  id: string
  step: string
  status: 'pending' | 'running' | 'success' | 'error'
  message: string
  data?: any
  duration_ms?: number
  timestamp: string
}

const sessionStore = useSessionStore()
const { fitView, onNodesChange, getNodes, project, addNodes, addEdges, onConnect } = useVueFlow()

// 사용 가능한 노드 타입 정의
const availableNodeTypes = [
  {
    category: 'data',
    label: '데이터',
    nodes: [
      { type: 'SQL_QUERY', nodeType: 'sql', label: 'SQL 쿼리', icon: '📊', color: '#3b82f6', description: 'SQL로 데이터 조회' }
    ]
  },
  {
    category: 'condition',
    label: '조건',
    nodes: [
      { type: 'CONDITION_EVALUATION', nodeType: 'condition', label: '조건 평가', icon: '⚡', color: '#f59e0b', description: '조건식 평가' },
      { type: 'THRESHOLD_CHECK', nodeType: 'condition', label: '임계값 검사', icon: '📈', color: '#f59e0b', description: '값이 임계값 초과 여부' },
      { type: 'TREND_ANALYSIS', nodeType: 'condition', label: '추세 분석', icon: '📉', color: '#f59e0b', description: '지속 상승/하락 감지' }
    ]
  },
  {
    category: 'action',
    label: '조치',
    nodes: [
      { type: 'PROCESS_START', nodeType: 'action', label: '프로세스 실행', icon: '⚙️', color: '#22c55e', description: 'ProcessGPT 프로세스 시작' },
      { type: 'ALARM', nodeType: 'action', label: '알람 발송', icon: '🔔', color: '#ef4444', description: '알림 메시지 발송' },
      { type: 'LOG_RECORD', nodeType: 'action', label: '로그 기록', icon: '📝', color: '#8b5cf6', description: '실행 결과 로그 저장' }
    ]
  }
]

// 연결 규칙 정의
const connectionRules: Record<string, string[]> = {
  'sql': ['condition'],           // SQL 뒤에는 조건만
  'condition': ['action'],        // 조건 뒤에는 조치만
  'action': []                    // 조치 뒤에는 연결 없음 (종료)
}

// 드래그 중인 노드 타입
const draggedNodeType = ref<any>(null)

// 노드 위치 변경 추적
const nodePositions = ref<Record<string, { x: number, y: number }>>({})
const isDragging = ref(false)
const positionSaveTimeout = ref<ReturnType<typeof setTimeout> | null>(null)

// 노드 변경 이벤트 핸들러 (드래그 포함)
onNodesChange((changes) => {
  changes.forEach((change: any) => {
    if (change.type === 'position' && change.position) {
      nodePositions.value[change.id] = {
        x: change.position.x,
        y: change.position.y
      }
      isDragging.value = change.dragging ?? false
      
      // 드래그 종료 시 위치 자동 저장 (debounce)
      if (!change.dragging && selectedProfile.value?._pipeline) {
        if (positionSaveTimeout.value) {
          clearTimeout(positionSaveTimeout.value)
        }
        positionSaveTimeout.value = setTimeout(() => {
          saveNodePositions()
        }, 500)
      }
    }
  })
})

// 현재 노드들의 위치 가져오기
const getCurrentNodePositions = () => {
  const positions: Record<string, { x: number, y: number }> = {}
  const currentNodes = getNodes.value
  currentNodes.forEach((node: any) => {
    positions[node.id] = {
      x: node.position?.x ?? nodePositions.value[node.id]?.x ?? 100,
      y: node.position?.y ?? nodePositions.value[node.id]?.y ?? 150
    }
  })
  return positions
}

// 노드 위치 저장 (기존 파이프라인용)
const saveNodePositions = async () => {
  if (!selectedProfile.value?._pipeline) return
  
  const positions = getCurrentNodePositions()
  const positionUpdates = Object.entries(positions).map(([stepId, pos]) => ({
    step_id: stepId,
    position_x: pos.x,
    position_y: pos.y
  }))
  
  try {
    await fetch(`/api/gateway/agent-scheduler/pipelines/${selectedProfile.value.id}/positions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions: positionUpdates })
    })
    console.log('노드 위치 저장 완료')
  } catch (error) {
    console.error('노드 위치 저장 오류:', error)
  }
}

// Vue Flow 노드 타입 등록
const nodeTypes = {
  sql: SqlNode,
  condition: ConditionNode,
  action: ActionNode
}

// 에이전트 목록
const profiles = ref<AgentProfile[]>([])
const isLoadingProfiles = ref(false)
const selectedProfile = ref<AgentProfile | null>(null)

// 새 에이전트 생성 모드
const isCreatingNew = ref(false)
const isSaving = ref(false)
const saveMessage = ref<{ type: 'success' | 'error', text: string } | null>(null)
const newAgentConfig = ref({
  name: '',
  sql: '',
  question: '',
  conditionType: 'exists',
  conditionExpression: 'rows > 0',
  conditionDescription: '데이터가 존재하면',
  processName: '',
  processId: '',
  actionType: 'process' as 'process' | 'alarm',
  checkIntervalMinutes: 10
})

// 선택된 노드
const selectedNodeId = ref<string | null>(null)
const showNodePanel = ref(false)

// 시뮬레이션 상태
const isSimulating = ref(false)
const currentSimulationStep = ref<string | null>(null)
const simulationLogs = ref<ExecutionLog[]>([])
const showResultPanel = ref(false)

// SQL 실행 결과 데이터 (ResultTable용)
const sqlExecutionResult = ref<{
  row_count: number
  execution_time_ms: number
  columns: string[]
  rows: any[][]
} | null>(null)

// Vue Flow 노드 & 엣지
const nodes = ref<any[]>([])
const edges = ref<any[]>([])

// 활성 프로필 수
const activeProfilesCount = computed(() => profiles.value.filter(p => p.is_active).length)

// 현재 액션 타입 (템플릿에서 사용)
const currentActionType = computed(() => {
  return isCreatingNew.value ? newAgentConfig.value.actionType : selectedProfile.value?.action_type
})

// 워크플로우 노드 생성
const createWorkflowNodes = (profile: AgentProfile | null) => {
  if (!profile && !isCreatingNew.value) {
    nodes.value = []
    edges.value = []
    return
  }

  // 파이프라인 데이터가 있으면 그래프 구조에서 로드
  const pipeline = profile?._pipeline
  
  if (pipeline && pipeline.steps?.length > 0) {
    // 그래프 기반 파이프라인에서 노드 생성
    nodes.value = pipeline.steps.map((step: PipelineStep) => {
      // 스텝 타입에 따라 노드 타입 결정
      let nodeType = 'sql'
      if (step.type === 'CONDITION_EVALUATION') nodeType = 'condition'
      else if (step.type === 'PROCESS_START' || step.type === 'ALARM') nodeType = 'action'
      
      const stepStatus = currentSimulationStep.value === step.id ? 'running' : 
                         simulationLogs.value.find(l => l.step === step.id)?.status || 'idle'
      
      return {
        id: step.id,
        type: nodeType,
        position: step.position || { x: 100, y: 150 },
        data: {
          label: step.name,
          stepType: step.type,
          config: step.config,
          // 기존 호환성을 위한 데이터
          sql: step.config?.sql,
          conditionType: step.config?.condition_type,
          expression: step.config?.condition_expression,
          description: step.config?.condition_description,
          actionType: step.config?.action_type,
          processName: step.config?.process_name,
          status: stepStatus
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left
      }
    })
    
    // 그래프 기반 연결에서 엣지 생성
    edges.value = pipeline.connections.map((conn: PipelineConnection, idx: number) => ({
      id: `e-${conn.source}-${conn.target}-${idx}`,
      source: conn.source,
      target: conn.target,
      label: conn.label || (conn.condition ? `[${conn.condition}]` : ''),
      animated: currentSimulationStep.value === conn.source,
      style: { stroke: '#6366f1', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
    }))
  } else {
    // 기존 프로필 또는 새 에이전트의 경우 기본 3단계 구조
    const config = profile || {
      generated_sql: newAgentConfig.value.sql || 'SELECT * FROM ...',
      condition_type: newAgentConfig.value.conditionType,
      condition_expression: newAgentConfig.value.conditionExpression,
      condition_description: newAgentConfig.value.conditionDescription,
      process_name: newAgentConfig.value.processName,
      action_type: newAgentConfig.value.actionType
    }

    nodes.value = [
      {
        id: 'sql',
        type: 'sql',
        position: { x: 100, y: 150 },
        data: {
          label: 'SQL 쿼리',
          sql: config.generated_sql,
          status: currentSimulationStep.value === 'sql' ? 'running' : 
                  simulationLogs.value.find(l => l.step === 'sql')?.status || 'idle'
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left
      },
      {
        id: 'condition',
        type: 'condition',
        position: { x: 450, y: 150 },
        data: {
          label: '조건 평가',
          conditionType: config.condition_type,
          expression: config.condition_expression,
          description: config.condition_description,
          status: currentSimulationStep.value === 'condition' ? 'running' : 
                  simulationLogs.value.find(l => l.step === 'condition')?.status || 'idle'
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left
      },
      {
        id: 'action',
        type: 'action',
        position: { x: 800, y: 150 },
        data: {
          label: '조치 실행',
          actionType: config.action_type,
          processName: config.process_name,
          status: currentSimulationStep.value === 'action' ? 'running' : 
                  simulationLogs.value.find(l => l.step === 'action')?.status || 'idle'
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left
      }
    ]

    edges.value = [
      {
        id: 'e-sql-condition',
        source: 'sql',
        target: 'condition',
        animated: currentSimulationStep.value === 'sql',
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
      },
      {
        id: 'e-condition-action',
        source: 'condition',
        target: 'action',
        label: '[true]',
        animated: currentSimulationStep.value === 'condition',
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
      }
    ]
  }

  nextTick(() => {
    fitView({ padding: 0.3 })
  })
}

// 프로필 선택
const selectProfile = (profile: AgentProfile) => {
  selectedProfile.value = profile
  isCreatingNew.value = false
  selectedNodeId.value = null
  showNodePanel.value = false
  simulationLogs.value = []
  currentSimulationStep.value = null
  createWorkflowNodes(profile)
}

// 새 에이전트 생성 시작
const startNewAgent = () => {
  selectedProfile.value = null
  isCreatingNew.value = true
  selectedNodeId.value = null
  showNodePanel.value = false
  simulationLogs.value = []
  currentSimulationStep.value = null
  
  // 히스토리에서 전달받은 데이터 확인
  const transferData = sessionStore.consumeWatchAgentTransferData()
  if (transferData) {
    newAgentConfig.value.name = extractAgentName(transferData.question)
    newAgentConfig.value.sql = transferData.sql
    newAgentConfig.value.question = transferData.question
    inferConditionFromQuery(transferData.question)
    inferProcessFromQuery(transferData.question)
  } else {
    // 기본값으로 초기화
    newAgentConfig.value = {
      name: '',
      sql: '',
      question: '',
      conditionType: 'exists',
      conditionExpression: 'rows > 0',
      conditionDescription: '데이터가 존재하면',
      processName: '',
      processId: '',
      actionType: 'process',
      checkIntervalMinutes: 10
    }
  }
  
  createWorkflowNodes(null)
}

// 에이전트 이름 추출
const extractAgentName = (question: string): string => {
  const keywords = ['탁도', '수위', '유량', '온도', '압력', '원수', '정수', '여과']
  for (const keyword of keywords) {
    if (question.includes(keyword)) {
      return `${keyword} 감시 에이전트`
    }
  }
  return question.length > 30 ? question.substring(0, 30) + '...' : question
}

// 쿼리에서 조건 추정
const inferConditionFromQuery = (question: string) => {
  const lowerQ = question.toLowerCase()
  
  if (lowerQ.includes('지속') || lowerQ.includes('상승') || lowerQ.includes('계속')) {
    newAgentConfig.value.conditionType = 'rising'
    newAgentConfig.value.conditionExpression = 'trend == "rising" AND duration >= 10'
    newAgentConfig.value.conditionDescription = '값이 지속적으로 상승하면'
  } else if (lowerQ.includes('이상') || lowerQ.includes('초과')) {
    newAgentConfig.value.conditionType = 'threshold'
    const numMatch = question.match(/(\d+(?:\.\d+)?)\s*(이상|초과)/)
    if (numMatch) {
      newAgentConfig.value.conditionExpression = `value >= ${numMatch[1]}`
      newAgentConfig.value.conditionDescription = `값이 ${numMatch[1]} 이상이면`
    }
  } else {
    newAgentConfig.value.conditionType = 'exists'
    newAgentConfig.value.conditionExpression = 'rows > 0'
    newAgentConfig.value.conditionDescription = '데이터가 존재하면'
  }
}

// 쿼리에서 프로세스 추정
const inferProcessFromQuery = (question: string) => {
  const lowerQ = question.toLowerCase()
  
  if (lowerQ.includes('탁도')) {
    newAgentConfig.value.processName = '원수탁도조치'
    newAgentConfig.value.processId = 'turbidity_action'
  } else if (lowerQ.includes('수위')) {
    newAgentConfig.value.processName = '수위관리조치'
    newAgentConfig.value.processId = 'water_level_action'
  } else if (lowerQ.includes('유량')) {
    newAgentConfig.value.processName = '유량관리조치'
    newAgentConfig.value.processId = 'flow_rate_action'
  }
}

// 노드 클릭 핸들러
const onNodeClick = (event: any) => {
  const nodeId = event.node.id
  selectedNodeId.value = nodeId
  showNodePanel.value = true
}

// 드래그 시작
const onDragStart = (event: DragEvent, nodeTypeInfo: any) => {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/json', JSON.stringify(nodeTypeInfo))
    event.dataTransfer.effectAllowed = 'move'
  }
  draggedNodeType.value = nodeTypeInfo
}

// 드래그 종료
const onDragEnd = () => {
  draggedNodeType.value = null
}

// 드롭 핸들러
const onDrop = (event: DragEvent) => {
  if (!event.dataTransfer || !isCreatingNew.value) return
  
  const data = event.dataTransfer.getData('application/json')
  if (!data) return
  
  const nodeTypeInfo = JSON.parse(data)
  const flowContainer = event.currentTarget as HTMLElement
  const bounds = flowContainer.getBoundingClientRect()
  
  // 마우스 위치를 Vue Flow 좌표로 변환
  const position = project({
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top
  })
  
  // 새 노드 ID 생성
  const newNodeId = `${nodeTypeInfo.nodeType}-${Date.now()}`
  
  // 새 노드 추가
  const newNode = {
    id: newNodeId,
    type: nodeTypeInfo.nodeType,
    position: { x: position.x, y: position.y },
    data: {
      label: nodeTypeInfo.label,
      stepType: nodeTypeInfo.type,
      config: {},
      status: 'idle'
    }
  }
  
  addNodes([newNode])
  
  // 자동 연결: 마지막 노드와 연결 가능하면 연결
  autoConnectNode(newNodeId, nodeTypeInfo.nodeType)
}

// 자동 연결 로직
const autoConnectNode = (newNodeId: string, newNodeType: string) => {
  const currentNodes = getNodes.value
  
  // 새 노드와 연결 가능한 기존 노드 찾기
  for (const existingNode of currentNodes) {
    if (existingNode.id === newNodeId) continue
    
    const existingType = existingNode.type || 'sql'
    const allowedTargets = connectionRules[existingType] || []
    
    // 연결 가능하고 아직 연결되지 않은 경우
    if (allowedTargets.includes(newNodeType)) {
      const hasExistingConnection = edges.value.some(e => e.source === existingNode.id)
      
      if (!hasExistingConnection) {
        addEdges([{
          id: `e-${existingNode.id}-${newNodeId}`,
          source: existingNode.id,
          target: newNodeId,
          style: { stroke: '#6366f1', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
        }])
        break
      }
    }
  }
}

// 드래그 오버 (드롭 허용)
const onDragOver = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

// 연결 검증
onConnect((params) => {
  const sourceNode = getNodes.value.find(n => n.id === params.source)
  const targetNode = getNodes.value.find(n => n.id === params.target)
  
  if (!sourceNode || !targetNode) return
  
  const sourceType = sourceNode.type || 'sql'
  const targetType = targetNode.type || 'sql'
  const allowedTargets = connectionRules[sourceType] || []
  
  if (!allowedTargets.includes(targetType)) {
    alert(`${getNodeTypeLabel(sourceType)}에서 ${getNodeTypeLabel(targetType)}로 연결할 수 없습니다.`)
    return
  }
  
  // 조건 노드의 경우 sourceHandle 확인 (true/false)
  const label = params.sourceHandle === 'false' ? '[false]' : '[true]'
  
  addEdges([{
    id: `e-${params.source}-${params.target}-${Date.now()}`,
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle,
    label: sourceType === 'condition' ? label : undefined,
    style: { stroke: '#6366f1', strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
  }])
})

// 노드 타입 레이블 가져오기
const getNodeTypeLabel = (nodeType: string): string => {
  switch (nodeType) {
    case 'sql': return 'SQL 쿼리'
    case 'condition': return '조건'
    case 'action': return '조치'
    default: return nodeType
  }
}

// 노드 설정 저장
const saveNodeConfig = () => {
  if (isCreatingNew.value) {
    createWorkflowNodes(null)
  } else if (selectedProfile.value) {
    // TODO: API 호출로 프로필 업데이트
    createWorkflowNodes(selectedProfile.value)
  }
  showNodePanel.value = false
}

// 시뮬레이션 실행
const runSimulation = async () => {
  if (!selectedProfile.value && !isCreatingNew.value) return
  
  isSimulating.value = true
  showResultPanel.value = true
  simulationLogs.value = []
  
  const steps = ['sql', 'condition', 'action']
  
  for (const step of steps) {
    currentSimulationStep.value = step
    createWorkflowNodes(selectedProfile.value)
    
    // 로그 추가
    simulationLogs.value.push({
      id: `log-${step}`,
      step,
      status: 'running',
      message: getStepStartMessage(step),
      timestamp: new Date().toISOString()
    })
    
    // 시뮬레이션 딜레이
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // 결과 업데이트
    const result = await simulateStep(step)
    const logIndex = simulationLogs.value.findIndex(l => l.step === step)
    if (logIndex !== -1) {
      simulationLogs.value[logIndex] = {
        ...simulationLogs.value[logIndex],
        status: result.success ? 'success' : 'error',
        message: result.message,
        data: result.data,
        duration_ms: result.duration_ms
      }
    }
    
    // 조건 미충족 시 중단
    if (step === 'condition' && !result.conditionMet) {
      break
    }
  }
  
  currentSimulationStep.value = null
  isSimulating.value = false
  createWorkflowNodes(selectedProfile.value)
}

// 단계별 시작 메시지
const getStepStartMessage = (step: string): string => {
  switch (step) {
    case 'sql': return 'SQL 쿼리 실행 중...'
    case 'condition': return '조건 평가 중...'
    case 'action': return '조치 실행 준비 중...'
    default: return '처리 중...'
  }
}

// 단계별 시뮬레이션
const simulateStep = async (step: string): Promise<any> => {
  // 실제 API 호출 시도
  const profileId = selectedProfile.value?.id
  
  if (profileId && step === 'sql') {
    try {
      const response = await fetch(`/api/gateway/agent-scheduler/profiles/${profileId}/test`, {
        method: 'POST'
      })
      
      if (response.ok) {
        const result = await response.json()
        
        // ResultTable용 데이터 저장
        if (result.sample_data && result.sample_data.length > 0) {
          const columns = Object.keys(result.sample_data[0])
          const rows = result.sample_data.map((row: any) => columns.map(col => row[col]))
          
          sqlExecutionResult.value = {
            row_count: result.row_count,
            execution_time_ms: result.execution_time_ms,
            columns,
            rows
          }
        }
        
        return {
          success: result.success,
          message: result.success 
            ? `쿼리 실행 완료: ${result.row_count}행 반환`
            : `쿼리 실행 실패: ${result.error}`,
          data: result.sample_data,
          duration_ms: result.execution_time_ms
        }
      }
    } catch (error) {
      console.error('API 호출 실패, 데모 데이터 사용:', error)
    }
  }
  
  // 데모 데이터 (API 실패 시 또는 새 에이전트)
  await new Promise(resolve => setTimeout(resolve, 500))
  
  switch (step) {
    case 'sql':
      // 데모 데이터
      const demoData = [
        { plant_id: 'WTP001', turbidity: 2.3, timestamp: '2024-01-15 10:00:00' },
        { plant_id: 'WTP002', turbidity: 3.1, timestamp: '2024-01-15 10:00:00' },
        { plant_id: 'WTP003', turbidity: 1.8, timestamp: '2024-01-15 10:00:00' },
        { plant_id: 'WTP004', turbidity: 2.7, timestamp: '2024-01-15 10:00:00' },
        { plant_id: 'WTP005', turbidity: 4.2, timestamp: '2024-01-15 10:00:00' }
      ]
      
      const columns = Object.keys(demoData[0])
      const rows = demoData.map(row => columns.map(col => (row as any)[col]))
      
      sqlExecutionResult.value = {
        row_count: 5,
        execution_time_ms: 156,
        columns,
        rows
      }
      
      return {
        success: true,
        message: '쿼리 실행 완료: 5행 반환',
        data: demoData,
        duration_ms: 156
      }
    case 'condition':
      return {
        success: true,
        conditionMet: true,
        message: '조건 충족: rows > 0 → 참',
        data: { expression: 'rows > 0', result: true },
        duration_ms: 5
      }
    case 'action':
      return {
        success: true,
        message: '프로세스 실행 대기 (시뮬레이션)',
        data: { process: selectedProfile.value?.process_name || newAgentConfig.value.processName },
        duration_ms: 10
      }
    default:
      return { success: false, message: '알 수 없는 단계' }
  }
}

// 단일 단계 실행
const runSingleStep = async (stepId: string) => {
  currentSimulationStep.value = stepId
  showResultPanel.value = true
  createWorkflowNodes(selectedProfile.value)
  
  simulationLogs.value = [{
    id: `log-${stepId}`,
    step: stepId,
    status: 'running',
    message: getStepStartMessage(stepId),
    timestamp: new Date().toISOString()
  }]
  
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  const result = await simulateStep(stepId)
  simulationLogs.value[0] = {
    ...simulationLogs.value[0],
    status: result.success ? 'success' : 'error',
    message: result.message,
    data: result.data,
    duration_ms: result.duration_ms
  }
  
  currentSimulationStep.value = null
  createWorkflowNodes(selectedProfile.value)
}

// 에이전트 저장 (그래프 기반 파이프라인)
const saveAgent = async () => {
  if (!isCreatingNew.value || !newAgentConfig.value.name || isSaving.value) return
  
  isSaving.value = true
  saveMessage.value = null
  
  // 현재 노드 위치 가져오기
  const positions = getCurrentNodePositions()
  
  // 파이프라인 스텝 구성 (현재 노드 위치 사용)
  const pipelineSteps = [
    {
      id: 'sql',
      type: 'SQL_QUERY',
      name: 'SQL 쿼리',
      config: {
        sql: newAgentConfig.value.sql,
        original_question: newAgentConfig.value.question
      },
      position: positions['sql'] || { x: 100, y: 150 }
    },
    {
      id: 'condition',
      type: 'CONDITION_EVALUATION',
      name: '조건 평가',
      config: {
        condition_type: newAgentConfig.value.conditionType,
        condition_expression: newAgentConfig.value.conditionExpression,
        condition_description: newAgentConfig.value.conditionDescription,
        check_interval_minutes: newAgentConfig.value.checkIntervalMinutes
      },
      position: positions['condition'] || { x: 450, y: 150 }
    },
    {
      id: 'action',
      type: newAgentConfig.value.actionType === 'alarm' ? 'ALARM' : 'PROCESS_START',
      name: newAgentConfig.value.actionType === 'alarm' ? '알람 발송' : '프로세스 실행',
      config: {
        action_type: newAgentConfig.value.actionType,
        process_id: newAgentConfig.value.processId,
        process_name: newAgentConfig.value.processName
      },
      position: positions['action'] || { x: 800, y: 150 }
    }
  ]
  
  // 연결 구성 (기본: sql -> condition -> action)
  const connections = [
    { source: 'sql', target: 'condition', condition: null, label: null },
    { source: 'condition', target: 'action', condition: 'true', label: '조건 충족' }
  ]
  
  try {
    const response = await fetch('/api/gateway/agent-scheduler/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newAgentConfig.value.name,
        description: newAgentConfig.value.question,
        natural_language_query: newAgentConfig.value.question,
        check_interval_minutes: newAgentConfig.value.checkIntervalMinutes,
        steps: pipelineSteps,
        connections: connections,
        start_step_id: 'sql'
      })
    })
    
    if (response.ok) {
      const savedPipeline = await response.json()
      
      // 성공 메시지 표시
      saveMessage.value = {
        type: 'success',
        text: `✅ "${newAgentConfig.value.name}" 에이전트가 Neo4j에 저장되었습니다! (ID: ${savedPipeline.id})`
      }
      
      await refreshProfiles()
      isCreatingNew.value = false
      
      // 저장된 프로필 선택
      const saved = profiles.value.find(p => p.id === savedPipeline.id)
      if (saved) {
        selectProfile(saved)
      }
      
      // 3초 후 메시지 숨김
      setTimeout(() => {
        saveMessage.value = null
      }, 5000)
    } else {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.detail || `저장 실패 (${response.status})`)
    }
  } catch (error: any) {
    console.error('파이프라인 저장 오류:', error)
    
    // 오류 메시지 표시
    saveMessage.value = {
      type: 'error',
      text: `❌ 저장 실패: ${error.message || '서버 연결 오류'}`
    }
    
    // 로컬 저장 (fallback)
    const newProfile: AgentProfile = {
      id: `local-${Date.now()}`,
      name: newAgentConfig.value.name,
      description: newAgentConfig.value.question,
      natural_language_query: newAgentConfig.value.question,
      generated_sql: newAgentConfig.value.sql,
      check_interval_minutes: newAgentConfig.value.checkIntervalMinutes,
      condition_type: newAgentConfig.value.conditionType,
      condition_expression: newAgentConfig.value.conditionExpression,
      condition_description: newAgentConfig.value.conditionDescription,
      process_id: newAgentConfig.value.processId,
      process_name: newAgentConfig.value.processName,
      action_type: newAgentConfig.value.actionType,
      is_active: true,
      created_at: new Date().toISOString(),
      execution_count: 0
    }
    profiles.value.unshift(newProfile)
    
    saveMessage.value = {
      type: 'success',
      text: `⚠️ 서버 저장 실패. 로컬에 임시 저장되었습니다.`
    }
  } finally {
    isSaving.value = false
    isCreatingNew.value = false
    selectProfile(newProfile)
  }
}

// 프로필 목록 조회 (파이프라인 API 우선, 없으면 프로필 API fallback)
const refreshProfiles = async () => {
  isLoadingProfiles.value = true
  try {
    // 먼저 그래프 기반 파이프라인 조회 시도
    let response = await fetch('/api/gateway/agent-scheduler/pipelines')
    
    if (response.ok) {
      const pipelines = await response.json()
      
      // 파이프라인을 프로필 형식으로 변환
      profiles.value = pipelines.map((p: any) => {
        // SQL 스텝에서 SQL 추출
        const sqlStep = p.steps?.find((s: any) => s.type === 'SQL_QUERY')
        const conditionStep = p.steps?.find((s: any) => s.type === 'CONDITION_EVALUATION')
        const actionStep = p.steps?.find((s: any) => s.type === 'PROCESS_START' || s.type === 'ALARM')
        
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          natural_language_query: p.natural_language_query,
          generated_sql: sqlStep?.config?.sql || '',
          check_interval_minutes: p.check_interval_minutes || conditionStep?.config?.check_interval_minutes || 10,
          condition_type: conditionStep?.config?.condition_type || 'exists',
          condition_expression: conditionStep?.config?.condition_expression || 'rows > 0',
          condition_description: conditionStep?.config?.condition_description || '',
          process_id: actionStep?.config?.process_id || '',
          process_name: actionStep?.config?.process_name || '',
          action_type: actionStep?.config?.action_type || 'process',
          is_active: p.is_active,
          created_at: p.created_at,
          last_executed_at: p.last_executed_at,
          execution_count: p.execution_count || 0,
          last_result: p.last_result,
          // 파이프라인 원본 데이터 보관
          _pipeline: p
        }
      })
    } else {
      // Fallback: 기존 프로필 API
      response = await fetch('/api/gateway/agent-scheduler/profiles')
      if (response.ok) {
        profiles.value = await response.json()
      }
    }
  } catch (error) {
    console.error('프로필 조회 오류:', error)
  } finally {
    isLoadingProfiles.value = false
  }
}

// 프로필 삭제 (파이프라인 API 사용)
const deleteProfile = async (id: string, event: Event) => {
  event.stopPropagation()
  if (!confirm('이 에이전트를 삭제하시겠습니까?')) return
  
  try {
    // 먼저 파이프라인 삭제 시도
    let response = await fetch(`/api/gateway/agent-scheduler/pipelines/${id}`, { method: 'DELETE' })
    
    if (!response.ok) {
      // Fallback: 프로필 삭제
      await fetch(`/api/gateway/agent-scheduler/profiles/${id}`, { method: 'DELETE' })
    }
    
    await refreshProfiles()
    if (selectedProfile.value?.id === id) {
      selectedProfile.value = null
      nodes.value = []
      edges.value = []
    }
  } catch (error) {
    profiles.value = profiles.value.filter(p => p.id !== id)
  }
}

// 프로필 활성/비활성 토글
const toggleProfile = async (profile: AgentProfile, event: Event) => {
  event.stopPropagation()
  try {
    // 먼저 파이프라인 토글 시도
    let response = await fetch(`/api/gateway/agent-scheduler/pipelines/${profile.id}/toggle`, { method: 'POST' })
    
    if (!response.ok) {
      // Fallback: 프로필 토글
      await fetch(`/api/gateway/agent-scheduler/profiles/${profile.id}/toggle`, { method: 'POST' })
    }
    
    await refreshProfiles()
  } catch (error) {
    profile.is_active = !profile.is_active
  }
}

// 결과 상태 아이콘
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'running': return '⏳'
    case 'success': return '✅'
    case 'error': return '❌'
    default: return '⚪'
  }
}

// 전달된 데이터 감시 - 탭 전환 후에도 데이터를 감지
watch(() => sessionStore.watchAgentTransferData, (newData) => {
  if (newData) {
    startNewAgent()
  }
}, { immediate: true })

// 초기화
onMounted(() => {
  refreshProfiles()
})

// 선택 변경 감시
watch([selectedProfile, isCreatingNew], () => {
  if (selectedProfile.value) {
    createWorkflowNodes(selectedProfile.value)
  } else if (isCreatingNew.value) {
    createWorkflowNodes(null)
  }
})
</script>

<template>
  <div class="watch-agent-page">
    <!-- 왼쪽: 에이전트 목록 -->
    <aside class="agent-list-panel">
      <div class="panel-header">
        <h2>🤖 감시 에이전트</h2>
        <button class="add-btn" @click="startNewAgent" title="새 에이전트">
          <IconPlus :size="16" />
        </button>
      </div>
      
      <div class="agent-stats" v-if="profiles.length > 0">
        <span class="stat" :class="{ active: activeProfilesCount > 0 }">
          <span class="dot"></span>
          {{ activeProfilesCount }}개 활성
        </span>
      </div>
      
      <div class="agent-list">
        <!-- 새 에이전트 (저장 전 - 점선) -->
        <div
          v-if="isCreatingNew"
          class="agent-item draft selected"
        >
          <div class="agent-header">
            <span class="status-dot draft-dot"></span>
            <span class="agent-name">{{ newAgentConfig.name || '새 에이전트' }}</span>
            <span class="draft-badge">초안</span>
          </div>
          
          <div class="agent-meta">
            <span class="meta-item">⏱️ {{ newAgentConfig.checkIntervalMinutes }}분</span>
            <span class="meta-item draft-hint">💡 저장되지 않음</span>
          </div>
          
          <div class="agent-desc" v-if="newAgentConfig.question">
            {{ newAgentConfig.question.length > 50 ? newAgentConfig.question.substring(0, 50) + '...' : newAgentConfig.question }}
          </div>
        </div>
        
        <div v-if="isLoadingProfiles" class="loading">
          <IconRefresh :size="20" class="spinning" />
        </div>
        
        <div v-else-if="profiles.length === 0 && !isCreatingNew" class="empty">
          <span class="empty-icon">📋</span>
          <p>등록된 에이전트 없음</p>
        </div>
        
        <div
          v-for="profile in profiles"
          :key="profile.id"
          class="agent-item"
          :class="{ 
            selected: selectedProfile?.id === profile.id && !isCreatingNew,
            inactive: !profile.is_active 
          }"
          @click="selectProfile(profile)"
        >
          <div class="agent-header">
            <span class="status-dot" :class="{ active: profile.is_active }"></span>
            <span class="agent-name">{{ profile.name }}</span>
          </div>
          
          <div class="agent-meta">
            <span class="meta-item">⏱️ {{ profile.check_interval_minutes }}분</span>
            <span v-if="profile.execution_count > 0" class="execution-count" :class="profile.last_result">
              {{ profile.execution_count }}회
            </span>
          </div>
          
          <div class="agent-actions">
            <button 
              class="action-btn"
              :class="{ active: profile.is_active }"
              @click="toggleProfile(profile, $event)"
              :title="profile.is_active ? '비활성화' : '활성화'"
            >
              {{ profile.is_active ? '🟢' : '⚪' }}
            </button>
            <button 
              class="action-btn danger"
              @click="deleteProfile(profile.id, $event)"
              title="삭제"
            >
              <IconTrash :size="12" />
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- 중앙: 워크플로우 뷰 -->
    <main class="workflow-panel">
      <!-- 헤더 -->
      <div class="workflow-header" v-if="selectedProfile || isCreatingNew">
        <div class="header-info">
          <h3 v-if="selectedProfile">{{ selectedProfile.name }}</h3>
          <template v-else>
            <input 
              v-model="newAgentConfig.name" 
              type="text" 
              placeholder="에이전트 이름 입력..."
              class="name-input"
            />
          </template>
          <span class="interval-badge">
            ⏱️ {{ selectedProfile?.check_interval_minutes || newAgentConfig.checkIntervalMinutes }}분 주기
          </span>
        </div>
        
        <!-- 저장 성공/실패 메시지 -->
        <div v-if="saveMessage" class="save-message" :class="saveMessage.type">
          {{ saveMessage.text }}
        </div>
        
        <div class="header-actions">
          <button 
            v-if="isCreatingNew"
            class="save-btn"
            @click="saveAgent"
            :disabled="!newAgentConfig.name || isSaving"
          >
            <IconRefresh v-if="isSaving" :size="16" class="spinning" />
            <IconCheck v-else :size="16" />
            {{ isSaving ? '저장 중...' : '저장' }}
          </button>
          <button 
            class="simulate-btn"
            @click="runSimulation"
            :disabled="isSimulating"
          >
            <IconPlay v-if="!isSimulating" :size="16" />
            <IconRefresh v-else :size="16" class="spinning" />
            {{ isSimulating ? '실행 중...' : '시뮬레이션' }}
          </button>
        </div>
      </div>

      <!-- Vue Flow 워크플로우 -->
      <div 
        class="flow-container" 
        v-if="selectedProfile || isCreatingNew"
        @drop="onDrop"
        @dragover="onDragOver"
      >
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          :node-types="nodeTypes"
          :default-viewport="{ zoom: 1 }"
          :min-zoom="0.5"
          :max-zoom="2"
          @node-click="onNodeClick"
          fit-view-on-init
        >
          <Background />
          <Controls />
        </VueFlow>
        
        <!-- 노드 팔레트 (새 에이전트 생성 모드에서만) -->
        <div class="node-palette" v-if="isCreatingNew">
          <div class="palette-header">
            <span>🧩 노드 추가</span>
          </div>
          <div class="palette-content">
            <div 
              v-for="category in availableNodeTypes" 
              :key="category.category"
              class="palette-category"
            >
              <div class="category-label">{{ category.label }}</div>
              <div class="category-nodes">
                <div
                  v-for="nodeType in category.nodes"
                  :key="nodeType.type"
                  class="draggable-node"
                  :style="{ '--node-color': nodeType.color }"
                  draggable="true"
                  @dragstart="onDragStart($event, nodeType)"
                  @dragend="onDragEnd"
                  :title="nodeType.description"
                >
                  <span class="node-icon">{{ nodeType.icon }}</span>
                  <span class="node-label">{{ nodeType.label }}</span>
                </div>
              </div>
            </div>
          </div>
          <div class="palette-hint">
            💡 노드를 워크플로우로 드래그하세요
          </div>
        </div>
        
        <!-- 범례 -->
        <div class="flow-legend">
          <span class="legend-item">
            <span class="legend-dot idle"></span> 대기
          </span>
          <span class="legend-item">
            <span class="legend-dot running"></span> 실행 중
          </span>
          <span class="legend-item">
            <span class="legend-dot success"></span> 완료
          </span>
          <span class="legend-item">
            <span class="legend-dot error"></span> 오류
          </span>
        </div>
        
        <!-- 연결 규칙 안내 -->
        <div class="connection-rules" v-if="isCreatingNew">
          <div class="rule">📊 SQL → ⚡ 조건</div>
          <div class="rule">⚡ 조건 → ⚙️/🔔 조치</div>
        </div>
      </div>
      
      <!-- 빈 상태 -->
      <div class="empty-workflow" v-else>
        <div class="empty-content">
          <span class="empty-icon">🔧</span>
          <h3>감시 에이전트 워크플로우</h3>
          <p>왼쪽에서 에이전트를 선택하거나<br/>새 에이전트를 생성하세요.</p>
          <button class="create-btn" @click="startNewAgent">
            <IconPlus :size="16" />
            새 에이전트 생성
          </button>
        </div>
      </div>

      <!-- 하단: 실행 결과 패널 -->
      <div class="result-panel" :class="{ visible: showResultPanel }" v-if="showResultPanel">
        <div class="result-header">
          <h4>📋 실행 결과</h4>
          <button class="close-btn" @click="showResultPanel = false">✕</button>
        </div>
        <div class="result-content">
          <!-- 실행 로그 -->
          <div class="log-section">
            <div 
              v-for="log in simulationLogs" 
              :key="log.id"
              class="log-entry"
              :class="log.status"
            >
              <span class="log-icon">{{ getStatusIcon(log.status) }}</span>
              <span class="log-step">{{ log.step.toUpperCase() }}</span>
              <span class="log-message">{{ log.message }}</span>
              <span v-if="log.duration_ms" class="log-duration">{{ log.duration_ms }}ms</span>
            </div>
          </div>
          
          <!-- SQL 실행 결과 테이블 -->
          <div v-if="sqlExecutionResult" class="data-result-section">
            <ResultTable :data="sqlExecutionResult" />
          </div>
          
          <div v-if="simulationLogs.length === 0" class="empty-logs">
            시뮬레이션을 실행하면 결과가 여기에 표시됩니다.
          </div>
        </div>
      </div>
    </main>

    <!-- 오른쪽: 노드 설정 패널 -->
    <aside class="node-panel" :class="{ visible: showNodePanel }">
      <div class="panel-header">
        <h3>
          {{ selectedNodeId === 'sql' ? '📊 SQL 쿼리' : 
             selectedNodeId === 'condition' ? '⚡ 조건 설정' : 
             selectedNodeId === 'action' ? '🎯 조치 설정' : '설정' }}
        </h3>
        <button class="close-btn" @click="showNodePanel = false">✕</button>
      </div>
      
      <div class="panel-body">
        <!-- SQL 노드 설정 -->
        <template v-if="selectedNodeId === 'sql'">
          <div class="field-group">
            <label>SQL 쿼리</label>
            <textarea 
              v-if="isCreatingNew"
              v-model="newAgentConfig.sql"
              class="sql-textarea"
            ></textarea>
            <textarea 
              v-else
              :value="selectedProfile?.generated_sql"
              class="sql-textarea"
              readonly
            ></textarea>
          </div>
          
          <div class="field-group">
            <label>원본 질문</label>
            <div class="readonly-text">
              {{ isCreatingNew ? newAgentConfig.question : selectedProfile?.natural_language_query }}
            </div>
          </div>
          
          <button class="run-step-btn" @click="runSingleStep('sql')">
            <IconPlay :size="14" />
            이 단계만 실행
          </button>
        </template>

        <!-- 조건 노드 설정 -->
        <template v-if="selectedNodeId === 'condition'">
          <div class="field-group">
            <label>조건 유형</label>
            <select 
              v-if="isCreatingNew"
              v-model="newAgentConfig.conditionType"
              class="select-input"
            >
              <option value="exists">데이터 존재</option>
              <option value="rising">지속 상승</option>
              <option value="threshold">임계값 초과</option>
              <option value="custom">직접 입력</option>
            </select>
            <select 
              v-else
              :value="selectedProfile?.condition_type"
              class="select-input"
              disabled
            >
              <option value="exists">데이터 존재</option>
              <option value="rising">지속 상승</option>
              <option value="threshold">임계값 초과</option>
              <option value="custom">직접 입력</option>
            </select>
          </div>
          
          <div class="field-group">
            <label>조건식</label>
            <input 
              v-if="isCreatingNew"
              v-model="newAgentConfig.conditionExpression"
              type="text"
              class="text-input"
            />
            <input 
              v-else
              :value="selectedProfile?.condition_expression"
              type="text"
              class="text-input"
              readonly
            />
          </div>
          
          <div class="field-group">
            <label>설명</label>
            <input 
              v-if="isCreatingNew"
              v-model="newAgentConfig.conditionDescription"
              type="text"
              class="text-input"
            />
            <input 
              v-else
              :value="selectedProfile?.condition_description"
              type="text"
              class="text-input"
              readonly
            />
          </div>
          
          <div class="field-group">
            <label>감시 주기</label>
            <div class="interval-input">
              <input 
                v-if="isCreatingNew"
                v-model.number="newAgentConfig.checkIntervalMinutes"
                type="number"
                class="text-input small"
              />
              <input 
                v-else
                :value="selectedProfile?.check_interval_minutes"
                type="number"
                class="text-input small"
                readonly
              />
              <span>분마다</span>
            </div>
          </div>
          
          <button class="run-step-btn" @click="runSingleStep('condition')">
            <IconPlay :size="14" />
            이 단계만 실행
          </button>
        </template>

        <!-- 조치 노드 설정 -->
        <template v-if="selectedNodeId === 'action'">
          <div class="field-group">
            <label>조치 유형</label>
            <div class="action-types">
              <button 
                class="type-btn"
                :class="{ selected: currentActionType === 'process' }"
                @click="isCreatingNew && (newAgentConfig.actionType = 'process')"
                :disabled="!isCreatingNew"
              >
                ⚙️ 프로세스
              </button>
              <button 
                class="type-btn"
                :class="{ selected: currentActionType === 'alarm' }"
                @click="isCreatingNew && (newAgentConfig.actionType = 'alarm')"
                :disabled="!isCreatingNew"
              >
                🔔 알람
              </button>
            </div>
          </div>
          
          <div class="field-group">
            <label>프로세스 이름</label>
            <input 
              v-if="isCreatingNew"
              v-model="newAgentConfig.processName"
              type="text"
              class="text-input"
              placeholder="예: 원수탁도조치"
            />
            <input 
              v-else
              :value="selectedProfile?.process_name"
              type="text"
              class="text-input"
              placeholder="예: 원수탁도조치"
              readonly
            />
          </div>
          
          <button class="run-step-btn" @click="runSingleStep('action')">
            <IconPlay :size="14" />
            이 단계만 실행
          </button>
        </template>
      </div>
      
      <div class="panel-footer" v-if="isCreatingNew">
        <button class="save-btn" @click="saveNodeConfig">
          <IconCheck :size="14" />
          적용
        </button>
      </div>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';

.watch-agent-page {
  display: flex;
  height: 100%;
  background: var(--color-bg);
  overflow: hidden;
}

// 왼쪽: 에이전트 목록
.agent-list-panel {
  width: 280px;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);

    h2 {
      font-size: 16px;
      font-weight: 600;
      color: var(--color-text-bright);
    }

    .add-btn {
      width: 32px;
      height: 32px;
      background: var(--color-accent);
      border: none;
      border-radius: var(--radius-md);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;

      &:hover {
        background: var(--color-accent-hover);
        transform: scale(1.05);
      }
    }
  }

  .agent-stats {
    padding: var(--spacing-sm) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);

    .stat {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--color-text-muted);

      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--color-text-muted);
      }

      &.active {
        color: var(--color-success);

        .dot {
          background: var(--color-success);
          animation: pulse 2s infinite;
        }
      }
    }
  }

  .agent-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-sm);
    padding-left: 24px; // 선택 인디케이터 공간
  }

  .loading, .empty {
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--color-text-muted);

    .empty-icon {
      font-size: 32px;
      display: block;
      margin-bottom: var(--spacing-sm);
    }
  }

  .agent-item {
    padding: var(--spacing-md);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-left: 4px solid transparent;
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-sm);
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;

    &:hover {
      border-color: var(--color-accent);
      border-left-color: var(--color-accent);
      transform: translateX(2px);
    }

    &.selected {
      border-color: var(--color-accent);
      border-left: 4px solid var(--color-accent);
      background: linear-gradient(90deg, rgba(99, 102, 241, 0.12) 0%, rgba(99, 102, 241, 0.03) 100%);
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.15);

      // 선택 표시 인디케이터
      &::before {
        content: '▶';
        position: absolute;
        left: -20px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--color-accent);
        font-size: 10px;
      }

      .agent-name {
        color: var(--color-accent) !important;
      }
    }

    &.inactive {
      opacity: 0.5;
    }

    // 새 에이전트 (초안) - 점선 테두리
    &.draft {
      border: 2px dashed var(--color-accent);
      border-left: 4px solid var(--color-accent);
      background: linear-gradient(90deg, rgba(99, 102, 241, 0.08) 0%, rgba(99, 102, 241, 0.02) 100%);
      animation: draft-pulse 2s ease-in-out infinite;

      &::before {
        content: '✨';
        position: absolute;
        left: -22px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 12px;
      }

      .draft-dot {
        background: var(--color-accent) !important;
        animation: blink 1s infinite;
      }

      .draft-badge {
        padding: 2px 6px;
        background: var(--color-accent);
        color: white;
        border-radius: var(--radius-sm);
        font-size: 10px;
        font-weight: 600;
        margin-left: auto;
      }

      .draft-hint {
        color: var(--color-warning);
        font-style: italic;
      }
    }

    .agent-desc {
      font-size: 11px;
      color: var(--color-text-muted);
      margin-top: 6px;
      font-style: italic;
      line-height: 1.4;
    }

    .agent-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-text-muted);

        &.active {
          background: var(--color-success);
        }
      }

      .agent-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-bright);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .agent-meta {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;

      .meta-item {
        font-size: 11px;
        color: var(--color-text-muted);
      }

      .execution-count {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: var(--radius-sm);

        &.success { background: rgba(34, 197, 94, 0.1); color: var(--color-success); }
        &.triggered { background: rgba(250, 176, 5, 0.1); color: var(--color-warning); }
        &.error { background: rgba(239, 68, 68, 0.1); color: var(--color-error); }
      }
    }

    .agent-actions {
      display: flex;
      gap: 4px;

      .action-btn {
        background: var(--color-bg-secondary);
        border: none;
        padding: 4px 8px;
        border-radius: var(--radius-sm);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: var(--color-bg-tertiary);
        }

        &.danger:hover {
          color: var(--color-error);
        }
      }
    }
  }
}

// 중앙: 워크플로우 뷰
.workflow-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  position: relative;

  .workflow-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-secondary);

    .header-info {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);

      h3 {
        font-size: 18px;
        font-weight: 600;
        color: var(--color-text-bright);
      }

      .name-input {
        font-size: 18px;
        font-weight: 600;
        color: var(--color-text-bright);
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 8px 14px;
        min-width: 300px;

        &:focus {
          outline: none;
          border-color: var(--color-accent);
        }
      }

      .interval-badge {
        padding: 6px 12px;
        background: var(--color-bg);
        border-radius: var(--radius-full);
        font-size: 12px;
        color: var(--color-text-muted);
      }
    }

    // 저장 성공/실패 메시지
    .save-message {
      padding: 8px 16px;
      border-radius: var(--radius-md);
      font-size: 13px;
      font-weight: 500;
      animation: fadeIn 0.3s ease;

      &.success {
        background: rgba(34, 197, 94, 0.15);
        color: var(--color-success);
        border: 1px solid rgba(34, 197, 94, 0.3);
      }

      &.error {
        background: rgba(239, 68, 68, 0.15);
        color: var(--color-error);
        border: 1px solid rgba(239, 68, 68, 0.3);
      }
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .header-actions {
      display: flex;
      gap: var(--spacing-sm);

      button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 18px;
        border: none;
        border-radius: var(--radius-md);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .save-btn {
        background: var(--color-success);
        color: white;

        &:hover:not(:disabled) {
          background: #16a34a;
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .simulate-btn {
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;

        &:hover:not(:disabled) {
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      }
    }
  }

  .flow-container {
    flex: 1;
    position: relative;

    :deep(.vue-flow) {
      background: var(--color-bg);
    }

    :deep(.vue-flow__background) {
      background-color: var(--color-bg);
    }

    :deep(.vue-flow__background pattern) {
      color: var(--color-border);
    }
  }

  .flow-legend {
    position: absolute;
    bottom: 20px;
    left: 20px;
    display: flex;
    gap: var(--spacing-md);
    padding: 8px 16px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 11px;

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--color-text-muted);
    }

    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;

      &.idle { background: var(--color-text-muted); }
      &.running { background: var(--color-accent); animation: pulse 1s infinite; }
      &.success { background: var(--color-success); }
      &.error { background: var(--color-error); }
    }
  }

  // 노드 팔레트
  .node-palette {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 200px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    z-index: 10;

    .palette-header {
      padding: 10px 14px;
      background: var(--color-bg-tertiary);
      border-bottom: 1px solid var(--color-border);
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-bright);
    }

    .palette-content {
      padding: 8px;
      max-height: 350px;
      overflow-y: auto;
    }

    .palette-category {
      margin-bottom: 12px;

      &:last-child {
        margin-bottom: 0;
      }

      .category-label {
        font-size: 10px;
        font-weight: 600;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
        padding: 0 4px;
      }

      .category-nodes {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
    }

    .draggable-node {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-left: 3px solid var(--node-color, var(--color-accent));
      border-radius: var(--radius-md);
      cursor: grab;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--node-color, var(--color-accent));
        background: rgba(99, 102, 241, 0.05);
        transform: translateX(2px);
      }

      &:active {
        cursor: grabbing;
        transform: scale(0.98);
      }

      .node-icon {
        font-size: 14px;
      }

      .node-label {
        font-size: 12px;
        color: var(--color-text);
        font-weight: 500;
      }
    }

    .palette-hint {
      padding: 8px 12px;
      background: rgba(99, 102, 241, 0.05);
      border-top: 1px solid var(--color-border);
      font-size: 10px;
      color: var(--color-text-muted);
      text-align: center;
    }
  }

  // 연결 규칙 안내
  .connection-rules {
    position: absolute;
    bottom: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: 10px;

    .rule {
      color: var(--color-text-muted);
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }

  .empty-workflow {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;

    .empty-content {
      text-align: center;

      .empty-icon {
        font-size: 64px;
        display: block;
        margin-bottom: var(--spacing-lg);
      }

      h3 {
        font-size: 20px;
        font-weight: 600;
        color: var(--color-text-bright);
        margin-bottom: var(--spacing-sm);
      }

      p {
        font-size: 14px;
        color: var(--color-text-muted);
        margin-bottom: var(--spacing-lg);
        line-height: 1.6;
      }

      .create-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 24px;
        background: var(--color-accent);
        border: none;
        border-radius: var(--radius-md);
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: var(--color-accent-hover);
          transform: translateY(-1px);
        }
      }
    }
  }

  // 결과 패널
  .result-panel {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--color-bg-secondary);
    border-top: 1px solid var(--color-border);
    transform: translateY(100%);
    transition: transform 0.3s ease;
    max-height: 350px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    z-index: 50;

    &.visible {
      transform: translateY(0);
    }

    .log-section {
      margin-bottom: 8px;
    }

    .data-result-section {
      margin-top: 8px;
      border-top: 1px solid var(--color-border);
      padding-top: 8px;

      :deep(.result-table) {
        border-radius: var(--radius-md);
        max-height: 180px;
        overflow: auto;
      }

      :deep(.table-wrapper) {
        max-height: 140px;
      }
    }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-sm) var(--spacing-md);
      border-bottom: 1px solid var(--color-border);

      h4 {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-bright);
      }

      .close-btn {
        background: none;
        border: none;
        color: var(--color-text-muted);
        cursor: pointer;
        padding: 4px;

        &:hover {
          color: var(--color-text);
        }
      }
    }

    .result-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-sm);
    }

    .log-entry {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: 8px 12px;
      background: var(--color-bg);
      border-radius: var(--radius-sm);
      margin-bottom: 6px;
      border-left: 3px solid var(--color-text-muted);

      &.running { border-left-color: var(--color-accent); }
      &.success { border-left-color: var(--color-success); }
      &.error { border-left-color: var(--color-error); }

      .log-icon {
        font-size: 14px;
      }

      .log-step {
        font-size: 11px;
        font-weight: 600;
        color: var(--color-text-muted);
        min-width: 80px;
      }

      .log-message {
        flex: 1;
        font-size: 12px;
        color: var(--color-text);
      }

      .log-duration {
        font-size: 11px;
        color: var(--color-text-muted);
        font-family: 'Fira Code', monospace;
      }
    }

    .empty-logs {
      text-align: center;
      padding: var(--spacing-lg);
      color: var(--color-text-muted);
      font-size: 13px;
    }
  }
}

// 오른쪽: 노드 설정 패널
.node-panel {
  width: 360px;
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 100;

  &.visible {
    transform: translateX(0);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);

    h3 {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text-bright);
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: 18px;
      padding: 4px;

      &:hover {
        color: var(--color-text);
      }
    }
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-lg);
  }

  .field-group {
    margin-bottom: var(--spacing-lg);

    label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
  }

  .text-input, .select-input {
    width: 100%;
    padding: 10px 14px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-size: 13px;

    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }

    &:read-only {
      opacity: 0.7;
      cursor: not-allowed;
    }

    &.small {
      width: 100px;
    }
  }

  .sql-textarea {
    width: 100%;
    min-height: 150px;
    padding: 12px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-accent);
    font-family: 'Fira Code', monospace;
    font-size: 12px;
    resize: vertical;

    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }

    &:read-only {
      opacity: 0.7;
      cursor: not-allowed;
    }
  }

  .readonly-text {
    padding: 10px 14px;
    background: var(--color-bg);
    border-radius: var(--radius-md);
    font-size: 13px;
    color: var(--color-text-light);
    font-style: italic;
  }

  .interval-input {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);

    span {
      font-size: 13px;
      color: var(--color-text-muted);
    }
  }

  .action-types {
    display: flex;
    gap: var(--spacing-sm);

    .type-btn {
      flex: 1;
      padding: 10px;
      background: var(--color-bg);
      border: 2px solid var(--color-border);
      border-radius: var(--radius-md);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s ease;

      &.selected {
        border-color: var(--color-accent);
        background: rgba(99, 102, 241, 0.05);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }

  .run-step-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 10px;
    background: var(--color-bg);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
  }

  .panel-footer {
    padding: var(--spacing-md) var(--spacing-lg);
    border-top: 1px solid var(--color-border);

    .save-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      padding: 10px;
      background: var(--color-accent);
      border: none;
      border-radius: var(--radius-md);
      color: white;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;

      &:hover {
        background: var(--color-accent-hover);
      }
    }
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes draft-pulse {
  0%, 100% { 
    border-color: var(--color-accent);
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0);
  }
  50% { 
    border-color: rgba(99, 102, 241, 0.5);
    box-shadow: 0 0 8px 2px rgba(99, 102, 241, 0.15);
  }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
