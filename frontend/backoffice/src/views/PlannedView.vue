<template>
  <div class="bo-page">
    <div class="bo-page__head">
      <div>
        <h1 class="bo-page__title">{{ screen?.label ?? 'Planlanan ekran' }}</h1>
        <p class="bo-page__lede">{{ screen?.plan?.summary }}</p>
      </div>
      <EkStatusChip tone="info" label="Planlandı · Aşama 3–4" icon="mdi-map-marker-path" />
    </div>
    <EkCard v-if="screen?.plan" title="Bu ekranda olacaklar" :icon="screen.icon" icon-tone="info">
      <ul class="bo-planned__list">
        <li v-for="item in screen.plan.items" :key="item"><v-icon icon="mdi-circle-small" aria-hidden="true" />{{ item }}</li>
      </ul>
      <p class="bo-planned__src">Uçlar: <code>{{ screen.plan.endpoints }}</code> · ayrıntı: BACKOFFICE_PLAN §1.2 / §2</p>
    </EkCard>
    <EkEmptyState v-else variant="no-data" title="Ekran bulunamadı" message="Menüden bir ekran seçin." />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { EkCard, EkEmptyState, EkStatusChip } from '@entegrasyonik/ui/components'
import { SCREENS } from '@bo/navigation/screens'

const route = useRoute()
const screen = computed(() => SCREENS.find((s) => s.key === route.params.key && s.status === 'planned'))
</script>

<style scoped>
.bo-planned__list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
}

.bo-planned__list li {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.bo-planned__src {
  margin: var(--ek-space-4) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-planned__src code {
  font-family: var(--ek-font-mono);
}
</style>
