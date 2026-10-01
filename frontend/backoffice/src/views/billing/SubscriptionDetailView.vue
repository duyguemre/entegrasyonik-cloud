<template>
  <div class="bo-page">
    <EkEmptyState v-if="res.phase.value === 'notFound'" variant="no-results" title="Abonelik bulunamadı" :message="`#${tid} numaralı müşterinin aboneliği yok ya da kaldırılmış.`" />
    <StateBlock v-else-if="!sub" :phase="res.phase.value" :error="res.error.value" skeleton="detail" :rows="4" degraded-title="Abonelik şu an okunamıyor" @retry="res.load()" />
    <template v-else>
      <BoPageHeader :title="title" lede="" :extra-crumbs="[{ label: title }]" :updated-at="res.loadedAt.value ?? undefined" :stale="res.stale.value">
        <template #status>
          <EkStatusChip :tone="SUB_STATUS[sub.status].tone" :label="SUB_STATUS[sub.status].label" dot />
          <EkStatusChip v-if="sub.billingExempt" tone="neutral" label="Faturalamadan muaf" />
          <EkStatusChip v-if="sub.cancelAtPeriodEnd" tone="warning" label="Dönem sonunda iptal" />
        </template>
        <template #meta>
          <BoAction kind="detail" size="sm" :to="`/musteriler/${tid}`" data-testid="tenant-link">Müşteriye git · #{{ tid }}</BoAction>
        </template>
        <template #actions>
          <BoAction kind="refresh" :loading="res.refreshing.value" data-page-refresh @click="res.load()" />
        </template>
      </BoPageHeader>

      <PageVerdict :verdict="verdict" />

      <BoTileGrid :min="200" dense>
        <BoStat label="Plan" :value="sub.plan?.name ?? planLabel(sub.planCode)" :hint="priceText" />
        <BoStat :label="sub.status === 'trialing' ? 'Deneme bitişi' : 'Dönem sonu'" :value="nextDateText" :hint="periodText === '—' ? undefined : periodText" />
        <BoStat label="Kart" :value="card || 'kartsız'" :hint="sub.hasProviderRef ? 'sağlayıcı kaydı var' : 'sağlayıcı kaydı yok'" />
        <BoStat label="Olay sayısı" :value="formatCount(res.data.value!.events.length)" hint="Olaylar sekmesinde" :to="{ query: { ...route.query, sekme: 'olaylar' } }" />
      </BoTileGrid>

      <BoTabs v-model="tab" :tabs="TABS" label="Abonelik bölümleri">
        <template v-if="tab === 'ozet'">
          <BoTileGrid :cols="2">
            <BoSection title="Abonelik özeti" description="Planın, dönemin ve ödeme sağlayıcısının kayıtlı durumu." icon="mdi-card-account-details-outline">
              <dl class="bo-kv">
                <div><dt>Plan</dt><dd>{{ sub.plan?.name ?? planLabel(sub.planCode) }} <span class="bo-muted">(sürüm {{ sub.planVersion }})</span></dd></div>
                <div><dt>Liste fiyatı</dt><dd class="ek-num">{{ priceText }}</dd></div>
                <div><dt>Dönem</dt><dd class="ek-num">{{ periodText }}</dd></div>
                <div><dt>Deneme bitişi</dt><dd class="ek-num">{{ sub.trialEndsAt ? formatDateTime(sub.trialEndsAt) : '—' }}</dd></div>
                <div v-if="trialRelevant">
                  <dt>Deneme uzatma</dt>
                  <dd class="ek-num" data-testid="extension-usage">
                    {{ extension.used }} / {{ TRIAL_EXTENSION_MAX_TOTAL_DAYS }} gün kullanıldı <span class="bo-muted">· kalan {{ extension.remaining }} gün</span>
                  </dd>
                </div>
                <div v-if="sub.graceUntil"><dt>Ödeme toleransı</dt><dd class="ek-num">{{ formatDateTime(sub.graceUntil) }}</dd></div>
                <div><dt>Ödeme sağlayıcı</dt><dd>{{ sub.provider }} <span class="bo-muted">· {{ sub.hasProviderRef ? 'sağlayıcı kaydı var' : 'sağlayıcı kaydı yok' }}</span></dd></div>
                <div><dt>Kart</dt><dd class="ek-num">{{ card || 'kartsız' }}</dd></div>
                <div><dt>Oluşturuldu</dt><dd class="ek-num">{{ formatDate(sub.createdAt) }}</dd></div>
              </dl>
            </BoSection>

            <BoSection title="Plan kapsamı" description="Bu planın müşteriye tanıdığı limitler ve özellikler." icon="mdi-tune-variant">
              <template v-if="sub.plan">
                <dl class="bo-kv">
                  <div v-for="[k, v] in Object.entries(sub.plan.limits)" :key="k"><dt>{{ LIMIT_LABEL[k] ?? k }}</dt><dd class="ek-num">{{ formatCount(v) }}</dd></div>
                </dl>
                <p class="bo-sd__features">
                  <span class="bo-muted">Özellikler:</span>
                  {{ sub.plan.features.length ? sub.plan.features.map((f) => FEATURE_LABEL[f] ?? f).join(', ') : 'yok' }}
                </p>
              </template>
              <p v-else class="bo-muted">Plan kaydı bulunamadı; limit ve özellikler gösterilemiyor.</p>
              <p class="bo-sd__features">
                <RouterLink :to="`/sistem/rekabet?tid=${tid}`" data-testid="competition-link">Rekabet izleme ayarı ve istisnası</RouterLink>
                <span class="bo-muted"> · buybox izleme kapsamını bu müşteri için değiştirir</span>
              </p>
            </BoSection>
          </BoTileGrid>
        </template>

        <SubscriptionEvents v-else-if="tab === 'olaylar'" :events="res.data.value!.events" />

        <BoSection v-else id="yonetim-eylemleri" title="Yönetim eylemleri" description="Her eylem gerekçe ve kimlik doğrulaması ister; denetim kaydına yazılır. Gri düğmenin altında neden kullanılamadığı yazar." icon="mdi-shield-edit-outline">
          <ul class="bo-sd__actions">
            <li>
              <EkButton tone="secondary" :icon="reopen ? 'mdi-restore' : 'mdi-timer-plus-outline'" :disabled="!!extendWhy" data-testid="extend-trial" @click="openExtend">{{ reopen ? 'Denemeyi yeniden aç' : 'Denemeyi uzat' }}</EkButton>
              <p class="bo-muted bo-sd__why">{{ extendWhy || (reopen ? 'Deneme süresi bitmiş, abonelik askıda. Uzatma aboneliği yeniden deneme durumuna alır.' : 'Deneme süresine gün ekler; müşteri erişimi sürer.') }}</p>
            </li>
            <li>
              <EkButton tone="secondary" icon="mdi-swap-horizontal" :disabled="!!changeWhy" data-testid="change-plan" @click="openChange">Planı değiştir</EkButton>
              <p class="bo-muted bo-sd__why">{{ changeWhy || 'Müşteriyi başka bir plana geçirir; ücret farkı sağlayıcıda işlenir.' }}</p>
            </li>
            <li class="bo-sd__danger">
              <BoAction kind="cancel" :disabled="!!cancelWhy" data-testid="cancel-sub" @click="openCancel">Aboneliği iptal et</BoAction>
              <p class="bo-muted bo-sd__why">{{ cancelWhy || 'Geri alınamaz; onay için müşteri numarası yazılır.' }}</p>
            </li>
          </ul>
        </BoSection>
      </BoTabs>
      <p class="bo-muted bo-sd__src">Abonelik okuması hassas okuma olarak denetime yazılır (BackofficeBillingService/getSubscription).</p>
    </template>

    <GuardedDialog
      :action="extend"
      :title="reopen ? 'Deneme yeniden açılsın mı?' : 'Deneme süresi uzatılsın mı?'"
      irreversible
      :description="`${title} · mevcut bitiş: ${sub?.trialEndsAt ? formatDateTime(sub.trialEndsAt) : '—'}`"
      :icon="reopen ? 'mdi-restore' : 'mdi-timer-plus-outline'"
      :tenant="{ tid, name: title }"
      :items="extendItems"
      :confirm-label="reopen ? 'Denemeyi yeniden aç' : 'Denemeyi uzat'"
      :confirm-icon="reopen ? 'mdi-restore' : 'mdi-timer-plus-outline'"
      :confirm-disabled="!daysValid"
    >
      <v-text-field
        v-model.number="days"
        type="number"
        min="1"
        :max="maxDays"
        step="1"
        :label="`Uzatılacak gün (1–${maxDays})`"
        density="compact"
        :hint="`Toplam hak ${TRIAL_EXTENSION_MAX_TOTAL_DAYS} gün: ${extension.used} gün kullanıldı, ${extension.remaining} gün kaldı. Tek seferde en çok ${TRIAL_EXTENSION_MAX_DAYS} gün.`"
        persistent-hint
        :error-messages="daysValid ? undefined : `Gün 1 ile ${maxDays} arasında tam sayı olmalı.`"
        data-testid="extend-days"
      />
      <p class="bo-sd__preview" aria-live="polite">Yeni bitiş: <strong class="ek-num">{{ daysValid ? formatDateTime(newTrialEnd) : '—' }}</strong></p>
    </GuardedDialog>

    <GuardedDialog
      :action="change"
      title="Plan değiştirilsin mi?"
      :description="`${title} · mevcut plan: ${planLabel(sub?.planCode)}`"
      icon="mdi-swap-horizontal"
      :tenant="{ tid, name: title }"
      :items="['Plan değişimi ödeme sağlayıcısında uygulanır; oransal ücret ve fatura sağlayıcı sorumluluğundadır.', 'Gerekçe denetim kaydına yazılır.']"
      confirm-label="Planı değiştir"
      confirm-icon="mdi-swap-horizontal"
      :confirm-disabled="!targetPlan || targetPlan === sub?.planCode"
    >
      <v-select v-model="targetPlan" :items="planItems" label="Hedef plan" density="compact" :hint="planHint" persistent-hint data-testid="target-plan" />
      <EkAlert v-if="targetPlan === 'enterprise'" tone="warning" dense title="Özel teklif gerektirir" text="Kurumsal plan liste fiyatsızdır; bu plana geçiş sağlayıcıda reddedilebilir." />
    </GuardedDialog>

    <GuardedDialog
      :action="cancel"
      title="Abonelik iptal edilsin mi?"
      :description="title"
      icon="mdi-cancel"
      danger
      :confirm-text="String(tid)"
      :tenant="{ tid, name: title }"
      :items="cancelItems"
      confirm-label="Aboneliği iptal et"
      confirm-icon="mdi-cancel"
    >
      <p v-if="cancelLocal" class="bo-sd__preview" data-testid="cancel-local">Sağlayıcı kaydı olmadığı için iptal doğrudan ve hemen uygulanır; dönem sonu seçeneği yoktur.</p>
      <BoSegmented v-else v-model="cancelWhen" :options="CANCEL_WHEN" label="İptal zamanı" />
    </GuardedDialog>
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import BoTabs from '@bo/components/r2/BoTabs.vue'
import BoSegmented from '@bo/components/r2/BoSegmented.vue'
import { useTabQuery } from '@bo/composables/useTabQuery'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { CANCEL_HASH, subscriptionDetailVerdict } from './billingVerdict'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkButton, EkEmptyState, EkStatusChip, type EkPageTab } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { GetSubscriptionResponse } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import SubscriptionEvents from './SubscriptionEvents.vue'
import { TRIAL_EXTENSION_MAX_DAYS, TRIAL_EXTENSION_MAX_TOTAL_DAYS } from '@bo/api/contracts/billing'
import { PLAN, SUB_STATUS, planLabel } from '@bo/utils/labels'
import { formatCount, formatMinor } from '@bo/utils/units'
import { formatDate, formatDateTime } from '@bo/utils/format'
import { notifyAuditedAt } from '@bo/utils/toast'
import '@bo/styles/kit.css'

