<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useProjectStore } from '@/stores/project'
import { storeToRefs } from 'pinia'
import DropZone from './DropZone.vue'
import UploadModal from './UploadModal.vue'
import UploadTree from './UploadTree.vue'
import JsonViewer from './JsonViewer.vue'
import { buildUploadTreeFromUploadedFiles, uniqueFilesByRelPath } from '@/utils/upload'
import { useResize } from '@/composables/useResize'

const projectStore = useProjectStore()
const { 
  uploadedFiles, 
  uploadedDdlFiles,
  isProcessing,
  currentStep,
  projectName,
  uploadMessages
} = storeToRefs(projectStore)

// 콘솔 관련 상태 - 기본값 닫힘
const showConsole = ref(false)

// 콘솔 리사이즈
const { value: consoleHeight, isResizing: isConsoleResizing, startResize: startConsoleResize } = useResize({
  direction: 'vertical',
  initialValue: 200,
  min: 100,
  max: 600,
  fromEnd: true
})

// 상태 타입 계산
const statusType = computed(() => {
  if (!currentStep.value) return 'idle'
  const step = currentStep.value.toLowerCase()
  if (step.includes('에러') || step.includes('실패') || step.includes('error')) return 'error'
  if (step.includes('완료') || step.includes('complete')) return 'success'
  if (isProcessing.value) return 'processing'
  return 'idle'
})

// 시간 포맷
function formatTime(timestamp: string): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString('ko-KR', { 
    hour: '2-digit', minute: '2-digit', second: '2-digit' 
  })
}

// 업로드된 파일을 트리 구조로 표시
const uploadedFileTree = computed(() => 
  buildUploadTreeFromUploadedFiles(uploadedFiles.value, projectName.value)
)
const uploadedDdlTree = computed(() => 
  buildUploadTreeFromUploadedFiles(uploadedDdlFiles.value, projectName.value)
)
const selectedRelPath = ref<string | null>(null)

const showModal = ref(false)
const pendingFiles = ref<File[]>([])
const pendingMetadata = ref<{
  projectName: string
}>({
  projectName: '',
})

// 열린 탭 관리
interface OpenTab {
  id: string
  fileName: string
  content: string
  type: 'file'
}

const openTabs = ref<OpenTab[]>([])
const activeTabId = ref<string | null>(null)

const activeTab = computed(() => 
  openTabs.value.find(t => t.id === activeTabId.value) || null
)

// JSON 파일 여부 확인
const isJsonFile = computed(() => 
  activeTab.value?.fileName.toLowerCase().endsWith('.json') || false
)

const hasUploadedFiles = computed(() => 
  uploadedFiles.value.length > 0 || uploadedDdlFiles.value.length > 0
)

// 드롭존 클릭 시 - 빈 상태로 모달 열기
const handleOpenModal = () => {
  pendingFiles.value = []
  pendingMetadata.value = {
    projectName: '',
  }
  showModal.value = true
}

// 파일 드롭 시 - 파일 분석 후 모달 열기
const handleFilesDrop = (files: File[]) => {
  const metadata = analyzeFileStructure(files)
  pendingFiles.value = files
  pendingMetadata.value = metadata
  showModal.value = true
}

// 디렉토리 구조 분석
const analyzeFileStructure = (files: File[]) => {
  // 자동 구조 인식은 "최상위 공통 폴더 -> projectName"만 수행
  const allFirstFolders = new Set<string>()
  for (const file of files) {
    const parts = (file.webkitRelativePath || file.name).split('/')
    if (parts.length >= 2) allFirstFolders.add(parts[0])
  }
  const hasCommonRoot = allFirstFolders.size === 1
  const projectName = hasCommonRoot ? Array.from(allFirstFolders)[0] : ''
  return {
    projectName
  }
}

// 모달에서 파일 추가 시
const handleAddFiles = (files: File[]) => {
  const merged = uniqueFilesByRelPath([...pendingFiles.value, ...files], pendingMetadata.value.projectName)
  pendingFiles.value = merged
}

// 모달에서 파일 목록 업데이트 시 (삭제/추가 후 동기화)
const handleFilesUpdated = (updatedFiles: File[]) => {
  pendingFiles.value = updatedFiles
}

