<!--
  frontend/src/components/ds/EkRefreshButton.vue

  DS-v2 Aşama 6b — Standart 9: TEK SAYFA YENİLEME DÜĞMESİ. Konum sabit: sayfa başlık satırının (EkPageBar) EN SAĞI —
  "Sayfa hakkında" (i) ile aynı dilde 32px çerçeveli ikon düğme; ekran kendi yerine ayrı "Yenile" koymaz.
  • yüklenirken ikon döner (reduced-motion'da dönmez, düğme `aria-busy`), tekrar tıklanamaz;
  • ipucu: "Yenile · Alt+R" + "Son güncelleme 14:02" (ya da "az önce"); aynı metin aria-label'da;
  • kısayol: Alt+R (kabuk `pageRefresh` → etkin sekmedeki `[data-page-refresh]`).
  `lastUpdated` verilmezse düğme kendisi tutar: ilk görünüm ve her yükleme bitişi (`loading` true → false).
-->
<template>
  <EkTooltip :text="tooltip" :shortcut="keys" :open-delay="300">
    <button
      type="button"
      class="ek-refresh"
      :class="{ 'is-loading': loading }"
      :aria-label="ariaLabel"
      :aria-busy="loading || undefined"
      :disabled="disabled"
      data-page-refresh
      @click="onClick"
    >
      <v-icon :icon="icons.refresh" class="ek-refresh__icon" aria-hidden="true" />
    </button>
  </EkTooltip>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EkTooltip from './EkTooltip.vue'
import { icons } from '@/design/icons'
import { shortcutKeys } from '@/navigation/shortcuts'

const props = withDefaults(
  defineProps<{
    loading?: boolean
    disabled?: boolean
    label?: string
    /** Verinin en son alındığı an (verilmezse düğme kendisi izler). */
    lastUpdated?: Date | string | number | null
  }>(),
  { loading: false, disabled: false, label: 'Yenile' },
)
const emit = defineEmits<{ refresh: [] }>()

const keys = shortcutKeys('pageRefresh')
const tracked = ref<Date | null>(null)
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  if (!props.loading) tracked.value = new Date()
  tick = setInterval(() => (now.value = Date.now()), 30_000)
})
onBeforeUnmount(() => clearInterval(tick))
watch(
  () => props.loading,
  (v, before) => {
    if (before && !v) tracked.value = new Date()
  },
)

const updatedAt = computed(() => {
  const v = props.lastUpdated ?? tracked.value
  if (v === null || v === undefined) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
})

const updatedText = computed(() => {
  const d = updatedAt.value
  if (!d) return ''
  const diff = Math.max(0, now.value - d.getTime())
  if (diff < 60_000) return 'az önce'
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
})

const tooltip = computed(() => (props.loading ? 'Yenileniyor…' : updatedText.value ? `${props.label} · Son güncelleme ${updatedText.value}` : props.label))
const ariaLabel = computed(() => `${props.label} (${keys.join('+')})${updatedText.value && !props.loading ? `, son güncelleme ${updatedText.value}` : ''}`)

function onClick() {
  if (!props.loading && !props.disabled) emit('refresh')
}
</script>

<style scoped>
.ek-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ek-control-h-sm);
  height: var(--ek-control-h-sm);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-icon-md);
  cursor: pointer;
  box-shadow: var(--ek-shadow-card);
  transition: var(--ek-transition-colors);
}

.ek-refresh:hover:not(:disabled) {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-refresh:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-refresh:disabled {
  cursor: default;
  opacity: 0.6;
}

.ek-refresh.is-loading {
  cursor: progress;
  opacity: 1;
  color: var(--ek-color-action);
}

.ek-refresh.is-loading .ek-refresh__icon {
  animation: ek-refresh-spin 0.8s linear infinite;
}

@keyframes ek-refresh-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .ek-refresh.is-loading .ek-refresh__icon {
    animation: none;
  }
}
</style>
