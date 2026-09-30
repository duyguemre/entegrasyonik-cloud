<!--
  frontend/src/views/secure/user/ConnectedAppsView.vue

  MCP-6 S3 — "Bağlı uygulamalar" (MCP_UI_CONTRACT §5, ADR-0035 Karar 2 "Bağlantı = refresh ailesi"). Rota
  `/account/connected-apps` (hesap bölümü; AccountSecurityView yanında). `EkSettingsTemplate` (960px okuma genişliği;
  `EkPageHeader`'ı şablon kendi içinde çizer — doğrudan kullanılmaz, AccountSecurityView emsali).

  Bölümler:
    1. "Nasıl bağlanırım?" — genişleyen bölüm (3 adım + `serverUrl` kopyala; `GET /api/mcp/settings` herkes okur).
       Tenant `access==='off'` → adımlar yerine uyarı + (sahipse) S4 bağlantısı.
    2. Bekleyen onaylar (varsa) — `GET /api/mcp/approvals?status=pending` → S2'ye bağlantı.
    3. Bağlantılarım (`scope=me`) + yalnız `users:manage` (sahip/yönetici) için "Mağazadaki tüm bağlantılar"
       sekmesi (`scope=tenant`, ek sütun kullanıcı) ve "Tümünü kes" (normal onay diyaloğu, sayı gösterilir).
  Kes: `EkConfirmDialog` → DELETE → İYİMSER DEĞİL: yanıt sonrası listeden düşer + bildirim (toast).
  Rol görünürlüğü yalnız ipucu (mcpModel.mcpVisibility); asıl sınır backend `can()`.
-->
<template>
  <div class="connectedAppsView">
    <EkSettingsTemplate :section="$t('mcp.connections.section')" :title="$t('mcp.connections.title')" :description="$t('mcp.connections.description')">
      <!-- 1. Nasıl bağlanırım? -->
      <section class="ek-apps-guide" :aria-labelledby="guideHeadingId">
        <h2 :id="guideHeadingId" class="ek-apps-guide__heading">
          <button
            ref="guideToggleRef"
            type="button"
            class="ek-apps-guide__toggle"
            :aria-expanded="guideOpen ? 'true' : 'false'"
            :aria-controls="guideBodyId"
            data-testid="mcp-guide-toggle"
            @click="guideOpen = !guideOpen"
          >
            <v-icon icon="mdi-help-circle-outline" size="small" aria-hidden="true" />
            <span>{{ $t('mcp.connections.guideToggle') }}</span>
            <v-icon class="ek-apps-guide__chevron" :class="{ 'is-open': guideOpen }" icon="mdi-chevron-down" size="small" aria-hidden="true" />
          </button>
        </h2>
        <EkCollapse :open="guideOpen">
          <div :id="guideBodyId" class="ek-apps-guide__body">
            <EkSkeleton v-if="settingsState === 'loading'" type="detail" :rows="3" />
            <McpConnectGuide
              v-else
              :server-url="settings?.serverUrl ?? null"
              :access="settings?.access ?? null"
              :can-open-settings="visibility.settingsLink"
              @open-settings="openSettings"
            />
          </div>
        </EkCollapse>
      </section>

      <!-- 2. Bekleyen onaylar -->
      <section v-if="pending.length" class="ek-apps-block" :aria-labelledby="pendingHeadingId" data-testid="mcp-pending">
        <header class="ek-apps-block__intro">
          <h2 :id="pendingHeadingId" class="ek-apps-block__title">{{ $t('mcp.connections.pendingTitle') }}</h2>
          <p class="ek-apps-block__desc">{{ $t('mcp.connections.pendingDescription') }}</p>
        </header>
        <ul class="ek-apps-pending">
          <li v-for="p in pending" :key="p.id" class="ek-apps-pending__item">
            <EkIconTile icon="mdi-shield-check-outline" tone="action" size="sm" />
            <div class="ek-apps-pending__text">
              <span class="ek-apps-pending__title">{{ p.preview.title }}</span>
              <span class="ek-apps-pending__meta">
                {{ p.client.name }} · {{ $t('mcp.connections.pendingExpires', { time: formatCountdown(remainingSeconds(p.expiresAt, now)) }) }}
              </span>
            </div>
            <router-link v-slot="{ navigate }" :to="`/approve/${encodeURIComponent(p.id)}`" custom>
              <EkButton tone="secondary" size="sm" trailing-icon="mdi-arrow-right" :aria-label="`${$t('mcp.connections.pendingOpen')}: ${p.preview.title}`" @click="navigate">
                {{ $t('mcp.connections.pendingOpen') }}
              </EkButton>
            </router-link>
          </li>
        </ul>
      </section>

      <!-- 3. Bağlantılar -->
      <section ref="listRef" class="ek-apps-block" :aria-labelledby="listHeadingId" tabindex="-1">
        <header class="ek-apps-block__bar">
          <h2 :id="listHeadingId" class="ek-sr-only">{{ $t('mcp.connections.tabsLabel') }}</h2>
          <EkPageTabs v-if="visibility.tenantTab" v-model="tab" :tabs="tabs" :label="$t('mcp.connections.tabsLabel')" data-testid="mcp-tabs" />
          <h2 v-else class="ek-apps-block__title" aria-hidden="true">{{ $t('mcp.connections.tabMine') }}</h2>
          <EkButton
            v-if="tab === 'tenant' && visibility.revokeAll && listState === 'ready' && items.length > 0"
            tone="danger"
            size="sm"
            icon="mdi-link-variant-off"
            data-testid="mcp-revoke-all"
            @click="askRevokeAll"
          >
            {{ $t('mcp.connections.revokeAll') }}
          </EkButton>
        </header>

        <EkSkeleton v-if="listState === 'loading'" type="table" :rows="3" />
        <EkProblemState
          v-else-if="listState === 'error'"
          :title="$t('mcp.connections.loadErrorTitle')"
          :cause="$t('mcp.connections.loadErrorCause')"
          :action="$t('mcp.connections.loadErrorAction')"
          :details="listRequestId ? [{ label: 'requestId', value: listRequestId }] : undefined"
          @retry="loadList"
        />
        <EkEmptyState
          v-else-if="items.length === 0"
          variant="first-run"
          :title="tab === 'tenant' ? $t('mcp.connections.emptyTenantTitle') : $t('mcp.connections.emptyTitle')"
          :message="tab === 'tenant' ? $t('mcp.connections.emptyTenantText') : $t('mcp.connections.emptyText')"
          :show-action="tab === 'me'"
          :action-text="$t('mcp.connections.emptyAction')"
          action-icon="mdi-help-circle-outline"
          data-testid="mcp-empty"
          @action="openGuide"
        />
        <EkDataTable v-else :items="rows" :columns="columns" data-testid="mcp-connections">
          <template #cell-app="{ item }">
            <span class="ek-apps-app">
              <span class="ek-apps-app__name">
                <span>{{ item.conn.clientName }}</span>
                <span v-if="item.conn.known" class="ek-apps-app__known" role="img" :aria-label="$t('mcp.consent.known')" :title="$t('mcp.consent.known')" data-testid="mcp-known">
                  <v-icon icon="mdi-check-decagram" size="16" aria-hidden="true" />
                </span>
              </span>
              <span class="ek-apps-app__host">{{ item.conn.redirectHost }}</span>
            </span>
          </template>
          <template #cell-user="{ item }">{{ item.conn.user?.email ?? '—' }}</template>
          <template #cell-scopes="{ item }">
            <span class="ek-apps-chips">
              <EkStatusChip v-for="c in scopeChips(item.conn.scopes)" :key="c.key" :tone="c.tone" :label="$t(c.key)" />
            </span>
          </template>
          <template #cell-lastUsed="{ item }">
            <span :title="item.conn.lastUsedAt ? formatDateTime(item.conn.lastUsedAt) : undefined">
              {{ item.conn.lastUsedAt ? formatRelative(item.conn.lastUsedAt) : $t('mcp.common.never') }}
            </span>
          </template>
          <template #cell-actions="{ item }">
            <EkRowActions
              :label="$t('mcp.connections.revokeFor', { app: item.conn.clientName })"
              :items="[{ key: 'revoke', action: 'cancel', icon: 'mdi-link-variant-off', label: $t('mcp.connections.revokeFor', { app: item.conn.clientName }), onClick: () => askRevoke(item.conn) }]"
            />
          </template>
        </EkDataTable>
      </section>
    </EkSettingsTemplate>

    <EkConfirmDialog
      v-model="revokeOpen"
      :title="$t('mcp.connections.revokeTitle')"
      :description="revokeTarget ? $t('mcp.connections.revokeText', { app: revokeTarget.clientName }) : ''"
      :confirm-label="$t('mcp.connections.revoke')"
      danger
      icon="mdi-link-variant-off"
      :loading="revoking"
      @confirm="confirmRevoke"
      @cancel="revokeOpen = false"
    >
      <EkAlert v-if="revokeErrorKey" tone="error" dense live :text="`${$t('mcp.connections.revokeError')} ${$t(revokeErrorKey)}`" />
    </EkConfirmDialog>

    <EkConfirmDialog
      v-model="revokeAllOpen"
      :title="$t('mcp.connections.revokeAllTitle')"
      :description="$t('mcp.connections.revokeAllText', { count: formatNumber(items.length) })"
      :confirm-label="$t('mcp.connections.revokeAll')"
      danger
      icon="mdi-link-variant-off"
      :loading="revoking"
      @confirm="confirmRevokeAll"
      @cancel="revokeAllOpen = false"
    >
      <EkAlert v-if="revokeErrorKey" tone="error" dense live :text="`${$t('mcp.connections.revokeError')} ${$t(revokeErrorKey)}`" />
    </EkConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  EkAlert,
  EkButton,
  EkCollapse,
  EkConfirmDialog,
  EkDataTable,
  EkEmptyState,
  EkIconTile,
  EkPageTabs,
  EkProblemState,
  EkRowActions,
  EkSkeleton,
  EkStatusChip,
  type EkPageTab,
  type EkTableColumn,
} from '@entegrasyonik/ui/components'
import { formatDateTime, formatNumber, formatRelative } from '@entegrasyonik/ui/format'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import EkSettingsTemplate from '@/components/page/templates/EkSettingsTemplate.vue'
import McpConnectGuide from '@/components/mcp/McpConnectGuide.vue'
import useUser from '@/composables/user'
import { useMcpApi } from '@/composables/useMcpApi'
import { formatCountdown, mcpErrorKey, mcpVisibility, remainingSeconds, scopeChips } from '@/components/mcp/mcpModel'
import type { ApprovalView, McpConnection, McpConnectionScope, McpSettings } from '@/types/McpTypes'

