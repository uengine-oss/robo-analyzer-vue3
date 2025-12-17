<script setup lang="ts">
interface Tab {
  id: string
  label: string
  icon?: string
}

defineProps<{
  tabs: Tab[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const setActive = (tabId: string) => {
  emit('update:modelValue', tabId)
}
</script>

<template>
  <div class="tab-container">
    <div class="tab-header">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-button"
        :class="{ active: modelValue === tab.id }"
        @click="setActive(tab.id)"
      >
        <span class="tab-icon" v-if="tab.icon">{{ tab.icon }}</span>
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </div>
    <div class="tab-content">
      <!-- v-show를 사용하여 컴포넌트 언마운트 없이 탭 전환 (그래프 유지) -->
      <div 
        v-for="tab in tabs" 
        :key="tab.id" 
        class="tab-panel" 
        :class="{ active: modelValue === tab.id }"
        v-show="modelValue === tab.id"
      >
        <slot :name="tab.id" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tab-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.tab-header {
  display: flex;
  gap: 2px;
  padding: var(--spacing-sm);
  background: var(--color-bg-tertiary);
  border-bottom: 1px solid var(--color-border);
}

.tab-button {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    color: var(--color-text-primary);
    background: var(--color-bg-elevated);
  }
  
  &.active {
    color: var(--color-accent-primary);
    background: var(--color-bg-secondary);
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.2);
  }
}

.tab-icon {
  font-size: 16px;
}

.tab-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.tab-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  
  &.active {
    animation: fadeIn var(--transition-normal);
  }
}
</style>

