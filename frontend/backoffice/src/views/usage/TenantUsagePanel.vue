<!--
  MOB-08 / K55 — müşteri detayı "Kullanım" sekmesi: aktif kullanıcı + giriş, masaüstü / mobil ana kırılım (alt türler
  ayrıntıda), aralık (7/30/90 gün) ve platform süzgeci. K51: Durum → Karar → Eylem → Ayrıntı. Kaynak BackofficeTenantService/getUsage.
-->
<template>
  <section class="bo-tu" aria-label="Müşteri kullanımı">
    <BoFilterBar :active="platform ? 1 : 0" label="Kullanım süzgeçleri" @clear="platform = null">
      <BoSegmented v-model="days" :options="DAY_OPTIONS" label="Aralık" />
      <PlatformFilter v-model="platform" label="Platform süzgeci" />
      <template #trailing>
        <EkRefreshButton quiet-success :loading="res.refreshing.value || res.phase.value === 'loading'" @refresh="res.load()" />
      </template>
    </BoFilterBar>

    <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="3" degraded-title="Kullanım verisi şu an okunamıyor" @retry="res.load()">
      <template v-if="u">
        <UsageVerdictBlock :verdict="verdict!" id-base="bo-tenant-usage" />

        <BoTileGrid :cols="2">
          <BoSection title="Aktif kullanıcı" :description="`${formatDate(u.from)} – ${formatDate(u.to)} aralığında bu müşteriden işlem yapan tekil kullanıcı.`" icon="mdi-account-multiple-outline">
            <template v-if="u.activeUsers.computable">
              <p class="bo-tu__big ek-num" data-testid="tenant-usage-users">{{ formatCount(u.activeUsers.users) }}</p>
              <PlatformBreakdown :by-class="u.activeUsers.byClass" :by-platform="u.activeUsers.byPlatform" label="Aktif kullanıcı" />
              <p class="bo-muted bo-tu__note">Son aktif gün: {{ u.activeUsers.lastActiveDay ? formatDate(u.activeUsers.lastActiveDay) : '—' }}</p>
            </template>
            <EkEmptyState v-else variant="no-data" title="Kullanım kaydı yok" message="Bu aralıkta günlük kullanım kaydı bulunmuyor. Kayıt platform ayrımıyla birlikte başladı; öncesi görünmez." />
          </BoSection>
          <BoSection title="Başarılı girişler" :description="`${formatDate(u.from)} – ${formatDate(u.to)} aralığındaki başarılı oturum açmalar.`" icon="mdi-login-variant">
            <p class="bo-tu__big ek-num" data-testid="tenant-usage-logins">{{ formatCount(u.logins.total) }}</p>
            <PlatformBreakdown :by-class="u.logins.byClass" :by-platform="u.logins.byPlatform" label="Giriş" unit="giriş" note="Platform alanı olmayan eski giriş kayıtları “Belirlenemedi” sayılır." />
          </BoSection>
        </BoTileGrid>

        <BoSection v-if="u.activeUsers.computable" title="Günlük aktif kullanıcı" description="Seçili aralıkta gün gün seyir; masaüstü / mobil ayrımıyla." icon="mdi-chart-bar">
          <SeriesBars :points="points" :series="SERIES" bucket="day" :label="`Son ${u.days} gün günlük aktif kullanıcı, masaüstü ve mobil`" />
        </BoSection>
        <p class="bo-muted bo-tu__note">Kaynak: BackofficeTenantService/getUsage · yalnız sayaç (kullanıcı kimliği, cihaz, IP dönmez) · destek oturumları sayılmaz.</p>
      </template>
    </StateBlock>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkEmptyState, EkRefreshButton } from '@entegrasyonik/ui/components'
import type { PlatformFilter as Filter } from '@entegrasyonik/ui/platform'
import { api } from '@bo/api'
import type { TenantUsage, UsageDays } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoFilterBar from '@bo/components/r2/BoFilterBar.vue'
import BoSegmented from '@bo/components/r2/BoSegmented.vue'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import SeriesBars, { type SeriesDef } from '@bo/components/kit/SeriesBars.vue'
import { PLATFORM_CLASS } from '@bo/utils/labels'
import { formatCount } from '@bo/utils/units'
import { formatDate } from '@bo/utils/format'
import PlatformFilter from './PlatformFilter.vue'
import PlatformBreakdown from './PlatformBreakdown.vue'
import UsageVerdictBlock from './UsageVerdictBlock.vue'
import { platformFromQuery } from './platformOrder'
import { tenantUsageVerdict } from './usageVerdict'
import '@bo/styles/kit.css'

const props = defineProps<{ tid: number }>()
const route = useRoute()
const router = useRouter()
const DAYS: readonly UsageDays[] = [7, 30, 90]
const DAY_OPTIONS = DAYS.map((d) => ({ value: d, label: `${d} gün` }))
const days = computed<UsageDays>({
  get: () => { const n = Number(route.query.gun); return (DAYS as readonly number[]).includes(n) ? (n as UsageDays) : 30 },
  set: (v) => { void router.replace({ query: { ...route.query, gun: v === 30 ? undefined : String(v) } }) },
})
const platform = computed<Filter | null>({
  get: () => platformFromQuery(route.query.platform),
  set: (v) => { void router.replace({ query: { ...route.query, platform: v ?? undefined } }) },
})
const res = useResource<TenantUsage>(() =>
  api.call('BackofficeTenantService/getUsage', { tid: props.tid, days: days.value, ...(platform.value ? { platform: platform.value } : {}) }),
)
const u = computed(() => res.data.value)
const verdict = computed(() => (u.value ? tenantUsageVerdict(u.value) : null))
const SERIES: SeriesDef[] = [
  { key: 'desktop', label: PLATFORM_CLASS.desktop.label, tone: 'info' },
  { key: 'mobile', label: PLATFORM_CLASS.mobile.label, tone: 'success' },
  { key: 'unknown', label: PLATFORM_CLASS.unknown.label, tone: 'neutral' },
]
const points = computed(() =>
  u.value?.activeUsers.computable ? u.value.activeUsers.daily.map((d) => ({ t: `${d.day}T12:00:00Z`, values: { desktop: d.desktop, mobile: d.mobile, unknown: d.unknown } })) : [],
)

watch([days, platform], () => res.load())
onMounted(() => res.load())
</script>

<style scoped>
.bo-tu {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}
.bo-tu__big {
  margin: 0 0 var(--ek-space-3);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  font-weight: var(--ek-type-metric-weight);
  line-height: var(--ek-type-metric-line);
}
.bo-tu__note {
  margin: var(--ek-space-2) 0 0;
  font-size: var(--ek-type-caption-size);
}
</style>
