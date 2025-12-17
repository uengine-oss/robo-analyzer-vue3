<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  'files-drop': [files: File[]]
  'open-modal': []
}>()

const isDragOver = ref(false)

const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  isDragOver.value = true
}

const handleDragLeave = () => {
  isDragOver.value = false
}

const handleDrop = async (e: DragEvent) => {
  e.preventDefault()
  isDragOver.value = false
  
  const files: File[] = []
  
  if (e.dataTransfer?.items) {
    const items = Array.from(e.dataTransfer.items)
    
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.()
        if (entry) {
          const entryFiles = await readEntry(entry)
          files.push(...entryFiles)
        } else {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
    }
  } else if (e.dataTransfer?.files) {
    files.push(...Array.from(e.dataTransfer.files))
  }
  
  if (files.length > 0) {
    emit('files-drop', files)
  }
}

const readEntry = (entry: FileSystemEntry): Promise<File[]> => {
  return new Promise((resolve) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file(
        (file) => {
          Object.defineProperty(file, 'webkitRelativePath', {
            value: entry.fullPath.slice(1),
            writable: false
          })
          resolve([file])
        },
        () => resolve([])
      )
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const files: File[] = []
      
      const readEntries = () => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(files)
          } else {
            for (const subEntry of entries) {
              const subFiles = await readEntry(subEntry)
              files.push(...subFiles)
            }
            readEntries()
          }
        }, () => resolve(files))
      }
      
      readEntries()
    } else {
      resolve([])
    }
  })
}

const handleClick = () => {
  emit('open-modal')
}
</script>

<template>
  <div 
    class="drop-zone"
    :class="{ 'drag-over': isDragOver }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @click="handleClick"
  >
    <div class="drop-content">
      <div class="drop-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 16V8M12 8L9 11M12 8L15 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 15V16C3 18.2091 4.79086 20 7 20H17C19.2091 20 21 18.2091 21 16V15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <p class="drop-text">
        프로젝트 폴더를 <strong>드래그</strong>하거나<br>
        이 영역을 <strong>클릭</strong>하여 업로드 설정
      </p>
      <div class="drop-formats">
        <span>.java</span>
        <span>.sql</span>
        <span>.xml</span>
        <span>최대 3MB</span>
      </div>
    </div>
    
    <div class="drop-overlay">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 16V8M12 8L9 11M12 8L15 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>여기에 놓으세요</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.drop-zone {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  padding: var(--spacing-xl);
  background: var(--color-bg-secondary);
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-sm);
  
  &:hover {
    border-color: var(--color-accent-primary);
    background: linear-gradient(
      135deg,
      rgba(59, 130, 246, 0.03) 0%,
      transparent 100%
    );
    box-shadow: var(--shadow-md);
    
    .drop-icon {
      color: var(--color-accent-primary);
      transform: translateY(-4px);
    }
  }
  
  &.drag-over {
    border-color: var(--color-accent-primary);
    border-style: solid;
    background: rgba(59, 130, 246, 0.06);
    
    .drop-overlay {
      opacity: 1;
    }
    
    .drop-content {
      opacity: 0;
    }
  }
}

.drop-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transition: opacity var(--transition-fast);
}

.drop-icon {
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-lg);
  transition: all var(--transition-normal);
}

.drop-text {
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
  
  strong {
    color: var(--color-text-primary);
    font-weight: 600;
  }
}

.drop-formats {
  display: flex;
  gap: var(--spacing-sm);
  
  span {
    padding: 4px 10px;
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--color-text-muted);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-sm);
  }
}

.drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  color: var(--color-accent-primary);
  background: rgba(59, 130, 246, 0.08);
  border-radius: var(--radius-lg);
  opacity: 0;
  transition: opacity var(--transition-fast);
  pointer-events: none;
  
  span {
    font-size: 16px;
    font-weight: 600;
  }
}
</style>
