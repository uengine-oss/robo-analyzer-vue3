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
// 모던 다크 테마 탭 디자인
.tab-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
}

.tab-header {
  display: flex;
  gap: 0;
  padding: 0 16px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  min-height: 48px;
}

.tab-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-light);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  margin-bottom: -1px;
  
  &:hover:not(.active) {
    color: var(--color-text);
  }
  
  &.active {
    color: var(--color-text-bright);
    font-weight: 600;
    border-bottom-color: var(--color-accent);
    
    .tab-icon {
      opacity: 1;
    }
  }
}

.tab-icon {
  font-size: 16px;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.tab-label {
  letter-spacing: -0.01em;
}

.tab-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  background: var(--color-bg);
}

.tab-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