const DAY_MS = 86_400_000
const LIMIT_LABEL: Record<string, string> = { channels: 'Kanal', skus: 'Ürün (SKU)', users: 'Kullanıcı', mcpCallsPerDay: 'Günlük MCP çağrısı' }
const FEATURE_LABEL: Record<string, string> = { erp: 'ERP', einvoice: 'E-fatura', shipping: 'Kargo' }
/** SÖZLEŞME EKSİĞİ: admin plan listesi ucu yok; seçenekler sabit yardımcı listeden sunulur (sunucu PLAN_NOT_FOUND ile doğrular). */
const KNOWN_PLANS = ['starter', 'growth', 'enterprise']

const route = useRoute()
const router = useRouter()
const tid = Number(route.params.tid)
const res = useResource<GetSubscriptionResponse>(() => api.call('BackofficeBillingService/getSubscription', { tid }))
const sub = computed(() => res.data.value?.subscription ?? null)
const title = computed(() => sub.value?.tenantName ?? `#${tid}`)

const tab = useTabQuery(['ozet', 'olaylar', 'eylemler'] as const, 'ozet')
const TABS = computed<EkPageTab[]>(() => [
  { value: 'ozet', label: 'Özet', icon: 'mdi-card-account-details-outline' },
  { value: 'olaylar', label: 'Olaylar', icon: 'mdi-history', count: res.data.value?.events.length ?? null },
  { value: 'eylemler', label: 'Eylemler', icon: 'mdi-shield-edit-outline' },
])
const nextDateText = computed(() => {
  const s = sub.value
  const iso = s?.status === 'trialing' ? s.trialEndsAt : s?.currentPeriodEnd
  return iso ? formatDate(iso) : '—'
})
const priceText = computed(() => {
  const p = sub.value?.plan
  if (!p) return '—'
  if (p.priceMinor === 0) return 'Özel teklif'
  return `${formatMinor(p.priceMinor, p.currency)} / ${p.interval === 'year' ? 'yıl' : 'ay'}${p.vatIncluded ? ' (KDV dahil)' : ' (KDV hariç)'}`
})
const periodText = computed(() => {
  const s = sub.value
  return s?.currentPeriodStart && s.currentPeriodEnd ? `${formatDate(s.currentPeriodStart)} – ${formatDate(s.currentPeriodEnd)}` : '—'
})
const card = computed(() => {
  const s = sub.value
  return s?.cardLast4 ? `${(s.cardBrand ?? 'kart').toLocaleUpperCase('tr')} •••• ${s.cardLast4}` : ''
})