// 파일 확장자로 소스 타입 자동 감지
const detectSourceType = (files: File[]): 'oracle' | 'postgresql' | 'java' | 'python' | null => {
  const extensions = files.map(f => {
    const name = f.name.toLowerCase()
    if (name.endsWith('.sql')) return 'sql'
    if (name.endsWith('.java')) return 'java'
    if (name.endsWith('.py')) return 'python'
    return 'other'
  })
  
  const hasJava = extensions.includes('java')
  const hasPython = extensions.includes('python')
  const hasSql = extensions.includes('sql')
  
  // Java 파일이 있으면 Java
  if (hasJava) return 'java'
  // Python 파일이 있으면 Python
  if (hasPython) return 'python'
  // SQL 파일만 있으면 DBMS (기본 Oracle)
  if (hasSql && !hasJava && !hasPython) return 'oracle'
  
  return null
}

// 업로드 확인
const handleUploadConfirm = async (metadata: { projectName: string }) => {
  showModal.value = false
  
  if (pendingFiles.value.length === 0) {
    alert('업로드할 파일이 없습니다. 파일을 먼저 추가해주세요.')
    return
  }
  
  // 소스 타입 자동 감지 및 설정
  const detectedSource = detectSourceType(pendingFiles.value)
  if (detectedSource) {
    projectStore.setSourceType(detectedSource)
  }
  
  try {
    const uploadMeta = {
      ...projectStore.analyzeMeta,
      projectName: metadata.projectName
    }
    await projectStore.uploadFiles(pendingFiles.value, uploadMeta)
  } catch (error) {
    alert(`업로드 실패: ${error}`)
  }
}

// 트리에서 파일 선택 (탭으로 열기)
const handleTreeSelect = (relPath: string) => {
  selectedRelPath.value = relPath
  
  // 파일 노드 찾기
  const findFileNode = (node: any, targetRelPath: string): any => {
    if (node.relPath === targetRelPath && node.type === 'file') {
      return node
    }
    for (const child of node.children || []) {
      const found = findFileNode(child, targetRelPath)
      if (found) return found
    }
    return null
  }
  
  const fileNode = findFileNode(uploadedFileTree.value, relPath) || 
                   findFileNode(uploadedDdlTree.value, relPath)
  
  if (!fileNode || !fileNode.fileContent) return
  
  const fileName = fileNode.relPath || fileNode.name
  const tabId = `file-${fileName}`
  
  // 이미 열려있으면 해당 탭으로 이동
  const existing = openTabs.value.find(t => t.id === tabId)
  if (existing) {
    activeTabId.value = tabId
    return
  }
  
  // 새 탭 추가
  openTabs.value.push({
    id: tabId,
    fileName,
    content: fileNode.fileContent,
    type: 'file'
  })
  activeTabId.value = tabId
}

// 탭 닫기
const closeTab = (tabId: string) => {
  const index = openTabs.value.findIndex(t => t.id === tabId)
  if (index === -1) return
  
  openTabs.value.splice(index, 1)
  
  // 활성 탭이 닫히면 다른 탭으로 이동
  if (activeTabId.value === tabId) {
    if (openTabs.value.length > 0) {
      activeTabId.value = openTabs.value[Math.max(0, index - 1)].id
    } else {
      activeTabId.value = null
    }
  }
}

// 뷰어 콘텐츠 ref
const viewerContentRef = ref<HTMLElement>()

// 탭 활성화
const activateTab = (tabId: string) => {
  activeTabId.value = tabId
  // 탭 전환 시 스크롤 맨 위로
  nextTick(() => {
    viewerContentRef.value?.scrollTo(0, 0)
  })
}

</script>

