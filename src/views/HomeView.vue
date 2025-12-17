<script setup lang="ts">
import TabContainer from '@/components/common/TabContainer.vue'
import UploadTab from '@/components/upload/UploadTab.vue'
import GraphTab from '@/components/graph/GraphTab.vue'
import ConvertTab from '@/components/convert/ConvertTab.vue'
import { useSessionStore } from '@/stores/session'
import { storeToRefs } from 'pinia'

const sessionStore = useSessionStore()
const { activeTab } = storeToRefs(sessionStore)

const tabs = [
  { id: 'upload', label: '업로드', icon: '📁' },
  { id: 'graph', label: '그래프', icon: '🔗' },
  { id: 'convert', label: '전환결과', icon: '⚡' }
]
</script>

<template>
  <div class="home-view">
    <TabContainer v-model="activeTab" :tabs="tabs">
      <template #upload>
        <UploadTab />
      </template>
      <template #graph>
        <GraphTab />
      </template>
      <template #convert>
        <ConvertTab />
      </template>
    </TabContainer>
  </div>
</template>

<style lang="scss" scoped>
.home-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>