// K40: denemesi bitip askıya alınmış kartsız abonelik uzatmayla yeniden açılır.
const reopen = computed(() => {
  const s = sub.value
  return !!s && s.status === 'suspended' && !s.hasProviderRef && !!s.trialEndsAt && !s.billingExempt
})
const trialRelevant = computed(() => !!sub.value && !sub.value.billingExempt && (sub.value.status === 'trialing' || reopen.value))
/**
 * K40 toplam uzatma: abonelik yanıtında sayaç alanı yok (SÖZLEŞME EKSİĞİ, backend'e iletildi); en yeni
 * `subscription.trial_extended` olayının `payload.totalExtensionDays` değeri okunur. Olay yoksa 0 kabul edilir; sunucu
 * yine de TRIAL_EXTENSION_LIMIT ile korur.
 */
const extension = computed(() => {
  const ev = res.data.value?.events.find((e) => e.type === 'subscription.trial_extended' && Number.isFinite(Number(e.payload?.totalExtensionDays)))
  const used = Math.min(TRIAL_EXTENSION_MAX_TOTAL_DAYS, Math.max(0, Number(ev?.payload?.totalExtensionDays ?? 0)))
  return { used, remaining: TRIAL_EXTENSION_MAX_TOTAL_DAYS - used }
})
const maxDays = computed(() => Math.max(1, Math.min(TRIAL_EXTENSION_MAX_DAYS, extension.value.remaining)))

