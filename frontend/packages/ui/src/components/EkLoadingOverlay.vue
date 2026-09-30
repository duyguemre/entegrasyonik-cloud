<!--
  frontend/src/components/ds/EkLoadingOverlay.vue

  DS-v2 Aşama 6b — Standart 8: ENGELLEYİCİ İŞ ÖRTÜSÜ (kaydetme, silme, içe/dışa aktarma sürerken). Yalnız İLGİLİ içeriği
  örter (Standart 7): açık `attach` verilmezse çalışma alanı sekmesinin kabına bağlanır; sekme şeridi, üst bar, menü ve
  diğer sekmeler kullanılabilir kalır. Görünüm (FR2-39): KARTSIZ sahne — yüzey perdesi (içerik sezilir) + ortada yumuşak
  bir ışık halesi üzerinde EkBrandLoader + iş metni + isteğe bağlı belirli ilerleme çubuğu (yüzde). Çerçeve/gölge yok.
  Titreme yok: içerik 150 ms gecikmeyle belirir (hızlı iş bitince hiç görünmez); `prefers-reduced-motion` → gecikmesiz,
  hareketsiz. Liste/sayfa ilk yüklemesi için örtü DEĞİL iskelet kullanılır
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
        <v-progress-linear :model-value="progress" height="4" rounded color="primary" bg-color="surface-sunken" bg-opacity="1" />
        <span class="ek-loading-overlay__pct ek-num">%{{ Math.round(progress) }}</span>
      </div>
      <p v-if="hint" class="ek-loading-overlay__hint">{{ hint }}</p>
    </div>
  </v-overlay>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkBrandLoader from './EkBrandLoader.vue'
import { resolveOverlayAttach, useTabScope } from '../composables/useTabScope'

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
  background: color-mix(in srgb, var(--ek-color-surface) 76%, transparent);
  backdrop-filter: blur(2px) saturate(0.85);
}

.ek-loading-overlay .ek-loading-overlay__content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.ek-loading-overlay__card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 240px;
  max-width: min(360px, calc(100vw - var(--ek-space-8)));
  padding: var(--ek-space-8) var(--ek-space-10);
  animation: ek-lo-in var(--ek-duration-slow) var(--ek-easing-enter) 150ms both;
}

/* Kart yerine hale: merkezde tam yüzey rengi (metin kontrastı perdeden bağımsız), kenara doğru eriyerek içerikle birleşir. */
.ek-loading-overlay__card::before {
  content: '';
  position: absolute;
  inset: calc(-1 * var(--ek-space-8));
  z-index: -1;
  border-radius: var(--ek-radius-full);
  background:
    radial-gradient(closest-side, var(--ek-color-surface) 58%, color-mix(in srgb, var(--ek-color-surface) 0%, transparent) 100%),
    radial-gradient(closest-side, color-mix(in srgb, var(--ek-color-brand) 10%, transparent), transparent);
}

@keyframes ek-lo-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .ek-loading-overlay__card {
    animation: none;
  }
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
