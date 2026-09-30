<!--
  frontend/src/views/unsecure/OAuthConsentView.vue

  MCP-6 S1 — OAuth onay (consent) ekranı (MCP_UI_CONTRACT §2, ADR-0035 Karar 2). Rota `/oauth/consent?req={id}`;
  SADE KABUK (`AuthShell`, menü yok — giriş sayfası deseni). Oturum gerekir: yoksa router `/login?redirect=` ile
  girişe gönderir ve geri döner; ekran içi 401 de aynı yolu izler (useMcpApi `skipSessionRedirect`).

  Güvenlik kuralları (statik test: tests/mcp-contract.test.ts):
    - Yönlendirme YALNIZ backend yanıtındaki `redirectTo` ile (`window.location.assign(res.data.redirectTo)`); önyüz URL kurmaz.
    - İlk odak BAŞLIKTA (birincil düğmede değil); "İzin ver" mağaza seçilmeden devre dışı; çift gönderim yok.
    - Doğrulanmamış istemcide uyarı; her iki durumda yönlendirme adresi (`client.redirectHost`) belirgin.
    - Yazma kutusu yalnız `writeAvailable` mağazada ve varsayılan İŞARETSİZ.
    - `notice.text` düz metin ({{ }}; `v-html` yok).
-->
<template>
  <div class="OAuthConsentView">
    <AuthShell>
      <div class="ek-consent">
        <p class="ek-consent__eyebrow">{{ $t('mcp.consent.eyebrow') }}</p>

        <div v-if="phase === 'loading'" role="status" aria-live="polite" data-testid="mcp-consent-loading">
          <span class="ek-sr-only">{{ $t('mcp.common.loading') }}</span>
          <EkSkeleton type="detail" :rows="5" />
        </div>

        <AuthResultBlock
          v-else-if="phase === 'expired'"
          icon="mdi-timer-off-outline"
          tone="neutral"
          :title="$t('mcp.consent.expiredTitle')"
          :text="$t('mcp.consent.expiredText')"
          data-testid="mcp-consent-expired"
        >
          <EkButton tone="secondary" block icon="mdi-view-dashboard-outline" @click="toApp">{{ $t('mcp.common.toApp') }}</EkButton>
        </AuthResultBlock>

        <AuthResultBlock
          v-else-if="phase === 'impersonation'"
          icon="mdi-account-supervisor-outline"
          tone="warning"
          :title="$t('mcp.consent.impersonationTitle')"
          :text="$t('mcp.consent.impersonationText')"
          alert
          data-testid="mcp-consent-impersonation"
        >
          <EkButton tone="secondary" block icon="mdi-view-dashboard-outline" @click="toApp">{{ $t('mcp.common.toApp') }}</EkButton>
        </AuthResultBlock>

        <AuthResultBlock
          v-else-if="phase === 'error'"
          icon="mdi-alert-circle-outline"
          tone="error"
          :title="$t('mcp.consent.loadErrorTitle')"
          :text="$t('mcp.consent.loadErrorText')"
          alert
        >
          <p v-if="loadRequestId" class="ek-consent__support">{{ $t('mcp.common.supportCode', { code: loadRequestId }) }}</p>
          <EkButton tone="primary" block icon="mdi-refresh" @click="load">{{ $t('mcp.common.retry') }}</EkButton>
        </AuthResultBlock>

        <div v-else-if="phase === 'redirecting'" role="status" aria-live="polite" class="ek-consent__redirecting" data-testid="mcp-consent-redirecting">
          <v-icon icon="mdi-open-in-new" size="small" aria-hidden="true" />
          <span>{{ $t('mcp.consent.redirecting') }}</span>
        </div>

        <form v-else-if="req" class="ek-consent__form" data-testid="mcp-consent" @submit.prevent="decide(true)">
          <h1 ref="headingRef" class="ek-consent__title" tabindex="-1">
            <i18n-t keypath="mcp.consent.title" tag="span" scope="global">
              <template #app><strong class="ek-consent__app">{{ req.client.name }}</strong></template>
            </i18n-t>
          </h1>

          <EkStatusChip v-if="req.client.known" class="ek-consent__known" tone="success" icon="mdi-check-decagram-outline" :label="$t('mcp.consent.known')" />
          <EkAlert v-else tone="warning" dense :text="$t('mcp.consent.unverified')" data-testid="mcp-consent-unverified" />

          <div class="ek-consent__redirect">
            <span>{{ $t('mcp.consent.redirect') }}</span>
            <strong class="ek-consent__host" data-testid="mcp-consent-host">{{ req.client.redirectHost }}</strong>
          </div>

          <!-- 2. Mağaza seçimi -->
          <fieldset class="ek-consent__group" :aria-describedby="storeHintId">
            <legend class="ek-consent__legend">{{ $t('mcp.consent.storeLegend') }}</legend>
            <p :id="storeHintId" class="ek-consent__hint">{{ $t('mcp.consent.storeHint') }}</p>

            <div v-if="req.tenants.length > 1" class="ek-consent__tenants">
              <label
                v-for="t in req.tenants"
                :key="t.tid"
                class="ek-consent__tenant"
                :class="{ 'is-disabled': !isTenantEligible(t), 'is-selected': tid === t.tid }"
                :data-tid="t.tid"
              >
                <input
                  v-model="tid"
                  type="radio"
                  name="ek-consent-tenant"
                  :value="t.tid"
                  :disabled="!isTenantEligible(t) || busy"
                  :aria-describedby="!isTenantEligible(t) ? `ek-consent-off-${t.tid}` : undefined"
                />
                <span class="ek-consent__tenant-text">
                  <span class="ek-consent__tenant-name">{{ t.name }}</span>
                  <span class="ek-consent__tenant-role">{{ $t(roleLabelKey(t.role)) }}</span>
                  <span v-if="!isTenantEligible(t)" :id="`ek-consent-off-${t.tid}`" class="ek-consent__tenant-off">
                    {{ $t('mcp.consent.storeOff') }}
                    <router-link v-if="t.role === 'owner'" class="ek-consent__link" to="/settings/ai-connection">{{ $t('mcp.consent.storeOffOwnerLink') }}</router-link>
                  </span>
                </span>
              </label>
            </div>
            <div v-else-if="req.tenants.length === 1" class="ek-consent__tenant is-static" :data-tid="req.tenants[0].tid">
              <span class="ek-consent__tenant-text">
                <span class="ek-consent__tenant-name">{{ req.tenants[0].name }}</span>
                <span class="ek-consent__tenant-role">{{ $t(roleLabelKey(req.tenants[0].role)) }}</span>
                <span v-if="!isTenantEligible(req.tenants[0])" class="ek-consent__tenant-off">
                  {{ $t('mcp.consent.storeOff') }}
                  <router-link v-if="req.tenants[0].role === 'owner'" class="ek-consent__link" to="/settings/ai-connection">{{ $t('mcp.consent.storeOffOwnerLink') }}</router-link>
                </span>
              </span>
            </div>
          </fieldset>

          <!-- 3. İzinler -->
          <fieldset v-if="!noEligible" class="ek-consent__group">
            <legend class="ek-consent__legend">{{ $t('mcp.consent.permissions') }}</legend>
            <p class="ek-consent__perm">
              <v-icon icon="mdi-check" size="small" aria-hidden="true" />
              <span>{{ $t('mcp.consent.readScope') }}</span>
            </p>
            <label v-if="showWrite" class="ek-consent__check" data-testid="mcp-consent-write">
              <input v-model="write" type="checkbox" :disabled="busy" />
              <span>{{ $t('mcp.consent.writeScope') }}</span>
            </label>
          </fieldset>

          <!-- 4. KVKK bilgilendirmesi (kullanıcı düzeyi; onay kutusu yok) -->
          <section class="ek-consent__notice" :aria-labelledby="noticeId">
            <h2 :id="noticeId" class="ek-consent__notice-title">{{ $t('mcp.consent.noticeTitle') }}</h2>
            <p class="ek-consent__notice-text">{{ req.notice.text }}</p>
            <p class="ek-consent__notice-text">{{ $t('mcp.consent.masked') }}</p>
          </section>

          <EkAlert v-if="decisionErrorKey" tone="error" dense live data-testid="mcp-consent-error">
            <span>{{ $t('mcp.consent.decisionError') }} {{ $t(decisionErrorKey) }}</span>
            <span v-if="decisionRequestId" class="ek-consent__support">{{ $t('mcp.common.supportCode', { code: decisionRequestId }) }}</span>
          </EkAlert>

          <p v-if="!noEligible && tid === null" :id="selectHintId" class="ek-consent__hint">{{ $t('mcp.consent.selectStoreFirst') }}</p>

          <div class="ek-consent__actions">
            <EkButton tone="secondary" :disabled="busy" :loading="busy && pending === 'deny'" data-testid="mcp-consent-deny" @click="decide(false)">
              {{ $t('mcp.consent.deny') }}
            </EkButton>
            <EkButton
              v-if="!noEligible"
              tone="primary"
              type="submit"
              :disabled="busy || tid === null"
              :loading="busy && pending === 'allow'"
              :aria-describedby="tid === null ? selectHintId : undefined"
              data-testid="mcp-consent-allow"
            >
              {{ $t('mcp.consent.allow') }}
            </EkButton>
          </div>
        </form>
      </div>
    </AuthShell>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkButton, EkSkeleton, EkStatusChip } from '@entegrasyonik/ui/components'
