<script setup lang="ts">
/**
 * TopToolbar.vue
 * 상단 헤더 - 로고, 검색바, 사용자 정보
 */

import { ref, onMounted } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { storeToRefs } from 'pinia'
import SettingsModal from './SettingsModal.vue'

const sessionStore = useSessionStore()
const projectStore = useProjectStore()

const { sessionId } = storeToRefs(sessionStore)
const { projectName, isProcessing, currentStep } = storeToRefs(projectStore)

const showSettings = ref(false)
const searchQuery = ref('')
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

const handleSearch = () => {
  // 검색 기능 구현 (추후)
  console.log('Search:', searchQuery.value)
}
</script>

<template>
  <header class="top-header">
    <!-- 로고 영역 -->
    <div class="header-left">
      <button class="logo" @click="sessionStore.goHome()" title="홈으로 이동">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">Robo Analyzer</span>
      </button>
    </div>
    
    <!-- 검색바 영역 -->
    <div class="header-center">
      <div class="search-container">
        <div class="search-type">
          All
          <span class="search-chevron">▾</span>
        </div>
        <div class="search-divider"></div>
        <input
          type="text"
          v-model="searchQuery"
          class="search-input"
          placeholder="Search for Classes, Methods, Tables, Packages..."
          @keyup.enter="handleSearch"
        />
        <div class="search-shortcut">
          <kbd>⌘</kbd><kbd>K</kbd>
        </div>
        <button class="search-btn" @click="handleSearch">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
        </button>
      </div>
    </div>
    
    <!-- 우측 영역: 프로젝트 상태 + 사용자 정보 -->
    <div class="header-right">
      <!-- 프로젝트 상태 -->
      <div class="project-status" v-if="projectName || isProcessing">
        <div class="project-badge" v-if="projectName">
          <span class="project-icon">📁</span>
          <span class="project-name">{{ projectName }}</span>
        </div>
        
        <div class="progress-indicator" v-if="isProcessing">
          <span class="spinner"></span>
          <span class="step-text">{{ currentStep }}</span>
        </div>
      </div>
      
      <!-- 알림 -->
      <button class="icon-btn" title="알림">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      </button>
      
      <!-- 설정 -->
      <button 
        class="icon-btn" 
        @click="showSettings = true"
        title="설정"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
      
      <!-- 사용자 프로필 -->
      <div class="user-profile" @click="copySessionId" title="세션 ID 복사">
        <div class="avatar">
          <span>U</span>
        </div>
      </div>
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
.top-header {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 56px;
  padding: 0 20px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

// ============================================================================
// 로고 영역
// ============================================================================
.header-left {
  display: flex;
  align-items: center;
  min-width: 180px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 10px;
  transition: all 0.15s;
  
  &:hover {
    background: #f3f4f6;
  }
  
  .logo-icon {
    font-size: 22px;
  }
  
  .logo-text {
    font-size: 16px;
    font-weight: 700;
    color: #1f2937;
    letter-spacing: -0.5px;
  }
}

// ============================================================================
// 검색바 영역
// ============================================================================
.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  max-width: 600px;
  margin: 0 auto;
}

.search-container {
  display: flex;
  align-items: center;
  width: 100%;
  height: 40px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.15s;
  
  &:focus-within {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    background: #ffffff;
  }
}

.search-type {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  white-space: nowrap;
  
  &:hover {
    color: #374151;
  }
}

.search-chevron {
  font-size: 10px;
  color: #94a3b8;
}

.search-divider {
  width: 1px;
  height: 20px;
  background: #e5e7eb;
}

.search-input {
  flex: 1;
  height: 100%;
  padding: 0 12px;
  font-size: 13px;
  color: #1f2937;
  background: transparent;
  border: none;
  outline: none;
  
  &::placeholder {
    color: #9ca3af;
  }
}

.search-shortcut {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  
  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 4px;
    font-size: 11px;
    font-family: inherit;
    color: #64748b;
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 4px;
  }
}

.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 100%;
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  
  &:hover {
    color: #3b82f6;
  }
}

// ============================================================================
// 우측 영역
// ============================================================================
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.project-status {
  display: flex;
  align-items: center;
  gap: 8px;
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
    max-width: 120px;
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
  background: #eff6ff;
  border-radius: 6px;
  
  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid #dbeafe;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  .step-text {
    font-size: 11px;
    color: #3b82f6;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: #f3f4f6;
    color: #374151;
  }
}

.user-profile {
  cursor: pointer;
  
  .avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
    border-radius: 50%;
    color: white;
    font-size: 14px;
    font-weight: 600;
    transition: transform 0.15s;
    
    &:hover {
      transform: scale(1.05);
    }
  }
}
</style>


