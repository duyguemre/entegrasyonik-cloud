<template>
  <div class="bo-page">
    <div class="bo-page__head">
      <div>
        <h1 class="bo-page__title">Denetim kayıtları</h1>
        <p class="bo-page__lede">Müşteri uygulaması (app.*) ve yönetim (backoffice.*) yazmaları, hassas okumalar ve geçici erişimler. Kayıtlar değiştirilemez, 365 gün saklanır.</p>
      </div>
    </div>

    <div class="bo-audit__bar">
      <div class="bo-seg" role="radiogroup" aria-label="Yüzey">
        <button v-for="o in SURFACES" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="surface === o.value" @click="surface = o.value">{{ o.label }}</button>
      </div>
      <v-select v-model="event" :items="EVENTS" label="Olay" density="compact" hide-details clearable class="bo-audit__field" />
      <v-select v-model="result" :items="RESULTS" label="Sonuç" density="compact" hide-details clearable class="bo-audit__field bo-audit__field--sm" />
      <v-text-field v-model="tid" label="Müşteri no" density="compact" hide-details clearable inputmode="numeric" class="bo-audit__field bo-audit__field--sm" @update:model-value="debounced" />
      <v-select v-model="range" :items="RANGES" label="Aralık" density="compact" hide-details class="bo-audit__field bo-audit__field--sm" />
    </div>

    <EkSkeleton v-if="!items" type="table" :rows="8" />
    <EkEmptyState v-else-if="!items.length" variant="no-results" title="Kayıt yok" message="Filtreleri genişletin." />
    <div v-else class="bo-audit">
      <table>
        <caption class="ek-sr-only">Denetim kayıtları</caption>
        <thead>
          <tr>
            <th scope="col"><span class="ek-sr-only">Ayrıntı</span></th>
            <th scope="col">Zaman</th>
            <th scope="col">Olay</th>
            <th scope="col">Aktör</th>
            <th scope="col">Hedef</th>
            <th scope="col">Sonuç</th>
            <th scope="col">İstek</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="a in items" :key="a.id">
            <tr class="bo-audit__row" :class="{ 'is-open': open.has(a.id) }">
              <td>
                <button type="button" class="bo-audit__toggle" :aria-expanded="open.has(a.id)" :aria-controls="`aud-${a.id}`" :aria-label="`Ayrıntı: ${a.event}`" @click="toggle(a.id)">
                  <v-icon :icon="open.has(a.id) ? 'mdi-chevron-down' : 'mdi-chevron-right'" aria-hidden="true" />
                </button>
              </td>
              <td class="ek-num bo-audit__time">{{ formatDateTime(a.at) }}<span>{{ formatRelative(a.at) }}</span></td>
              <td>
                <code class="bo-audit__event">{{ a.event }}</code>
                <span class="bo-audit__op">{{ a.meta?.op }}</span>
              </td>
              <td class="bo-audit__actor">
                <span class="bo-mono">{{ a.sub ?? '—' }}</span>
                <span>
                  {{ a.actorType ? ACTOR[a.actorType] : 'Kimliksiz istek' }}<template v-if="a.imp"> · <strong class="bo-audit__imp">geçici erişimde</strong></template>
                </span>
              </td>
              <td class="ek-num">
                <RouterLink v-if="a.tid ?? a.onBehalfOf" :to="`/musteriler/${a.tid ?? a.onBehalfOf}`" class="bo-audit__tenant">#{{ a.tid ?? a.onBehalfOf }}</RouterLink>
                <span v-else class="bo-muted">platform</span>
              </td>
              <td><EkStatusChip :tone="RESULT[a.result].tone" :label="RESULT[a.result].label" dot /></td>
              <td><button v-if="a.reqId" type="button" class="bo-audit__req bo-mono" @click="traceId = a.reqId">{{ a.reqId.slice(4, 12) }}</button></td>
            </tr>
            <tr v-if="open.has(a.id)" :id="`aud-${a.id}`" class="bo-audit__detail">
              <td></td>
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
                  <div><dt>Yüzey</dt><dd>{{ a.surface ?? '—' }}</dd></div>
                  <div><dt>IP</dt><dd class="bo-mono">{{ a.ip ?? '—' }}</dd></div>
                  <div><dt>Kayıt</dt><dd class="bo-mono">{{ a.id }}</dd></div>
                  <div v-if="a.reqId"><dt>reqId</dt><dd class="bo-mono">{{ a.reqId }}</dd></div>
                </dl>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <div v-if="cursor" class="bo-audit__more"><EkButton tone="secondary" size="sm" @click="load(true)">Daha fazla</EkButton></div>
    </div>
    <TraceDialog :req-id="traceId" @close="traceId = null" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { EkButton, EkEmptyState, EkSkeleton, EkStatusChip, type StatusTone } from '@entegrasyonik/ui/components'
import TraceDialog from '@bo/components/TraceDialog.vue'
import { api } from '@bo/api'
import type { AuditRecord, LogRange } from '@bo/api/contract'
import { formatDateTime, formatRelative } from '@bo/utils/format'
import { auditChanges } from '@bo/utils/audit'