import AuthShell from '@/components/login/AuthShell.vue'
import AuthResultBlock from '@/components/user/team/AuthResultBlock.vue'
import { useMcpApi } from '@/composables/useMcpApi'
import {
  consentDecisionBody,
  consentPhase,
  initialTenant,
  isTenantEligible,
  mcpErrorKey,
  needsLogin,
  noEligibleTenant,
  roleLabelKey,
  writeOptionVisible,
  type ConsentPhase,
} from '@/components/mcp/mcpModel'
import type { ConsentRequest } from '@/types/McpTypes'

const route = useRoute()
const router = useRouter()
const api = useMcpApi()
const uid = useId()
const storeHintId = `ek-consent-store-${uid}`
const noticeId = `ek-consent-notice-${uid}`
const selectHintId = `ek-consent-select-${uid}`

const phase = ref<ConsentPhase | 'redirecting'>('loading')
const req = ref<ConsentRequest | null>(null)
const tid = ref<number | null>(null)
const write = ref(false)
const busy = ref(false)
const pending = ref<'allow' | 'deny' | null>(null)
const decisionErrorKey = ref('')
const decisionRequestId = ref('')
const loadRequestId = ref('')
const headingRef = ref<HTMLElement | null>(null)
let expiryTimer: ReturnType<typeof setTimeout> | null = null

