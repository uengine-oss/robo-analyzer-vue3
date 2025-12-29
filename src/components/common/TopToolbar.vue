<script setup lang="ts">
/**
 * TopToolbar.vue
 * 상단 툴바 - 밝은 중성 테마 (msaez.io 스타일)
 */

import { ref, onMounted } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { storeToRefs } from 'pinia'
import SettingsModal from './SettingsModal.vue'
import type { SourceType, ConvertTarget } from '@/types'

const sessionStore = useSessionStore()
const projectStore = useProjectStore()

const { sessionId } = storeToRefs(sessionStore)
const { projectName, isProcessing, currentStep, sourceType, convertTarget } = storeToRefs(projectStore)

const showSettings = ref(false)
const nodeLimit = ref(500)

// localStorage에서 값 로드 (안전하게, 마운트 후)
onMounted(() => {
  try {
    const savedNodeLimit = localStorage.getItem('nodeLimit')
    if (savedNodeLimit) {
      const parsed = parseInt(savedNodeLimit)
      if (!isNaN(parsed)) nodeLimit.value = parsed
    }
  } catch (e) {
    console.warn('localStorage 접근 실패:', e)
  }
})

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

const copySessionId = async () => {
  await navigator.clipboard.writeText(sessionId.value)
}

const handleNodeLimitChange = (value: number) => {
  nodeLimit.value = value
  localStorage.setItem('nodeLimit', String(value))
  window.dispatchEvent(new CustomEvent('nodeLimitChange', { detail: value }))
}

const handleUmlDepthChange = (value: number) => {
  localStorage.setItem('umlDepth', String(value))
  window.dispatchEvent(new CustomEvent('umlDepthChange', { detail: value }))
}
</script>

<template>
  <header class="top-toolbar">
    <button class="logo" @click="sessionStore.goHome()" title="홈으로 이동">
      <span class="logo-icon">⚡</span>
      <span class="logo-text">Robo Analyzer</span>
    </button>
    
    <div class="conversion-flow">
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
    
    <div class="status-area">
      <div class="project-badge" v-if="projectName">
        <span class="project-icon">📁</span>
        <span class="project-name">{{ projectName }}</span>
      </div>
      
      <div class="progress-indicator" v-if="isProcessing">
        <span class="spinner"></span>
        <span class="step-text">{{ currentStep }}</span>
      </div>
    </div>
    
    <div class="actions">
      <code class="session-id" @click="copySessionId" title="클릭하여 Session ID 복사">
        {{ sessionId.slice(0, 8) }}
      </code>
      
      <button 
        class="settings-btn" 
        @click="showSettings = true"
        title="설정"
      >
        ⚙️
      </button>
    </div>
  </header>
  
  <SettingsModal 
    :is-open="showSettings"
    @close="showSettings = false"
    @update:node-limit="handleNodeLimitChange"
    @update:uml-depth="handleUmlDepthChange"
  />
</template>

<style lang="scss" scoped>
// 밝은 중성 테마 툴바 (msaez.io 스타일)
.top-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 48px;
  padding: 0 16px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: all 0.15s;
  
  &:hover {
    background: #f3f4f6;
  }
  
  .logo-icon {
    font-size: 18px;
  }
  
  .logo-text {
    font-size: 14px;
    font-weight: 700;
    color: #1f2937;
    letter-spacing: -0.3px;
  }
}

.conversion-flow {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.select {
  padding: 4px 8px;
  font-size: 12px;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  color: #1e293b;
  cursor: pointer;
  transition: all 0.15s;
  
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
  font-size: 12px;
  color: #6b7280;
  font-weight: bold;
}

.status-area {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.project-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #f3f4f6;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  
  .project-icon {
    font-size: 12px;
  }
  
  .project-name {
    font-size: 12px;
    font-weight: 500;
    color: #374151;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: #f3f4f6;
  border-radius: 6px;
  
  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid #d1d5db;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  .step-text {
    font-size: 11px;
    color: #6b7280;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #6b7280;
  padding: 4px 8px;
  background: #f3f4f6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: #e5e7eb;
    color: #374151;
  }
}

.settings-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: #e5e7eb;
    transform: rotate(45deg);
  }
}
</style>
