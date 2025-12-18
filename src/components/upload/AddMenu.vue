<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

interface Props {
  title?: string
}

defineProps<Props>()

const emit = defineEmits<{
  pickFile: []
  pickFolder: []
}>()

const open = ref(false)
const rootRef = ref<HTMLElement>()

const toggle = () => {
  open.value = !open.value
}

const close = () => {
  open.value = false
}

const onPickFile = () => {
  close()
  emit('pickFile')
}

const onPickFolder = () => {
  close()
  emit('pickFolder')
}

const onDocClick = (e: MouseEvent) => {
  const el = rootRef.value
  if (!el) return
  if (e.target instanceof Node && el.contains(e.target)) return
  close()
}

onMounted(() => document.addEventListener('click', onDocClick, true))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick, true))
</script>

<template>
  <div ref="rootRef" class="add-menu">
    <button class="add-btn" type="button" @click.stop="toggle" :title="title || '추가'">
      ＋
    </button>
    <div v-if="open" class="menu">
      <button class="menu-item" type="button" @click="onPickFile">📄 파일 추가</button>
      <button class="menu-item" type="button" @click="onPickFolder">📁 폴더 추가</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.add-menu {
  position: relative;
}

.add-btn {
  width: 34px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.32);
  background: rgba(59, 130, 246, 0.06);
  color: rgba(59, 130, 246, 0.95);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.05s;

  &:hover {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.5);
  }

  &:active {
    transform: translateY(1px);
  }
}

.menu {
  position: absolute;
  top: 32px;
  right: 0;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  z-index: 10;
  min-width: 120px;
}

.menu-item {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-primary);

  &:hover {
    background: var(--color-bg-tertiary);
  }
}
</style>


