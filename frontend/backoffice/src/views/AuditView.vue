<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="summary.updatedAt.value" :stale="summary.stale.value">
      <template #actions>
        <BoAction kind="refresh" :loading="summary.refreshing.value" data-page-refresh @click="refresh" />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <BoFilterBar label="Denetim süzgeçleri" :active="activeCount" @clear="clearFilters">
      <BoSegmented v-model="surfaceKey" :options="SURFACES" label="Yüzey" />
      <v-select v-model="event" :items="eventItems" label="Olay" density="compact" hide-details clearable />
      <v-select v-model="result" :items="RESULTS" label="Sonuç" density="compact" hide-details clearable />
      <v-text-field
        v-model="tid"
        label="Müşteri no"
        density="compact"
        hide-details="auto"
        clearable
        inputmode="numeric"
        autocomplete="off"
        spellcheck="false"
        :error-messages="tidError"
        :aria-invalid="tidError ? 'true' : undefined"
        @update:model-value="debounced"
      />
      <v-select v-model="range" :items="RANGES" label="Aralık" density="compact" hide-details />
    </BoFilterBar>
    <p v-if="reqId" class="bo-audit__req-filter">
      <v-icon icon="mdi-transit-connection-horizontal" aria-hidden="true" />
      İstek kimliğine göre süzülüyor: <code class="bo-mono">{{ reqId }}</code><EkCopyButton :value="reqId" label="İstek kimliği" />
      <button type="button" class="bo-audit__req-clear" aria-label="İstek kimliği süzgecini kaldır" @click="reqId = ''">Kaldır</button>
    </p>

    <BoSection title="Denetim kayıtları" description="Kim, neyi, ne zaman değiştirdi. Kayıtlar değiştirilemez ve 365 gün saklanır." icon="mdi-shield-search" flush>
      <div v-if="state !== 'ready'" class="bo-audit__panel">
        <BoPanelState
          :state="state"
          skeleton="table"
          :rows="8"
          :error="error"
          error-text="Denetim kayıtları yüklenemedi"
          empty-icon="mdi-shield-search"
          empty-title="Bu süzgeçlerle kayıt yok"
          empty-text="Aralığı genişletin ya da filtreleri temizleyin. Kayıtlar 365 gün saklanır."
          @retry="load()"
        />
      </div>
      <BoTableFrame v-else label="Denetim kayıtları" flat>
        <template #head>
          <tr>
            <th scope="col"><span class="ek-sr-only">Ayrıntı</span></th>
            <th scope="col">Zaman</th>
            <th scope="col">Olay</th>
            <th scope="col" class="bo-hide-sm">Aktör</th>
            <th scope="col" class="bo-hide-sm">Hedef</th>
            <th scope="col">Sonuç</th>
            <th scope="col" class="bo-hide-sm">İstek</th>
          </tr>
        </template>
        <template v-for="a in items" :key="a.id">
          <tr class="bo-audit__row" :class="{ 'is-open': open.has(a.id) }">
            <td class="bo-audit__tog">
              <button type="button" class="bo-audit__toggle" :aria-expanded="open.has(a.id)" :aria-controls="`aud-${a.id}`" :aria-label="`Ayrıntı: ${a.event}`" @click="toggle(a.id)">
                <v-icon :icon="open.has(a.id) ? 'mdi-chevron-down' : 'mdi-chevron-right'" aria-hidden="true" />
              </button>
            </td>
            <td class="ek-num bo-audit__time">{{ formatDateTime(a.at) }}<span><EkRelativeTime :value="a.at" /></span></td>
            <td>
              <code class="bo-audit__event">{{ a.event }}</code>
              <span class="bo-audit__op">{{ a.meta?.op }}</span>
            </td>
            <td class="bo-audit__actor bo-hide-sm">
              <span class="bo-mono">{{ a.sub ?? '—' }}</span>
              <span>
                {{ a.actorType ? ACTOR[a.actorType] : 'Kimliksiz istek' }}<template v-if="a.imp"> · <strong class="bo-audit__imp">geçici erişimde</strong></template>
              </span>
            </td>
            <td class="ek-num bo-hide-sm">
              <RouterLink v-if="a.tid ?? a.onBehalfOf" :to="`/musteriler/${a.tid ?? a.onBehalfOf}`" class="bo-audit__tenant">#{{ a.tid ?? a.onBehalfOf }}</RouterLink>
              <span v-else class="bo-muted">platform</span>
            </td>
            <td><EkStatusChip :tone="RESULT[a.result].tone" :label="RESULT[a.result].label" dot /></td>
            <td class="bo-audit__req-cell bo-hide-sm">
              <template v-if="a.reqId">
                <button type="button" class="bo-audit__req bo-mono" :aria-label="`İstek zincirini aç: ${a.reqId}`" @click="traceId = a.reqId">{{ a.reqId.slice(4, 12) }}</button><EkCopyButton :value="a.reqId" label="İstek kimliği" />
              </template>
            </td>
          </tr>
          <tr v-if="open.has(a.id)" :id="`aud-${a.id}`" class="bo-audit__detail">
            <td class="bo-audit__tog"></td>
            <td colspan="6">
              <p v-if="a.meta?.reason" class="bo-audit__reason"><v-icon icon="mdi-format-quote-open" aria-hidden="true" />{{ a.meta.reason }}</p>
              <table v-if="changes(a).length" class="bo-diff">
                <caption class="ek-sr-only">Önce / sonra</caption>
                <thead><tr><th scope="col">Alan</th><th scope="col">Önce</th><th scope="col" aria-hidden="true"></th><th scope="col">Sonra</th></tr></thead>
                <tbody>
                  <tr v-for="c in changes(a)" :key="c.field">
                    <th scope="row" class="bo-mono">{{ c.field }}</th>
                    <td><span v-if="c.before !== undefined" class="bo-diff__before bo-mono">{{ c.before }}</span><span v-else class="bo-muted">—</span></td>
                    <td class="bo-diff__arrow" aria-hidden="true"><v-icon icon="mdi-arrow-right" /></td>
                    <td><span v-if="c.after !== undefined" class="bo-diff__after bo-mono">{{ c.after }}</span><span v-else class="bo-muted">—</span></td>
                  </tr>
                </tbody>
              </table>
              <dl class="bo-audit__facts">
                <div><dt>Aktör</dt><dd><span class="bo-mono">{{ a.sub ?? '—' }}</span> · {{ a.actorType ? ACTOR[a.actorType] : 'Kimliksiz istek' }}</dd></div>
                <div>
                  <dt>Hedef</dt>
                  <dd>
                    <RouterLink v-if="a.tid ?? a.onBehalfOf" :to="`/musteriler/${a.tid ?? a.onBehalfOf}`" class="bo-audit__tenant">Müşteri #{{ a.tid ?? a.onBehalfOf }}</RouterLink>
                    <template v-else>platform</template>
                  </dd>
                </div>
                <div><dt>Yüzey</dt><dd>{{ a.surface ?? '—' }}</dd></div>
                <div><dt>IP</dt><dd class="bo-mono">{{ a.ip ?? '—' }}</dd></div>
                <div><dt>Kayıt</dt><dd class="bo-mono">{{ a.id }}</dd></div>
                <div v-if="a.reqId">
                  <dt>İstek kimliği</dt>
                  <dd class="bo-mono">{{ a.reqId }}<EkCopyButton :value="a.reqId" label="İstek kimliği" /><BoAction kind="detail" label="İzi aç" size="sm" @click="traceId = a.reqId ?? null" /></dd>
                </div>
              </dl>
            </td>
          </tr>
        </template>
      </BoTableFrame>
      <template v-if="state === 'ready'" #footer>
        <BoPagination :count="items?.length ?? 0" :has-more="!!cursor" :loading="loadingMore" :error="moreError" @more="load(true)" />
      </template>
    </BoSection>
    <TraceDialog :req-id="traceId" @close="traceId = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkCopyButton, EkRelativeTime, EkStatusChip, type StatusTone } from '@entegrasyonik/ui/components'
