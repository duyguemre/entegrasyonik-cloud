<!--
  frontend/src/components/ds/EkPageTabs.vue

  ADR-0015 Karar 6.1 + Aşama 6b (Standart 5) — SAYFA İÇİ SEKME, TEK KAYNAK (ikinci seviye). Ana çalışma alanı
  sekmelerinden (EkWorkspaceTabs: klasör sekmesi, şerit zemini) görsel olarak AYRIŞIR.
  FR3 madde 5 (fe-r3a): SİTE İLE AYNI DİL — "segment tepsisi" (site `entegrasyonlar` süzgeci): soluk tepsi
  (`surface-muted` + 1px `border-default`, yarıçap `xl`), segmentler zeminsiz; ETKİN segment yüzeye çıkar
  (`surface` + ince kenarlık + kart gölgesi + `content-strong` yarı kalın), sayı hapı etkinde aksiyon tonunda.
  Alt çizgi/kaydırıcı YOK (Vuetify'ın JS kaydırıcısı kapalı — hareket tek kaynak, FR3 madde 7). Genişlik içerik kadar;
  taşmada yatay kaydırma (oklar; çubuk gizli), etkin segment görünür alana gelir. Kalınlık değişimi genişliği
  oynatmaz (hayalet yarı kalın etiket). Klavye/ARIA: Vuetify `v-tabs` (role=tablist, ←/→). URL'ye yazma ÇAĞIRANIN
  sorumluluğudur (saf sunum).

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
    :height="dense ? 28 : 32"
    hide-slider
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
      <span class="ek-page-tabs__label" :data-text="tab.label">{{ tab.label }}</span>
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
/* Tepsi: içerik genişliğinde, soluk zemin + ince kenarlık (site `.filters`). */
.ek-page-tabs {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  height: auto !important;
  padding: 3px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-xl);
  background: var(--ek-color-surface-muted) !important;
}

.ek-page-tabs :deep(.v-slide-group__content) {
  gap: 2px;
}

.ek-page-tabs :deep(.v-slide-group__prev),
.ek-page-tabs :deep(.v-slide-group__next) {
  min-width: 28px;
  flex: 0 0 28px;
  color: var(--ek-color-content-muted);
}

.ek-page-tabs__tab {
  min-width: 0 !important;
  padding: 0 var(--ek-space-3) !important;
  border: 1px solid transparent !important;
  border-radius: var(--ek-radius-lg) !important;
  background: transparent;
  color: var(--ek-color-content-default) !important;
  letter-spacing: normal !important;
  text-transform: none !important;
  font-size: var(--ek-type-tab-size) !important;
  font-weight: var(--ek-type-tab-weight) !important;
  transition: var(--ek-transition-colors);
}

.ek-page-tabs--dense .ek-page-tabs__tab {
  padding: 0 var(--ek-space-2) !important;
}

/* Vuetify'ın basma/hover katmanı yerine kendi sakin zeminimiz. */
.ek-page-tabs__tab :deep(.v-btn__overlay),
.ek-page-tabs__tab :deep(.v-btn__underlay),
.ek-page-tabs__tab :deep(.v-tab__slider) {
  display: none;
}

.ek-page-tabs__tab:hover:not(.v-tab--selected) {
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong) !important;
}

.ek-page-tabs__tab:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

/* ETKİN: yüzeye çıkan segment (site `[aria-pressed='true']`). */
.ek-page-tabs__tab.v-tab--selected {
  border-color: var(--ek-color-border-default) !important;
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  color: var(--ek-color-content-strong) !important;
  font-weight: var(--ek-font-weight-semibold) !important;
}

.ek-page-tabs__tab.v-tab--selected:focus-visible {
  box-shadow: var(--ek-shadow-card), var(--ek-focus-ring);
}

.ek-page-tabs__tab :deep(.v-btn__content) {
  gap: var(--ek-space-2);
}

/* Hayalet yarı kalın etiket: kutu her durumda yarı kalın genişliği ayırır → etkinleşince komşular kaymaz. */
.ek-page-tabs__label {
  display: inline-flex;
  flex-direction: column;
}

.ek-page-tabs__label::after {
  content: attr(data-text);
  content: attr(data-text) / '';
  height: 0;
  overflow: hidden;
  visibility: hidden;
  font-weight: var(--ek-font-weight-semibold);
  pointer-events: none;
  user-select: none;
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
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: 1;
  font-weight: var(--ek-font-weight-semibold);
}

.v-tab--selected .ek-page-tabs__count {
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}
</style>
