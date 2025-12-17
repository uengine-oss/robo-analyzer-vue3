<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'
import DropZone from './DropZone.vue'
import UploadModal from './UploadModal.vue'
import FileList from './FileList.vue'
import JsonViewer from './JsonViewer.vue'
import type { SystemInfo } from '@/types'

const projectStore = useProjectStore()
const sessionStore = useSessionStore()
const { 
  uploadedSystemFiles, 
  uploadedDdlFiles,
  parsedFiles,
  isProcessing,
  currentStep
} = storeToRefs(projectStore)

// 파일 추가용 hidden input refs
const systemFileInput = ref<HTMLInputElement>()
const ddlFileInput = ref<HTMLInputElement>()
const currentAddTarget = ref<{ type: 'system' | 'ddl'; systemName?: string } | null>(null)

// 시스템별로 파일 그룹화
const filesBySystem = computed(() => {
  const grouped = new Map<string, typeof uploadedSystemFiles.value>()
  for (const file of uploadedSystemFiles.value) {
    const systemName = file.system || '기타'
    if (!grouped.has(systemName)) {
      grouped.set(systemName, [])
    }
    grouped.get(systemName)!.push(file)
  }
  return grouped
})

// 시스템별로 파싱 결과 그룹화
const parsedFilesBySystem = computed(() => {
  const grouped = new Map<string, typeof parsedFiles.value>()
  for (const file of parsedFiles.value) {
    const systemName = file.system || '기타'
    if (!grouped.has(systemName)) {
      grouped.set(systemName, [])
    }
    grouped.get(systemName)!.push(file)
  }
  return grouped
})

const showModal = ref(false)
const pendingFiles = ref<File[]>([])
const pendingMetadata = ref<{
  projectName: string
  systems: SystemInfo[]
  ddl: string[]
}>({
  projectName: '',
  systems: [],
  ddl: []
})

// 열린 탭 관리
interface OpenTab {
  id: string
  fileName: string
  content: string
  type: 'file' | 'parsed'
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

// 파싱 결과 파일 여부
const isParsedFile = computed(() => 
  activeTab.value?.type === 'parsed'
)

const hasUploadedFiles = computed(() => 
  uploadedSystemFiles.value.length > 0 || uploadedDdlFiles.value.length > 0
)

const hasParsedFiles = computed(() => parsedFiles.value.length > 0)

// 드롭존 클릭 시 - 빈 상태로 모달 열기
const handleOpenModal = () => {
  console.log('Opening modal (click)')
  pendingFiles.value = []
  pendingMetadata.value = {
    projectName: '',
    systems: [],
    ddl: []
  }
  showModal.value = true
}

// 파일 드롭 시 - 파일 분석 후 모달 열기
const handleFilesDrop = (files: File[]) => {
  console.log('handleFilesDrop called with', files.length, 'files')
  
  const metadata = analyzeFileStructure(files)
  console.log('Analyzed metadata:', metadata)
  
  pendingFiles.value = files
  pendingMetadata.value = metadata
  showModal.value = true
}

// 디렉토리 구조 분석
const analyzeFileStructure = (files: File[]) => {
  const result: {
    projectName: string
    systems: SystemInfo[]
    ddl: string[]
  } = {
    projectName: '',
    systems: [],
    ddl: []
  }
  
  // 1. 공통 루트 찾기 (모든 파일이 같은 최상위 폴더에 있는지 확인)
  const allFirstFolders = new Set<string>()
  for (const file of files) {
    const parts = (file.webkitRelativePath || file.name).split('/')
    if (parts.length >= 2) {
      allFirstFolders.add(parts[0])
    }
  }
  
  // 모든 파일이 같은 최상위 폴더에 있으면 그것이 프로젝트 루트
  const hasCommonRoot = allFirstFolders.size === 1
  
  // 공통 루트가 있으면 프로젝트명으로 설정
  if (hasCommonRoot) {
    result.projectName = Array.from(allFirstFolders)[0]
  }
  
  const systemMap = new Map<string, string[]>()
  
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name
    const pathParts = relativePath.split('/')
    const fileName = pathParts[pathParts.length - 1]
    
    // 경로 어딘가에 DDL 폴더가 있는지 확인 (대소문자 무관)
    const hasDdlFolder = pathParts.some(part => part.toLowerCase() === 'ddl')
    
    if (hasDdlFolder) {
      // DDL 폴더 경로에 있는 파일은 DDL로 분류
      result.ddl.push(fileName)
    } else if (pathParts.length >= 2) {
      // 파일의 직접 부모 폴더를 시스템명으로 사용 (파일 바로 위 폴더)
      const parentFolder = pathParts[pathParts.length - 2]
      
      // 부모 폴더가 프로젝트 루트인 경우 (루트 바로 아래 파일)
      if (hasCommonRoot && pathParts.length === 2) {
        // 프로젝트 루트 바로 아래 파일 → 시스템 미지정
        if (fileName.toLowerCase().endsWith('.sql')) {
          result.ddl.push(fileName)
        } else {
          if (!systemMap.has('')) {
            systemMap.set('', [])
          }
          systemMap.get('')!.push(fileName)
        }
      } else {
        // 부모 폴더를 시스템명으로 사용
        if (!systemMap.has(parentFolder)) {
          systemMap.set(parentFolder, [])
        }
        systemMap.get(parentFolder)!.push(fileName)
      }
    } else {
      // 단일 파일 (폴더 없음)
      if (fileName.toLowerCase().endsWith('.sql')) {
        result.ddl.push(fileName)
      } else {
        if (!systemMap.has('')) {
          systemMap.set('', [])
        }
        systemMap.get('')!.push(fileName)
      }
    }
  }
  
