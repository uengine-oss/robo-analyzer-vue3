<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef } from 'vue'
import * as monaco from 'monaco-editor'

interface Props {
  code: string
  language: string
  fileName: string
}

const props = defineProps<Props>()

const containerRef = ref<HTMLElement>()
const editorInstance = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)

// Monaco Editor 초기화
const initEditor = () => {
  if (!containerRef.value) return
  
  // 라이트 테마 정의
  monaco.editor.defineTheme('legacy-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'dc2626' },
      { token: 'string', foreground: '059669' },
      { token: 'number', foreground: '7c3aed' },
      { token: 'type', foreground: '0891b2' },
      { token: 'function', foreground: '7c3aed' },
      { token: 'variable', foreground: 'ea580c' }
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#1e293b',
      'editor.lineHighlightBackground': '#f8fafc',
      'editor.selectionBackground': '#bfdbfe',
      'editorCursor.foreground': '#3b82f6',
      'editorLineNumber.foreground': '#94a3b8',
      'editorLineNumber.activeForeground': '#475569',
      'editor.inactiveSelectionBackground': '#e2e8f0'
    }
  })
  
  editorInstance.value = monaco.editor.create(containerRef.value, {
    value: props.code,
    language: props.language,
    theme: 'legacy-light',
    readOnly: true,
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    padding: { top: 16, bottom: 16 }
  })
}

// 코드 업데이트
const updateCode = () => {
  if (editorInstance.value) {
    const model = editorInstance.value.getModel()
    if (model) {
      model.setValue(props.code)
      monaco.editor.setModelLanguage(model, props.language)
    }
  }
}

// 코드 복사
const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(props.code)
    alert('코드가 복사되었습니다')
  } catch {
    alert('복사 실패')
  }
}

onMounted(() => {
  initEditor()
})

onUnmounted(() => {
  if (editorInstance.value) {
    editorInstance.value.dispose()
    editorInstance.value = null
  }
})

watch(() => props.code, () => {
  updateCode()
})

watch(() => props.language, () => {
  updateCode()
})
</script>

<template>
  <div class="code-editor">
    <div class="editor-header">
      <span class="file-info">
        <span class="file-name">{{ fileName }}</span>
        <span class="file-lang">{{ language }}</span>
      </span>
      <div class="editor-actions">
        <button class="btn btn--secondary btn--sm" @click="copyCode">
          📋 복사
        </button>
      </div>
    </div>
    <div class="editor-container" ref="containerRef"></div>
  </div>
</template>

<style lang="scss" scoped>
.code-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-elevated);
  border-bottom: 1px solid var(--color-border);
}

.file-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.file-name {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--color-text-primary);
}

.file-lang {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.editor-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.editor-container {
  flex: 1;
  min-height: 200px;
}

.btn--sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 12px;
}
</style>

