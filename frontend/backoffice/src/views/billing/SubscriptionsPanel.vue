<template>
  <section class="bo-panel" aria-labelledby="bo-subs-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-subs-title" class="bo-panel__title">Abonelikler</h2>
        <p class="bo-panel__hint">En yeni kayıt önce. Bir müşteriyi seçerek plan, olaylar ve yönetim eylemlerini görürsünüz.</p>
      </div>
      <EkRefreshButton quiet-success :loading="list.refreshing.value || list.phase.value === 'loading'" @refresh="list.reload({ keep: true })" />
    </header>

    <div class="bo-toolbar">
      <v-select v-model="status" :items="STATUS_ITEMS" label="Durum" density="compact" hide-details class="bo-toolbar__field" data-testid="status-filter" />
      <v-select v-model="plan" :items="PLAN_ITEMS" label="Plan" density="compact" hide-details class="bo-toolbar__field" data-testid="plan-filter" />
      <EkButton v-if="filtered" tone="ghost" size="sm" icon="mdi-filter-remove-outline" @click="clearFilters">Filtreleri temizle</EkButton>
    </div>

    <EkCard flush>
      <StateBlock
        :phase="list.phase.value"
        :error="list.error.value"
        :retrying="list.phase.value === 'loading'"
        degraded-title="Abonelikler şu an okunamıyor"
        :empty-variant="filtered ? 'no-results' : 'no-data'"
        :empty-title="filtered ? 'Filtreye uyan abonelik yok' : 'Henüz abonelik yok'"
        :empty-message="filtered ? 'Durum ya da plan filtresini değiştirin veya filtreleri temizleyin.' : 'Müşteriler kayıt olup deneme başlattığında abonelikleri burada listelenir.'"
        @retry="list.reload()"
      >
        <EkDataTable :items="rows" :columns="COLUMNS" row-key="tid">
          <template #cell-tenant="{ item }">
            <RouterLink :to="`/abonelikler/${(item as Row).tid}`" class="bo-subs__link" :data-testid="`sub-${(item as Row).tid}`">
              <span class="bo-cell-stack">
                <span>{{ (item as Row).tenantName ?? `#${(item as Row).tid}` }}</span>
                <span v-if="(item as Row).tenantName" class="ek-num">#{{ (item as Row).tid }}</span>
              </span>
            </RouterLink>
          </template>
          <template #cell-plan="{ item }">{{ planLabel((item as Row).planCode) }}</template>
          <template #cell-status="{ item }">
            <span class="bo-subs__status">
              <EkStatusChip :tone="SUB_STATUS[(item as Row).status].tone" :label="SUB_STATUS[(item as Row).status].label" dot />
              <span v-if="(item as Row).cancelAtPeriodEnd" class="bo-muted">dönem sonunda iptal</span>
              <span v-if="(item as Row).billingExempt" class="bo-muted">muaf</span>
              <span v-if="(item as Row).graceUntil" class="bo-muted">ödeme toleransı {{ formatDate((item as Row).graceUntil!) }}</span>
            </span>
          </template>
          <template #cell-date="{ item }">
            <span class="bo-cell-stack">
              <span v-if="(item as Row).status === 'trialing' && (item as Row).trialEndsAt">Deneme: <span class="ek-num">{{ formatDate((item as Row).trialEndsAt!) }}</span></span>
              <span v-else-if="(item as Row).currentPeriodEnd">Dönem sonu: <span class="ek-num">{{ formatDate((item as Row).currentPeriodEnd!) }}</span></span>
              <span v-else class="bo-muted">—</span>
            </span>
          </template>
          <template #cell-card="{ item }">
            <span v-if="cardLabel(item as Row)" class="ek-num">{{ cardLabel(item as Row) }}</span>
            <span v-else class="bo-muted">kartsız</span>
          </template>
          <template #cell-updatedAt="{ item }">
            <time :datetime="(item as Row).updatedAt" :title="formatDateTime((item as Row).updatedAt)">{{ formatRelative((item as Row).updatedAt) }}</time>
          </template>
        </EkDataTable>
        <BoPagination :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" @more="list.loadMore()" />
      </StateBlock>
    </EkCard>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkButton, EkCard, EkDataTable, EkRefreshButton, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { SubscriptionRow, SubscriptionStatus } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import { PLAN, SUB_STATUS, planLabel } from '@bo/utils/labels'
import { formatDate, formatDateTime, formatRelative } from '@bo/utils/format'
import '@bo/styles/kit.css'

type Row = SubscriptionRow

const COLUMNS: EkTableColumn[] = [
  { key: 'tenant', label: 'Müşteri' },
  { key: 'plan', label: 'Plan' },
  { key: 'status', label: 'Durum' },
  { key: 'date', label: 'Deneme bitişi / dönem sonu' },
  { key: 'card', label: 'Kart' },
  { key: 'updatedAt', label: 'Güncellendi' },
]
const STATUS_ITEMS = [
  { title: 'Tüm durumlar', value: '' },
  ...(Object.keys(SUB_STATUS) as SubscriptionStatus[]).map((s) => ({ title: SUB_STATUS[s].label, value: s })),
]
const PLAN_ITEMS = [{ title: 'Tüm planlar', value: '' }, ...Object.entries(PLAN).map(([value, title]) => ({ title, value }))]

// Süzgeçler URL'de (?durum= ?plan=): hüküm bağlantıları ve paylaşılan görünüm aynı listeyi açar.
const route = useRoute()
const router = useRouter()
// `alias`: genel bakış (getAttention) sözleşme adıyla gelir (`status=past_due`) — okunur, yazımda Türkçe ada çevrilir.
const queryRef = <T extends string>(key: string, valid: (v: string) => boolean, fallback: T, alias?: string) =>
  computed<T>({
    get: () => {
      const v = route.query[key] ?? (alias ? route.query[alias] : undefined)
      return typeof v === 'string' && valid(v) ? (v as T) : fallback
    },
    set: (v) => void router.replace({ query: { ...route.query, ...(alias ? { [alias]: undefined } : {}), [key]: v || undefined } }),
  })
const status = queryRef<SubscriptionStatus | ''>('durum', (v) => v in SUB_STATUS, '', 'status')
const plan = queryRef<string>('plan', (v) => v in PLAN, '')
const filtered = computed(() => !!status.value || !!plan.value)

const list = useCursorList<SubscriptionRow>((cursor) =>
  api.call('BackofficeBillingService/listSubscriptions', {
    ...(status.value ? { status: status.value } : {}),
    ...(plan.value ? { planCode: plan.value } : {}),
    cursor,
    limit: 20,
  }),
)
const rows = computed(() => list.items.value as unknown as Array<Record<string, unknown>>)

function cardLabel(s: SubscriptionRow) {
  return s.cardLast4 ? `${(s.cardBrand ?? 'kart').toLocaleUpperCase('tr')} •••• ${s.cardLast4}` : ''
}
function clearFilters() {
  // Tek geçişte: iki ayrı replace eski sorguyu üst üste yazar.
  void router.replace({ query: { ...route.query, durum: undefined, status: undefined, plan: undefined } })
}

watch([status, plan], () => list.reload())
onMounted(() => list.reload())
</script>

<style scoped>
.bo-subs__link {
  color: var(--ek-color-action);
  text-decoration: none;
}
.bo-subs__link:hover {
  text-decoration: underline;
}
.bo-subs__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  font-size: var(--ek-type-caption-size);
}
</style>
