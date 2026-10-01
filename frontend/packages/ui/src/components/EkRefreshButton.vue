<!--
  frontend/src/components/ds/EkRefreshButton.vue

  DS-v2 Aşama 6b — Standart 9: TEK SAYFA YENİLEME DÜĞMESİ (konum: başlık satırının en sağı — satır düzeni EkPageBar'ın).
  A8 yeniden tasarım (kullanıcı geri bildirimi "pek güzel olmadı"): SAKİN ikon düğmesi —
  • FR2-SHELL madde 9 (fe-r2a): başlık satırının SAĞ ÜSTÜNDE ikincil düğme dilinde kare kontrol — yüzey zemin, ince
    kenarlık, kart gölgesi; 36px (`control-h-md`, yanındaki "Yeni …" düğmesiyle aynı yükseklik/yarıçap), 18px glif.
    Çıplak ikon başlık satırında "yarım kalmış" görünüyordu. Hover'da zemin tonu + koyu kenar, odakta `focus-ring`.
  • 4 durum (`data-state`):
      idle     — `refresh` glifi, `content-muted`;
      loading  — glif yumuşak döner (3 × duration-slow, standart eğri), `action` tonu, `aria-busy`, tekrar tıklanamaz;
                 reduced-motion'da dönmez, yanında "Yenileniyor…" metni görünür;
      success  — yükleme hatasız bitince ~1,2 s yeşil tik (`success`), sonra sessizce idle'a döner;
      error    — glifin sağ üstünde 8px `error` noktası; ipucu "Yenilenemedi — tekrar denemek için tıklayın".
  • İpucu (400 ms): "Yenile  [Alt R]" + "Son güncelleme 2 dk önce" (göreli; 30 sn'de bir tazelenir).
  • Ekran okuyucu: aria-label adı + son güncelleme; durum değişimi `aria-live=polite` ile duyurulur.
  Hata bilgisi: `error` prop'u ya da atadan `provideRefreshState` (bkz. refreshState.ts).
  `lastUpdated` verilmezse düğme kendisi tutar: ilk görünüm ve her BAŞARILI yükleme bitişi.
  Kısayol: Alt+R (kabuk `pageRefresh` → etkin sekmedeki `[data-page-refresh]`).
-->
<template>
  <span class="ek-refresh-wrap">
  <v-tooltip :eager="false" transition="fade-transition" location="bottom" :open-delay="400">
    <template #activator="{ props: tip }">
      <button
        v-bind="tip"
        type="button"
        class="ek-refresh"
        :class="[`is-${state}`, { 'is-reduced': reducedMotion, 'is-quiet': quietSuccess }]"
        :data-state="state"
        :aria-label="ariaLabel"
        :aria-busy="loading || undefined"
        :disabled="disabled"
        data-page-refresh
        @click="onClick"
      >
        <span class="ek-refresh__glyph" aria-hidden="true">
          <v-icon v-if="state === 'success' && !quietSuccess" key="ok" :icon="icons.approve" class="ek-refresh__icon ek-refresh__icon--ok" />
          <v-icon v-else key="rf" :icon="icons.refresh" class="ek-refresh__icon" />
          <span v-if="state === 'error'" class="ek-refresh__dot" />
        </span>
        <span v-if="state === 'loading' && reducedMotion" class="ek-refresh__text">Yenileniyor…</span>
        <span v-else-if="state === 'success' && quietSuccess" class="ek-refresh__text">Güncellendi</span>
      </button>
    </template>
    <span class="ek-refresh__tip">
      <span class="ek-refresh__tip-row">
        <span class="ek-refresh__tip-title">{{ tipTitle }}</span>
        <EkKbd v-if="state !== 'loading'" :keys="keys" tone="inverse" />
      </span>
      <span v-if="tipMeta" class="ek-refresh__tip-meta">{{ tipMeta }}</span>
    </span>
  </v-tooltip>
  <span class="ek-sr-only" aria-live="polite">{{ announce }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EkKbd from './EkKbd.vue'
import { icons } from '../icons'
import { shortcutKeys } from '../shortcuts'
import { formatRelativeTime, injectRefreshState, resolveRefreshView } from './refreshState'

const props = withDefaults(
  defineProps<{
    loading?: boolean
    disabled?: boolean
    label?: string
    /** Verinin en son alındığı an (verilmezse düğme kendisi izler). */
    lastUpdated?: Date | string | number | null
    /** Son yenileme başarısız (true ya da kısa metin). Verilmezse atadaki `provideRefreshState`. */
    error?: boolean | string | null
    /**
     * Başarıda yeşil tik yerine nötr "Güncellendi" metni (ekleyici; varsayılan kapalı — ana uygulama değişmez).
     * Backoffice: tik "sağlıklı" okunuyordu (BO-ELEV ST-2/NT-07); tazelik sağlık değildir.
     */
    quietSuccess?: boolean
  }>(),
  { loading: false, disabled: false, label: 'Yenile', lastUpdated: undefined, error: undefined, quietSuccess: false },
)
const emit = defineEmits<{ refresh: [] }>()

/** Başarı onayının süresi (ms). */
const SUCCESS_MS = 1200

const keys = shortcutKeys('pageRefresh')
const injected = injectRefreshState()
const tracked = ref<Date | null>(null)
const now = ref(Date.now())
const flash = ref(false)
const announce = ref('')
const reducedMotion = ref(false)
let tick: ReturnType<typeof setInterval> | undefined
let flashTimer: ReturnType<typeof setTimeout> | undefined
let mq: MediaQueryList | undefined
const onMq = () => (reducedMotion.value = !!mq?.matches)

const errorValue = computed(() => (props.error !== undefined ? props.error : injected?.().error ?? null))
const hasError = computed(() => !!errorValue.value)

onMounted(() => {
  if (!props.loading && !hasError.value) tracked.value = new Date()
  tick = setInterval(() => (now.value = Date.now()), 30_000)
  mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
  onMq()
  mq?.addEventListener?.('change', onMq)
})
onBeforeUnmount(() => {
  clearInterval(tick)
  clearTimeout(flashTimer)
  mq?.removeEventListener?.('change', onMq)
})

watch(
  () => props.loading,
  (v, before) => {
    now.value = Date.now()
    if (v) {
      clearTimeout(flashTimer)
      flash.value = false
      announce.value = 'Yenileniyor'
      return
    }
    if (!before) return
    // Hata bilgisi ata tarafında aynı tick'te güncellenir → bir sonraki mikro görevde karar ver.
    queueMicrotask(() => {
      if (hasError.value) {
        announce.value = 'Yenilenemedi'
        return
      }
      tracked.value = new Date()
      now.value = Date.now()
      announce.value = 'Güncellendi'
      flash.value = true
      clearTimeout(flashTimer)
      flashTimer = setTimeout(() => (flash.value = false), SUCCESS_MS)
    })
  },
)

const updatedAt = computed(() => {
  const v = props.lastUpdated ?? tracked.value
  if (v === null || v === undefined) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
})

const updatedText = computed(() => (updatedAt.value ? formatRelativeTime(updatedAt.value, now.value) : ''))

const view = computed(() =>
  resolveRefreshView({ loading: props.loading, error: hasError.value, flash: flash.value, label: props.label, keys, updatedText: updatedText.value }),
)
const state = computed(() => view.value.state)
const tipTitle = computed(() => view.value.tipTitle)
const tipMeta = computed(() => view.value.tipMeta)
const ariaLabel = computed(() => view.value.ariaLabel)

function onClick() {
  if (!props.loading && !props.disabled) emit('refresh')
}
</script>

<style scoped>
.ek-refresh-wrap {
  display: inline-flex;
}

.ek-refresh {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-2);
  min-width: var(--ek-control-h-md);
  height: var(--ek-control-h-md);
  padding: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  color: var(--ek-color-content-default);
  font-family: inherit;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-refresh:hover:not(:disabled) {
  border-color: var(--ek-color-border-input);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.ek-refresh:active:not(:disabled) {
  background: var(--ek-color-surface-muted);
}

.ek-refresh:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-refresh:disabled {
  cursor: default;
  opacity: 0.5;
}

.ek-refresh__glyph {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ek-icon-md);
  height: var(--ek-icon-md);
}

.ek-refresh__icon {
  font-size: var(--ek-icon-md);
}

.ek-refresh.is-loading {
  cursor: progress;
  color: var(--ek-color-action);
}

.ek-refresh.is-loading .ek-refresh__icon {
  animation: ek-refresh-spin calc(var(--ek-duration-slow) * 3) var(--ek-easing-standard) infinite;
}

.ek-refresh.is-success {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success);
}

.ek-refresh.is-quiet.is-success {
  padding: 0 var(--ek-space-3) 0 var(--ek-space-2);
  gap: var(--ek-space-1);
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
}

.ek-refresh.is-error {
  border-color: var(--ek-color-error-border);
}

.ek-refresh__icon--ok {
  animation: ek-refresh-pop var(--ek-duration-base) var(--ek-easing-enter);
}

.ek-refresh__dot {
  position: absolute;
  top: -3px;
  right: -4px;
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-error);
  box-shadow: 0 0 0 2px var(--ek-color-background);
}

.ek-refresh.is-error:hover .ek-refresh__dot {
  box-shadow: 0 0 0 2px var(--ek-color-surface);
}

/* Reduced-motion: dönme yok, metin görünür ("Yenileniyor…"). */
.ek-refresh.is-reduced.is-loading {
  padding: 0 var(--ek-space-3) 0 var(--ek-space-2);
}

.ek-refresh__text {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-medium);
  white-space: nowrap;
}

.ek-refresh__tip {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
}

.ek-refresh__tip-row {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-refresh__tip-meta {
  opacity: 0.8;
}

@keyframes ek-refresh-spin {
  to { transform: rotate(360deg); }
}

@keyframes ek-refresh-pop {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .ek-refresh.is-loading .ek-refresh__icon,
  .ek-refresh__icon--ok {
    animation: none;
  }
}
</style>