const SURFACES = [
  { value: undefined, label: 'Tümü' },
  { value: 'backoffice', label: 'Yönetim' },
  { value: 'app', label: 'Müşteri uygulaması' },
] as const
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

const surface = ref<'backoffice' | 'app' | undefined>(undefined)
const event = ref<string | null>(null)
const result = ref<AuditRecord['result'] | null>(null)
const tid = ref('')
const range = ref<LogRange>('7d')
const items = ref<AuditRecord[] | null>(null)
const cursor = ref<string | undefined>()
const open = reactive(new Set<string>())
const traceId = ref<string | null>(null)

async function load(more = false) {
  if (!more) items.value = null
  const res = await api.call('BackofficeAuditService/search', {
    range: range.value,
    surface: surface.value,
    event: event.value ?? undefined,
    result: result.value ?? undefined,
    tid: /^\d+$/.test(tid.value ?? '') ? Number(tid.value) : undefined,
    cursor: more ? cursor.value : undefined,
    limit: 50,
  })
  items.value = more ? [...(items.value ?? []), ...res.items] : res.items
  cursor.value = res.nextCursor
}

let timer: ReturnType<typeof setTimeout> | undefined
function debounced() {
  clearTimeout(timer)
  timer = setTimeout(() => load(), 300)
}

watch([surface, event, result, range], () => load())
onMounted(() => load())

function toggle(id: string) {
  if (open.has(id)) open.delete(id)
  else open.add(id)
}
const changes = (a: AuditRecord) => auditChanges(a.meta)
</script>

<style scoped>
.bo-audit__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.bo-audit__field {
  flex: 0 1 240px;
}

.bo-audit__field--sm {
  flex-basis: 160px;
}

.bo-seg {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}

.bo-seg__opt {
  height: 30px;
  padding: 0 var(--ek-space-3);
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-muted);
  font: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
}

.bo-seg__opt[aria-checked='true'] {
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  box-shadow: var(--ek-shadow-sm);
}

.bo-seg__opt:focus-visible,
.bo-audit__toggle:focus-visible,
.bo-audit__req:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 1px;
}

.bo-audit {
  overflow-x: auto;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.bo-audit > table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ek-type-body-size);
}

.bo-audit > table > thead th {
  padding: var(--ek-space-3);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-align: left;
  text-transform: uppercase;
}

.bo-audit__row > td {
  padding: var(--ek-space-2) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  vertical-align: top;
}

.bo-audit__row:hover > td,
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
}

.bo-audit__toggle:hover {
  background: var(--ek-color-surface-sunken);
}

.bo-audit__time,
.bo-audit__actor {
  white-space: nowrap;
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
  padding: 0 var(--ek-space-3) var(--ek-space-4);
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
  min-width: 420px;
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
  padding: var(--ek-space-2) var(--ek-space-3);
  text-align: left;
}

.bo-diff thead th {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-diff tbody tr > * {
  border-top: 1px solid var(--ek-color-border-subtle);
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

.bo-audit__more {
  display: flex;
  justify-content: center;
  padding: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}

/* Dar ekran: satır = kart (tablo semantiği korunur, yatay kaydırma yok). */
@media (max-width: 767px) {
  .bo-audit > table,
  .bo-audit > table > tbody {
    display: block;
  }

  .bo-audit > table > thead {
    display: none;
  }

  .bo-audit__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ek-space-1) var(--ek-space-3);
    padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-3) var(--ek-space-2);
    border-top: 1px solid var(--ek-color-border-subtle);
  }

  .bo-audit__row > td {
    padding: 0;
    border-top: 0;
    background: transparent !important;
  }

  .bo-audit__row > td:nth-child(2) {
    flex: 1;
  }

  .bo-audit__row > td:nth-child(3),
  .bo-audit__row > td:nth-child(4) {
    flex-basis: calc(100% - 44px);
    margin-left: 40px;
  }

  .bo-audit__row > td:nth-child(5) {
    margin-left: 40px;
  }

  .bo-audit__row > td:nth-child(6) {
    order: -1;
    margin-left: auto;
  }

  .bo-audit__row > td:nth-child(2) {
    order: -2;
  }

  .bo-audit__row > td:first-child {
    order: -3;
  }

  .bo-audit__time,
  .bo-audit__actor {
    white-space: normal;
  }

  .bo-audit__actor span {
    display: inline !important;
  }

  .bo-audit__actor span:last-child::before {
    content: ' · ';
  }

  .bo-audit__detail {
    display: block;
    background: var(--ek-color-surface-muted);
  }

  .bo-audit__detail > td:first-child {
    display: none;
  }

  .bo-audit__detail > td {
    display: block;
    padding: 0 var(--ek-space-3) var(--ek-space-4) 48px;
  }

  .bo-diff {
    width: 100%;
    min-width: 0;
  }
}
</style>
