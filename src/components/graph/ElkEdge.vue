<script setup lang="ts">
import { computed } from 'vue'
import type { EdgeProps } from '@vue-flow/core'

const props = defineProps<EdgeProps>()

// ELK points (start, bends, end) 를 data.points로 받음
const points = computed(() => (props.data as any)?.points as Array<{ x: number; y: number }> | null)

const pathD = computed(() => {
  if (!points.value || points.value.length < 2) {
    // fallback: 그냥 직선
    return `M ${props.sourceX},${props.sourceY} L ${props.targetX},${props.targetY}`
  }
  const [first, ...rest] = points.value
  return `M ${first.x},${first.y} ` + rest.map((p) => `L ${p.x},${p.y}`).join(' ')
})
</script>

<template>
  <g class="elk-edge">
    <path
      class="vue-flow__edge-path"
      :d="pathD"
      :style="props.style"
      fill="none"
    />
    <!-- 라벨은 VueFlow 기본 라벨 렌더 사용 -->
  </g>
</template>