const requestId = computed(() => (typeof route.query.req === 'string' ? route.query.req : ''))
const noEligible = computed(() => (req.value ? noEligibleTenant(req.value) : false))
const showWrite = computed(() => (req.value ? writeOptionVisible(req.value, tid.value) : false))

// Mağaza değişince yazma kutusu sıfırlanır: başka mağazada verilmiş "işaretli" niyet taşınmaz (varsayılan işaretsiz).
watch(tid, () => {
  write.value = false
})

function goLogin() {
  router.push({ path: '/login', query: { redirect: route.fullPath } })
}

function toApp() {
  router.push('/')
}

function armExpiry(expiresAt: string) {
  if (expiryTimer) clearTimeout(expiryTimer)
  const ms = Date.parse(expiresAt) - Date.now()
  if (!Number.isFinite(ms)) return
  // setTimeout üst sınırı (~24,8 gün) aşılmaz; istek ömrü 10 dk.
  expiryTimer = setTimeout(() => {
    if (phase.value === 'ready' && !busy.value) phase.value = 'expired'
  }, Math.min(Math.max(ms, 0), 2_000_000_000))
}

async function load() {
  phase.value = 'loading'
  loadRequestId.value = ''
  if (!requestId.value) {
    phase.value = 'expired'
    return
  }
  const res = await api.getConsentRequest(requestId.value)
  const next = consentPhase(res)
  if (next === 'login') return goLogin()
  if (res.ok) {
    req.value = res.data
    tid.value = initialTenant(res.data)
    write.value = false
    if (next === 'ready') armExpiry(res.data.expiresAt)
  } else {
    loadRequestId.value = res.failure.requestId ?? ''
  }
  phase.value = next
  if (next === 'ready') {
    await nextTick()
    headingRef.value?.focus()
  }
}