const { t } = useI18n()
const router = useRouter()
const api = useMcpApi()
const userApi = useUser()
const { showToast } = useToast()
const uid = useId()
const guideHeadingId = `ek-apps-guide-${uid}`
const guideBodyId = `ek-apps-guide-body-${uid}`
const pendingHeadingId = `ek-apps-pending-${uid}`
const listHeadingId = `ek-apps-list-${uid}`

type LoadState = 'loading' | 'ready' | 'error'

const visibility = computed(() =>
  mcpVisibility({ owner: userApi.isOwner() === true, roleCode: userApi.isTenantAdmin() ? 'ROLE_ADMIN' : undefined }),
)

const settings = ref<McpSettings | null>(null)
const settingsState = ref<LoadState>('loading')
const pending = ref<ApprovalView[]>([])
const tab = ref<McpConnectionScope>('me')
const items = ref<McpConnection[]>([])
const listState = ref<LoadState>('loading')
const listRequestId = ref('')
const guideOpen = ref(false)
const guideToggleRef = ref<HTMLButtonElement | null>(null)

const revokeOpen = ref(false)
const revokeAllOpen = ref(false)
const revokeTarget = ref<McpConnection | null>(null)
const revoking = ref(false)
const revokeErrorKey = ref('')

const listRef = ref<HTMLElement | null>(null)
/** Diyalog kapanınca odak açan öğeye döner (§8 "diyalog odak tuzağı ve dönüşü"); öğe listeden düştüyse liste bölümüne. */
let returnFocusTo: HTMLElement | null = null

