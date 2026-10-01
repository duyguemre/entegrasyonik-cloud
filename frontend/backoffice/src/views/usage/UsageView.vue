<!--
  MOB-08 / K55 — platform geneli kullanım: masaüstü / mobil ana kırılım, alt türler ayrıntıda, platform süzgeci (`?platform=`).
  K51: Durum → Karar → Eylem (UsageVerdictBlock) → Ayrıntı (göstergeler, günlük seri, kırılım). Kaynak getPulse.activeUsers.
-->
<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="res.loadedAt.value ?? undefined" :stale="res.stale.value">
      <template #meta>
        <span class="bo-inline-note"><v-icon icon="mdi-shield-lock-outline" aria-hidden="true" />Yalnız platform sınıfı sayılır; cihaz/tarayıcı bilgisi ve IP saklanmaz</span>
      </template>
      <template #actions>
        <PlatformFilter v-model="platform" label="Platform süzgeci" />
        <EkButton tone="secondary" icon="mdi-refresh" :loading="res.refreshing.value || res.phase.value === 'loading'" data-page-refresh @click="res.load()">Yenile</EkButton>
      </template>
    </BoPageHeader>

    <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="3" degraded-title="Kullanım verisi şu an okunamıyor" @retry="res.load()">
      <template v-if="a">
        <UsageVerdictBlock :verdict="verdict!" id-base="bo-usage" />

        <template v-if="a.status === 'ok' && a.computable">
          <p v-if="platform" class="bo-muted bo-usage__filter" data-testid="usage-filter-note">
            Süzgeç: <strong>{{ filterLabel }}</strong> — sayılar yalnız bu platformdan gelen kullanıcıları kapsar.
          </p>
          <section class="bo-grid-3" aria-label="Aktif kullanıcı göstergeleri">
            <EkMetricCard label="Bugün" :value="formatCount(a.today.users)" :description="`${formatCount(a.today.tenants)} müşteri`" icon="mdi-account-clock-outline" data-testid="usage-today" />
            <EkMetricCard label="Son 7 gün" :value="formatCount(a.last7d.users)" :description="`${formatCount(a.last7d.tenants)} müşteri`" icon="mdi-account-multiple-outline" data-testid="usage-7d" />
            <EkMetricCard label="Son 30 gün" :value="formatCount(a.last30d.users)" :description="`${formatCount(a.last30d.tenants)} müşteri`" icon="mdi-calendar-month-outline" />
          </section>

          <div class="bo-grid-2">
            <EkCard title="Masaüstü ve mobil" subtitle="Son 7 gün · tekil aktif kullanıcı" icon="mdi-devices">
              <PlatformBreakdown :by-class="a.byClass" :by-platform="a.byPlatform" label="Son 7 gün aktif kullanıcı" note="Aynı kullanıcı hem masaüstü hem mobilden geldiyse iki satırda da sayılır; üstteki toplamda bir kez." />
            </EkCard>
            <EkCard title="Günlük aktif kullanıcı" subtitle="Son 14 gün · masaüstü / mobil" icon="mdi-chart-bar">
              <SeriesBars :points="points" :series="SERIES" bucket="day" label="Son 14 gün günlük aktif kullanıcı, masaüstü ve mobil" />
            </EkCard>
          </div>
        </template>
        <p class="bo-muted bo-usage__src">Kaynak: BackofficeOverviewService/getPulse (activeUsers) · günlük toplama, Europe/Istanbul günü · müşteri yüzeyi (destek oturumları sayılmaz).</p>
      </template>
    </StateBlock>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkButton, EkCard, EkMetricCard } from '@entegrasyonik/ui/components'
import type { PlatformFilter as Filter } from '@entegrasyonik/ui/platform'
import { api } from '@bo/api'
import type { PulseResponse } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import SeriesBars, { type SeriesDef } from '@bo/components/kit/SeriesBars.vue'
import { CLIENT_PLATFORM, PLATFORM_CLASS } from '@bo/utils/labels'
import { formatCount } from '@bo/utils/units'
import PlatformFilter from './PlatformFilter.vue'
import PlatformBreakdown from './PlatformBreakdown.vue'
import UsageVerdictBlock from './UsageVerdictBlock.vue'
import { platformFromQuery } from './platformOrder'
import { pulseUsageVerdict } from './usageVerdict'
import '@bo/styles/kit.css'

const route = useRoute()
const router = useRouter()
const platform = computed<Filter | null>({
  get: () => platformFromQuery(route.query.platform),
  set: (v) => { void router.replace({ query: { ...route.query, platform: v ?? undefined } }) },
})
const res = useResource<PulseResponse>(() => api.call('BackofficeOverviewService/getPulse', platform.value ? { platform: platform.value } : {}))
const a = computed(() => res.data.value?.activeUsers ?? null)
const verdict = computed(() => (a.value ? pulseUsageVerdict(a.value) : null))
const filterLabel = computed(() => {
  const p = platform.value
  if (!p) return ''
  return p === 'desktop' || p === 'mobile' ? PLATFORM_CLASS[p].label : CLIENT_PLATFORM[p].label
})

const SERIES: SeriesDef[] = [
  { key: 'desktop', label: PLATFORM_CLASS.desktop.label, tone: 'action' },
  { key: 'mobile', label: PLATFORM_CLASS.mobile.label, tone: 'success' },
  { key: 'unknown', label: PLATFORM_CLASS.unknown.label, tone: 'neutral' },
]
const points = computed(() => {
  const x = a.value
  if (!x || x.status !== 'ok' || !x.computable) return []
  return x.daily.map((d) => ({ t: `${d.day}T12:00:00Z`, values: { desktop: d.desktop, mobile: d.mobile, unknown: d.unknown } }))
})

watch(platform, () => res.load())
onMounted(() => res.load())
</script>

<style scoped>
.bo-usage__filter,
.bo-usage__src {
  margin: 0;
  font-size: var(--ek-type-caption-size);
}
</style>
