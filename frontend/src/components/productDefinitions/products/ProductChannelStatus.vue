<!--
  frontend/src/components/productDefinitions/products/ProductChannelStatus.vue

  FR2 madde 21–22 — ürün satırındaki KANAL DURUMU hücresi + GÖNDERİME HAZIR (yükleme hedefi) seçimi.
    • Hücre: bağlı her kanal için bir durum karosu (`ChannelStatusTile`: kısa kanal rozeti + durum işareti), tek bakışta
      yayında / hatalı / bekliyor / satışa kapalı / yok. Karoların tümü TEK düğmedir (satırda tek sekme durağı); erişilebilir ad
      tüm kanalların durumunu okur; üzerine gelince ipucu aynı özeti gösterir.
    • Panel (tıklayınca): kanal başına uzun rozet + durum çipi + varyant dağılımı + (varsa) kısa neden ve "Gönderime hazır"
      anahtarı (`platformUploads.<kod>.isReady`; kaydı ebeveyn `IntegrationService/savePlatformUploadIsReadyForProduct` ile
      yapar). NOT: backend bu bayrağı yalnız YAZAR, aktarım akışı okumaz (2026-09-30 tarama) → metin otomatik gönderim VAAT
      ETMEZ; gönderim Toplu işlemler → Platformlara Yükle. Eski satır-içi "logoya tıkla = hazır/değil" gizli davranışının
      yerini alır: ne yaptığı yazılı, durumu görünür, geri alınabilir.
  Veri: `channelStatus.ts` (saf, testli). Durum çipi dili `EkStatusChip` (renk + ikon + metin).
-->
<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom end" offset="8" transition="fade-transition"
    content-class="pcs-menu">
    <template #activator="{ props: menuProps }">
      <!-- FR3-11: iki satır — (1) en kritik durum sade cümleyle, durum tonunda; (2) bulunduğu kanalların rozeti + glif,
           gönderilmemiş kanallar "+n" olarak. Ayrıntı (kanal başına durum + gönderime hazır) tıklayınca panelde. -->
      <button type="button" v-bind="menuProps" class="pcs" :aria-label="`${summaryText}. Kanal durumu ve gönderime hazır işareti`"
        :title="titleText" @click.stop>
        <span class="pcs__summary" :class="`is-${summary.tone}`">
          <v-icon :icon="summary.icon" class="pcs__summary-icon" aria-hidden="true" />
          <span class="pcs__summary-text">{{ summary.text }}</span>
        </span>
        <span v-if="present.length || absentCount" class="pcs__channels" aria-hidden="true">
          <ChannelStatusTile v-for="s in present" :key="s.code" :status="s" :name="titleOf(s.code)" />
          <span v-if="absentCount" class="pcs__absent">+{{ absentCount }}</span>
        </span>
        <span v-if="summary.detail" class="ek-sr-only">{{ summary.detail }}</span>
      </button>
    </template>

    <section class="pcs-panel" role="dialog" :aria-label="`${productTitle} — kanal durumu`">
      <header class="pcs-panel__head">
        <span class="pcs-panel__title">Kanal durumu</span>
        <span class="pcs-panel__sub">{{ productTitle }}</span>
      </header>
      <ul class="pcs-panel__list">
        <li v-for="s in statuses" :key="s.code" class="pcs-row" :class="{ 'is-ready': s.ready }" :data-channel-status="s.key">
          <div class="pcs-row__main">
            <EkChannelBadge :code="s.code" :name="titleOf(s.code)" size="sm" />
            <EkStatusChip :tone="s.tone" :label="s.label" :icon="s.icon" />
            <button type="button" role="switch" class="pcs-switch" :aria-checked="s.ready" :disabled="busy === s.code"
              :aria-label="`${titleOf(s.code)} için gönderime hazır`" @click="emit('toggle-ready', s.code)">
              <span class="pcs-switch__label">Gönderime hazır</span>
              <span class="pcs-switch__track" aria-hidden="true"><span class="pcs-switch__knob"></span></span>
            </button>
          </div>
          <p v-if="s.counts.total > 1" class="pcs-row__counts ek-num">{{ countsText(s) }}</p>
          <p v-if="s.reason" class="pcs-row__reason"><v-icon icon="mdi-information-outline" aria-hidden="true" />{{ s.reason }}</p>
        </li>
      </ul>
      <footer class="pcs-panel__foot">
        <v-icon icon="mdi-information-outline" aria-hidden="true" />
        <span><strong class="ek-num">{{ readyCount }}</strong> kanal gönderime hazır işaretli. İşaret planlama içindir; gönderimi
          Toplu işlemler → Platformlara Yükle başlatır.</span>
      </footer>
    </section>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { EkChannelBadge, EkStatusChip } from '@entegrasyonik/ui/components'