import BoPanelState, { type PanelState } from '@bo/components/shell/BoPanelState.vue'
import TraceDialog from '@bo/components/TraceDialog.vue'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoFilterBar from '@bo/components/r2/BoFilterBar.vue'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoSegmented from '@bo/components/r2/BoSegmented.vue'
import BoTableFrame from '@bo/components/r2/BoTableFrame.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { useVerdictSources } from '@bo/composables/useVerdictSources'
import { auditVerdict } from './auditVerdict'
import { api } from '@bo/api'
import type { AuditRecord, LogRange } from '@bo/api/contract'
import { formatDateTime } from '@bo/utils/format'
import { auditChanges } from '@bo/utils/audit'

const SURFACES = [
  { value: 'all', label: 'Tümü' },
  { value: 'backoffice', label: 'Yönetim' },
  { value: 'app', label: 'Müşteri uygulaması' },
]
const EVENTS = ['backoffice.write', 'backoffice.sensitive_read', 'backoffice.reauth', 'app.write', 'impersonation', 'login', 'user.password_change']
const RESULTS = [
  { value: 'ok', title: 'Başarılı' },
  { value: 'fail', title: 'Reddedildi' },
  { value: 'error', title: 'Hata' },
]
const RANGES = [
  { value: '24h', title: 'Son 24 saat' },
  { value: '7d', title: 'Son 7 gün' },
]
const RESULT: Record<AuditRecord['result'], { label: string; tone: StatusTone }> = {
  ok: { label: 'Başarılı', tone: 'success' },
  fail: { label: 'Reddedildi', tone: 'warning' },
  error: { label: 'Hata', tone: 'danger' },
}
const ACTOR = { user: 'Müşteri kullanıcısı', platform: 'Platform yöneticisi', system: 'Sistem' } as const

