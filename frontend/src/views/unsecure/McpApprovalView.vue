<!--
  frontend/src/views/unsecure/McpApprovalView.vue

  MCP-6 S2 — bant dışı işlem onayı (MCP_UI_CONTRACT §3, ADR-0035 Karar 5). Rota `/approve/{id}` (URL'de başka parametre
  yok); SADE KABUK (`AuthShell`). Yapay zekâ uygulamasının önerdiği yazma işlemi YALNIZ burada, kullanıcının web oturumu
  ve sunucu önizlemesiyle onaylanır — istemcinin "kabul" yanıtı onay sayılmaz.

  Durumlar: yükleniyor · pending (önizleme + geri sayım + Reddet/eylem düğmesi) · executed · failed · unknown_outcome ·
  rejected · expired/404 · LIVE_READONLY · MAINTENANCE · QUOTA_EXCEEDED (+ plan bağlantısı) · yükleme hatası.
  Erişilebilirlik: ilk odak BAŞLIKTA; geri sayım görsel, ekran okuyucuya yalnız son 60 sn'ye girilince BİR kez;
  sonuç değişince odak sonuç başlığına. `preview.*` düz metin (v-html yok).
-->
<template>
  <div class="McpApprovalView">
    <AuthShell>
      <div class="ek-approval">
        <p class="ek-approval__eyebrow">{{ $t('mcp.approval.eyebrow') }}</p>

        <div v-if="phase === 'loading'" role="status" aria-live="polite" data-testid="mcp-approval-loading">
          <span class="ek-sr-only">{{ $t('mcp.common.loading') }}</span>
          <EkSkeleton type="detail" :rows="5" />
        </div>

        <template v-else-if="phase === 'pending' && view">
          <h1 ref="headingRef" class="ek-approval__title" tabindex="-1" data-testid="mcp-approval-title">
            <i18n-t keypath="mcp.approval.title" tag="span" scope="global">
              <template #app><strong>{{ view.client.name }}</strong></template>
            </i18n-t>
          </h1>

          <McpActionPreview :view="view" />

          <p class="ek-approval__timer" :class="{ 'is-soon': remaining <= 60 }" aria-hidden="true" data-testid="mcp-approval-timer">
            <v-icon icon="mdi-timer-outline" size="small" />
            <span>{{ $t('mcp.approval.countdown', { time: formatCountdown(remaining) }) }}</span>
          </p>
          <p class="ek-sr-only" aria-live="polite" data-testid="mcp-approval-announce">{{ announcement }}</p>

          <EkAlert v-if="decisionErrorKey" tone="error" dense live data-testid="mcp-approval-error">
            <span>{{ $t('mcp.approval.decisionError') }} {{ $t(decisionErrorKey) }}</span>
            <span v-if="failureRequestId" class="ek-approval__support">{{ $t('mcp.common.supportCode', { code: failureRequestId }) }}</span>
          </EkAlert>

          <div class="ek-approval__actions">
            <EkButton tone="secondary" :disabled="busy" :loading="busy && pendingDecision === 'reject'" data-testid="mcp-approval-reject" @click="decide('reject')">
              {{ $t('mcp.approval.reject') }}
            </EkButton>
            <EkButton tone="primary" icon="mdi-check" :disabled="busy" :loading="busy && pendingDecision === 'approve'" data-testid="mcp-approval-approve" @click="decide('approve')">
              {{ view.preview.confirmLabel }}
            </EkButton>
          </div>
        </template>

        <div v-else-if="outcome" class="ek-approval__outcome" :data-phase="phase" data-testid="mcp-approval-outcome">
          <div class="ek-approval__outcome-head" :class="`is-${outcome.tone}`">
            <v-icon :icon="outcome.icon" size="28" aria-hidden="true" />
            <h1 ref="headingRef" class="ek-approval__title" tabindex="-1">{{ $t(outcome.titleKey) }}</h1>
          </div>

          <p v-if="phase === 'executed' && view?.result?.summary" class="ek-approval__text">{{ view.result.summary }}</p>
          <p v-else-if="phase === 'failed'" class="ek-approval__text">{{ $t(failedResultKey(view)) }}</p>
          <p v-if="outcome.textKey" class="ek-approval__text">{{ $t(outcome.textKey) }}</p>

          <McpActionPreview v-if="view && showPreviewInOutcome" :view="view" />

          <p v-if="outcome.showSupport && supportCode" class="ek-approval__support">{{ $t('mcp.common.supportCode', { code: supportCode }) }}</p>
          <p v-if="outcome.showReturnNote" class="ek-approval__note">{{ $t('mcp.approval.returnNote') }}</p>

          <div class="ek-approval__actions is-outcome">
            <router-link v-if="outcome.showOpenIn && openIn" v-slot="{ navigate }" :to="openIn" custom>
              <EkButton tone="primary" trailing-icon="mdi-arrow-right" data-testid="mcp-approval-open-in" @click="navigate">{{ $t('mcp.approval.openIn') }}</EkButton>
            </router-link>
            <EkButton v-if="outcome.showUpgrade" tone="primary" trailing-icon="mdi-arrow-right" data-testid="mcp-approval-upgrade" @click="router.push('/subscription')">
              {{ $t('mcp.approval.upgrade') }}
            </EkButton>
            <EkButton v-if="phase === 'error'" tone="primary" icon="mdi-refresh" @click="load">{{ $t('mcp.common.retry') }}</EkButton>
            <EkButton tone="secondary" icon="mdi-view-dashboard-outline" @click="router.push('/')">{{ $t('mcp.common.toApp') }}</EkButton>
          </div>
        </div>
      </div>
    </AuthShell>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { EkAlert, EkButton, EkSkeleton } from '@entegrasyonik/ui/components'
