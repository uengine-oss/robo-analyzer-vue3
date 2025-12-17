<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { storeToRefs } from 'pinia'
import type { SourceType, ConvertTarget } from '@/types'

const sessionStore = useSessionStore()
const projectStore = useProjectStore()

const { sessionId } = storeToRefs(sessionStore)
const { projectName, isProcessing, currentStep, sourceType, convertTarget } = storeToRefs(projectStore)

const showApiKeyInput = ref(false)
const localApiKey = ref('')

// 소스 타입 옵션
const sourceOptions: { value: SourceType; label: string; icon: string }[] = [
  { value: 'oracle', label: 'Oracle', icon: '🔶' },
  { value: 'postgresql', label: 'PostgreSQL', icon: '🐘' },
  { value: 'java', label: 'Java', icon: '☕' },
  { value: 'python', label: 'Python', icon: '🐍' }
]

// 변환 타겟 옵션
const targetOptions: { value: ConvertTarget; label: string; icon: string }[] = [
  { value: 'java', label: 'Spring Boot', icon: '🍃' },
  { value: 'python', label: 'FastAPI', icon: '⚡' },
  { value: 'oracle', label: 'Oracle', icon: '🔶' },
  { value: 'postgresql', label: 'PostgreSQL', icon: '🐘' }
]

const copySessionId = async () => {
  await navigator.clipboard.writeText(sessionId.value)
}

const handleNewSession = () => {
  if (confirm('새 세션을 시작하시겠습니까? 현재 데이터가 초기화됩니다.')) {
    sessionStore.createNewSession()
    projectStore.reset()
  }
}

const handleDeleteAll = async () => {
  if (confirm('모든 데이터를 삭제하시겠습니까?')) {
    await projectStore.deleteAllData()
  }
}

const updateSourceType = (val: SourceType) => {
  projectStore.setSourceType(val)
}

const updateConvertTarget = (val: ConvertTarget) => {
  projectStore.setConvertTarget(val)
}

const updateApiKey = (val: string) => {
  localApiKey.value = val
  sessionStore.setApiKey(val)
}
</script>

<template>
  <header class="top-toolbar">
    <div class="toolbar-section toolbar-left">
      <button class="logo" @click="sessionStore.goHome()" title="홈으로 이동">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">Legacy Modernizer</span>
      </button>
    </div>
    
    <div class="toolbar-section toolbar-center">
      <!-- 변환 플로우: 소스 → 타겟 (컴팩트) -->
      <div class="conversion-flow">
        <span class="flow-label">소스</span>
        <select 
          class="select select--source" 
          :value="sourceType"
          @change="updateSourceType(($event.target as HTMLSelectElement).value as SourceType)"
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
          class="select select--target"
          :value="convertTarget"
          @change="updateConvertTarget(($event.target as HTMLSelectElement).value as ConvertTarget)"
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
      
      <div class="divider" v-if="projectName"></div>
      
      <div class="project-badge" v-if="projectName">
        <span class="project-icon">📁</span>
        <span class="project-name">{{ projectName }}</span>
      </div>
      
      <div class="progress-indicator" v-if="isProcessing">
        <span class="spinner"></span>
        <span>{{ currentStep }}</span>
      </div>
    </div>
    
    <div class="toolbar-section toolbar-right">
      <div class="session-info">
        <span class="session-label">Session:</span>
        <code class="session-id" @click="copySessionId" title="클릭하여 복사">
          {{ sessionId.slice(0, 8) }}...
        </code>
      </div>
      
      <button 
        class="btn btn--icon" 
        @click="showApiKeyInput = !showApiKeyInput"
        title="API Key 설정"
      >
        🔑
      </button>
      
      <button 
        class="btn btn--secondary" 
        @click="handleNewSession"
        title="새 세션"
      >
        🔄 새 세션
      </button>
      
      <button 
        class="btn btn--danger" 
        @click="handleDeleteAll"
        :disabled="isProcessing"
        title="전체 삭제"
      >
        🗑️
      </button>
    </div>
    
    <!-- API Key Input Panel -->
    <div class="api-key-panel" v-if="showApiKeyInput">
      <input 
        type="password"
        class="input"
        placeholder="OpenAI API Key"
        :value="localApiKey"
        @input="updateApiKey(($event.target as HTMLInputElement).value)"
      />
      <button class="btn btn--secondary" @click="showApiKeyInput = false">닫기</button>
    </div>
  </header>
</template>

<style lang="scss" scoped>
.top-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  position: relative;
  z-index: 100;
}

.toolbar-section {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.toolbar-left {
  flex-shrink: 0;
}

.toolbar-center {
  flex: 1;
  justify-content: center;
  gap: var(--spacing-lg);
}

.conversion-flow {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 4px 10px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.flow-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.flow-label {
  font-size: 10px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 500;
}

.flow-arrow {
  font-size: 14px;
  color: var(--color-accent-primary);
  font-weight: bold;
  margin: 0 2px;
}

.select--source,
.select--target {
  min-width: 110px;
  padding: 4px 8px;
  font-size: 12px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--color-accent-primary);
  }
  
  &:focus {
    outline: none;
    border-color: var(--color-accent-primary);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
}

.divider {
  width: 1px;
  height: 24px;
  background: var(--color-border);
}

.project-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.project-icon {
  font-size: 12px;
}

.toolbar-right {
  flex-shrink: 0;
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-weight: 700;
  font-size: 16px;
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
  
  &:hover {
    background: var(--color-bg-tertiary);
    transform: scale(1.02);
  }
  
  .logo-icon {
    font-size: 20px;
  }
  
  .logo-text {
    background: linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-tertiary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
}

.project-name {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-accent-primary);
  font-weight: 500;
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  background: rgba(59, 130, 246, 0.1);
  border-radius: var(--radius-md);
  color: var(--color-accent-primary);
  font-size: 13px;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid transparent;
  border-top-color: var(--color-accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.session-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 12px;
  
  .session-label {
    color: var(--color-text-muted);
  }
  
  .session-id {
    font-family: var(--font-mono);
    padding: 2px 6px;
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
    
    &:hover {
      background: var(--color-bg-elevated);
    }
  }
}

.api-key-panel {
  position: absolute;
  top: 100%;
  right: var(--spacing-lg);
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  animation: slideUp var(--transition-fast);
  
  .input {
    width: 300px;
  }
}
</style>

