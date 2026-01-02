<script setup lang="ts">
/**
 * ConvertTab.vue
 * 전환 탭 - 개선된 UI (밝은 중성 테마)
 */

import { ref, computed, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { storeToRefs } from 'pinia'
import CodeEditor from './CodeEditor.vue'
import FrameworkSteps from './FrameworkSteps.vue'
import type { ConvertedFile, SourceType, ConvertTarget } from '@/types'
import { useResize } from '@/composables/useResize'

const projectStore = useProjectStore()
const { 
  sourceType,
  convertTarget,
  convertedFiles, 
  isProcessing, 
  currentStep,
  convertMessages,
  frameworkSteps
} = storeToRefs(projectStore)

// 소스/타겟 옵션
const sourceOptions: { value: SourceType; label: string; icon: string }[] = [
  { value: 'oracle', label: 'Oracle', icon: '🔶' },
  { value: 'postgresql', label: 'PostgreSQL', icon: '🐘' },
  { value: 'java', label: 'Java', icon: '☕' },
  { value: 'python', label: 'Python', icon: '🐍' }
]

const targetOptions: { value: ConvertTarget; label: string; icon: string }[] = [
  { value: 'java', label: 'Spring Boot', icon: '🍃' },
  { value: 'python', label: 'FastAPI', icon: '⚡' },
  { value: 'oracle', label: 'Oracle', icon: '🔶' },
  { value: 'postgresql', label: 'PostgreSQL', icon: '🐘' }
]

const updateSourceType = (val: SourceType) => {
  projectStore.setSourceType(val)
}

const updateConvertTarget = (val: ConvertTarget) => {
  projectStore.setConvertTarget(val)
}

const selectedFile = ref<string | null>(null)
const showConsole = ref(false)
const showStepsPanel = ref(false)
const expandedFolders = ref<Set<string>>(new Set(['']))

// 파일 탐색기 리사이즈
const { value: explorerWidth, isResizing: isExplorerResizing, startResize: startExplorerResize } = useResize({
  direction: 'horizontal',
  initialValue: 280,
  min: 200,
  max: 600,
  fromEnd: false
})

// 콘솔 리사이즈
const { value: consoleHeight, isResizing: isConsoleResizing, startResize: startConsoleResize } = useResize({
  direction: 'vertical',
  initialValue: 200,
  min: 100,
  max: 600,
  fromEnd: true
})

const showCode = computed(() => convertedFiles.value.length > 0)

const showSteps = computed(() =>
  convertTarget.value === 'java' || convertTarget.value === 'python' || 
  convertTarget.value === 'oracle' || convertTarget.value === 'postgresql'
)

// 로그가 있을 때 자동으로 콘솔 표시
watch(convertMessages, (messages) => {
  if (messages.length > 0 && !showConsole.value) {
    showConsole.value = true
  }
}, { immediate: true })

const statusType = computed(() => {
  if (!currentStep.value) return 'idle'
  const lower = currentStep.value.toLowerCase()
  if (lower.includes('에러') || lower.includes('실패') || lower.includes('error')) return 'error'
  if (lower.includes('완료') || lower.includes('complete')) return 'success'
  if (isProcessing.value) return 'processing'
  return 'idle'
})

const currentFile = computed<ConvertedFile | null>(() => {
  if (!selectedFile.value) return null
  return convertedFiles.value.find(f => f.fileName === selectedFile.value) || null
})

const fileTree = computed(() => {
  const tree: Map<string, ConvertedFile[]> = new Map()
  for (const file of convertedFiles.value) {
    const parts = file.fileName.split('/')
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    if (!tree.has(folder)) tree.set(folder, [])
    tree.get(folder)!.push(file)
  }
  return tree
})

const sortedFolders = computed(() => Array.from(fileTree.value.keys()).sort())

function formatTime(timestamp: string): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getFileLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'java': return 'java'
    case 'sql': return 'sql'
    case 'xml': return 'xml'
    case 'py': return 'python'
    default: return 'plaintext'
  }
}

function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'java': return '☕'
    case 'sql': return '🗄️'
    case 'xml': return '📋'
    case 'py': return '🐍'
    default: return '📄'
  }
}

function getFolderName(path: string): string {
  if (!path) return '/'
  return path.split('/').pop() || '/'
}

function getFileName(fullPath: string): string {
  return fullPath.split('/').pop() || fullPath
}

function toggleFolder(folder: string): void {
  if (expandedFolders.value.has(folder)) {
    expandedFolders.value.delete(folder)
  } else {
    expandedFolders.value.add(folder)
  }
}