// Uygun olmayan eylemler: neden metni (düğme devre dışı).
const extendWhy = computed(() => {
  const s = sub.value
  if (!s) return ''
  if (s.billingExempt) return 'Muaf abonelikte deneme uzatılamaz.'
  if (s.status !== 'trialing' && !reopen.value) {
    return s.status === 'suspended' ? 'Kartlı abonelik askıda: ödeme sağlayıcısında çözülmeli.' : 'Yalnız deneme sürecindeki ya da denemesi bitmiş (askıdaki, kartsız) abonelik uzatılabilir.'
  }
  if (extension.value.remaining <= 0) return `Toplam ${TRIAL_EXTENSION_MAX_TOTAL_DAYS} günlük uzatma hakkı doldu.`
  return ''
})
const changeWhy = computed(() => {
  const s = sub.value
  if (s && !['trialing', 'active', 'past_due'].includes(s.status)) return 'Deneme, aktif veya ödemesi gecikmiş abonelikte değiştirilebilir.'
  return ''
})
const cancelWhy = computed(() => {
  const s = sub.value
  if (s && (s.status === 'canceled' || s.status === 'expired')) return 'Abonelik zaten sona ermiş.'
  return ''
})

// --- Denemeyi uzat
const days = ref(7)
const daysValid = computed(() => Number.isInteger(days.value) && days.value >= 1 && days.value <= maxDays.value)
const extendItems = computed(() => [
  reopen.value
    ? 'Askıdaki abonelik yeniden deneme durumuna alınır; müşteri erişimi açılır. Yeni bitiş = şimdi + seçilen gün.'
    : 'Yeni bitiş = mevcut bitiş ile şimdi arasından geç olan + seçilen gün.',
  `Tek seferde en çok ${TRIAL_EXTENSION_MAX_DAYS}, abonelik başına toplam ${TRIAL_EXTENSION_MAX_TOTAL_DAYS} gün (kalan ${extension.value.remaining} gün).`,
  'Sağlayıcıdan bağımsızdır; kartsız denemede de çalışır. Gerekçe denetim kaydına yazılır.',
])
const newTrialEnd = computed(() => {
  const cur = sub.value?.trialEndsAt ? Date.parse(sub.value.trialEndsAt) : 0
  return Math.max(cur, Date.now()) + days.value * DAY_MS
})
const extend = useGuardedAction(
  (id: number, reason) => api.call('BackofficeBillingService/extendTrial', { tid: id, days: days.value, reason }),
  (r) => {
    const head = r.reopened ? `Deneme yeniden açıldı (${r.extendedDays} gün)` : `Deneme ${r.extendedDays} gün uzatıldı`
    notifyAuditedAt(`${head}; yeni bitiş ${formatDateTime(r.trialEndsAt)}. Kalan uzatma hakkı ${r.remainingExtensionDays} gün.`, { tid: String(tid) })
    res.load()
  },
)
function openExtend() {
  days.value = Math.min(7, maxDays.value)
  extend.open(tid)
}