// Süzgeçler URL'den başlar ve URL'e yazılır: denetim bağlantıları (toast "Denetim kaydını aç", komut paleti, genel bakış)
// ve paylaşılan adresler aynı görünümü açar. Okunan: surface, event, result, tid, reqId, range.
const route = useRoute()
const router = useRouter()
const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
const surface = ref<'backoffice' | 'app' | undefined>(q('surface') === 'backoffice' || q('surface') === 'app' ? (q('surface') as 'backoffice' | 'app') : undefined)
const event = ref<string | null>(q('event') || null)
const result = ref<AuditRecord['result'] | null>(['ok', 'fail', 'error'].includes(q('result')) ? (q('result') as AuditRecord['result']) : null)
const tid = ref(q('tid'))
const reqId = ref(q('reqId'))
const range = ref<LogRange>(q('range') === '24h' ? '24h' : '7d')
const items = ref<AuditRecord[] | null>(null)
const error = ref<unknown>(null)
const eventItems = computed(() => (event.value && !EVENTS.includes(event.value) ? [event.value, ...EVENTS] : EVENTS))
// "Müşteri no" yalnız rakam: geçersiz girdi sessizce yok sayılmaz → satır içi hata, etkin süzgeç sayılmaz.
const tidValid = computed(() => /^\d+$/.test(tid.value ?? ''))
const tidError = computed(() => (tid.value && !tidValid.value ? 'Yalnız rakam girin.' : undefined))
const activeCount = computed(() => [surface.value, event.value, result.value, tidValid.value, reqId.value, range.value !== '7d'].filter(Boolean).length)
const surfaceKey = computed<string>({
  get: () => surface.value ?? 'all',
  set: (v) => (surface.value = v === 'backoffice' || v === 'app' ? v : undefined),
})
const state = computed<PanelState>(() => (items.value === null ? (error.value ? 'error' : 'loading') : items.value.length ? 'ready' : 'empty'))
const cursor = ref<string | undefined>()
const loadingMore = ref(false)
const moreError = ref<{ message: string } | null>(null)
const open = reactive(new Set<string>())
const traceId = ref<string | null>(null)

// Hüküm: süzgeçlerden bağımsız son 7 günlük özet okuma (son 24 saat + önceki günlerin tabanı).
const summary = useVerdictSources({
  recent: () => api.call('BackofficeAuditService/search', { range: '7d', limit: 200 }),
})
const verdict = computed(() =>
  summary.settled.value
    ? auditVerdict({
        records: summary.sources.recent.data.value?.items ?? null,
        truncated: !!summary.sources.recent.data.value?.nextCursor,
        failed: summary.failed('recent'),
        retry: () => summary.load(),
      })
    : null,
)

/** Hüküm bağlantıları göreli konumdur (`{ query }`): URL değişince süzgeçler uygulanır (kullanıcı yazarken URL'i beklemez). */
let lastSynced = ''
function applyQuery() {
  if (JSON.stringify(route.query) === lastSynced) return
  surface.value = q('surface') === 'backoffice' || q('surface') === 'app' ? (q('surface') as 'backoffice' | 'app') : undefined
  event.value = q('event') || null
  result.value = ['ok', 'fail', 'error'].includes(q('result')) ? (q('result') as AuditRecord['result']) : null
  range.value = q('range') === '24h' ? '24h' : '7d'
  tid.value = q('tid')
  reqId.value = q('reqId')
}
watch(() => route.query, applyQuery)

function refresh() {
  void summary.load()
  void load()
}