  // Map을 배열로 변환
  for (const [name, sp] of systemMap) {
    result.systems.push({ name, sp })
  }
  
  return result
}

// 모달에서 파일 추가 시 (개별 파일 - 재분석 안함)
const handleAddFiles = (files: File[], reanalyze: boolean = false) => {
  console.log('Adding files from modal:', files.length, 'reanalyze:', reanalyze)
  
  // 중복 파일 제외하고 추가
  const existingNames = new Set(pendingFiles.value.map(f => f.name))
  const newFiles = files.filter(f => !existingNames.has(f.name))
  
  pendingFiles.value = [...pendingFiles.value, ...newFiles]
  
  // 폴더 업로드인 경우에만 메타데이터 재분석
  if (reanalyze) {
    pendingMetadata.value = analyzeFileStructure(pendingFiles.value)
  }
}

// 모달에서 파일 삭제 시
const handleRemoveFile = (fileName: string) => {
  console.log('Removing file:', fileName)
  
  // pendingFiles에서 해당 파일 제거
  pendingFiles.value = pendingFiles.value.filter(f => {
    // 파일명만 비교 (경로 포함된 경우도 처리)
    const name = f.webkitRelativePath ? f.webkitRelativePath.split('/').pop() : f.name
    return name !== fileName && !f.webkitRelativePath?.endsWith('/' + fileName)
  })
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
const handleUploadConfirm = async (metadata: {
  projectName: string
  systems: SystemInfo[]
  ddl: string[]
}) => {
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
    // understandingMeta에서 백엔드 호환 형식 가져와서 오버라이드
    const uploadMeta = {
      ...projectStore.understandingMeta,
      projectName: metadata.projectName,
      systems: metadata.systems,
      ddl: metadata.ddl
    }
    await projectStore.uploadFiles(pendingFiles.value, uploadMeta)
    
    projectStore.setSystems(metadata.systems)
    projectStore.setDdl(metadata.ddl)
  } catch (error) {
    alert(`업로드 실패: ${error}`)
  }
}

// 파싱 요청
const handleParse = async () => {
  try {
    await projectStore.parseFiles()
  } catch (error) {
    alert(`파싱 실패: ${error}`)
  }
}

// Understanding 실행
const handleUnderstanding = async () => {
  // 그래프 탭으로 자동 전환
  sessionStore.setActiveTab('graph')
  
  try {
    await projectStore.runUnderstanding()
  } catch (error) {
    alert(`Understanding 실패: ${error}`)
  }
}