import { channelName } from '@entegrasyonik/ui/tokens'
import ChannelStatusTile from './ChannelStatusTile.vue'
import { channelStatusSummary, channelStatusText, productChannelStatus, type ProductChannelStatus } from './channelStatus'

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
const summary = computed(() => channelStatusSummary(statuses.value))
/** Hücrede rozetiyle görünen kanallar: ürünün bulunduğu ya da gönderime hazır işaretli olanlar. */
const present = computed(() => statuses.value.filter((s) => s.key !== 'none' || s.ready))
const absentCount = computed(() => statuses.value.length - present.value.length)
/** İpucu: kanal başına bir satır (panelle aynı dil). */
const titleText = computed(() => statuses.value.map((s) => channelStatusText(s, titleOf(s.code))).join('\n') || 'Kanal bağlı değil')
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
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  max-width: 100%;
  min-height: 36px;
  margin-inline-start: -8px; /* hover zemini hücre hizasının dışına taşar; içerik kolon başlığıyla hizalı kalır */
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: var(--ek-radius-control);
  background: transparent;
  font: inherit;
  text-align: left;
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

.pcs__summary {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
}

.pcs__summary-icon {
  flex: none;
  font-size: var(--ek-icon-sm);
}

.pcs__summary.is-success { color: var(--ek-color-success-emphasis); }
.pcs__summary.is-danger { color: var(--ek-color-error-emphasis); }
.pcs__summary.is-info { color: var(--ek-color-info-emphasis); }
.pcs__summary.is-warning { color: var(--ek-color-warning-emphasis); }
.pcs__summary.is-action { color: var(--ek-color-action); }
.pcs__summary.is-neutral { color: var(--ek-color-content-muted); font-weight: var(--ek-font-weight-medium); }

.pcs__channels {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.pcs__absent {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-chip);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
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
  gap: 6px;
  padding: 10px var(--ek-space-3) 10px var(--ek-space-4);
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
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
  margin: 0;
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

/* "Gönderime hazır" anahtarı: kompakt, metinli (durum renk + konum + etiketle anlatılır). */
.pcs-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-inline-start: auto;
  padding: 4px 4px 4px var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-muted);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pcs-switch:hover { background: var(--ek-color-surface-muted); color: var(--ek-color-content-default); }
.pcs-switch:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.pcs-switch:disabled { cursor: progress; opacity: 0.6; }
.pcs-switch[aria-checked='true'] { color: var(--ek-color-action); }

.pcs-switch__track {
  position: relative;
  width: 32px;
  height: 18px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-border-strong);
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
}

.pcs-switch__knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  transition: transform var(--ek-duration-fast) var(--ek-easing-standard);
}

.pcs-switch[aria-checked='true'] .pcs-switch__track { background: var(--ek-color-action); }
.pcs-switch[aria-checked='true'] .pcs-switch__knob { transform: translateX(14px); }

.pcs-row.is-ready {
  background: var(--ek-color-action-subtle);
}

@media (prefers-reduced-motion: reduce) {
  .pcs-switch__track, .pcs-switch__knob { transition: none; }
}

.pcs-panel__foot {
  display: flex;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.pcs-panel__foot .v-icon {
  flex: none;
  margin-top: 1px;
  font-size: var(--ek-icon-sm);
}

.pcs-panel__foot strong {
  color: var(--ek-color-content-strong);
}
</style>