async function load(more = false) {
  if (!more) {
    items.value = null
    syncUrl()
  }
  error.value = null
  moreError.value = null
  loadingMore.value = more
  try {
    const res = await api.call('BackofficeAuditService/search', {
      range: range.value,
      surface: surface.value,
      event: event.value ?? undefined,
      result: result.value ?? undefined,
      tid: tidValid.value ? Number(tid.value) : undefined,
      reqId: reqId.value || undefined,
      cursor: more ? cursor.value : undefined,
      limit: 50,
    })
    items.value = more ? [...(items.value ?? []), ...res.items] : res.items
    cursor.value = res.nextCursor
  } catch (e) {
    if (more) moreError.value = { message: 'Sonraki kayıtlar yüklenemedi — "Daha fazla" ile yeniden deneyin.' }
    else {
      error.value = e
      items.value = null
    }
  } finally {
    loadingMore.value = false
  }
}

function syncUrl() {
  const query: Record<string, string> = {}
  if (surface.value) query.surface = surface.value
  if (event.value) query.event = event.value
  if (result.value) query.result = result.value
  if (tid.value) query.tid = tid.value
  if (reqId.value) query.reqId = reqId.value
  if (range.value !== '7d') query.range = range.value
  lastSynced = JSON.stringify(query)
  void router.replace({ query })
}

function clearFilters() {
  surface.value = undefined
  event.value = null
  result.value = null
  tid.value = ''
  reqId.value = ''
  range.value = '7d'
}

let timer: ReturnType<typeof setTimeout> | undefined
function debounced() {
  clearTimeout(timer)
  timer = setTimeout(() => load(), 300)
}

watch([surface, event, result, range, reqId], () => load())
watch(tid, (v) => {
  if (!v) void load()
})
onMounted(() => {
  void summary.load()
  void load()
})

function toggle(id: string) {
  if (open.has(id)) open.delete(id)
  else open.add(id)
}
const changes = (a: AuditRecord) => auditChanges(a.meta)
</script>

<style scoped>
.bo-audit__panel {
  padding: var(--ek-space-4);
}

.bo-audit__req-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.bo-audit__req-clear {
  margin-left: auto;
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: none;
  color: var(--ek-color-action-emphasis);
  font: inherit;
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
}

.bo-audit__req-clear:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-audit__req-cell,
.bo-audit__time,
.bo-audit__actor {
  white-space: nowrap;
}

.bo-audit__tog {
  width: 44px;
  padding-right: 0 !important;
}

.bo-audit__toggle:focus-visible,
.bo-audit__req:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 1px;
}

.bo-audit__row > td {
  vertical-align: top;
}

.bo-audit__row.is-open > td,
.bo-audit__detail > td {
  background: var(--ek-color-surface-muted);
}

.bo-audit__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-muted);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-audit__toggle:hover {
  background: var(--ek-color-surface-sunken);
}

.bo-audit__time span,
.bo-audit__actor span:last-child,
.bo-audit__op {
  display: block;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-audit__event {
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-audit__imp {
  color: var(--ek-color-warning-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-audit__tenant,
.bo-audit__req {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  text-decoration: none;
  cursor: pointer;
}

.bo-audit__tenant:hover,
.bo-audit__req:hover {
  text-decoration: underline;
}

.bo-audit__detail > td {
  height: auto !important;
  padding-bottom: var(--ek-space-4) !important;
  white-space: normal;
}

.bo-audit__reason {
  display: flex;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-3);
  color: var(--ek-color-content-strong);
  font-style: italic;
}

.bo-audit__reason :deep(.v-icon) {
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-sm);
}

.bo-diff {
  width: auto;
  max-width: 100%;
  margin-bottom: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  border-collapse: separate;
  border-spacing: 0;
  background: var(--ek-color-surface);
  font-size: var(--ek-type-label-size);
}

.bo-diff th,
.bo-diff td {
  height: auto !important;
  padding: var(--ek-space-2) var(--ek-space-3) !important;
  text-align: left;
  overflow-wrap: anywhere;
}

.bo-diff thead th {
  position: static;
  height: auto;
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
  letter-spacing: normal;
  text-transform: none;
}

.bo-diff tbody tr > * {
  border-top: 1px solid var(--ek-color-border-subtle);
  border-bottom: 0;
}

.bo-diff tbody th {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.bo-diff__before {
  padding: 1px 6px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}

.bo-diff__after {
  padding: 1px 6px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.bo-diff__arrow {
  color: var(--ek-color-content-subtle);
}

.bo-audit__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2) var(--ek-space-6);
  margin: 0;
  font-size: var(--ek-type-caption-size);
}

.bo-audit__facts dt {
  color: var(--ek-color-content-muted);
}

.bo-audit__facts dd {
  margin: 0;
  color: var(--ek-color-content-strong);
}
</style>
