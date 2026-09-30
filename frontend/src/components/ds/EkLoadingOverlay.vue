<!--
  frontend/src/components/ds/EkLoadingOverlay.vue

  DS-v2 Aşama 6b — Standart 8: ENGELLEYİCİ İŞ ÖRTÜSÜ (kaydetme, silme, içe/dışa aktarma sürerken). Yalnız İLGİLİ içeriği
  örter (Standart 7): açık `attach` verilmezse çalışma alanı sekmesinin kabına bağlanır; sekme şeridi, üst bar, menü ve
  diğer sekmeler kullanılabilir kalır. Görünüm: açık yüzey perdesi (içerik sezilir) + ortada EkBrandLoader + iş metni
  + isteğe bağlı belirli ilerleme çubuğu (yüzde). Liste/sayfa ilk yüklemesi için örtü DEĞİL iskelet kullanılır
  (EkSkeleton / EkDataGrid `loading`); düğme içi iş için `EkButton loading`.

    <EkLoadingOverlay :model-value="saving" label="Ürün kaydediliyor…" />
    <EkLoadingOverlay :model-value="importing" label="İçe aktarılıyor" :progress="62" />
-->
<template>
  <v-overlay
    :model-value="modelValue"
    persistent
    :attach="target"
    :contained="!!target"
    :scrim="false"
    scroll-strategy="none"
    class="ek-loading-overlay align-center justify-center"
    content-class="ek-loading-overlay__content"
    :aria-busy="modelValue || undefined"
  >
    <div class="ek-loading-overlay__card">
      <EkBrandLoader :label="label" :size="44" />
      <div v-if="progress !== undefined" class="ek-loading-overlay__progress" role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100" :aria-label="label">
        <v-progress-linear :model-value="progress" height="4" rounded color="primary" bg-color="surface-sunken" bg-opacity="1" aria-hidden="true" />
        <span class="ek-loading-overlay__pct ek-num">%{{ Math.round(progress) }}</span>
      </div>
      <p v-if="hint" class="ek-loading-overlay__hint">{{ hint }}</p>
    </div>
  </v-overlay>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkBrandLoader from './EkBrandLoader.vue'
import { resolveOverlayAttach, useTabScope } from '@/composables/useTabScope'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    label?: string
    /** 0–100; verilirse belirli ilerleme çubuğu gösterilir. */
    progress?: number
    hint?: string
    attach?: string | boolean | Element
  }>(),
  { label: 'İşleniyor…' },
)

const scope = useTabScope()
const target = computed(() => resolveOverlayAttach(props.attach, scope))
</script>

<style>
/* Teleport edilir → scoped değil; yalnız `.ek-loading-overlay` ile sınırlı. */
.ek-loading-overlay.v-overlay {
  background: color-mix(in srgb, var(--ek-color-surface) 72%, transparent);
  backdrop-filter: saturate(0.9);
}

.ek-loading-overlay .ek-loading-overlay__content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.ek-loading-overlay__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 240px;
  max-width: min(360px, calc(100vw - var(--ek-space-8)));
  padding: var(--ek-space-6) var(--ek-space-8);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-dialog);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-dialog);
}

.ek-loading-overlay__progress {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
}

.ek-loading-overlay__pct {
  flex: none;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
  min-width: 3.5ch;
  text-align: right;
}

.ek-loading-overlay__hint {
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
  text-align: center;
}
</style>