function selectFile(fileName: string): void {
  selectedFile.value = fileName
}

async function handleRunConvert(): Promise<void> {
  try {
    await projectStore.runConvert()
  } catch (error) {
    alert(`Convert 실패: ${error}`)
  }
}

async function handleDownload(): Promise<void> {
  try {
    await projectStore.downloadZip()
  } catch (error) {
    alert(`다운로드 실패: ${error}`)
  }
}

watch(convertedFiles, (files) => {
  if (files.length > 0 && !selectedFile.value) {
    selectedFile.value = files[0].fileName
  }
  files.forEach(f => {
    const parts = f.fileName.split('/')
    if (parts.length > 1) {
      let path = ''
      for (let i = 0; i < parts.length - 1; i++) {
        path = path ? `${path}/${parts[i]}` : parts[i]
        expandedFolders.value.add(path)
      }
    }
  })
}, { immediate: true })
</script>

<template>
  <div class="convert-tab">
    <!-- 상단 전환 설정 바 -->
    <div class="convert-header">
      <div class="conversion-flow">
        <span class="flow-label">소스</span>
        <select 
          class="select" 
          :value="sourceType"
          @change="updateSourceType(($event.target as HTMLSelectElement).value as SourceType)"
          title="소스 타입"
        >
          <option 
            v-for="opt in sourceOptions" 
            :key="opt.value" 
            :value="opt.value"
          >
            {{ opt.icon }} {{ opt.label }}
          </option>
        </select>
        
        <span class="flow-arrow">→</span>
        
        <span class="flow-label">타겟</span>
        <select 
          class="select"
          :value="convertTarget"
          @change="updateConvertTarget(($event.target as HTMLSelectElement).value as ConvertTarget)"
          title="타겟 타입"
        >
          <option 
            v-for="opt in targetOptions" 
            :key="opt.value" 
            :value="opt.value"
          >
            {{ opt.icon }} {{ opt.label }}
          </option>
        </select>
      </div>
      
      <div class="header-actions">
        <button class="convert-btn" @click="handleRunConvert" :disabled="isProcessing">
          <span class="btn-icon">⚡</span>
          Convert 실행
        </button>
        <button class="download-btn" @click="handleDownload" :disabled="isProcessing || !showCode">
          <span class="btn-icon">📦</span>
          ZIP 다운로드
        </button>
      </div>
    </div>
    
    <!-- 메인 콘텐츠 -->
    <div class="main-area">
      <!-- 파일 탐색기 -->
      <div class="file-explorer" :style="{ width: `${explorerWidth}px` }">
        <div class="explorer-header">
          <span>파일</span>
          <span class="count">{{ convertedFiles.length }}</span>
        </div>
        
        <div class="explorer-content" v-if="showCode">
          <div v-for="folder in sortedFolders" :key="folder" class="folder-group">
            <div 
              v-if="folder"
              class="folder-item"
              @click="toggleFolder(folder)"
            >
              <span>{{ expandedFolders.has(folder) ? '📂' : '📁' }}</span>
              <span>{{ getFolderName(folder) }}</span>
            </div>
            
            <div class="file-list" v-show="!folder || expandedFolders.has(folder)">
              <div 
                v-for="file in fileTree.get(folder)" 
                :key="file.fileName"
                class="file-item"
                :class="{ active: selectedFile === file.fileName }"
                @click="selectFile(file.fileName)"
              >
                <span class="icon">{{ getFileIcon(file.fileName) }}</span>
                <span class="name">{{ getFileName(file.fileName) }}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div class="explorer-empty" v-else>
          <span>파일 없음</span>
        </div>
        
        <div class="explorer-actions">
          <button @click="handleRunConvert" :disabled="isProcessing">
            Convert
          </button>
          <button @click="handleDownload" :disabled="isProcessing || !showCode">
            📦 ZIP
          </button>
        </div>
      </div>
      
      <!-- 리사이즈 핸들 -->
      <div 
        class="resize-handle"
        :class="{ resizing: isExplorerResizing }"
        @mousedown="startExplorerResize"
      ></div>
      
      <!-- 코드 에디터 영역 -->
      <div class="editor-area">
        <template v-if="currentFile">
          <div class="editor-header">
            <span class="file-tab">
              {{ getFileIcon(currentFile.fileName) }}
              {{ getFileName(currentFile.fileName) }}
            </span>
            <span class="file-path">{{ currentFile.fileName }}</span>
          </div>
          <div class="editor-content">
            <CodeEditor 
              :code="currentFile.code"
              :language="getFileLanguage(currentFile.fileName)"
              :fileName="currentFile.fileName"
            />
          </div>
        </template>
        
        <div class="editor-empty" v-else>
          <div class="empty-content">
            <span class="icon">⚡</span>
            <h3>전환 결과가 없습니다</h3>
            <p>Understanding 완료 후 Converting를 실행하세요</p>
          </div>
        </div>
      </div>
      
      <!-- 플로팅: 단계 패널 토글 (우측) -->
      <button 
        v-if="showSteps && frameworkSteps.length > 0 && !showStepsPanel"
        class="panel-toggle right"
        @click="showStepsPanel = !showStepsPanel"
      >
        ‹
      </button>
    </div>
    
    <!-- 플로팅: 단계 패널 (노드패널처럼 우측 슬라이드) -->
    <Transition name="slide-right">
      <div class="floating-panel right" v-if="showStepsPanel && showSteps">
        <div class="panel-header">
          <span>단계</span>
          <button @click="showStepsPanel = false">›</button>
        </div>
        <div class="panel-body">
          <FrameworkSteps :steps="frameworkSteps" :strategy="convertTarget" />
        </div>
      </div>
    </Transition>
    
    <!-- 플로팅: 콘솔 토글 버튼 (콘솔이 닫혔을 때만 표시) -->
    <button 
      v-if="!showConsole"
      class="console-toggle-btn"
      :class="[statusType]"
      @click="showConsole = !showConsole"
    >
      <span class="dot"></span>
      콘솔
      <span class="count" v-if="convertMessages.length">{{ convertMessages.length }}</span>
    </button>
    
    <Transition name="slide-up">
      <div class="floating-console" v-if="showConsole" :style="{ height: `${consoleHeight}px` }">
        <div class="console-header">
          <span>콘솔</span>
          <span class="console-count" v-if="convertMessages.length">{{ convertMessages.length }}</span>
        </div>
        <!-- 리사이즈 핸들 -->
        <div 
          class="console-resize-handle"
          :class="{ resizing: isConsoleResizing }"
          @mousedown="startConsoleResize"
        ></div>
        <div class="console-content">
          <div 
            v-for="(msg, idx) in convertMessages" 
            :key="idx"
            class="log-item"
            :class="msg.type"
          >
            <span class="time">{{ formatTime(msg.timestamp) }}</span>
            <span class="text">{{ msg.content }}</span>
          </div>
          <div class="log-empty" v-if="convertMessages.length === 0">
            로그가 없습니다
          </div>
        </div>
        <!-- 콘솔 닫기 버튼 (하단 중앙) -->
        <button class="console-close-btn-bottom" @click="showConsole = false">
          <span class="arrow">▼</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