import AuthShell from '@/components/login/AuthShell.vue'
import McpActionPreview from '@/components/mcp/McpActionPreview.vue'
import { useMcpApi } from '@/composables/useMcpApi'
import {
  approvalFailurePhase,
  approvalOutcome,
  failedResultKey,
  formatCountdown,
  mcpErrorKey,
  openInLocation,
  remainingSeconds,
  shouldAnnounceCountdown,
  type ApprovalPhase,
} from '@/components/mcp/mcpModel'
import type { ApprovalView } from '@/types/McpTypes'

const route = useRoute()
const router = useRouter()
const api = useMcpApi()
const { t } = useI18n()

const phase = ref<ApprovalPhase>('loading')
const view = ref<ApprovalView | null>(null)
const busy = ref(false)
const pendingDecision = ref<'approve' | 'reject' | null>(null)
const decisionErrorKey = ref('')
const failureRequestId = ref('')
const headingRef = ref<HTMLElement | null>(null)

const now = ref(Date.now())
const announced = ref(false)
const announcement = ref('')
let ticker: ReturnType<typeof setInterval> | null = null

const approvalId = computed(() => String(route.params.id ?? ''))
const remaining = computed(() => (view.value ? remainingSeconds(view.value.expiresAt, now.value) : 0))
const outcome = computed(() => approvalOutcome(phase.value, view.value))
const openIn = computed(() => openInLocation(view.value?.result?.openIn))
/** Engelleyici hata (salt-okuma/bakım/kota) ve sonuçlarda önizleme bağlam için kalır; süresi dolmuş/yükleme hatasında yok. */
const showPreviewInOutcome = computed(() => ['LIVE_READONLY', 'MAINTENANCE', 'QUOTA_EXCEEDED'].includes(phase.value))
/** Destek kodu: hata yanıtının `requestId`'si; `failed` sonucunda ApprovalView'da requestId alanı yok → onay kimliği. */
const supportCode = computed(() => failureRequestId.value || (phase.value === 'failed' ? view.value?.id ?? '' : ''))

function stopTicker() {
  if (ticker) clearInterval(ticker)
  ticker = null
}

function tick() {
  now.value = Date.now()
  if (phase.value !== 'pending') return stopTicker()
  if (shouldAnnounceCountdown(remaining.value, announced.value)) {
    announced.value = true
    announcement.value = t('mcp.approval.lastMinute')
  }
  if (remaining.value <= 0 && !busy.value) {
    phase.value = 'expired'
    stopTicker()
  }
}