<template>
  <div class="upload-tab">
    <div class="upload-main">
      <!-- 좌측: 드롭존 또는 파일/DDL 목록 -->
      <div class="upload-left">
        <template v-if="!hasUploadedFiles">
          <DropZone 
            @files-drop="handleFilesDrop" 
            @open-modal="handleOpenModal"
          />
          
          <!-- 업로드 가이드 -->
          <div class="upload-guide">
            <div class="guide-header">
              <span class="guide-icon">💡</span>
              <span class="guide-title">사용 가이드</span>
            </div>
            <div class="guide-content">
              <div class="guide-item">
                <span class="guide-step">1</span>
                <div class="guide-text">
                  <span class="guide-text-main">프로젝트 폴더 업로드</span>
                  <span class="guide-text-detail">드래그 앤 드롭 또는 클릭하여 업로드</span>
                </div>
              </div>
              <div class="guide-item">
                <span class="guide-step">2</span>
                <div class="guide-text">
                  <span class="guide-text-main">파싱 실행</span>
                  <span class="guide-text-detail">코드 구조 분석 및 AST 생성</span>
                </div>
              </div>
              <div class="guide-item">
                <span class="guide-step">3</span>
                <div class="guide-text">
                  <span class="guide-text-main">분석 실행</span>
                  <span class="guide-text-detail">소스를 분석하여 그래프로 전환</span>
                </div>
              </div>
            </div>
            <div class="guide-tips">
              <div class="tip-item">
                <span class="tip-label">⚙️ 설정:</span>
                <span class="tip-text">상단에서 소스/타겟 타입 선택, 설정 아이콘에서 노드 제한 및 UML 깊이 조정</span>
              </div>
            </div>
          </div>
        </template>
        
        <!-- 파일 업로드 후: Files/DDL 2영역 분리 -->
        <template v-else>
          <aside class="sidebar">
            <!-- 파일 트리 패널 -->
            <section class="files-panel">
              <div class="panel-header">
                <h3 class="panel-title">📁 파일 ({{ uploadedFiles.length }})</h3>
              </div>
              <UploadTree
                v-if="uploadedFiles.length > 0"
                :root="uploadedFileTree"
                :show-header="false"
                :selected-rel-path="selectedRelPath"
                :enable-dn-d="false"
                :show-remove-button="false"
                @select="handleTreeSelect"
              />
              <div v-else class="empty-section">파일 없음</div>
            </section>
            
            <!-- DDL 패널 -->
            <section class="ddl-panel">
              <div class="panel-header">
                <h3 class="panel-title">🗄️ DDL ({{ uploadedDdlFiles.length }})</h3>
              </div>
              <div class="ddl-content">
                <UploadTree
                  v-if="uploadedDdlFiles.length > 0"
                  :root="uploadedDdlTree"
                  :show-header="false"
                  :selected-rel-path="selectedRelPath"
                  :enable-dn-d="false"
                  :show-remove-button="false"
                  @select="handleTreeSelect"
                />
                <div v-else class="empty-section">DDL 파일 없음</div>
              </div>
            </section>
          </aside>
        </template>
      </div>
      
      <!-- 우측: 탭 형식 파일 뷰어 -->
      <div class="upload-right">
        <!-- 탭 헤더 -->
        <div class="tabs-header" v-if="openTabs.length > 0">
          <div 
            v-for="tab in openTabs" 
            :key="tab.id"
            class="tab-item"
            :class="{ active: activeTabId === tab.id }"
            @click="activateTab(tab.id)"
          >
            <span class="tab-icon">📄</span>
            <span class="tab-name" :title="tab.fileName">{{ tab.fileName }}</span>
            <button class="tab-close" @click.stop="closeTab(tab.id)">×</button>
          </div>
        </div>
        
        <!-- 탭 콘텐츠 -->
        <div class="viewer-content" ref="viewerContentRef" :class="{ 'has-content': activeTab }">
          <template v-if="activeTab">
            <div class="content-wrapper">
              <!-- JSON 파일 -->
              <JsonViewer v-if="isJsonFile" :json="activeTab.content" />
              <pre v-else class="code-viewer"><code>{{ activeTab.content }}</code></pre>
            </div>
          </template>
          <template v-else>
            <div class="empty-state">
              <span class="empty-icon">📂</span>
              <p>파일을 선택하면 내용이 여기에 표시됩니다</p>
            </div>
          </template>
        </div>
      </div>
    </div>
    
    <!-- 플로팅: 콘솔 토글 버튼 (콘솔이 닫혔을 때만 표시) -->
    <button 
      v-if="!showConsole"
      class="console-toggle-btn"
      :class="[statusType]"
      @click="showConsole = !showConsole"
    >
      <span class="status-dot"></span>
      콘솔
      <span class="count" v-if="uploadMessages.length">{{ uploadMessages.length }}</span>
    </button>
    
    <!-- 플로팅 콘솔 -->
    <Transition name="slide-up">
      <div class="floating-console" v-if="showConsole" :style="{ height: `${consoleHeight}px` }">
        <div class="console-header">
          <span>콘솔</span>
          <span class="console-count" v-if="uploadMessages.length">{{ uploadMessages.length }}</span>
        </div>
        <!-- 리사이즈 핸들 -->
        <div 
          class="console-resize-handle"
          :class="{ resizing: isConsoleResizing }"
          @mousedown="startConsoleResize"
        ></div>
        <div class="console-content">
          <div 
            v-for="(msg, idx) in uploadMessages" 
            :key="idx"
            class="log-item"
            :class="msg.type"
          >
            <span class="time">{{ formatTime(msg.timestamp) }}</span>
            <span class="text">{{ msg.content }}</span>
          </div>
          <div class="log-empty" v-if="uploadMessages.length === 0">
            로그가 없습니다
          </div>
        </div>
        <!-- 콘솔 닫기 버튼 (하단 중앙) -->
        <button class="console-close-btn-bottom" @click="showConsole = false">
          <span class="arrow">▼</span>
        </button>
      </div>
    </Transition>
    
    <!-- 업로드 모달 -->
    <UploadModal 
      v-if="showModal"
      :initial-metadata="pendingMetadata"
      :initial-files="pendingFiles"
      @confirm="handleUploadConfirm"
      @cancel="showModal = false"
      @add-files="handleAddFiles"
      @files-updated="handleFilesUpdated"
    />
  </div>
