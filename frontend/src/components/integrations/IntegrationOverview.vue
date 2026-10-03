<!--
  frontend/src/components/integrations/IntegrationOverview.vue

  FE-LOCAL-1048 — entegrasyon ekranlarının (pazaryeri / e-ticaret / kargo / e-fatura / ERP) "Özet" görünümü: sayfa adı
  satırındaki Liste | Özet anahtarıyla AYAR SAYFASININ YERİNE açılır (özet ile bağlantı ayarları aynı sayfada durmaz).
    1) Özet şeridi — Tanımlı · Etkin · Pasif · Yakında
    2) Sağlayıcılar — her sağlayıcı bir satır (kanal rozeti + durum); tıklayınca ayarları (Liste görünümü) açılır
    3) Durum dağılımı — toplam + oran çubuğu
  Sayılar YALNIZ eldeki gerçek veriden: hesaptaki sağlayıcı listesi (`items`), kodu olan ("canlı") küme (`liveCodes`,
  `getCatalog` manifestosu) ve kayıtlı bağlantı durumu (`activeCodes` — bkz. `useIntegrationScreen`).
  Kodu olmayan sağlayıcı HİÇBİR ZAMAN "etkin" sayılmaz (E3 entegrasyon dürüstlüğü) — "Yakında" hücresindedir.
-->
<template>
  <div class="iov">
    <ListDashSection label="Özet">
      <ListSummaryStrip :cells="cells" :label="`${title} özeti`" />
    </ListDashSection>

    <div class="iov__grid">
      <ListDashSection :label="listLabel">
        <EkCard :title="listLabel" :subtitle="`Bağlantı ayarlarını açmak için ${noun} seçin`" icon="mdi-connection" icon-tone="action" :heading-level="3">
          <p v-if="!rows.length" class="iov__empty">Hesabınızda tanımlı {{ noun }} yok.</p>
          <ul v-else class="iov__list">
            <li v-for="r in rows" :key="r.code">
              <button type="button" class="iov__row" :class="[r.live ? channelClass(r.code) : undefined, { 'is-current': r.code === current }]"
                :aria-label="`${r.name}: ${r.status.label} — bağlantı ayarlarını aç`" :data-integration-row="r.code" @click="emit('select', r.code)">
                <EkPlatformMark :name="r.name" :code="r.live ? r.code : undefined" size="sm" />
                <EkStatusChip :tone="r.status.tone" :label="r.status.label" :dot="r.live" />
                <v-icon class="iov__go" icon="mdi-arrow-right" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </EkCard>
      </ListDashSection>

      <ListDashSection label="Dağılım">
        <ListDistributionCard title="Bağlantı durumu" :subtitle="`Tanımlı ${noun} dağılımı`" icon="mdi-chart-donut" :unit="noun" :rows="distribution"
          :empty-text="`Hesabınızda tanımlı ${noun} yok.`" />
      </ListDashSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkCard, EkPlatformMark, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import { channelClass, channelName } from '@entegrasyonik/ui/tokens'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import ListDistributionCard, { type ListDistributionRow } from '@/components/page/ListDistributionCard.vue'

const props = withDefaults(
  defineProps<{
    /** Ekran adı ("Pazaryeri") — şeridin erişilebilir adı. */
    title: string
    /** Sağlayıcının cümle içi adı ("pazaryeri", "kargo firması" …). */
    noun: string
    /** Sağlayıcı listesinin başlığı ("Pazaryerleri"). */
    listLabel?: string
    items?: Array<{ code: string; title?: string; name?: string }>
    liveCodes?: string[]
    /** Kayıtlı bağlantı durumu açık olan sağlayıcı kodları. */
    activeCodes?: string[]
    /** Liste görünümünde seçili sağlayıcı. */
    current?: string
  }>(),
  { listLabel: 'Sağlayıcılar', items: () => [], liveCodes: () => [], activeCodes: () => [], current: '' },
)
const emit = defineEmits<{ select: [code: string] }>()

type Status = { key: 'active' | 'passive' | 'soon'; label: string; tone: 'success' | 'neutral' }

const rows = computed(() =>
  (props.items ?? []).map((i) => {
    const live = props.liveCodes.includes(i.code)
    const status: Status = !live
      ? { key: 'soon', label: 'Yakında', tone: 'neutral' }
      : props.activeCodes.includes(i.code)
        ? { key: 'active', label: 'Etkin', tone: 'success' }
        : { key: 'passive', label: 'Pasif', tone: 'neutral' }
    return { code: i.code, name: (live ? channelName(i.code) : '') || i.title || i.name || i.code, live, status }
  }),
)

const count = (key: Status['key']) => rows.value.filter((r) => r.status.key === key).length

const cells = computed<ListSummaryCell[]>(() => {
  const cell = (key: string, label: string, n: number, icon: string, tone: ListSummaryCell['tone'], hint: string): ListSummaryCell => ({
    key, label, hint, icon, tone, value: formatNumber(n), zero: !n,
  })
  return [
    cell('total', 'Tanımlı', rows.value.length, 'mdi-connection', 'action', `Hesabınızdaki ${props.noun}`),
    cell('active', 'Etkin', count('active'), 'mdi-check-circle-outline', 'success', 'Bağlantı durumu açık'),
    cell('passive', 'Pasif', count('passive'), 'mdi-pause-circle-outline', 'warning', 'Durumu kapalı ya da yetkisiz'),
    cell('soon', 'Yakında', count('soon'), 'mdi-timer-sand', 'neutral', 'Otomatik bağlantı henüz yok'),
  ]
})

const distribution = computed<ListDistributionRow[]>(() => [
  { key: 'active', label: 'Etkin', count: count('active'), tone: 'success' },
  { key: 'passive', label: 'Pasif', count: count('passive'), tone: 'warning' },
  { key: 'soon', label: 'Yakında', count: count('soon'), tone: 'neutral' },
])
</script>

<style scoped>
.iov {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}

.iov__grid {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--ek-space-6);
  align-items: start;
}

.iov__list {
  display: flex;
  flex-direction: column;
  margin: 0 calc(-1 * var(--ek-space-2));
  padding: 0;
  list-style: none;
}

.iov__list > li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.iov__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 48px;
  padding: var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-tile);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.iov__row:hover {
  background: var(--ek-color-surface-muted);
}

.iov__row.is-current {
  background: var(--ek-color-action-subtle);
}

.iov__row:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.iov__go {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.iov__row:hover .iov__go {
  color: var(--ek-color-action);
}

.iov__empty {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

@media (max-width: 1023px) {
  .iov__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
