<!--
  frontend/src/components/ds/EkPageTabs.vue

  ADR-0015 Karar 6.1 + Aşama 6b (Standart 5) — SAYFA İÇİ SEKME, TEK KAYNAK (ikinci seviye). Ana çalışma alanı
  sekmelerinden (EkWorkspaceTabs: klasör sekmesi, şerit zemini) görsel olarak AYRIŞIR: zeminsiz metin sekmeleri,
  etkin = 2px aksiyon alt çizgisi + yarı kalın metin, ince kenarlık üzerinde; isteğe bağlı ikon (16px) ve sayı
  rozeti (etkinde aksiyon tonunda). Taşmada yatay kaydırma (oklar; çubuk gizli), etkin sekme görünür alana gelir.
  Klavye/ARIA: Vuetify `v-tabs` (role=tablist, ←/→). URL'ye yazma ÇAĞIRANIN sorumluluğudur (saf sunum).

    <EkPageTabs v-model="tab" label="Müşteri ayrıntıları" :tabs="[
      { value: 'general', label: 'Genel bilgiler', icon: 'mdi-account-outline' },
      { value: 'orders', label: 'Sipariş geçmişi', count: 12 },
    ]" />
-->
<template>
  <v-tabs
    :model-value="modelValue"
    class="ek-page-tabs"
    :class="{ 'ek-page-tabs--dense': dense }"
    show-arrows
    :height="dense ? 36 : 40"
    slider-color="primary"
    :aria-label="label"
    @update:model-value="(value) => emit('update:modelValue', value as string | number)"
  >
    <v-tab
      v-for="tab in tabs"
      :key="tab.value"
      :value="tab.value"
      :disabled="tab.disabled"
      class="ek-page-tabs__tab"
      :ripple="false"
    >
      <v-icon v-if="tab.icon" class="ek-page-tabs__icon" :icon="tab.icon" aria-hidden="true" />
      <span class="ek-page-tabs__label">{{ tab.label }}</span>
      <span v-if="tab.count !== undefined && tab.count !== null" class="ek-page-tabs__count ek-num">{{ tab.count }}</span>
    </v-tab>
  </v-tabs>
</template>

<script setup lang="ts">
export interface EkPageTab {
  value: string | number
  label: string
  icon?: string
  /** Sayı rozeti (ör. kayıt sayısı); 0 da gösterilir. */
  count?: number | null
  disabled?: boolean
}

withDefaults(
  defineProps<{
    modelValue: string | number
    tabs: EkPageTab[]
    /** Sekme listesinin erişilebilir adı. */
    label?: string
    /** Diyalog/panel içinde daha sıkı (36px). */
    dense?: boolean
  }>(),
  { dense: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
</script>

<style scoped>
.ek-page-tabs {
  border-bottom: 1px solid var(--ek-color-border-default);
  background: transparent;
}

.ek-page-tabs :deep(.v-slide-group__content) {
  gap: var(--ek-space-1);
}

.ek-page-tabs :deep(.v-slide-group__prev),
.ek-page-tabs :deep(.v-slide-group__next) {
  min-width: 32px;
  flex: 0 0 32px;
  color: var(--ek-color-content-muted);
}

.ek-page-tabs__tab {
  min-width: 0 !important;
  padding: 0 var(--ek-space-3) !important;
  letter-spacing: normal !important;
  text-transform: none !important;
  font-size: var(--ek-type-tab-size) !important;
  font-weight: var(--ek-type-tab-weight) !important;
  color: var(--ek-color-content-muted) !important;
  border-radius: var(--ek-radius-control) var(--ek-radius-control) 0 0 !important;
  transition: var(--ek-transition-colors);
}

.ek-page-tabs__tab:hover {
  color: var(--ek-color-content-strong) !important;
  background: var(--ek-color-surface-sunken);
}

.ek-page-tabs__tab:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.ek-page-tabs__tab.v-tab--selected {
  color: var(--ek-color-content-strong) !important;
  font-weight: var(--ek-font-weight-semibold) !important;
}

.ek-page-tabs__tab :deep(.v-btn__content) {
  gap: var(--ek-space-2);
}

.ek-page-tabs__tab :deep(.v-tab__slider) {
  height: 2px;
  border-radius: 2px 2px 0 0;
}

.ek-page-tabs__icon {
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-muted);
}

.v-tab--selected .ek-page-tabs__icon {
  color: var(--ek-color-action);
}

.ek-page-tabs__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
  border: 1px solid var(--ek-color-border-default);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: 1;
  font-weight: var(--ek-font-weight-semibold);
}

.v-tab--selected .ek-page-tabs__count {
  background: var(--ek-color-action-subtle);
  border-color: var(--ek-color-action-border);
  color: var(--ek-color-action-emphasis);
}
</style>