// --- Planı değiştir
const targetPlan = ref('')
const planItems = computed(() =>
  [...new Set([...KNOWN_PLANS, ...(sub.value ? [sub.value.planCode] : [])])].map((code) => ({
    title: PLAN[code] ?? code,
    value: code,
    props: { disabled: code === sub.value?.planCode, subtitle: code === sub.value?.planCode ? 'mevcut plan' : undefined },
  })),
)
const planHint = computed(() => (targetPlan.value === sub.value?.planCode ? 'Aynı plan seçilemez.' : 'Plan listesi sabittir; sunucu plan kodunu doğrular.'))
const change = useGuardedAction(
  (id: number, reason) => api.call('BackofficeBillingService/changePlan', { tid: id, planCode: targetPlan.value, reason }),
  (r) => {
    notifyAuditedAt(`Plan ${planLabel(r.planCode)} olarak değiştirildi.`, { tid: String(tid) })
    res.load()
  },
)
function openChange() {
  targetPlan.value = ''
  change.open(tid)
}

// --- İptal (K40: sağlayıcı kaydı yoksa yerel ve doğrudan)
const cancelLocal = computed(() => !!sub.value && !sub.value.billingExempt && !sub.value.hasProviderRef)
const atPeriodEnd = ref(true)
const CANCEL_WHEN = [{ value: 'end', label: 'Dönem sonunda' }, { value: 'now', label: 'Hemen' }]
const cancelWhen = computed<string>({ get: () => (atPeriodEnd.value ? 'end' : 'now'), set: (v) => { atPeriodEnd.value = v === 'end' } })
const cancelItems = computed(() =>
  cancelLocal.value
    ? [
        'Abonelik hemen iptal edilir; müşteri erişimi kapanır.',
        'Kartsız abonelikte ödeme sağlayıcısı çağrılmaz; iptal yalnız Entegrasyonik kaydında uygulanır.',
        'Gerekçe denetim kaydına yazılır.',
      ]
    : [
        atPeriodEnd.value ? 'Abonelik dönem sonuna kadar sürer; sonra yenilenmez.' : 'Abonelik hemen iptal edilir; müşteri erişimi etkilenebilir.',
        'İptal ödeme sağlayıcısında uygulanır (canlı salt-okuma kipinde kapalıdır).',
        'Gerekçe denetim kaydına yazılır.',
      ],
)
const cancel = useGuardedAction(
  (id: number, reason) => api.call('BackofficeBillingService/cancelSubscription', { tid: id, atPeriodEnd: cancelLocal.value ? false : atPeriodEnd.value, reason }),
  (r) => {
    const where = r.external ? 'ödeme sağlayıcısında' : 'doğrudan (sağlayıcı kaydı yok)'
    notifyAuditedAt(r.status === 'canceled' ? `Abonelik ${where} iptal edildi.` : `Abonelik dönem sonunda iptal edilecek (${where}).`, { tid: String(tid) })
    res.load()
  },
)
function openCancel() {
  atPeriodEnd.value = !cancelLocal.value
  cancel.open(tid)
}

