<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { SystemInfo } from '@/types'

interface Props {
  initialMetadata: {
    projectName: string
    systems: SystemInfo[]
    ddl: string[]
  }
  initialFiles?: File[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  confirm: [metadata: { projectName: string; systems: SystemInfo[]; ddl: string[] }]
  cancel: []
  'add-files': [files: File[], reanalyze: boolean]
  'remove-file': [fileName: string]
}>()

const projectName = ref(props.initialMetadata.projectName || '')
const systems = ref<SystemInfo[]>([...props.initialMetadata.systems])
const ddl = ref<string[]>([...props.initialMetadata.ddl])

const folderInput = ref<HTMLInputElement>()
const ddlFileInput = ref<HTMLInputElement>()
const systemFileInput = ref<HTMLInputElement>()
const currentSystemIndex = ref(-1)

// 드래그 상태
const dragData = ref<{ type: 'system' | 'ddl'; systemIndex?: number; fileIndex: number; fileName: string } | null>(null)
const dropTargetSystem = ref<number | null>(null)
const dropTargetDdl = ref(false)

// 파일 존재 여부
const hasFiles = computed(() => 
  systems.value.some(s => s.sp.length > 0) || ddl.value.length > 0
)

// 전체 파일 수
const totalFileCount = computed(() => 
  systems.value.reduce((sum, s) => sum + s.sp.length, 0) + ddl.value.length
)

// 빈 시스템명 확인
const hasEmptySystemName = computed(() => 
  systems.value.some(s => s.sp.length > 0 && !s.name.trim())
)

// 유효성 검사
const isValid = computed(() => 
  projectName.value.trim() && hasFiles.value && !hasEmptySystemName.value
)

// 유효성 오류 메시지
const validationError = computed(() => {
  if (!projectName.value.trim()) return '프로젝트명을 입력해주세요'
  if (hasEmptySystemName.value) return '시스템명을 입력해주세요'
  if (!hasFiles.value) return '파일을 추가해주세요'
  return ''
})

watch(() => props.initialMetadata, (val) => {
  projectName.value = val.projectName || ''
  systems.value = [...val.systems]
  ddl.value = [...val.ddl]
}, { deep: true })

// === 파일 추가 헬퍼 ===
const addFileToArray = (arr: string[], fileName: string) => {
  if (!arr.includes(fileName)) arr.push(fileName)
}

// === 드래그 앤 드롭 ===
const handleDragStart = (type: 'system' | 'ddl', fileIndex: number, fileName: string, systemIndex?: number) => {
  dragData.value = { type, systemIndex, fileIndex, fileName }
}

const handleDragEnd = () => {
  dragData.value = null
  dropTargetSystem.value = null
  dropTargetDdl.value = false
}

const handleDropOnSystem = (targetSystemIndex: number) => {
  if (!dragData.value) return
  
  const { type, systemIndex, fileIndex, fileName } = dragData.value
  
  // 같은 시스템 내 이동은 무시
  if (type === 'system' && systemIndex === targetSystemIndex) return
  
  // 원본에서 제거
  if (type === 'system' && systemIndex !== undefined) {
    systems.value[systemIndex].sp.splice(fileIndex, 1)
  } else if (type === 'ddl') {
    ddl.value.splice(fileIndex, 1)
  }
  
  // 타겟에 추가
  addFileToArray(systems.value[targetSystemIndex].sp, fileName)
  handleDragEnd()
}

const handleDropOnDdl = () => {
  if (!dragData.value || dragData.value.type === 'ddl') return
  
  const { systemIndex, fileIndex, fileName } = dragData.value
  
  if (systemIndex !== undefined) {
    systems.value[systemIndex].sp.splice(fileIndex, 1)
    addFileToArray(ddl.value, fileName)
  }
  handleDragEnd()
}

// === 폴더 업로드 ===
const handleFolderSelect = (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  if (!files.length) return
  
  // 1. 공통 루트 찾기
  const allFirstFolders = new Set<string>()
  for (const file of files) {
    const parts = (file.webkitRelativePath || file.name).split('/')
    if (parts.length >= 2) {
      allFirstFolders.add(parts[0])
    }
  }
  
  const hasCommonRoot = allFirstFolders.size === 1
  
  // 공통 루트가 있고 프로젝트명이 비어있으면 자동 설정
  if (hasCommonRoot && !projectName.value.trim()) {
    projectName.value = Array.from(allFirstFolders)[0]
  }
  
  const newSystems = new Map<string, string[]>()
  const newDdl: string[] = []
  
  for (const file of files) {
    const parts = (file.webkitRelativePath || file.name).split('/')
    const fileName = parts[parts.length - 1]
    
    // 경로 어딘가에 DDL 폴더가 있는지 확인 (대소문자 무관)
    const hasDdlFolder = parts.some(part => part.toLowerCase() === 'ddl')
    
    if (hasDdlFolder) {
      newDdl.push(fileName)
    } else if (parts.length >= 2) {
      // 파일의 직접 부모 폴더를 시스템명으로 사용
      const parentFolder = parts[parts.length - 2]
      
      // 부모 폴더가 프로젝트 루트인 경우 (루트 바로 아래 파일)
      if (hasCommonRoot && parts.length === 2) {
        if (fileName.toLowerCase().endsWith('.sql')) {
          newDdl.push(fileName)
        }
        // 그 외 파일은 시스템 미지정 (무시하거나 빈 시스템에 추가)
      } else {
        if (!newSystems.has(parentFolder)) newSystems.set(parentFolder, [])
        newSystems.get(parentFolder)!.push(fileName)
      }
    } else if (file.name.toLowerCase().endsWith('.sql')) {
      newDdl.push(fileName)
    }
  }
  
  // 병합
  for (const [name, sp] of newSystems) {
    const existing = systems.value.find(s => s.name === name)
    if (existing) {
      sp.forEach(f => addFileToArray(existing.sp, f))
    } else {
      systems.value.push({ name, sp })
    }
  }
  newDdl.forEach(f => addFileToArray(ddl.value, f))
  
  emit('add-files', files, false)
  ;(e.target as HTMLInputElement).value = ''
}

// === DDL 파일 추가 ===
const handleDdlFileSelect = (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  files.forEach(f => addFileToArray(ddl.value, f.name))
  if (files.length) emit('add-files', files, false)
  ;(e.target as HTMLInputElement).value = ''
}

// === 시스템 파일 추가 ===
const handleAddSystemFiles = (index: number) => {
  currentSystemIndex.value = index
  systemFileInput.value?.click()
}

const handleSystemFileSelect = (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  if (currentSystemIndex.value >= 0 && files.length) {
    files.forEach(f => addFileToArray(systems.value[currentSystemIndex.value].sp, f.name))
    emit('add-files', files, false)
  }
  ;(e.target as HTMLInputElement).value = ''
  currentSystemIndex.value = -1
}

// === 파일/시스템 삭제 ===
const removeSystemFile = (sIndex: number, fIndex: number) => {
  const fileName = systems.value[sIndex].sp.splice(fIndex, 1)[0]
  emit('remove-file', fileName)
}

const removeDdlFile = (index: number) => {
  const fileName = ddl.value.splice(index, 1)[0]
  emit('remove-file', fileName)
}

const removeSystem = (index: number) => {
  systems.value.splice(index, 1)
}

const addNewSystem = () => {
  systems.value.push({ name: `system${systems.value.length + 1}`, sp: [] })
}

// === 확인 ===
const handleConfirm = () => {
  if (!isValid.value) {
    alert(validationError.value)
    return
  }
  emit('confirm', {
    projectName: projectName.value.trim(),
    systems: systems.value.filter(s => s.sp.length > 0),
    ddl: ddl.value
  })
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">📁 업로드 설정</h2>
        <button class="close-btn" @click="emit('cancel')">✕</button>
      </div>
      
      <div class="modal-body">
        <!-- 상단: 프로젝트명 + 폴더 업로드 -->
        <div class="top-row">
          <div class="project-name-group">
            <label class="form-label">프로젝트명 <span class="required">*</span></label>
            <input 
              v-model="projectName" 
              class="input" 
              :class="{ 'input--error': !projectName.trim() }"
              placeholder="프로젝트명 입력"
            />
          </div>
          <button class="btn btn--secondary folder-btn" @click="folderInput?.click()" title="폴더를 업로드하면 자동으로 구조 분석">
            📁 폴더 업로드
          </button>
        </div>
        
        <p class="drag-hint">💡 파일을 드래그하여 시스템/DDL 간 이동할 수 있습니다</p>
        
        <!-- 시스템 + DDL 가로 배치 -->
        <div class="content-row">
          <!-- 시스템 목록 -->
          <div class="section">
            <div class="section-header">
              <label class="form-label">시스템 ({{ systems.length }})</label>
              <button class="btn btn--text btn--sm" @click="addNewSystem">+ 추가</button>
            </div>
            
            <div class="section-content">
              <div 
                v-for="(system, sIndex) in systems" 
                :key="sIndex"
                class="system-item"
                :class="{ 'drop-target': dropTargetSystem === sIndex }"
                @dragover.prevent="dropTargetSystem = sIndex"
                @dragleave="dropTargetSystem = null"
                @drop="handleDropOnSystem(sIndex)"
              >
                <div class="system-header">
                  <input 
                    :value="system.name" 
                    @input="systems[sIndex].name = ($event.target as HTMLInputElement).value"
                    class="input input--sm system-name-input"
                    :class="{ 'input--error': !system.name.trim() && system.sp.length > 0 }"
                    placeholder="시스템명"
                  />
                  <span class="file-count">{{ system.sp.length }}</span>
                  <button class="btn btn--icon btn--xs" @click="handleAddSystemFiles(sIndex)" title="파일 추가">+</button>
                  <button class="btn btn--icon btn--xs btn--danger" @click="removeSystem(sIndex)" title="삭제">×</button>
                </div>
                
                <div class="file-list" v-if="system.sp.length > 0">
                  <div 
                    v-for="(file, fIndex) in system.sp" 
                    :key="fIndex" 
                    class="file-item"
                    draggable="true"
                    @dragstart="handleDragStart('system', fIndex, file, sIndex)"
                    @dragend="handleDragEnd"
                  >
                    <span class="drag-handle">⋮⋮</span>
                    <span class="file-name">{{ file }}</span>
                    <button class="btn--micro" @click="removeSystemFile(sIndex, fIndex)">×</button>
                  </div>
                </div>
              </div>
              
              <div class="empty-text" v-if="systems.length === 0">시스템 없음</div>
            </div>
          </div>
          
          <!-- DDL 목록 -->
          <div 
            class="section"
            :class="{ 'drop-target': dropTargetDdl }"
            @dragover.prevent="dropTargetDdl = true"
            @dragleave="dropTargetDdl = false"
            @drop="handleDropOnDdl"
          >
            <div class="section-header">
              <label class="form-label">DDL ({{ ddl.length }})</label>
              <button class="btn btn--text btn--sm" @click="ddlFileInput?.click()">+ 추가</button>
            </div>
            
            <div class="section-content">
              <div v-if="ddl.length > 0" class="file-list">
                <div 
                  v-for="(file, dIndex) in ddl" 
                  :key="dIndex" 
                  class="file-item ddl-item"
                  draggable="true"
                  @dragstart="handleDragStart('ddl', dIndex, file)"
                  @dragend="handleDragEnd"
                >
                  <span class="drag-handle">⋮⋮</span>
                  <span class="file-name">{{ file }}</span>
                  <button class="btn--micro" @click="removeDdlFile(dIndex)">×</button>
                </div>
              </div>
              <div class="empty-text" v-else>DDL 없음</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="modal-footer">
        <!-- Hidden inputs -->
        <input ref="folderInput" type="file" webkitdirectory class="hidden" @change="handleFolderSelect" />
        <input ref="ddlFileInput" type="file" multiple accept=".sql" class="hidden" @change="handleDdlFileSelect" />
        <input ref="systemFileInput" type="file" multiple accept=".sql,.java,.xml,.properties,.json,.py,.txt" class="hidden" @change="handleSystemFileSelect" />
        
        <div class="validation-info">
          <span class="file-summary" v-if="hasFiles">총 {{ totalFileCount }}개 파일</span>
          <span class="validation-error" v-if="validationError && hasFiles">⚠️ {{ validationError }}</span>
        </div>
        <div class="spacer"></div>
        <button class="btn btn--secondary" @click="emit('cancel')">취소</button>
        <button class="btn btn--primary" @click="handleConfirm" :disabled="!isValid">✓ 업로드</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  animation: fadeIn var(--transition-fast);
}

.modal {
  width: 90%;
  max-width: 800px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: slideUp var(--transition-normal);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  font-size: 17px;
  font-weight: 600;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  font-size: 18px;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  
  &:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.top-row {
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-lg);
}

.project-name-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  
  .input {
    font-size: 14px;
    padding: 10px 12px;
  }
}