function startTicker() {
  stopTicker()
  announced.value = false
  announcement.value = ''
  tick()
  ticker = setInterval(tick, 1000)
}

function goLogin() {
  router.push({ path: '/login', query: { redirect: route.fullPath } })
}

async function focusHeading() {
  await nextTick()
  headingRef.value?.focus()
}

function applyView(v: ApprovalView) {
  view.value = v
  phase.value = v.status === 'pending' && remainingSeconds(v.expiresAt) <= 0 ? 'expired' : v.status
  if (phase.value === 'pending') startTicker()
  else stopTicker()
}

async function load() {
  phase.value = 'loading'
  decisionErrorKey.value = ''
  failureRequestId.value = ''
  if (!approvalId.value) {
    phase.value = 'expired'
    return
  }
  const res = await api.getApproval(approvalId.value)
  if (res.ok) applyView(res.data)
  else {
    const next = approvalFailurePhase(res.failure)
    if (next === 'login') return goLogin()
    failureRequestId.value = res.failure.requestId ?? ''
    phase.value = next
  }
  await focusHeading()
}

async function decide(decision: 'approve' | 'reject') {
  if (busy.value || !view.value || phase.value !== 'pending') return
  busy.value = true
  pendingDecision.value = decision
  decisionErrorKey.value = ''
  failureRequestId.value = ''
  const res = await api.decideApproval(view.value.id, decision)
  busy.value = false
  pendingDecision.value = null
  if (res.ok) {
    applyView(res.data)
    await focusHeading()
    return
  }
  const next = approvalFailurePhase(res.failure)
  if (next === 'login') return goLogin()
  failureRequestId.value = res.failure.requestId ?? ''
  if (next === 'error') {
    // Geçici hata: önizleme ve düğmeler kalır, satır içi ileti + destek kodu (yeniden denenebilir).
    decisionErrorKey.value = mcpErrorKey(res.failure.code)
    return
  }
  stopTicker()
  phase.value = next
  await focusHeading()
}

watch(approvalId, (id, old) => {
  if (id && id !== old) load()
})

onMounted(load)
onBeforeUnmount(stopTicker)
</script>

<style scoped>
.ek-approval {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
.ek-approval__eyebrow {
  margin: 0;
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}
.ek-approval__title {
  margin: 0;
  font-size: var(--ek-font-size-xl);
  font-weight: var(--ek-font-weight-semibold);
  line-height: var(--ek-line-height-tight);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}
.ek-approval__title:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
  border-radius: var(--ek-radius-control);
}
.ek-approval__timer {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-font-size-sm);
  font-variant-numeric: tabular-nums;
  color: var(--ek-color-content-muted);
}
.ek-approval__timer.is-soon {
  color: var(--ek-color-warning-emphasis);
  font-weight: var(--ek-font-weight-medium);
}
.ek-approval__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}
.ek-approval__actions.is-outcome {
  justify-content: flex-start;
}
.ek-approval__outcome {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}
.ek-approval__outcome-head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}
.ek-approval__outcome-head.is-success .v-icon {
  color: var(--ek-color-success-emphasis);
}
.ek-approval__outcome-head.is-error .v-icon {
  color: var(--ek-color-error-emphasis);
}
.ek-approval__outcome-head.is-warning .v-icon {
  color: var(--ek-color-warning-emphasis);
}
.ek-approval__outcome-head.is-neutral .v-icon,
.ek-approval__outcome-head.is-info .v-icon {
  color: var(--ek-color-content-muted);
}
.ek-approval__text {
  margin: 0;
  color: var(--ek-color-content-default);
  line-height: var(--ek-line-height-normal);
}
.ek-approval__note {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}
.ek-approval__support {
  display: block;
  margin: 0;
  font-size: var(--ek-font-size-xs);
  font-family: var(--ek-font-mono);
  color: var(--ek-color-content-muted);
}
</style>
