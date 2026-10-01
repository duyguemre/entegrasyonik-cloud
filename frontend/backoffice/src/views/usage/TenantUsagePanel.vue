<!--
  MOB-08 / K55 — müşteri detayı "Kullanım" sekmesi: aktif kullanıcı + giriş, masaüstü / mobil ana kırılım (alt türler
  ayrıntıda), aralık (7/30/90 gün) ve platform süzgeci. K51: Durum → Karar → Eylem → Ayrıntı. Kaynak BackofficeTenantService/getUsage.
-->
<template>
  <section class="bo-tu" aria-label="Müşteri kullanımı">
    <div class="bo-toolbar bo-tu__bar">
      <div class="bo-seg" role="radiogroup" aria-label="Aralık">
        <button v-for="d in DAYS" :key="d" type="button" role="radio" class="bo-seg__opt" :aria-checked="days === d" :data-days="d" @click="days = d">{{ d }} gün</button>
      </div>
      <PlatformFilter v-model="platform" label="Platform süzgeci" />
      <EkRefreshButton :loading="res.refreshing.value || res.phase.value === 'loading'" @refresh="res.load()" />
    </div>

    <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="3" degraded-title="Kullanım verisi şu an okunamıyor" @retry="res.load()">
      <template v-if="u">
        <UsageVerdictBlock :verdict="verdict!" id-base="bo-tenant-usage" />

        <div class="bo-grid-2">
          <EkCard title="Aktif kullanıcı" :subtitle="`${formatDate(u.from)} – ${formatDate(u.to)} · tekil`" icon="mdi-account-multiple-outline">
            <template v-if="u.activeUsers.computable">
              <p class="bo-tu__big ek-num" data-testid="tenant-usage-users">{{ formatCount(u.activeUsers.users) }}</p>
              <PlatformBreakdown :by-class="u.activeUsers.byClass" :by-platform="u.activeUsers.byPlatform" label="Aktif kullanıcı" />
              <p class="bo-muted bo-tu__note">Son aktif gün: {{ u.activeUsers.lastActiveDay ? formatDate(u.activeUsers.lastActiveDay) : '—' }}</p>
            </template>
            <EkEmptyState v-else variant="no-data" title="Kullanım kaydı yok" message="Bu aralıkta günlük kullanım kaydı bulunmuyor. Kayıt platform ayrımıyla birlikte başladı; öncesi görünmez." />
          </EkCard>
          <EkCard title="Başarılı girişler" :subtitle="`${formatDate(u.from)} – ${formatDate(u.to)}`" icon="mdi-login-variant">
            <p class="bo-tu__big ek-num" data-testid="tenant-usage-logins">{{ formatCount(u.logins.total) }}</p>
            <PlatformBreakdown :by-class="u.logins.byClass" :by-platform="u.logins.byPlatform" label="Giriş" unit="giriş" note="Platform alanı olmayan eski giriş kayıtları “Belirlenemedi” sayılır." />
          </EkCard>
        </div>

        <EkCard v-if="u.activeUsers.computable" title="Günlük aktif kullanıcı" subtitle="Masaüstü / mobil" icon="mdi-chart-bar">
          <SeriesBars :points="points" :series="SERIES" bucket="day" :label="`Son ${u.days} gün günlük aktif kullanıcı, masaüstü ve mobil`" />
        </EkCard>
        <p class="bo-muted bo-tu__note">Kaynak: BackofficeTenantService/getUsage · yalnız sayaç (kullanıcı kimliği, cihaz, IP dönmez) · destek oturumları sayılmaz.</p>
      </template>
    </StateBlock>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkCard, EkEmptyState, EkRefreshButton } from '@entegrasyonik/ui/components'
import type { PlatformFilter as Filter } from '@entegrasyonik/ui/platform'
import { api } from '@bo/api'
import type { TenantUsage, UsageDays } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
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
  { key: 'desktop', label: PLATFORM_CLASS.desktop.label, tone: 'action' },
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
  gap: var(--ek-space-4);
}
.bo-tu__bar { justify-content: flex-end; }
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
