<!--
  frontend/src/components/ds/templates/EkReadonlyPanelTemplate.vue

  ADR-0015 Karar 3.9.4/6.1 — salt-okunur panel (sağlık/denetim) TEK KAYNAK
  şablonu. KPI satırı → durum listesi (`EkStatusChip`) → zaman çizelgesi/log
  tablosu (slot). "Son güncelleme: HH:mm · Yenile" göstergesi vardır.
  Otomatik yenileme varsa yalnızca METİN değişir — nabız/yanıp sönme
  animasyonu YOK (premium-ui-standards).

  Kullanım:
    <EkReadonlyPanelTemplate title="Entegrasyon Sağlığı" :last-updated="lastUpdated" @refresh="refetch">
      <template #kpis><EkKpiRow>...</EkKpiRow></template>
      <template #status-list>
        <EkStatusChip v-for="i in integrations" :key="i.code" :tone="..." :label="..." />
      </template>
      <EkDataTable :items="logs" :columns="logColumns" />
    </EkReadonlyPanelTemplate>
-->
<template>
  <div class="ek-readonly-panel">
    <EkPageHeader :title="title" :description="description" />

    <div v-if="$slots.kpis" class="ek-readonly-panel__kpis">
      <slot name="kpis" />
    </div>

    <div v-if="$slots['status-list']" class="ek-readonly-panel__status-list">
      <slot name="status-list" />
    </div>

    <div class="ek-readonly-panel__footer-meta">
      <span class="ek-readonly-panel__updated">
        Son güncelleme: {{ formattedLastUpdated }}
      </span>
      <v-btn variant="text" size="small" prepend-icon="mdi-refresh" @click="emit('refresh')">
        Yenile
      </v-btn>
    </div>

    <div class="ek-readonly-panel__content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkPageHeader from '../EkPageHeader.vue'
import { formatDateTime } from '@/composables/format'

const props = defineProps<{
  title: string
  description?: string
  lastUpdated?: Date | string | number | null
}>()

const emit = defineEmits<{ refresh: [] }>()

const formattedLastUpdated = computed(() => (props.lastUpdated ? formatDateTime(props.lastUpdated) : '—'))
</script>

<style scoped>
.ek-readonly-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}

.ek-readonly-panel__status-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.ek-readonly-panel__footer-meta {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.ek-readonly-panel__content {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
</style>