</template>

<style lang="scss" scoped>
.upload-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-md);
  gap: var(--spacing-md);
  overflow: hidden;
  background: #ffffff;
  position: relative;
}

.upload-main {
  flex: 1;
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: var(--spacing-md);
  overflow: hidden;
  min-height: 0;
}

.upload-left {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  overflow: hidden;
  min-height: 0;
  
  .drop-zone {
    flex: 1;
    min-height: 0;
  }
  
  .upload-guide {
    flex: 1;
    min-height: 0;
  }
}

// ============================================================================
// 사이드바 레이아웃 (Files/DDL 2영역 분리)
// ============================================================================

.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.files-panel {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  
  .panel-header {
    flex-shrink: 0;
    padding: 10px 12px;
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
  }
  
  .panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }
  
  :deep(.tree) {
    flex: 1;
    min-height: 0;
    border: none;
    border-radius: 0;
    
    .tree-list {
      overflow: auto;
      flex: 1;
      min-height: 0;
    }
  }
}

.ddl-panel {
  flex: 0 0 180px;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--color-border);
  
  .panel-header {
    flex-shrink: 0;
    padding: 10px 12px;
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
  }
  
  .panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }
  
  .ddl-content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    
    :deep(.tree) {
      border: none;
      border-radius: 0;
      min-height: auto;
      
      .tree-list {
        overflow: visible;
      }
    }
  }
}

.upload-guide {
  padding: 16px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  min-height: 0;
  
  // 커스텀 스크롤바 스타일
  &::-webkit-scrollbar {
    width: 6px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
    
    &:hover {
      background: #94a3b8;
    }
  }
  
  // Firefox
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
  
  .guide-header {
    display: flex;
    align-items: center;
    gap: 6px;
    
    .guide-icon {
      font-size: 14px;
    }
    
    .guide-title {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
    }
  }
  
  .guide-content {
    display: flex;
    flex-direction: column;
    gap: 14px;
    
    .guide-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      
      .guide-step {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: #e5e7eb;
        color: #6b7280;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        flex-shrink: 0;
        margin-top: 1px;
      }
      
      .guide-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 5px;
        
        .guide-text-main {
          font-size: 13px;
          color: #374151;
          font-weight: 600;
        }
        
        .guide-text-detail {
          font-size: 11px;
          color: #6b7280;
          line-height: 1.4;
        }
      }
    }
  }
  
  .guide-tips {
    padding-top: 12px;
    margin-top: 12px;
    border-top: 1px solid #e5e7eb;
    
    .tip-item {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      font-size: 11px;
      color: #6b7280;
      line-height: 1.5;
      
      .tip-label {
        font-weight: 600;
        color: #4b5563;
        flex-shrink: 0;
      }
      
      .tip-text {
        flex: 1;
      }
    }
  }
}

.file-lists {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  overflow-y: auto;
}

.file-section {
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
  margin: 0;
  
  .icon {
    font-size: 16px;
  }
}

.btn-add {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3B82F6;
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  
  &:hover {
    background: #2563EB;
  }
  
  &:active {
    background: #1D4ED8;
  }
}

.btn-add-sm {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: #3B82F6;
    border-color: #3B82F6;
    color: white;
  }
  
  &:active {
    background: #2563EB;
    border-color: #2563EB;
  }
}

.file-count {
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  padding: 2px 6px;
  border-radius: 10px;
}

.empty-section {
  font-size: 12px;
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--spacing-md);
}


