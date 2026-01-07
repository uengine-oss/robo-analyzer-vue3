<script setup lang="ts">
import { onMounted } from 'vue'
import TopToolbar from '@/components/common/TopToolbar.vue'
import SideNav from '@/components/common/SideNav.vue'
import { RouterView } from 'vue-router'
import { useProjectStore } from '@/stores/project'

const projectStore = useProjectStore()

// 앱 초기화 시 Neo4j에서 기존 그래프 데이터 로드
onMounted(async () => {
  try {
    await projectStore.loadExistingGraphData()
  } catch (error) {
    console.warn('초기 그래프 데이터 로드 실패:', error)
  }
})
</script>

<template>
  <div class="main-layout">
    <!-- 상단 헤더 -->
    <TopToolbar />
    
    <!-- 메인 영역: 사이드바 + 콘텐츠 -->
    <div class="main-body">
      <!-- 왼쪽 사이드바 네비게이션 -->
      <SideNav />
      
      <!-- 메인 콘텐츠 -->
      <main class="main-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.main-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.main-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  background: var(--color-bg);
}
</style>