.folder-btn {
  flex-shrink: 0;
  white-space: nowrap;
  padding: 10px 16px;
}

.drag-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
  padding: 0 4px;
}

.content-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-lg);
  flex: 1;
  min-height: 0;
}

.section {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
  transition: border-color 0.2s, box-shadow 0.2s;
  
  &.drop-target {
    border-color: var(--color-accent-primary);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.section-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  max-height: 250px;
  min-height: 120px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.btn--text {
  background: transparent;
  border: none;
  color: var(--color-accent-primary);
  cursor: pointer;
  font-size: 13px;
  padding: 4px 8px;
  font-weight: 500;
  
  &:hover {
    text-decoration: underline;
  }
}

.system-item {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  border: 1px solid var(--color-border);
  transition: border-color 0.2s, box-shadow 0.2s;
  
  &:last-child {
    margin-bottom: 0;
  }
  
  &.drop-target {
    border-color: var(--color-accent-primary);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }
}

.system-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.system-name-input {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  padding: 6px 10px;
}

.file-count {
  font-size: 12px;
  color: var(--color-text-muted);
  background: var(--color-bg-tertiary);
  padding: 3px 8px;
  border-radius: 12px;
  font-weight: 500;
}

.btn--icon {
  padding: 4px;
  min-width: 24px;
  min-height: 24px;
  font-size: 12px;
}

.btn--xs {
  min-width: 24px;
  min-height: 24px;
  padding: 4px;
  font-size: 12px;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: var(--spacing-sm);
}

.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  cursor: grab;
  transition: background 0.15s;
  
  &:hover {
    background: var(--color-bg-hover);
  }
  
  &:active {
    cursor: grabbing;
  }
  
  &.ddl-item {
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.2);
  }
}

.drag-handle {
  color: var(--color-text-muted);
  font-size: 10px;
  letter-spacing: 1px;
  user-select: none;
}

.file-name {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  color: var(--color-text-primary);
}

.btn--micro {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
  line-height: 1;
  border-radius: var(--radius-sm);
  
  &:hover {
    color: var(--color-danger);
    background: rgba(239, 68, 68, 0.1);
  }
}

.empty-text {
  font-size: 13px;
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--spacing-lg);
}

.modal-footer {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: 1px solid var(--color-border);
}

.validation-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-summary {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.validation-error {
  font-size: 12px;
  color: var(--color-danger);
}

.spacer {
  flex: 1;
}

.hidden {
  display: none;
}

.btn--sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: 12px;
}

.required {
  color: var(--color-danger);
}

.input--error {
  border-color: var(--color-danger) !important;
  
  &:focus {
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
  }
}
</style>