function rememberFocus() {
  returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
}

function restoreFocus() {
  const target = returnFocusTo && returnFocusTo.isConnected ? returnFocusTo : listRef.value
  returnFocusTo = null
  // Vuetify katmanı kapanış geçişinde odağı bir kare daha tutar; sonraki karede geri ver.
  requestAnimationFrame(() => requestAnimationFrame(() => target?.focus()))
}

watch([revokeOpen, revokeAllOpen], ([a, b], [pa, pb]) => {
  if ((pa && !a) || (pb && !b)) nextTick(restoreFocus)
})

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

const tabs = computed<EkPageTab[]>(() => [
  { value: 'me', label: t('mcp.connections.tabMine') },
  { value: 'tenant', label: t('mcp.connections.tabTenant') },
])

const columns = computed<EkTableColumn[]>(() => [
  { key: 'app', label: t('mcp.connections.colApp') },
  ...(tab.value === 'tenant' ? [{ key: 'user', label: t('mcp.connections.colUser') }] : []),
  { key: 'store', label: t('mcp.connections.colStore') },
  { key: 'scopes', label: t('mcp.connections.colScopes') },
  { key: 'created', label: t('mcp.connections.colCreated'), type: 'date' as const },
  { key: 'lastUsed', label: t('mcp.connections.colLastUsed') },
  { key: 'expires', label: t('mcp.connections.colExpires'), type: 'date' as const },
  { key: 'actions', label: t('mcp.connections.colActions'), type: 'actions' as const },
])

const rows = computed(() =>
  items.value.map((conn) => ({
    id: conn.id,
    conn,
    store: conn.tenant.name,
    created: conn.createdAt,
    expires: conn.expiresAt,
  })),
)

