<script setup lang="ts">
import TopToolbar from '@/components/common/TopToolbar.vue'
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="main-layout">
    <TopToolbar />
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.main-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-primary);
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  padding: var(--spacing-md);
}
</style>

