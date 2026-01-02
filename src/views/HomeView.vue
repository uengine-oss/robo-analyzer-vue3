<script setup lang="ts">
import UploadTab from '@/components/upload/UploadTab.vue'
import GraphTab from '@/components/graph/GraphTab.vue'
import Text2SqlTab from '@/components/text2sql/Text2SqlTab.vue'
import ConvertTab from '@/components/convert/ConvertTab.vue'
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'

const sessionStore = useSessionStore()
const { activeTab } = storeToRefs(sessionStore)
</script>

<template>
  <div class="home-view">
    <!-- 현재 활성 탭에 따라 컴포넌트 표시 -->
    <UploadTab v-if="activeTab === 'upload'" />
    <GraphTab v-else-if="activeTab === 'graph'" />
    <Text2SqlTab v-else-if="activeTab === 'text2sql'" />
    <ConvertTab v-else-if="activeTab === 'convert'" />
  </div>
</template>

<style lang="scss" scoped>
.home-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
  border-radius: 12px 0 0 0;
  box-shadow: -1px 0 0 #e5e7eb;
}
</style>
