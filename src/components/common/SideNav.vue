<script setup lang="ts">
/**
 * SideNav.vue
 * 왼쪽 아이콘 사이드바 네비게이션
 */
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'

const sessionStore = useSessionStore()
const { activeTab } = storeToRefs(sessionStore)

interface NavItem {
  id: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { id: 'upload', label: '소스', icon: '📁' },
  { id: 'graph', label: '메타데이터', icon: '📊' },
  { id: 'text2sql', label: 'Text2SQL', icon: '🧠' },
  { id: 'convert', label: '전환', icon: '🔀' }
]

const setActiveTab = (tabId: string) => {
  sessionStore.setActiveTab(tabId)
}
</script>

<template>
  <nav class="side-nav">
    <div class="nav-items">
      <button
        v-for="item in navItems"
        :key="item.id"
        class="nav-item"
        :class="{ active: activeTab === item.id }"
        @click="setActiveTab(item.id)"
        :title="item.label"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </div>
  </nav>
</template>

<style lang="scss" scoped>
.side-nav {
  width: 72px;
  height: 100%;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  transition: width 0.2s ease;
  
  &:hover {
    width: 160px;
    
    .nav-label {
      opacity: 1;
      max-width: 80px;
    }
  }
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: transparent;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  overflow: hidden;
  
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 0;
    background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
    border-radius: 0 2px 2px 0;
    transition: height 0.2s ease;
  }
  
  &:hover {
    background: #f3f4f6;
  }
  
  &.active {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.08) 100%);
    
    &::before {
      height: 24px;
    }
    
    .nav-icon {
      transform: scale(1.1);
    }
    
    .nav-label {
      color: #1e40af;
      font-weight: 600;
    }
  }
}

.nav-icon {
  font-size: 20px;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.nav-label {
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  white-space: nowrap;
  opacity: 0;
  max-width: 0;
  overflow: hidden;
  transition: all 0.2s ease;
}
</style>

