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
        <!-- Durum → Karar → Eylem: ortak PageVerdict (UsageView ile aynı model, `toPageVerdict`). -->
        <div class="bo-tu__verdict" data-testid="usage-verdict">
          <PageVerdict :verdict="verdict" />
        </div>

        <!-- Metrik şeridi: tek sayı rolü yalnız BoStat'ta (§12.2). Ayrıntı bağlantıları bu bölüme iner. -->
        <BoSection id="kullanim-ayrinti" title="Kullanım göstergeleri" :description="`${formatDate(u.from)} – ${formatDate(u.to)} aralığı.`" icon="mdi-account-multiple-outline" plain tabindex="-1">
          <BoTileGrid :cols="2" aria-label="Kullanım göstergeleri">
            <BoStat
              label="Aktif kullanıcı"
              :value="u.activeUsers.computable ? formatCount(u.activeUsers.users) : '—'"
              :hint="u.activeUsers.computable ? `Son aktif gün: ${u.activeUsers.lastActiveDay ? formatDate(u.activeUsers.lastActiveDay) : '—'}` : 'Kullanım kaydı yok'"
              info="Aralıkta bu müşteriden işlem yapan tekil kullanıcı."
              data-testid="tenant-usage-users"
            />
            <BoStat label="Başarılı giriş" :value="formatCount(u.logins.total)" hint="Aralıktaki başarılı oturum açmalar" data-testid="tenant-usage-logins" />
          </BoTileGrid>
        </BoSection>

        <BoTileGrid :cols="2">
          <BoSection title="Aktif kullanıcı kırılımı" :description="`${formatDate(u.from)} – ${formatDate(u.to)} aralığında bu müşteriden işlem yapan tekil kullanıcı.`" icon="mdi-account-multiple-outline">
            <PlatformBreakdown v-if="u.activeUsers.computable" :by-class="u.activeUsers.byClass" :by-platform="u.activeUsers.byPlatform" label="Aktif kullanıcı" />
            <EkEmptyState v-else variant="no-data" title="Kullanım kaydı yok" message="Bu aralıkta günlük kullanım kaydı bulunmuyor. Kayıt platform ayrımıyla birlikte başladı; öncesi görünmez." />
          </BoSection>
          <BoSection title="Giriş kırılımı" :description="`${formatDate(u.from)} – ${formatDate(u.to)} aralığındaki başarılı oturum açmalar.`" icon="mdi-login-variant">
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
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { EkEmptyState, EkRefreshButton } from '@entegrasyonik/ui/components'
import type { PlatformFilter as Filter } from '@entegrasyonik/ui/platform'
import { api } from '@bo/api'
import type { TenantUsage, UsageDays } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
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
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { platformFromQuery } from './platformOrder'
import { tenantUsageVerdict, toPageVerdict } from './usageVerdict'
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
// Dikkat maddelerinin `#kullanim-ayrinti` bağlantısı yalnız çapa taşır; müşteri detayında sekme/süzgeç sorgusu korunmalı
// (çıplak `{ hash }` sorguyu düşürür → sekme değişirdi).
const verdict = computed(() => {
  if (!u.value) return null
  const v = toPageVerdict(tenantUsageVerdict(u.value))
  const keepQuery = (to: RouteLocationRaw | undefined): RouteLocationRaw | undefined =>
    to && typeof to === 'object' && 'hash' in to && !('path' in to) && !('name' in to) && !('query' in to) ? { query: route.query, hash: to.hash } : to
  return { ...v, attention: v.attention.map((a) => ({ ...a, to: keepQuery(a.to) })) }
})
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
.bo-tu__verdict {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}
.bo-tu__note {
  margin: var(--ek-space-2) 0 0;
  font-size: var(--ek-type-caption-size);
}
</style>