// ============================================================================
// 기본 레이아웃 (밝은 중성 테마)
// ============================================================================

.convert-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: #ffffff;
}

// ============================================================================
// 상단 전환 설정 바
// ============================================================================

.convert-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.conversion-flow {
  display: flex;
  align-items: center;
  gap: 10px;
}

.flow-label {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.select {
  padding: 8px 12px;
  font-size: 13px;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  color: #1e293b;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 140px;
  
  &:hover {
    border-color: #9ca3af;
  }
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
}

.flow-arrow {
  font-size: 16px;
  color: #6b7280;
  font-weight: bold;
  padding: 0 4px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.convert-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover:not(:disabled) {
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    transform: translateY(-1px);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.download-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  background: #ffffff;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover:not(:disabled) {
    background: #f3f4f6;
    border-color: #9ca3af;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-icon {
  font-size: 14px;
}

.main-area {
  flex: 1;
  display: flex;
  position: relative;
}

// ============================================================================
// 파일 탐색기
// ============================================================================

.file-explorer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  border-right: 1px solid #cbd5e1;
}

.explorer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: #f1f5f9;
  border-bottom: 1px solid #cbd5e1;
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
  
  .count {
    padding: 2px 6px;
    background: #e5e7eb;
    border-radius: 8px;
    font-size: 10px;
    color: #6b7280;
  }
}

.explorer-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  font-weight: 500;
  
  &:hover {
    background: #f3f4f6;
  }
}

.file-list {
  padding-left: 10px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  border-radius: 4px;
  margin: 2px 4px;
  
  &:hover {
    background: #f3f4f6;
    color: #374151;
  }
  
  &.active {
    background: #dbeafe;
    color: #1d4ed8;
    font-weight: 600;
  }
  
  .icon {
    font-size: 13px;
  }
  
  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.explorer-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 11px;
}

