<script setup lang="ts">
import { ref } from 'vue'
import { IconX, IconTrash, IconPlus, IconAlertTriangle } from '@/components/icons'

export type DataAction = 'delete' | 'append' | 'cancel'
export type NameCaseOption = 'original' | 'uppercase' | 'lowercase'

const props = defineProps<{
  isOpen: boolean
  nodeCount: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', action: DataAction, nameCase: NameCaseOption): void
}>()

// 대소문자 변환 옵션
const nameCaseOption = ref<NameCaseOption>('original')

function handleAction(action: DataAction) {
  emit('confirm', action, nameCaseOption.value)
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="isOpen" class="modal-overlay" @click.self="handleClose">
        <div class="modal-container">
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-title">
              <span class="modal-icon">📊</span>
              <span>기존 데이터 감지</span>
            </div>
            <button class="modal-close" @click="handleClose">
              <IconX :size="18" />
            </button>
          </div>
          
          <!-- Body -->
          <div class="modal-body">
            <!-- Warning Message -->
            <div class="warning-box">
              <IconAlertTriangle :size="24" class="warning-icon" />
              <div class="warning-content">
                <p class="warning-title">Neo4j에 기존 데이터가 있습니다</p>
                <p class="warning-desc">
                  현재 <strong>{{ nodeCount.toLocaleString() }}개</strong>의 노드가 저장되어 있습니다.
                </p>
              </div>
            </div>
            
            <!-- Name Case Option -->
            <div class="section-label">메타데이터 대소문자 변환</div>
            <div class="case-options">
              <label class="case-option" :class="{ active: nameCaseOption === 'original' }">
                <input type="radio" v-model="nameCaseOption" value="original" />
                <span class="case-icon">Aa</span>
                <span class="case-label">원본 유지</span>
              </label>
              <label class="case-option" :class="{ active: nameCaseOption === 'uppercase' }">
                <input type="radio" v-model="nameCaseOption" value="uppercase" />
                <span class="case-icon">AA</span>
                <span class="case-label">대문자</span>
              </label>
              <label class="case-option" :class="{ active: nameCaseOption === 'lowercase' }">
                <input type="radio" v-model="nameCaseOption" value="lowercase" />
                <span class="case-icon">aa</span>
                <span class="case-label">소문자</span>
              </label>
            </div>
            <p class="case-hint">테이블명, 컬럼명 등 메타데이터에 적용됩니다</p>
            
            <!-- Action Options -->
            <div class="section-label" style="margin-top: 20px;">처리 방법 선택</div>
            
            <div class="action-options">
              <!-- Delete and Start Fresh -->
              <button 
                class="action-option action-delete"
                @click="handleAction('delete')"
              >
                <div class="action-icon">
                  <IconTrash :size="24" />
                </div>
                <div class="action-content">
                  <span class="action-title">삭제 후 시작</span>
                  <span class="action-desc">기존 데이터를 모두 삭제하고 새로 시작합니다</span>
                </div>
              </button>
              
              <!-- Append to Existing -->
              <button 
                class="action-option action-append"
                @click="handleAction('append')"
              >
                <div class="action-icon">
                  <IconPlus :size="24" />
                </div>
                <div class="action-content">
                  <span class="action-title">기존 데이터에 추가</span>
                  <span class="action-desc">기존 데이터를 유지하고 새 데이터를 추가합니다</span>
                </div>
              </button>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="modal-footer">
            <button class="btn btn--secondary" @click="handleClose">
              취소
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
/* Modal Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

/* Modal Container */
.modal-container {
  background: var(--color-bg-secondary, #25262b);
  border: 1px solid var(--color-border, #373a40);
  border-radius: 16px;
  width: 480px;
  max-width: 95vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

/* Modal Transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-20px);
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, #fab005 0%, #f59f00 100%);
  color: #1a1b26;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.1rem;
  font-weight: 600;
}

.modal-icon {
  font-size: 1.3rem;
}

.modal-close {
  background: rgba(0, 0, 0, 0.1);
  border: none;
  color: #1a1b26;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  
  &:hover {
    background: rgba(0, 0, 0, 0.2);
  }
}

/* Modal Body */
.modal-body {
  padding: 20px;
}

/* Warning Box */
.warning-box {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  background: rgba(250, 176, 5, 0.1);
  border: 1px solid rgba(250, 176, 5, 0.3);
  border-radius: 12px;
  margin-bottom: 20px;
}

.warning-icon {
  color: #fab005;
  flex-shrink: 0;
  margin-top: 2px;
}

.warning-content {
  flex: 1;
}

.warning-title {
  margin: 0 0 6px 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-bright, #fff);
}

.warning-desc {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-light, #909296);
  
  strong {
    color: #fab005;
    font-weight: 600;
  }
}

/* Section Label */
.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-light, #909296);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 12px;
}

/* Case Options */
.case-options {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}

.case-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px;
  background: var(--color-bg-tertiary, #373a40);
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  
  input {
    display: none;
  }
  
  &:hover {
    background: var(--color-bg, #25262b);
  }
  
  &.active {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
    
    .case-icon {
      color: #38bdf8;
    }
  }
}

.case-icon {
  font-size: 1.2rem;
  font-weight: 700;
  font-family: var(--font-mono, monospace);
  color: var(--color-text-light, #909296);
  transition: color 0.2s;
}

.case-label {
  font-size: 0.8rem;
  color: var(--color-text, #c1c2c5);
}

.case-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #5c5f66);
  font-style: italic;
}

/* Action Options */
.action-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-option {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-bg-tertiary, #373a40);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  width: 100%;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }
  
  &.action-delete {
    &:hover {
      border-color: #fa5252;
      background: rgba(250, 82, 82, 0.1);
      
      .action-icon {
        background: rgba(250, 82, 82, 0.2);
        color: #fa5252;
      }
    }
  }
  
  &.action-append {
    &:hover {
      border-color: #40c057;
      background: rgba(64, 192, 87, 0.1);
      
      .action-icon {
        background: rgba(64, 192, 87, 0.2);
        color: #40c057;
      }
    }
  }
}

.action-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg, #25262b);
  border-radius: 10px;
  color: var(--color-text-light, #909296);
  transition: all 0.2s ease;
}

.action-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.action-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-bright, #fff);
}

.action-desc {
  font-size: 0.85rem;
  color: var(--color-text-light, #909296);
}

/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #373a40);
  background: var(--color-bg-tertiary, #1a1b26);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  
  &--secondary {
    background: var(--color-bg-tertiary, #373a40);
    color: var(--color-text, #c1c2c5);
    border: 1px solid var(--color-border, #373a40);
    
    &:hover {
      background: var(--color-bg, #25262b);
      border-color: var(--color-text-light, #909296);
    }
  }
}
</style>