// 파일 선택 (탭으로 열기)
const handleFileSelect = (file: { fileName: string; fileContent?: string }) => {
  const tabId = `file-${file.fileName}`
  
  // 이미 열려있으면 해당 탭으로 이동
  const existing = openTabs.value.find(t => t.id === tabId)
  if (existing) {
    activeTabId.value = tabId
    return
  }
  
  // 새 탭 추가
  openTabs.value.push({
    id: tabId,
    fileName: file.fileName,
    content: file.fileContent || '',
    type: 'file'
  })
  activeTabId.value = tabId
}

// 파싱 결과 선택 (탭으로 열기)
const handleParseResultSelect = (file: { fileName: string; analysisResult: string }) => {
  const tabId = `parsed-${file.fileName}`
  
  // 이미 열려있으면 해당 탭으로 이동
  const existing = openTabs.value.find(t => t.id === tabId)
  if (existing) {
    activeTabId.value = tabId
    return
  }
  
  // 새 탭 추가
  openTabs.value.push({
    id: tabId,
    fileName: `${file.fileName} (분석)`,
    content: file.analysisResult,
    type: 'parsed'
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

// 탭 활성화
const activateTab = (tabId: string) => {
  activeTabId.value = tabId
}

// 시스템에 파일 추가
const handleAddFilesToSystem = (systemName: string) => {
  currentAddTarget.value = { type: 'system', systemName }
  systemFileInput.value?.click()
}

// DDL에 파일 추가
const handleAddDdlFiles = () => {
  currentAddTarget.value = { type: 'ddl' }
  ddlFileInput.value?.click()
}

// 새 시스템 추가
const handleAddNewSystem = () => {
  const name = prompt('새 시스템 이름을 입력하세요:')
  if (name && name.trim()) {
    projectStore.addSystem({ name: name.trim(), sp: [] })
  }
}

// 파일 선택 처리
const handleSystemFileChange = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  
  if (files.length > 0 && currentAddTarget.value?.systemName) {
    await projectStore.addFilesToSystem(currentAddTarget.value.systemName, files)
  }
  
  input.value = ''
  currentAddTarget.value = null
}

const handleDdlFileChange = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  
  if (files.length > 0) {
    await projectStore.addFilesToDdl(files)
  }
  
  input.value = ''
  currentAddTarget.value = null
}
</script>

<template>
  <div class="upload-tab">
    <div class="upload-main">
      <!-- 좌측: 드롭존 또는 파일 목록 -->
      <div class="upload-left">
        <template v-if="!hasUploadedFiles">
          <DropZone 
            @files-drop="handleFilesDrop" 
            @open-modal="handleOpenModal"
          />
        </template>
        <template v-else>
          <div class="file-lists">
            <!-- 시스템별 파일 목록 -->
            <div class="file-section">
              <div class="section-header">
                <h3 class="section-title">
                  <span class="icon">📁</span>
                  시스템 ({{ filesBySystem.size }})
                </h3>
                <button class="btn-add" @click="handleAddNewSystem" title="시스템 추가">
                  <span>+</span>
                </button>
              </div>
              
              <!-- 시스템별 그룹 -->
              <div v-for="[systemName, files] in filesBySystem" :key="systemName" class="system-group">
                <div class="system-header">
                  <span class="system-name">{{ systemName }}</span>
                  <span class="file-count">{{ files.length }}</span>
                  <button class="btn-add-sm" @click="handleAddFilesToSystem(systemName)" title="파일 추가">+</button>
                </div>
                <FileList 
                  :files="files" 
                  @select="handleFileSelect"
                />
              </div>
            </div>
            
            <!-- DDL 파일 -->
            <div class="file-section">
              <div class="section-header">
                <h3 class="section-title">
                  <span class="icon">🗄️</span>
                  DDL ({{ uploadedDdlFiles.length }})
                </h3>
                <button class="btn-add" @click="handleAddDdlFiles" title="DDL 추가">
                  <span>+</span>
                </button>
              </div>
              <FileList 
                v-if="uploadedDdlFiles.length > 0"
                :files="uploadedDdlFiles" 
                @select="handleFileSelect"
              />
              <div v-else class="empty-section">DDL 파일 없음</div>
            </div>
            
            <!-- 파싱 결과 (시스템별) -->
            <div class="file-section" v-if="parsedFiles.length > 0">
              <div class="section-header">
                <h3 class="section-title">
                  <span class="icon">📊</span>
                  파싱 결과 ({{ parsedFiles.length }})
                </h3>
              </div>
              
              <!-- 시스템별 그룹 -->
              <div v-for="[systemName, files] in parsedFilesBySystem" :key="'parsed-' + systemName" class="system-group">
                <div class="system-header">
                  <span class="system-name">{{ systemName }}</span>
                  <span class="file-count">{{ files.length }}</span>
                </div>
                <FileList 
                  :files="files.map(f => ({ fileName: f.fileName, system: f.system }))" 
                  @select="file => handleParseResultSelect(parsedFiles.find(p => p.fileName === file.fileName)!)"
                />
              </div>
            </div>
          </div>
          
          <div class="action-buttons">
            <button 
              class="btn btn--primary" 
              @click="handleParse"
              :disabled="isProcessing"
            >
              📄 파싱
            </button>
            <button 
              class="btn btn--primary" 
              @click="handleUnderstanding"
              :disabled="isProcessing || !hasParsedFiles"
            >
              🔗 Understanding
            </button>
          </div>
          
          <!-- Hidden file inputs -->
          <input 
            ref="systemFileInput"
            type="file" 
            multiple
            accept=".sql,.java,.xml,.properties,.json,.py,.txt"
            class="hidden"
            @change="handleSystemFileChange"
          />
          <input 
            ref="ddlFileInput"
            type="file" 
            multiple
            accept=".sql"
            class="hidden"
            @change="handleDdlFileChange"
          />
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
            <span class="tab-icon">{{ tab.type === 'parsed' ? '📊' : '📄' }}</span>
            <span class="tab-name">{{ tab.fileName }}</span>
            <button class="tab-close" @click.stop="closeTab(tab.id)">×</button>
          </div>
        </div>
        
        <!-- 탭 콘텐츠 -->
        <div class="viewer-content">
          <template v-if="activeTab">
            <!-- JSON 또는 파싱 결과 -->
            <JsonViewer v-if="isJsonFile || isParsedFile" :json="activeTab.content" />
            <pre v-else class="code-viewer"><code>{{ activeTab.content }}</code></pre>
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
    
    <!-- 상태 표시 -->
    <div class="status-bar" v-if="currentStep">
      <span 
        class="status-indicator" 
        :class="{ 
          processing: isProcessing,
          error: currentStep.includes('에러') || currentStep.includes('실패')
        }"
      ></span>
      <span>{{ currentStep }}</span>
    </div>
    
    <!-- 업로드 모달 -->
    <UploadModal 
      v-if="showModal"
      :initial-metadata="pendingMetadata"
      :initial-files="pendingFiles"
      @confirm="handleUploadConfirm"
      @cancel="showModal = false"
      @add-files="(files, reanalyze) => handleAddFiles(files, reanalyze)"
      @remove-file="handleRemoveFile"
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
}

.upload-main {
  flex: 1;
  display: grid;
  grid-template-columns: 350px 1fr;
  gap: var(--spacing-md);
  overflow: hidden;
  min-height: 0; // grid가 제대로 shrink 되도록
}

.upload-left {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  overflow: hidden;
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

.system-group {
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-sm);
  background: var(--color-bg-elevated);
  border-radius: var(--radius-sm);
  
  &:last-child {
    margin-bottom: 0;
  }
}

.system-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border);
}

.system-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-accent-primary);
  flex: 1;
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

.hidden {
  display: none;
}

.action-buttons {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.upload-right {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  overflow: hidden;
  min-height: 0; // flex child가 제대로 shrink 되도록
}

.tabs-header {
  display: flex;
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  flex-shrink: 0; // 탭 헤더는 축소되지 않음
  
  // 스크롤바 숨김 (탭은 드래그로 스크롤)
  scrollbar-width: none;
  -ms-overflow-style: none;
  
  &::-webkit-scrollbar {
    display: none;
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
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
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

.code-viewer {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  
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

.status-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-success);
  flex-shrink: 0;
  
  &.processing {
    background: var(--color-accent-primary);
    animation: pulse 1.5s ease-in-out infinite;
  }
  
  &.error {
    background: #ef4444;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
