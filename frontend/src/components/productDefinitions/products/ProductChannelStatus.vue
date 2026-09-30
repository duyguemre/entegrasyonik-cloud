<!--
  frontend/src/components/productDefinitions/products/ProductChannelStatus.vue

  FR2 madde 21–22 — ürün satırındaki KANAL DURUMU hücresi + YÜKLEME seçimi.
    • Hücre: bağlı her kanal için bir durum karosu (`ChannelStatusTile`: kısa kanal rozeti + durum işareti), tek bakışta
      yayında / hatalı / bekliyor / satışa kapalı / yok. Karoların tümü TEK düğmedir (satırda tek sekme durağı); erişilebilir ad
      tüm kanalların durumunu okur; üzerine gelince ipucu aynı özeti gösterir.
    • Panel (tıklayınca): kanal başına uzun rozet + durum çipi + varyant dağılımı + (varsa) kısa neden ve "Yükleme listesi"
      anahtarı. Anahtar = ürünün o kanala bir sonraki aktarımda gönderilmesi (`platformUploads.<kod>.isReady`; kaydı ebeveyn
      `IntegrationService/savePlatformUploadIsReadyForProduct` ile yapar). Eski satır-içi "logoya tıkla = hazır/değil" gizli
      davranışının yerini alır: ne yaptığı yazılı, durumu görünür, geri alınabilir.
  Veri: `channelStatus.ts` (saf, testli). Durum çipi dili `EkStatusChip` (renk + ikon + metin).
-->
<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom end" offset="8" transition="fade-transition"
    content-class="pcs-menu">
    <template #activator="{ props: menuProps }">
      <button type="button" v-bind="menuProps" class="pcs" :aria-label="`${summaryText}. Kanal durumu ve yükleme listesi`"
        :title="summaryText" @click.stop>
        <ChannelStatusTile v-for="s in statuses" :key="s.code" :status="s" :name="titleOf(s.code)" />
        <span v-if="!statuses.length" class="pcs__empty">Kanal bağlı değil</span>
      </button>
    </template>

    <section class="pcs-panel" role="dialog" :aria-label="`${productTitle} — kanal durumu`">
      <header class="pcs-panel__head">
        <span class="pcs-panel__title">Kanal durumu</span>
        <span class="pcs-panel__sub">{{ productTitle }}</span>
      </header>
      <ul class="pcs-panel__list">
        <li v-for="s in statuses" :key="s.code" class="pcs-row" :data-channel-status="s.key">
          <div class="pcs-row__main">
            <EkChannelBadge :code="s.code" :name="titleOf(s.code)" size="sm" />
            <EkStatusChip :tone="s.tone" :label="s.label" dot />
            <span v-if="s.counts.total > 1" class="pcs-row__counts ek-num">{{ countsText(s) }}</span>
          </div>
          <p v-if="s.reason" class="pcs-row__reason"><v-icon icon="mdi-information-outline" aria-hidden="true" />{{ s.reason }}</p>
          <label class="pcs-row__ready" :class="{ 'is-on': s.ready }">
            <v-switch :model-value="s.ready" :disabled="busy === s.code" density="compact" hide-details inset color="primary"
              :aria-label="`${titleOf(s.code)} yükleme listesinde`" @update:model-value="emit('toggle-ready', s.code)" />
            <span class="pcs-row__ready-text">
              <strong>Yükleme listesi</strong>
              <span>{{ s.ready ? 'Bir sonraki aktarımda gönderilecek' : 'Aktarımda bu kanala gönderilmez' }}</span>
            </span>
          </label>
        </li>
      </ul>
      <footer class="pcs-panel__foot">
        <span class="ek-num">{{ readyCount }}</span> kanal yükleme listesinde · aktarım "Toplu işlemler" üzerinden başlatılır
      </footer>
    </section>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { EkChannelBadge, EkStatusChip } from '@entegrasyonik/ui/components'
import { channelName } from '@entegrasyonik/ui/tokens'
import ChannelStatusTile from './ChannelStatusTile.vue'
import { channelStatusText, productChannelStatus, type ProductChannelStatus } from './channelStatus'

const props = defineProps<{
  product: any
  /** Mağazanın bağlı kanalları (`integrationStore.getClientPlatforms()`): `{ code, title }`. */
  channels: Array<{ code: string; title?: string }>
  /** Kaydı süren kanal kodu (anahtar geçici olarak kilitlenir). */
  busy?: string | null
}>()

const emit = defineEmits<{ 'toggle-ready': [code: string] }>()

const open = ref(false)
const productTitle = computed(() => String(props.product?.title ?? 'Ürün'))
const statuses = computed<ProductChannelStatus[]>(() => props.channels.map((c) => productChannelStatus(props.product, c.code)))
const titleOf = (code: string) => props.channels.find((c) => c.code === code)?.title ?? channelName(code)
const summaryText = computed(() => statuses.value.map((s) => channelStatusText(s, titleOf(s.code))).join('; ') || 'Kanal bağlı değil')
const readyCount = computed(() => statuses.value.filter((s) => s.ready).length)

function countsText(s: ProductChannelStatus): string {
  const c = s.counts
  const parts = [`${c.live}/${c.total} yayında`]
  if (c.failed) parts.push(`${c.failed} hatalı`)
  if (c.waiting) parts.push(`${c.waiting} bekliyor`)
  if (c.offsale) parts.push(`${c.offsale} kapalı`)
  return parts.join(' · ')
}
</script>

<style scoped>
.pcs {
  display: inline-flex;
  flex-wrap: nowrap; /* satır yüksekliği sabit: karolar tek satır (dar kapta kart görünümü sarar) */
  align-items: center;
  gap: 9px;
  min-height: 36px;
  padding: 6px 10px 8px 6px;
  border: 1px solid transparent;
  border-radius: var(--ek-radius-control);
  background: transparent;
  font: inherit;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pcs:hover {
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}

.pcs:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

@media (max-width: 599px) {
  .pcs { flex-wrap: wrap; }
}

.pcs__empty {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
</style>

<style>
/* Panel (teleport edilir → kapsamsız; önek bu bileşene özgü). */
.pcs-menu > .pcs-panel {
  width: min(400px, calc(100vw - 32px));
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-popover);
  background: var(--ek-color-surface-raised);
  box-shadow: var(--ek-shadow-popover);
  color: var(--ek-color-content-default);
}

.pcs-panel__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.pcs-panel__title {
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.pcs-panel__sub {
  overflow: hidden;
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pcs-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pcs-row {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
}

.pcs-row + .pcs-row {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.pcs-row__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

.pcs-row__counts {
  margin-inline-start: auto;
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.pcs-row__reason {
  display: flex;
  gap: 6px;
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pcs-row__reason .v-icon {
  flex: none;
  font-size: var(--ek-icon-sm);
}

.pcs-row__ready {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: 6px var(--ek-space-3) 6px 6px;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pcs-row__ready.is-on {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.pcs-row__ready .v-switch {
  flex: none;
}

.pcs-row__ready-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.pcs-row__ready-text strong {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
}

.pcs-panel__foot {
  padding: var(--ek-space-3) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}
</style>