.upload-right {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  overflow: hidden;
  min-height: 0;
  height: 100%;
}

.tabs-header {
  display: flex;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  max-width: 100%;
  
  // 스크롤바 표시 (연한 색상)
  scrollbar-width: thin;
  scrollbar-color: rgba(150, 150, 150, 0.25) transparent;
  
  &::-webkit-scrollbar {
    height: 4px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(150, 150, 150, 0.25);
    border-radius: 2px;
    
    &:hover {
      background: rgba(150, 150, 150, 0.4);
    }
  }
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-right: 1px solid var(--color-border);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
  background: var(--color-bg-secondary);
  flex-shrink: 0; // 탭이 축소되지 않도록 고정
  min-width: 0; // 텍스트 오버플로우 처리를 위해
  max-width: 200px; // 최대 너비 제한
  
  &:hover {
    background: var(--color-bg-tertiary);
  }
  
  &.active {
    background: var(--color-bg-tertiary);
    border-bottom: 2px solid var(--color-accent-primary);
    margin-bottom: -1px;
    
    .tab-name {
      color: var(--color-accent-primary);
    }
  }
}

.tab-icon {
  font-size: 14px;
}

.tab-name {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0; // 오버플로우 처리를 위한 필수 속성
}

.tab-close {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-text-primary);
  }
}

.viewer-content {
  flex: 1;
  overflow: auto;
  padding: var(--spacing-md);
  min-height: 0;
  background: var(--color-bg-tertiary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  
  &.has-content {
    align-items: flex-start;
    justify-content: flex-start;
  }
  
  // 스크롤바 항상 표시
  &::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 5px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: rgba(100, 100, 100, 0.5);
    border-radius: 5px;
    border: 2px solid transparent;
    background-clip: padding-box;
    
    &:hover {
      background: rgba(100, 100, 100, 0.7);
      background-clip: padding-box;
    }
  }
}

.content-wrapper {
  width: 100%;
  max-width: 100%;
}

.code-viewer {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  width: 100%;
  max-width: 100%;
  
  code {
    color: var(--color-text-primary);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-muted);
  
  .empty-icon {
    font-size: 48px;
    margin-bottom: var(--spacing-md);
    opacity: 0.5;
  }
}

// ============================================================================
// 콘솔 토글 버튼
// ============================================================================

.console-toggle-btn {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
  transition: all 0.15s;
  
  &:hover {
    background: #f9fafb;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  }
  
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #9ca3af;
  }
  
  &.processing .status-dot {
    background: #3b82f6;
    animation: pulse 1.5s infinite;
  }
  
  &.error .status-dot {
    background: #ef4444;
  }
  
  &.success .status-dot {
    background: #22c55e;
  }
  
  .count {
    padding: 2px 6px;
    background: #3b82f6;
    color: white;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
  }
}

// ============================================================================
// 플로팅 콘솔
// ============================================================================

.floating-console {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: #f8fafc;
  border-top: 2px solid #cbd5e1;
  z-index: 90;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  
  .console-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #ffffff;
    border-bottom: 1px solid #e5e7eb;
    font-size: 12px;
    font-weight: 600;
    color: #374151;
    
    .console-count {
      padding: 2px 6px;
      background: #3b82f6;
      color: white;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 600;
    }
  }
  
  .console-close-btn-bottom {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    color: #64748b;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    z-index: 10;
    transition: all 0.15s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
    
    .arrow {
      font-size: 12px;
    }
    
    &:hover {
      background: #f1f5f9;
      color: #1e293b;
      border-color: #94a3b8;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }
  }
  
  .console-resize-handle {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    cursor: row-resize;
    z-index: 1;
    background: transparent;
    transition: background 0.15s;
    
    &:hover {
      background: #cbd5e1;
    }
    
    &.resizing {
      background: #94a3b8;
    }
  }
  
  .console-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    margin-top: 4px;
    font-family: 'Consolas', monospace;
    font-size: 11px;
    background: #ffffff;
    margin-left: 4px;
    margin-right: 4px;
    margin-bottom: 4px;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
  }
  
  .log-item {
    display: flex;
    gap: 10px;
    padding: 3px 0;
    color: #374151;
    
    &.error {
      color: #dc2626;
    }
    
    .time {
      color: #9ca3af;
      flex-shrink: 0;
    }
  }
  
  .log-empty {
    color: #9ca3af;
    text-align: center;
    padding: 16px;
  }
}

// ============================================================================
// 트랜지션
// ============================================================================

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
