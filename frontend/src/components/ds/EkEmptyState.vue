<!--
  frontend/src/components/ds/EkEmptyState.vue

  ADR-0015 Karar 3.10/6.1 — boş durum, TEK KAYNAK (mevcut
  `components/layout/EmptyState.vue` API'si korunarak GENİŞLETİLİR — bu yeni
  bileşen `variant` prop'u ekler, `icon/title/message/showAction/actionText`
  API'si AYNI kalır). 96px inline SVG yerine (illüstrasyon YOK, maskot YOK)
  bu sürüm `v-icon` kullanır — tek renk (`content-subtle`), premium-ui-
  standards "maskot yok" ilkesiyle uyumlu en düşük maliyetli çözüm.

  5 varyant: no-data | no-results | error | not-connected | first-run.

  Kullanım:
    <EkEmptyState variant="no-results" title="Sonuç yok" message="Farklı bir arama deneyin." />
    <EkEmptyState variant="first-run" title="Henüz ürün yok" message="İlk ürününüzü ekleyin."
      show-action action-text="Yeni ürün" @action="openCreate" />
-->
<template>
  <div class="ek-empty-state">
    <v-icon :icon="icon" size="48" class="ek-empty-state__icon" aria-hidden="true" />
    <div class="ek-empty-state__title">{{ title }}</div>
    <div class="ek-empty-state__message">{{ message }}</div>
    <v-btn v-if="showAction" color="primary" :prepend-icon="actionIcon" @click="emit('action')">
      {{ actionText }}
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const VARIANT_ICONS: Record<string, string> = {
  'no-data': 'mdi-tray-arrow-down',
  'no-results': 'mdi-magnify-close',
  error: 'mdi-alert-circle-outline',
  'not-connected': 'mdi-lan-disconnect',
  'first-run': 'mdi-rocket-launch-outline',
}

const props = withDefaults(
  defineProps<{
    variant?: 'no-data' | 'no-results' | 'error' | 'not-connected' | 'first-run'
    title: string
    message: string
    showAction?: boolean
    actionText?: string
    actionIcon?: string
  }>(),
  {
    variant: 'no-data',
    showAction: false,
    actionText: 'Yeni Ekle',
    actionIcon: 'mdi-plus',
  },
)

const icon = computed(() => VARIANT_ICONS[props.variant] ?? VARIANT_ICONS['no-data'])

const emit = defineEmits<{ action: [] }>()
</script>

<style scoped>
.ek-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-8) var(--ek-space-4);
  min-height: 240px;
}

.ek-empty-state__icon {
  color: var(--ek-color-content-subtle);
  margin-bottom: var(--ek-space-2);
}

.ek-empty-state__title {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-empty-state__message {
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-muted);
  max-width: 400px;
  margin-bottom: var(--ek-space-2);
}
</style>
