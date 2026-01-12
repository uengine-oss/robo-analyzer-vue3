<script setup lang="ts">
import UploadTab from '@/components/upload/UploadTab.vue'
import GraphTab from '@/components/graph/GraphTab.vue'
import LineageTab from '@/components/lineage/LineageTab.vue'
import GlossaryTab from '@/components/glossary/GlossaryTab.vue'
import Text2SqlTab from '@/components/text2sql/Text2SqlTab.vue'
import LangChainTab from '@/components/langchain-text2sql/LangChainTab.vue'
import { OlapTab } from '@/components/olap'
import { DataQuality, IncidentManager, AlertsPage, EventDetection, WatchAgent } from '@/components/observability'
import AlarmToast from '@/components/common/AlarmToast.vue'
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
    <LineageTab v-else-if="activeTab === 'lineage'" />
    <GlossaryTab v-else-if="activeTab === 'glossary'" />
    <OlapTab v-else-if="activeTab === 'olap'" />
    <Text2SqlTab v-else-if="activeTab === 'text2sql'" />
    <LangChainTab v-else-if="activeTab === 'langchain'" />
    
    <!-- Observability 탭들 -->
    <DataQuality v-else-if="activeTab === 'data-quality'" />
    <IncidentManager v-else-if="activeTab === 'incident-manager'" />
    <AlertsPage v-else-if="activeTab === 'alerts'" />
    <EventDetection v-else-if="activeTab === 'event-detection'" />
    <WatchAgent v-else-if="activeTab === 'watch-agent'" />
    
    <!-- 실시간 알람 토스트 (항상 표시) -->
    <AlarmToast />
  </div>
</template>

<style lang="scss" scoped>
.home-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg);
  border-radius: var(--radius-lg) 0 0 0;
  box-shadow: -1px 0 0 var(--color-border);
}
</style>