async function loadSettings() {
  settingsState.value = 'loading'
  const res = await api.getSettings()
  if (res.ok) {
    settings.value = res.data
    settingsState.value = 'ready'
  } else {
    settings.value = null
    settingsState.value = 'error'
  }
}

async function loadPending() {
  const res = await api.listPendingApprovals()
  pending.value = res.ok && Array.isArray(res.data?.items) ? res.data.items.filter((a) => a.status === 'pending') : []
}

async function loadList() {
  listState.value = 'loading'
  listRequestId.value = ''
  const scope = tab.value === 'tenant' && visibility.value.tenantTab ? 'tenant' : 'me'
  const res = await api.listConnections(scope)
  if (res.ok && Array.isArray(res.data?.items)) {
    items.value = res.data.items
    listState.value = 'ready'
  } else {
    items.value = []
    listRequestId.value = res.ok ? '' : res.failure.requestId ?? ''
    listState.value = 'error'
  }
}

watch(tab, () => loadList())

async function openGuide() {
  guideOpen.value = true
  await nextTick()
  guideToggleRef.value?.focus()
  guideToggleRef.value?.scrollIntoView({ block: 'nearest' })
}

function openSettings() {
  router.push('/settings/ai-connection')
}

function askRevoke(conn: McpConnection) {
  rememberFocus()
  revokeTarget.value = conn
  revokeErrorKey.value = ''
  revokeOpen.value = true
}

function askRevokeAll() {
  rememberFocus()
  revokeErrorKey.value = ''
  revokeAllOpen.value = true
}

async function confirmRevoke() {
  const target = revokeTarget.value
  if (!target || revoking.value) return
  revoking.value = true
  revokeErrorKey.value = ''
  const res = await api.revokeConnection(target.id)
  revoking.value = false
  if (!res.ok) {
    revokeErrorKey.value = mcpErrorKey(res.failure.code)
    return
  }
  // İyimser değil: yanıt geldikten SONRA listeden düşer.
  items.value = items.value.filter((c) => c.id !== target.id)
  revokeOpen.value = false
  showToast({ tone: 'success', message: t('mcp.connections.revoked', { app: target.clientName }) })
}

async function confirmRevokeAll() {
  if (revoking.value) return
  revoking.value = true
  revokeErrorKey.value = ''
  const res = await api.revokeAllConnections()
  revoking.value = false
  if (!res.ok) {
    revokeErrorKey.value = mcpErrorKey(res.failure.code)
    return
  }
  revokeAllOpen.value = false
  showToast({ tone: 'success', message: t('mcp.connections.revokedAll', { count: formatNumber(res.data?.revoked ?? 0) }) })
  await loadList()
}

onMounted(() => {
  loadSettings()
  loadPending()
  loadList()
  ticker = setInterval(() => (now.value = Date.now()), 15_000)
})
onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})
</script>

<style scoped>
.ek-apps-guide {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}
.ek-apps-guide__heading {
  margin: 0;
  font-size: inherit;
}
.ek-apps-guide__toggle {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 0;
  border-radius: var(--ek-radius-card);
  background: transparent;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  text-align: start;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}
.ek-apps-guide__toggle:hover {
  background: var(--ek-color-surface-muted);
}
.ek-apps-guide__toggle:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}
.ek-apps-guide__chevron {
  margin-inline-start: auto;
  transition: transform var(--ek-duration-fast) var(--ek-easing-standard);
}
.ek-apps-guide__chevron.is-open {
  transform: rotate(180deg);
}
.ek-apps-guide__body {
  padding: var(--ek-space-2) var(--ek-space-4) var(--ek-space-4);
}
.ek-apps-block:focus {
  outline: none;
}
.ek-apps-block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}
.ek-apps-block__intro {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}
.ek-apps-block__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}
.ek-apps-block__title {
  margin: 0;
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}
.ek-apps-block__desc {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}
.ek-apps-pending {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}
.ek-apps-pending__item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
}
.ek-apps-pending__item + .ek-apps-pending__item {
  border-top: 1px solid var(--ek-color-border-subtle);
}
.ek-apps-pending__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}
.ek-apps-pending__title {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}
.ek-apps-pending__meta {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}
.ek-apps-app {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ek-apps-app__name {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}
.ek-apps-app__known {
  display: inline-flex;
  color: var(--ek-color-success-emphasis);
}
.ek-apps-app__host {
  font-family: var(--ek-font-mono);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  overflow-wrap: anywhere;
}
.ek-apps-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}
@media (max-width: 599px) {
  .ek-apps-pending__item {
    flex-wrap: wrap;
  }
}
</style>
