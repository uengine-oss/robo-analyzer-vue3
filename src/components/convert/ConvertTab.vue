<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { storeToRefs } from 'pinia'
import CodeEditor from './CodeEditor.vue'
import FrameworkSteps from './FrameworkSteps.vue'
import type { ConvertedFile } from '@/types'

const projectStore = useProjectStore()
const { 
  convertTarget,
  convertedFiles, 
  isProcessing, 
  currentStep,
  convertMessages,
  frameworkSteps
} = storeToRefs(projectStore)

const activeFileTab = ref<string | null>(null)
const showConsole = ref(true)
const consoleHeight = ref(180)

const showCode = computed(() => 
  convertedFiles.value.length > 0
)
const showSteps = computed(() =>
  convertTarget.value === 'java' || convertTarget.value === 'python' || 
  convertTarget.value === 'oracle' || convertTarget.value === 'postgresql'
)

// 상태 타입 계산
const statusType = computed(() => {
  if (!currentStep.value) return 'idle'
  const lower = currentStep.value.toLowerCase()
  if (lower.includes('에러') || lower.includes('실패') || lower.includes('error')) return 'error'
  if (lower.includes('완료') || lower.includes('complete')) return 'success'
  if (isProcessing.value) return 'processing'
  return 'idle'
})

// 시간 포맷
const formatTime = (timestamp: string) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const selectedFile = computed<ConvertedFile | null>(() => {
  if (!activeFileTab.value) return null
  return convertedFiles.value.find(f => f.fileName === activeFileTab.value) || null
})

// 첫 번째 파일을 자동 선택
watch(convertedFiles, (files) => {
  if (files.length > 0 && !activeFileTab.value) {
    activeFileTab.value = files[0].fileName
  }
}, { immediate: true })

// Convert 실행
const handleRunConvert = async () => {
  try {
    await projectStore.runConvert()
  } catch (error) {
    alert(`Convert 실패: ${error}`)
  }
}

// ZIP 다운로드
const handleDownload = async () => {
  try {
    await projectStore.downloadZip()
  } catch (error) {
    alert(`다운로드 실패: ${error}`)
  }
}

// 파일 언어 감지
const getFileLanguage = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'java': return 'java'
    case 'sql': return 'sql'
    case 'xml': return 'xml'
    case 'properties': return 'properties'
    case 'json': return 'json'
    case 'py': return 'python'
    default: return 'plaintext'
  }
}

// 파일 아이콘
const getFileIcon = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'java': return '☕'
    case 'sql': return '🗄️'
    case 'xml': return '📋'
    case 'properties': return '⚙️'
    default: return '📄'
  }
}
</script>

<template>
  <div class="convert-tab">
    <!-- 상단: 단계 표시 (있을 경우) -->
    <div class="steps-section" v-if="showSteps">
      <FrameworkSteps 
        :steps="frameworkSteps"
        :strategy="convertTarget"
      />
    </div>
    
    <!-- 메인 컨텐츠: 코드 결과 -->
    <div class="main-content">
      <!-- 코드 파일 탭 -->
      <div class="code-section" v-if="showCode">
        <div class="section-header">
          <h3>📝 생성된 코드 ({{ convertedFiles.length }}개)</h3>
          <button 
            class="btn btn--primary btn--sm"
            @click="handleDownload"
            :disabled="isProcessing"
          >
            📦 ZIP 다운로드
          </button>
        </div>
        
        <div class="file-tabs">
          <button 
            v-for="file in convertedFiles" 
            :key="file.fileName"
            class="file-tab"
            :class="{ active: activeFileTab === file.fileName }"
            @click="activeFileTab = file.fileName"
          >
            <span class="tab-icon">{{ getFileIcon(file.fileName) }}</span>
            <span class="tab-name">{{ file.fileName }}</span>
          </button>
        </div>
        
        <div class="editor-container" v-if="selectedFile">
          <CodeEditor 
            :code="selectedFile.code"
            :language="getFileLanguage(selectedFile.fileName)"
            :fileName="selectedFile.fileName"
          />
        </div>
      </div>
      
      <!-- 빈 상태 -->
      <div class="empty-state" v-if="!showCode">
        <span class="empty-icon">⚡</span>
        <h3>전환 결과가 없습니다</h3>
        <p>Understanding 완료 후 Convert를 실행하세요</p>
        <button 
          class="btn btn--primary"
          @click="handleRunConvert"
          :disabled="isProcessing"
        >
          ▶️ Convert 실행
        </button>
      </div>
    </div>
    
    <!-- 하단 콘솔 패널 -->
    <div 
      class="console-panel"
      :class="{ collapsed: !showConsole }"
      :style="{ height: showConsole ? `${consoleHeight}px` : '44px' }"
    >
      <!-- 콘솔 헤더 -->
      <div class="console-header" @click="showConsole = !showConsole">
        <div class="console-title">
          <span class="console-icon" :class="statusType"></span>
          <span>콘솔</span>
          <span class="message-count" v-if="convertMessages.length">{{ convertMessages.length }}</span>
        </div>
        <div class="console-actions">
          <button class="console-toggle">
            {{ showConsole ? '▼' : '▲' }}
          </button>
        </div>
      </div>
      
      <!-- 콘솔 내용 -->
      <div class="console-body" v-show="showConsole">
        <div class="log-entries">
          <div 
            v-for="(msg, idx) in convertMessages" 
            :key="idx"
            class="log-entry"
            :class="msg.type"
          >
            <span class="log-time">{{ formatTime(msg.timestamp) }}</span>
            <span class="log-icon" v-if="msg.type === 'error'">❌</span>
            <span class="log-icon" v-else-if="msg.type === 'message'">💬</span>
            <span class="log-text">{{ msg.content }}</span>
          </div>
          <div class="log-empty" v-if="convertMessages.length === 0">
            로그가 없습니다
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.convert-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-secondary);
}

