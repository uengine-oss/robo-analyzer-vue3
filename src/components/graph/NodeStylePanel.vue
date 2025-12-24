<script setup lang="ts">
/**
 * NodeStylePanel.vue
 * 노드 스타일 설정 플로팅 패널
 * 
 * 그래프 영역 위에 오버레이로 표시되는 노드 타입별 스타일 설정 패널
 */

import { computed, ref, watch, onMounted } from 'vue'
import { NODE_COLORS, NODE_SIZES } from '@/config/graphStyles'
import { 
  getNodeStyle, 
  setNodeColor, 
  setNodeSize,
  type NodeStyleConfig 
} from '@/utils/nodeStyleStorage'

// ============================================================================
// Props & Emits
// ============================================================================

interface Props {
  nodeType: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'style-updated': []
  'close': []
}>()

// ============================================================================
// 상수 정의
// ============================================================================

/** 사용 가능한 색상 팔레트 (사진과 동일한 색상) */
const COLOR_PALETTE = [
  '#D4A574', // light brown/beige
  '#FFB6C1', // pink
  '#87CEEB', // light blue
  '#90EE90', // light green
  '#FFA07A', // light salmon
  '#FFD700', // yellow
  '#DDA0DD', // light purple
  '#F0E68C', // light khaki
  '#E0E0E0', // light gray
  '#FF8C00', // dark orange
  '#48D1CC', // medium turquoise
  '#CD5C5C'  // indian red
]

/** 사용 가능한 크기 옵션 (4가지 - 사진과 동일) */
const SIZE_OPTIONS = [20, 25, 30, 35]

// ============================================================================
// 상태
// ============================================================================

/** 현재 노드 타입의 저장된 스타일 */
const savedStyle = ref<NodeStyleConfig | null>(null)

/** 현재 선택된 색상 */
const selectedColor = ref<string>('')

/** 현재 선택된 크기 */
const selectedSize = ref<number>(30)

// ============================================================================
// Computed
// ============================================================================

/** 노드 타입 색상 (저장된 값 또는 기본값) */
const nodeTypeColor = computed(() => {
  if (!props.nodeType) return NODE_COLORS.DEFAULT
  if (savedStyle.value?.color) {
    return savedStyle.value.color
  }
  const type = props.nodeType
  return NODE_COLORS[type] || NODE_COLORS[type.toUpperCase()] || NODE_COLORS.DEFAULT
})

// ============================================================================
// 이벤트 핸들러
// ============================================================================

/**
 * 노드 스타일 로드
 */
function loadNodeStyle(): void {
  if (!props.nodeType) {
    savedStyle.value = null
    selectedColor.value = ''
    selectedSize.value = 30
    return
  }
  
  const style = getNodeStyle(props.nodeType)
  savedStyle.value = style
  
  if (style?.color) {
    selectedColor.value = style.color
  } else {
    const type = props.nodeType
    selectedColor.value = NODE_COLORS[type] || NODE_COLORS[type.toUpperCase()] || NODE_COLORS.DEFAULT
  }
  
  if (style?.size) {
    selectedSize.value = style.size
  } else {
    const type = props.nodeType
    selectedSize.value = NODE_SIZES[type] || NODE_SIZES[type.toUpperCase()] || NODE_SIZES.DEFAULT
  }
}

/**
 * 색상 선택
 */
function handleColorSelect(color: string): void {
  if (!props.nodeType) return
  
  selectedColor.value = color
  setNodeColor(props.nodeType, color)
  savedStyle.value = { ...savedStyle.value, color }
  emit('style-updated')
}

/**
 * 크기 선택
 */
function handleSizeSelect(size: number): void {
  if (!props.nodeType) return
  
  selectedSize.value = size
  setNodeSize(props.nodeType, size)
  savedStyle.value = { ...savedStyle.value, size }
  emit('style-updated')
}

// 노드 타입 변경 시 스타일 로드
watch(() => props.nodeType, () => {
  loadNodeStyle()
}, { immediate: true })

onMounted(() => {
  loadNodeStyle()
})

</script>

<template>
  <div class="node-style-panel" v-if="nodeType">
    <div class="style-panel-header" :style="{ background: nodeTypeColor }">
      {{ nodeType }}
      <button class="close-btn" @click="emit('close')" title="닫기">×</button>
    </div>
    
    <!-- 색상 선택 -->
    <div class="style-section">
      <div class="style-label">Color</div>
      <div class="color-palette">
        <button
          v-for="color in COLOR_PALETTE"
          :key="color"
          class="color-swatch"
          :class="{ active: selectedColor === color }"
          :style="{ background: color }"
          @click="handleColorSelect(color)"
          :title="color"
        ></button>
      </div>
    </div>
    
    <!-- 크기 선택 -->
    <div class="style-section">
      <div class="style-label">Size</div>
      <div class="size-options">
        <button
          v-for="size in SIZE_OPTIONS"
          :key="size"
          class="size-swatch"
          :class="{ active: selectedSize === size }"
          :style="{ width: `${size * 0.6}px`, height: `${size * 0.6}px` }"
          @click="handleSizeSelect(size)"
          :title="`Size: ${size}`"
        ></button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.node-style-panel {
  position: relative;
  min-width: 240px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.style-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: white;
  background: #D4A574;
  
  .close-btn {
    width: 20px;
    height: 20px;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 18px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.2s ease;
    
    &:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  }
}

.style-section {
  padding: 10px 14px;
  border-top: 1px solid #f1f5f9;
  
  &:first-of-type {
    border-top: none;
  }
}

.style-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #64748b;
  margin-bottom: 8px;
}

.color-palette {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
  background: none;
  
  &:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
  
  &.active {
    border-color: #1e293b;
    box-shadow: 0 0 0 2px white, 0 0 0 4px #1e293b;
  }
}

.size-options {
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-swatch {
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background: #e2e8f0;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
  flex-shrink: 0;
  min-width: 20px;
  min-height: 20px;
  
  &:hover {
    border-color: #94a3b8;
    background: #cbd5e1;
  }
  
  &.active {
    border-color: #1e293b;
    background: #64748b;
    box-shadow: 0 0 0 2px white, 0 0 0 4px #1e293b;
  }
}
</style>