// Hüküm: abonelik + olaylar tek okumadan; yazma eylemleri aşağıdaki GuardedDialog'ları açar.
const verdict = computed(() =>
  sub.value || (res.phase.value !== 'loading' && res.phase.value !== 'notFound')
    ? subscriptionDetailVerdict({
        tid,
        sub: sub.value,
        events: res.data.value?.events ?? [],
        failed: res.data.value === null,
        stale: res.stale.value,
        retry: () => void res.load(),
        why: { extend: extendWhy.value, change: changeWhy.value, cancel: cancelWhy.value },
        reopen: reopen.value,
        openExtend,
        openChange,
        openCancel,
      })
    : null,
)

// Hükümdeki "Aboneliği iptal et" (danger) eylemi yalnız buraya götürür: yönetim eylemleri kartına kaydırır, iptal düğmesine odaklanır.
watch(
  () => [route.hash, sub.value?.tid],
  async () => {
    if (route.hash !== CANCEL_HASH || !sub.value) return
    if (tab.value !== 'eylemler') tab.value = 'eylemler'
    await nextTick()
    await nextTick()
    document.getElementById('yonetim-eylemleri')?.scrollIntoView({ block: 'center' })
    document.querySelector<HTMLElement>('[data-testid="cancel-sub"]')?.focus()
  },
  { immediate: true },
)

onMounted(() => res.load())
</script>

<style scoped>
.bo-sd__title {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}
.bo-sd__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}
.bo-sd__tid {
  color: var(--ek-color-action);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-label-size);
  text-decoration: none;
}
.bo-sd__tid:hover {
  text-decoration: underline;
}
.bo-sd__features {
  margin: var(--ek-space-4) 0 0;
  font-size: var(--ek-type-label-size);
}
.bo-sd__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-5);
  margin: 0;
  padding: 0;
  list-style: none;
}
.bo-sd__actions li {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-2);
  max-width: 260px;
}
.bo-sd__why {
  margin: 0;
  font-size: var(--ek-type-caption-size);
}
.bo-sd__preview {
  margin: 0 0 var(--ek-space-3);
  font-size: var(--ek-type-label-size);
}
.bo-sd__src {
  margin: 0;
  font-size: var(--ek-type-caption-size);
}
</style>
