import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { v4 as uuidv4 } from 'uuid'

const STORAGE_KEY_SESSION_ID = 'legacy-modernizer-session-id'
const STORAGE_KEY_API_KEY = 'legacy-modernizer-api-key'
const STORAGE_KEY_ACTIVE_TAB = 'legacy-modernizer-active-tab'

// 로컬스토리지에서 값 로드
const loadFromStorage = (key: string, defaultValue: string): string => {
  try {
    const stored = localStorage.getItem(key)
    return stored || defaultValue
  } catch {
    return defaultValue
  }
}

// 로컬스토리지에 값 저장
const saveToStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch (error) {
    console.warn('로컬스토리지 저장 실패:', error)
  }
}

// 로컬스토리지에서 값 삭제
const removeFromStorage = (key: string): void => {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.warn('로컬스토리지 삭제 실패:', error)
  }
}

export const useSessionStore = defineStore('session', () => {
  // 세션 ID - 로컬스토리지에서 로드, 없으면 새로 생성
  const sessionId = ref<string>(
    loadFromStorage(STORAGE_KEY_SESSION_ID, uuidv4())
  )
  
  // OpenAI API Key (옵션) - 로컬스토리지에서 로드
  const apiKey = ref<string>(
    loadFromStorage(STORAGE_KEY_API_KEY, '')
  )
  
  // 현재 활성 탭 - 로컬스토리지에서 로드
  const activeTab = ref<string>(
    loadFromStorage(STORAGE_KEY_ACTIVE_TAB, 'upload')
  )
  
  // 세션 ID 변경 시 로컬스토리지에 저장
  watch(sessionId, (newId) => {
    saveToStorage(STORAGE_KEY_SESSION_ID, newId)
  }, { immediate: true })
  
  // API Key 변경 시 로컬스토리지에 저장
  watch(apiKey, (newKey) => {
    saveToStorage(STORAGE_KEY_API_KEY, newKey)
  }, { immediate: true })
  
  // 활성 탭 변경 시 로컬스토리지에 저장
  watch(activeTab, (newTab) => {
    saveToStorage(STORAGE_KEY_ACTIVE_TAB, newTab)
  }, { immediate: true })
  
  // 새 세션 생성 (로컬스토리지도 초기화)
  const createNewSession = () => {
    sessionId.value = uuidv4()
    apiKey.value = ''
    activeTab.value = 'upload'
    // 로컬스토리지는 watch에서 자동 저장됨
  }
  
  // 세션 초기화 (로컬스토리지 완전 삭제)
  const clearSession = () => {
    removeFromStorage(STORAGE_KEY_SESSION_ID)
    removeFromStorage(STORAGE_KEY_API_KEY)
    removeFromStorage(STORAGE_KEY_ACTIVE_TAB)
    sessionId.value = uuidv4()
    apiKey.value = ''
    activeTab.value = 'upload'
  }
  
  // 탭 변경
  const setActiveTab = (tab: string) => {
    activeTab.value = tab
  }
  
  // 홈으로 이동 (업로드 탭)
  const goHome = () => {
    activeTab.value = 'upload'
  }
  
  // API Key 설정
  const setApiKey = (key: string) => {
    apiKey.value = key
  }
  
  // 헤더 생성
  const getHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Session-UUID': sessionId.value,
      'Accept-Language': 'ko'
    }
    
    if (apiKey.value) {
      headers['OpenAI-Api-Key'] = apiKey.value
    }
    
    return headers
  }
  
  return {
    sessionId,
    apiKey,
    activeTab,
    createNewSession,
    clearSession,
    setApiKey,
    setActiveTab,
    goHome,
    getHeaders
  }
})

