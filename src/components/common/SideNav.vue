<script setup lang="ts">
/**
 * SideNav.vue
 * 왼쪽 아이콘 사이드바 네비게이션
 */
import { ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'
import {
  IconFolder,
  IconDatabase,
  IconMessageSquare,
  IconLineage,
  IconBook,
  IconBarChart,
  IconObservability,
  IconDataQuality,
  IconIncident,
  IconAlertConfig,
  IconEventDetection,
  IconWatchAgent,
  IconChevronDown
} from '@/components/icons'
import type { Component } from 'vue'

const sessionStore = useSessionStore()
const { activeTab } = storeToRefs(sessionStore)

// Observability 메뉴 확장 상태
const isObservabilityExpanded = ref(false)

interface NavItem {
  id: string
  label: string
  icon: Component
}

interface NavGroup {
  id: string
  label: string
  icon: Component
  children: NavItem[]
}

const navItems: NavItem[] = [
  { id: 'upload', label: '소스', icon: IconFolder },
  { id: 'graph', label: '메타데이터', icon: IconDatabase },
  { id: 'text2sql', label: '자연어 질의', icon: IconMessageSquare },
  { id: 'lineage', label: '데이터 리니지', icon: IconLineage },
  { id: 'glossary', label: '용어 관리', icon: IconBook },
  { id: 'olap', label: 'OLAP 분석', icon: IconBarChart }
]

const observabilityGroup: NavGroup = {
  id: 'observability',
  label: '관찰 가능성',
  icon: IconObservability,
  children: [
    { id: 'data-quality', label: '데이터 품질', icon: IconDataQuality },
    { id: 'incident-manager', label: '사고 관리자', icon: IconIncident },
    { id: 'alerts', label: '알림들', icon: IconAlertConfig },
    { id: 'event-detection', label: '이벤트 감지', icon: IconEventDetection },
    { id: 'watch-agent', label: '감시 에이전트', icon: IconWatchAgent }
  ]
}

const setActiveTab = (tabId: string) => {
  sessionStore.setActiveTab(tabId)
}

const toggleObservability = () => {
  isObservabilityExpanded.value = !isObservabilityExpanded.value
}

const isObservabilityActive = () => {
  return observabilityGroup.children.some(child => activeTab.value === child.id)
}
</script>

<template>
  <nav class="side-nav">
    <div class="nav-items">
      <!-- 기본 네비게이션 아이템 -->
      <button v-for="item in navItems" :key="item.id" class="nav-item" :class="{ active: activeTab === item.id }"
        @click="setActiveTab(item.id)" :title="item.label">
        <span class="nav-icon">
          <component :is="item.icon" :size="20" />
        </span>
        <span class="nav-label">{{ item.label }}</span>
      </button>

      <!-- Observability 그룹 (확장 가능) -->
      <div class="nav-group" :class="{ expanded: isObservabilityExpanded, active: isObservabilityActive() }">
        <button class="nav-item nav-group-header" :class="{ active: isObservabilityActive() }"
          @click="toggleObservability" :title="observabilityGroup.label">
          <span class="nav-icon">
            <component :is="observabilityGroup.icon" :size="20" />
          </span>
          <span class="nav-label">{{ observabilityGroup.label }}</span>
          <span class="nav-chevron" :class="{ rotated: isObservabilityExpanded }">
            <IconChevronDown :size="14" />
          </span>
        </button>

        <div class="nav-group-children" v-show="isObservabilityExpanded">
          <button v-for="child in observabilityGroup.children" :key="child.id" class="nav-item nav-child"
            :class="{ active: activeTab === child.id }" @click="setActiveTab(child.id)" :title="child.label">
            <span class="nav-icon">
              <component :is="child.icon" :size="18" />
            </span>
            <span class="nav-label">{{ child.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<style lang="scss" scoped>
.side-nav {
  width: 72px;
  height: 100%;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  transition: width 0.2s ease;
  overflow-y: auto;
  overflow-x: hidden;

  &:hover {
    width: 180px;

    .nav-label {
      opacity: 1;
      max-width: 100px;
    }

    .nav-chevron {
      opacity: 1;
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
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  overflow: hidden;
  color: var(--color-text-light);
  width: 100%;
  text-align: left;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 0;
    background: linear-gradient(180deg, var(--color-accent) 0%, var(--color-accent-hover) 100%);
    border-radius: 0 2px 2px 0;
    transition: height 0.2s ease;
  }

  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text);
  }

  &.active {
    background: linear-gradient(135deg, rgba(34, 139, 230, 0.15) 0%, rgba(34, 139, 230, 0.08) 100%);
    color: var(--color-accent);

    &::before {
      height: 24px;
    }

    .nav-icon {
      transform: scale(1.1);
    }

    .nav-label {
      color: var(--color-accent);
      font-weight: 600;
    }
  }
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.nav-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-light);
  white-space: nowrap;
  opacity: 0;
  max-width: 0;
  overflow: hidden;
  transition: all 0.2s ease;
}

.nav-chevron {
  margin-left: auto;
  opacity: 0;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;

  &.rotated {
    transform: rotate(180deg);
  }
}

// Observability 그룹 스타일
.nav-group {
  display: flex;
  flex-direction: column;

  &.active .nav-group-header {
    color: var(--color-accent);

    .nav-icon {
      color: var(--color-accent);
    }
  }

  &.expanded {
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-lg);
    margin-top: 4px;

    .nav-group-header {
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }
  }
}

.nav-group-header {
  .nav-chevron {
    color: var(--color-text-muted);
  }
}

.nav-group-children {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  padding-top: 0;
}

.nav-child {
  padding: 10px 12px;
  padding-left: 20px;
  border-radius: var(--radius-md);

  &::before {
    left: 8px;
  }

  .nav-icon {
    color: var(--color-text-muted);
  }

  &:hover .nav-icon {
    color: var(--color-text);
  }

  &.active {
    background: linear-gradient(135deg, rgba(34, 139, 230, 0.2) 0%, rgba(34, 139, 230, 0.1) 100%);

    .nav-icon {
      color: var(--color-accent);
    }
  }
}
</style>