async function decide(approve: boolean) {
  if (busy.value || !req.value) return
  if (approve && (noEligible.value || tid.value === null)) return
  busy.value = true
  pending.value = approve ? 'allow' : 'deny'
  decisionErrorKey.value = ''
  decisionRequestId.value = ''
  const res = await api.decideConsent(req.value.id, consentDecisionBody(approve, req.value, tid.value, write.value))
  if (res.ok && typeof res.data?.redirectTo === 'string' && res.data.redirectTo) {
    phase.value = 'redirecting'
    // Yönlendirme adresi YALNIZ backend'den (sözleşme §2): önyüz URL kurmaz/değiştirmez.
    window.location.assign(res.data.redirectTo)
    return
  }
  busy.value = false
  pending.value = null
  if (!res.ok) {
    const f = res.failure
    if (needsLogin(f)) return goLogin()
    if (f.code === 'IMPERSONATION_FORBIDDEN') {
      phase.value = 'impersonation'
      return
    }
    if (f.status === 404 || f.code === 'NOT_FOUND') {
      phase.value = 'expired'
      return
    }
    decisionErrorKey.value = mcpErrorKey(f.code)
    decisionRequestId.value = f.requestId ?? ''
    return
  }
  decisionErrorKey.value = mcpErrorKey(null)
}

onMounted(load)
onBeforeUnmount(() => {
  if (expiryTimer) clearTimeout(expiryTimer)
})
</script>

<style scoped>
.ek-consent {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
.ek-consent__eyebrow {
  margin: 0;
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}
.ek-consent__form {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
.ek-consent__title {
  margin: 0;
  font-size: var(--ek-font-size-xl);
  font-weight: var(--ek-font-weight-semibold);
  line-height: var(--ek-line-height-tight);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}
/* Programatik odak (tabindex=-1, etkileşimsiz başlık): halka çizilmez — ekran okuyucu başlığı okur, Tab sonraki öğeye gider. */
.ek-consent__title:focus {
  outline: none;
}
.ek-consent__app {
  font-weight: var(--ek-font-weight-bold);
}
.ek-consent__known {
  align-self: flex-start;
}
.ek-consent__redirect {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}
.ek-consent__host {
  font-family: var(--ek-font-mono);
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}
.ek-consent__group {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
}
.ek-consent__legend {
  padding: 0;
  margin-bottom: var(--ek-space-1);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}
.ek-consent__hint {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}
.ek-consent__tenants {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}
.ek-consent__tenant {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}
.ek-consent__tenant.is-static {
  cursor: default;
}
.ek-consent__tenant.is-selected {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}
.ek-consent__tenant.is-disabled {
  cursor: not-allowed;
  background: var(--ek-color-surface-muted);
}
.ek-consent__tenant input,
.ek-consent__check input {
  flex: none;
  width: 18px;
  height: 18px;
  margin: 1px 0 0;
  accent-color: var(--ek-color-action);
}
.ek-consent__tenant input:focus-visible,
.ek-consent__check input:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}
.ek-consent__tenant-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ek-consent__tenant-name {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}
.ek-consent__tenant-role {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}
.ek-consent__tenant-off {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}
.ek-consent__link {
  color: var(--ek-color-action);
  font-weight: var(--ek-font-weight-medium);
  white-space: nowrap;
}
.ek-consent__link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
  border-radius: var(--ek-radius-control);
}
.ek-consent__perm {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-default);
}
.ek-consent__perm .v-icon {
  color: var(--ek-color-success-emphasis);
  margin-top: 2px;
}
.ek-consent__check {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-default);
  cursor: pointer;
}
.ek-consent__notice {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}
.ek-consent__notice-title {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}
.ek-consent__notice-text {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  line-height: var(--ek-line-height-normal);
  color: var(--ek-color-content-default);
  white-space: pre-line;
}
.ek-consent__support {
  display: block;
  margin: 0;
  font-size: var(--ek-font-size-xs);
  font-family: var(--ek-font-mono);
  color: var(--ek-color-content-muted);
}
.ek-consent__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  flex-wrap: wrap;
}
.ek-consent__redirecting {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-default);
}
</style>
