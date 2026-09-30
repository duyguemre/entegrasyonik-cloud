<template>
  <div class="bo-page">
    <div class="bo-page__head">
      <div>
        <h1 class="bo-page__title">Redis ve MongoDB</h1>
        <p class="bo-page__lede">Redis ve MongoDB'nin sağlığı, kaynak kullanımı ve yavaş sorgular. Yalnız sayaç ve boyut gösterilir; belge içeriği, ham anahtar ve sorgu değeri hiçbir zaman görünmez.</p>
      </div>
    </div>

    <EkPageTabs v-model="tab" :tabs="tabs" label="Altyapı bölümleri" />

    <RedisPanel v-if="tab === 'redis'" />
    <MongoPanel v-else-if="tab === 'mongodb'" />
    <SlowQueriesPanel v-else />
  </div>
</template>

<script setup lang="ts">
import { EkPageTabs, type EkPageTab } from '@entegrasyonik/ui/components'
import { useTabQuery } from '@bo/composables/useTabQuery'
import RedisPanel from './RedisPanel.vue'
import MongoPanel from './MongoPanel.vue'
import SlowQueriesPanel from './SlowQueriesPanel.vue'
import '@bo/styles/kit.css'

const TABS = ['redis', 'mongodb', 'yavas'] as const
const tab = useTabQuery(TABS, 'redis')
const tabs: EkPageTab[] = [
  { value: 'redis', label: 'Redis', icon: 'mdi-memory' },
  { value: 'mongodb', label: 'MongoDB', icon: 'mdi-database-outline' },
  { value: 'yavas', label: 'Yavaş sorgular', icon: 'mdi-timer-alert-outline' },
]
</script>