// 상단 단계 섹션
.steps-section {
  flex-shrink: 0;
  padding: 8px 16px;
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

// 메인 컨텐츠
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-md);
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  
  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
}

.code-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.file-tabs {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  padding-bottom: var(--spacing-sm);
  flex-shrink: 0;
  
  &::-webkit-scrollbar {
    height: 4px;
  }
}

.file-tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: 12px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
  
  &:hover {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
  }
  
  &.active {
    background: var(--color-accent-primary);
    color: white;
    border-color: var(--color-accent-primary);
  }
  
  .tab-icon {
    font-size: 14px;
  }
  
  .tab-name {
    font-family: var(--font-mono);
  }
}

.editor-container {
  flex: 1;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: var(--spacing-xl);
  border: 1px solid var(--color-border);
  
  .empty-icon {
    font-size: 64px;
    margin-bottom: var(--spacing-lg);
    opacity: 0.5;
  }
  
  h3 {
    font-size: 18px;
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-sm);
  }
  
  p {
    font-size: 14px;
    color: var(--color-text-muted);
    margin-bottom: var(--spacing-lg);
  }
}

// 하단 콘솔 패널 - 밝은 블루 테마
.console-panel {
  flex-shrink: 0;
  background: #eff6ff;
  border-top: 2px solid #bfdbfe;
  display: flex;
  flex-direction: column;
  transition: height 0.25s ease;
  overflow: hidden;
  
  &.collapsed {
    height: 44px !important;
    
    .console-body {
      display: none;
    }
  }
}

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  height: 44px;
  min-height: 44px;
  background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid #bfdbfe;
  
  &:hover {
    background: linear-gradient(135deg, #bfdbfe 0%, #dbeafe 100%);
  }
}

.console-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #1e40af;
  
  .console-icon {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #60a5fa;
    
    &.error {
      background: #ef4444;
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
    }
    &.processing {
      background: #3b82f6;
      box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
      animation: pulse 1.5s infinite;
    }
    &.success {
      background: #22c55e;
      box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
    }
  }
  
  .message-count {
    font-size: 11px;
    padding: 2px 10px;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
    border-radius: 12px;
    font-family: var(--font-mono);
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.25);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.console-actions {
  .console-toggle {
    width: 28px;
    height: 28px;
    background: #ffffff;
    border: 1px solid #93c5fd;
    border-radius: 6px;
    color: #3b82f6;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
    
    &:hover {
      background: #dbeafe;
      color: #1d4ed8;
      border-color: #60a5fa;
    }
  }
}

.console-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

.log-entries {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
}

.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 6px 16px;
  color: #475569;
  transition: background 0.15s;
  
  &:hover {
    background: rgba(0, 0, 0, 0.02);
  }
  
  &.error {
    color: #b91c1c;
    background: rgba(239, 68, 68, 0.08);
    border-left: 3px solid #ef4444;
    
    .log-time {
      color: #dc2626;
    }
  }
  
  &.message {
    color: #1e293b;
  }
  
  .log-time {
    color: #94a3b8;
    flex-shrink: 0;
    min-width: 70px;
  }
  
  .log-icon {
    flex-shrink: 0;
  }
  
  .log-text {
    flex: 1;
    word-break: break-word;
  }
}

.log-empty {
  padding: 32px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}

.btn--sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 12px;
}
</style>