.explorer-actions {
  display: flex;
  gap: 4px;
  padding: 6px;
  background: #f1f5f9;
  border-top: 1px solid #cbd5e1;
  
  button {
    flex: 1;
    padding: 6px;
    font-size: 11px;
    font-weight: 600;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    
    &:hover:not(:disabled) {
      background: #2563eb;
    }
    
    &:last-child {
      background: #f3f4f6;
      color: #374151;
      
      &:hover:not(:disabled) {
        background: #e5e7eb;
      }
    }
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

// ============================================================================
// 리사이즈 핸들 공통 스타일
// ============================================================================

@mixin resize-handle-base {
  background: transparent;
  transition: background 0.15s;
  z-index: 10;
  
  &:hover {
    background: #cbd5e1;
  }
  
  &.resizing {
    background: #94a3b8;
  }
}

// ============================================================================
// 리사이즈 핸들
// ============================================================================

.resize-handle {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  @include resize-handle-base;
}

// ============================================================================
// 에디터 영역
// ============================================================================

.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.editor-header {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  background: #f1f5f9;
  border-bottom: 1px solid #cbd5e1;
  
  .file-tab {
    padding: 5px 10px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    font-size: 12px;
    font-weight: 600;
    color: #1e293b;
  }
  
  .file-path {
    margin-left: auto;
    font-size: 10px;
    color: #9ca3af;
  }
}

.editor-content {
  flex: 1;
  overflow: hidden;
}

.editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  
  .empty-content {
    text-align: center;
    
    .icon {
      font-size: 40px;
      display: block;
      margin-bottom: 12px;
      opacity: 0.4;
    }
    
    h3 {
      font-size: 15px;
      color: #374151;
      margin-bottom: 6px;
      font-weight: 600;
    }
    
    p {
      font-size: 12px;
      color: #9ca3af;
      margin-bottom: 16px;
    }
    
    button {
      padding: 8px 20px;
      font-size: 12px;
      font-weight: 600;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      
      &:hover:not(:disabled) {
        background: #2563eb;
      }
      
      &:disabled {
        opacity: 0.5;
      }
    }
  }
}

// ============================================================================
// 패널 토글
// ============================================================================

.panel-toggle {
  position: absolute;
  top: 8px;
  width: 32px;
  height: 32px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  font-size: 16px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  z-index: 100;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  
  &.left {
    left: 0;
    border-radius: 0 4px 4px 0;
    border-left: none;
    
    &.open {
      left: 200px;
    }
  }
  
  &.right {
    right: 8px;
    border-radius: 6px;
  }
  
  &:hover {
    background: #f1f5f9;
    color: #1e293b;
    border-color: #94a3b8;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }
}

// ============================================================================
// 플로팅 단계 패널 (노드패널처럼)
// ============================================================================

.floating-panel {
  position: absolute;
  top: 0;
  width: 300px;
  max-height: 100vh;
  min-height: 200px;
  background: #ffffff;
  border-left: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  z-index: 90;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.05);
  
  &.right {
    right: 0;
  }
  
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: #f1f5f9;
    border-bottom: 1px solid #cbd5e1;
    flex-shrink: 0;
    
    span {
      font-size: 12px;
      font-weight: 600;
      color: #374151;
    }
    
    button {
      width: 24px;
      height: 24px;
      background: transparent;
      border: none;
      color: #64748b;
      cursor: pointer;
      border-radius: 4px;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &:hover {
        background: #e5e7eb;
        color: #1e293b;
      }
    }
  }
  
  .panel-body {
    overflow-y: auto;
    padding: 8px;
  }
}

// ============================================================================
// 플로팅 콘솔
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
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  z-index: 100;
  
  &:hover {
    background: #f9fafb;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }
  
  &.open {
    bottom: 120px;
  }
  
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #9ca3af;
  }
  
  &.processing .dot {
    background: #3b82f6;
    animation: pulse 1.5s infinite;
  }
  
  &.error .dot {
    background: #ef4444;
  }
  
  &.success .dot {
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
  
  .arrow {
    font-size: 10px;
    color: #9ca3af;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

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
    @include resize-handle-base;
  }
  
  .console-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    margin-top: 4px;
    margin-left: 4px;
    margin-right: 4px;
    margin-bottom: 4px;
    font-family: 'Consolas', monospace;
    font-size: 11px;
    background: #ffffff;
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

.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.2s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.2s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
