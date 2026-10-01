<template>
  <div class="bo-page">
    <BoPageHeader>
      <template #meta>
        <span class="bo-inline-note"><v-icon icon="mdi-flask-outline" aria-hidden="true" />Örnek veriyle taslak — uçlar (L6–L8) henüz yok</span>
      </template>
      <template #actions>
        <div class="bo-seg" role="radiogroup" aria-label="Zaman aralığı">
          <button v-for="r in RANGES" :key="r.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="range === r.value" @click="range = r.value">{{ r.label }}</button>
        </div>
        <EkButton tone="secondary" icon="mdi-refresh" icon-only aria-label="Yenile" :loading="loading" data-page-refresh @click="loadAll" />
      </template>
    </BoPageHeader>

    <!-- Kategori şeridi: kontrol merkezinin ana ekseni -->
    <section class="bo-cats" aria-label="Kategoriler">
      <template v-if="volume">
        <button
          v-for="c in volume.categories"
          :key="c.category"
          type="button"
          class="bo-cat"
          :class="{ 'is-on': category.includes(c.category), 'has-error': c.error > 0 }"
          :aria-pressed="category.includes(c.category)"
          :data-category="c.category"
          @click="toggle(category, c.category)"
        >
          <span class="bo-cat__head">
            <v-icon :icon="CATEGORY[c.category].icon" aria-hidden="true" />
            <span class="bo-cat__name">{{ CATEGORY[c.category].label }}</span>
          </span>
          <span class="bo-cat__total ek-num">{{ compact(c.total) }}<span class="bo-cat__unit"> olay</span></span>
          <span class="bo-cat__split">
            <span :class="{ 'is-error': c.error }"><v-icon icon="mdi-close-circle" aria-hidden="true" />{{ c.error }} hata</span>
            <span :class="{ 'is-warn': c.warn }"><v-icon icon="mdi-alert" aria-hidden="true" />{{ c.warn }} uyarı</span>
          </span>
          <Sparkline :values="c.series" :tone="c.error ? 'error' : c.warn ? 'warning' : 'neutral'" :label="`${CATEGORY[c.category].label}: uyarı ve hata eğilimi`" />
        </button>
      </template>
      <p v-else-if="!loading" class="bo-muted">Kategori hacmi okunamadı. <button type="button" class="bo-link" @click="loadAll">Yeniden dene</button></p>
      <EkSkeleton v-else type="cards" :rows="1" />
    </section>

    <div class="bo-logs">
      <aside class="bo-facets" aria-label="Filtreler">
        <fieldset class="bo-facet">
          <legend>Seviye</legend>
          <label v-for="l in LEVELS" :key="l" class="bo-facet__opt" :class="`lvl-${l}`">
            <input type="checkbox" :checked="level.includes(l)" @change="toggle(level, l)" />
            <v-icon :icon="LEVEL[l].icon" aria-hidden="true" />
            <span>{{ LEVEL[l].label }}</span>
            <span class="bo-facet__n ek-num">{{ facets?.level[l] ?? 0 }}</span>
          </label>
        </fieldset>
        <fieldset class="bo-facet">
          <legend>Kaynak</legend>
          <label v-for="s in sourcesShown" :key="s" class="bo-facet__opt">
            <input type="checkbox" :checked="src.includes(s)" @change="toggle(src, s)" />
            <span>{{ SOURCE[s] }}</span>
            <span class="bo-facet__n ek-num">{{ facets?.src[s] ?? 0 }}</span>
          </label>
        </fieldset>
        <p v-if="legacyShare !== null" class="bo-facet__note">
          Eski <code>console.*</code> payı: <strong class="ek-num">%{{ legacyShare }}</strong> — F-06 göçü ilerledikçe düşer.
        </p>
        <EkButton v-if="filtered" tone="ghost" size="sm" icon="mdi-filter-remove-outline" @click="clearFilters">Filtreleri temizle</EkButton>
      </aside>

      <section class="bo-logs__main">
        <p v-if="tid" class="bo-logs__scope" data-testid="tid-scope">
          <span class="bo-logs__scope-chip">
            <v-icon icon="mdi-storefront-outline" aria-hidden="true" />
            Müşteri <RouterLink :to="`/musteriler/${tid}`" class="ek-num">#{{ tid }}</RouterLink>
            <button type="button" class="bo-logs__scope-x" :aria-label="`Müşteri #${tid} süzgecini kaldır`" @click="tid = undefined">
              <v-icon icon="mdi-close" aria-hidden="true" />
            </button>
          </span>
          <span class="bo-logs__scope-note">Olay akışına uygulanır; sorun grupları platform genelidir.</span>
        </p>
        <div class="bo-tabs">
          <div class="bo-tabs__list" role="tablist" aria-label="Görünüm">
          <button id="tab-issues" type="button" role="tab" class="bo-tab" :aria-selected="tab === 'issues'" aria-controls="panel-issues" @click="tab = 'issues'">
            Sorun grupları <span class="bo-tab__n ek-num">{{ issues?.length ?? '…' }}</span>
          </button>
          <button id="tab-stream" type="button" role="tab" class="bo-tab" :aria-selected="tab === 'stream'" aria-controls="panel-stream" @click="tab = 'stream'">
            Olay akışı <span class="bo-tab__n ek-num">{{ stream?.items.length ?? '…' }}{{ stream?.nextCursor ? '+' : '' }}</span>
          </button>
          </div>
          <span class="bo-tabs__spacer" />
          <v-select
            v-if="tab === 'issues'"
            v-model="sort"
            :items="SORTS"
            label="Sırala"
            density="compact"
            hide-details
            class="bo-tabs__sort"
          />
        </div>

        <!-- Sorun grupları -->
        <div v-if="tab === 'issues'" id="panel-issues" role="tabpanel" aria-labelledby="tab-issues">
          <BoPanelState v-if="issuesError" state="error" :error="issuesError" error-text="Sorun grupları yüklenemedi" @retry="loadIssues" />
          <EkSkeleton v-else-if="!issues" type="table" :rows="6" />
          <EkEmptyState v-else-if="!issues.length" variant="no-results" title="Bu filtrelerde sorun yok" message="Aralığı genişletin ya da filtreleri temizleyin." />
          <ul v-else class="bo-issues">
            <li v-for="issue in issues" :key="issue.fp">
              <button type="button" class="bo-issue" :class="{ 'is-selected': selected?.fp === issue.fp }" :data-fp="issue.fp" @click="openIssue(issue)">
                <span class="bo-issue__lvl" :class="`lvl-${issue.level}`" :title="LEVEL[issue.level].label"><v-icon :icon="LEVEL[issue.level].icon" aria-hidden="true" /><span class="ek-sr-only">{{ LEVEL[issue.level].label }}</span></span>
                <span class="bo-issue__main">
                  <span class="bo-issue__title">
                    <EkBadge v-if="issue.isNew" text="Yeni" tone="error" />
                    {{ issue.title }}
                  </span>
                  <span class="bo-issue__meta">
                    <span class="bo-issue__cat"><v-icon :icon="CATEGORY[issue.category].icon" aria-hidden="true" />{{ CATEGORY[issue.category].label }}</span>
                    <span>{{ SOURCE[issue.src] }}</span>
                    <code v-if="issue.errClass">{{ issue.errClass }}</code>
                    <EkChannelDot v-if="issue.integ" :code="issue.integ" :name="CHANNEL[issue.integ] ?? issue.integ" variant="plain" />
                    <span class="bo-issue__op">{{ issue.op }}</span>
                  </span>
                </span>
                <span class="bo-issue__spark"><Sparkline :values="Object.values(issue.daily)" :tone="issue.level === 'warn' ? 'warning' : 'error'" :label="`${issue.title}: 14 günlük eğilim`" /></span>
                <span class="bo-issue__num"><strong class="ek-num">{{ issue.count }}</strong><span>olay</span></span>
                <span class="bo-issue__num bo-issue__num--tenants"><strong class="ek-num">{{ issue.tenantCount || '—' }}</strong><span>müşteri</span></span>
                <span class="bo-issue__when">
                  <EkStatusChip :tone="ISSUE_STATUS[issue.status].tone" :label="ISSUE_STATUS[issue.status].label" dot />
                  <span class="ek-num"><EkRelativeTime :value="issue.lastSeen" /></span>
                </span>
              </button>
            </li>
          </ul>
        </div>

        <!-- Olay akışı -->
        <div v-else id="panel-stream" role="tabpanel" aria-labelledby="tab-stream">
          <div class="bo-stream__bar">
            <v-text-field v-model="text" label="İleti öneki (regex yok)" prepend-inner-icon="mdi-text-search" density="compact" hide-details clearable @update:model-value="debouncedStream" />
            <v-tooltip text="Canlı akış 3 sn aralıklı sorguyla gelecek (uç henüz yok)" location="bottom">
              <template #activator="{ props: tip }">
                <span v-bind="tip"><v-switch label="Canlı" density="compact" hide-details disabled inset /></span>
              </template>
            </v-tooltip>
          </div>
          <BoPanelState v-if="streamError" state="error" :error="streamError" error-text="Olay akışı yüklenemedi" @retry="loadStream" />
          <EkSkeleton v-else-if="!stream" type="table" :rows="8" />
          <EkEmptyState v-else-if="!stream.items.length" variant="no-results" title="Olay yok" message="Bu filtrelerle kayıt bulunamadı." />
          <div v-else class="bo-stream">
            <table>
              <caption class="ek-sr-only">Olay akışı</caption>
              <thead>
                <tr><th scope="col">Zaman</th><th scope="col">Seviye</th><th scope="col">Kategori · kaynak</th><th scope="col">İleti</th><th scope="col">İstek</th></tr>
              </thead>
              <tbody>
                <tr v-for="e in stream.items" :key="e.id" :class="`lvl-${e.level}`">
                  <td class="ek-num bo-stream__time">{{ formatClock(e.t) }}<span><EkRelativeTime :value="e.t" /></span></td>
                  <td><EkStatusChip :tone="LEVEL[e.level].tone" :label="LEVEL[e.level].label" /></td>
                  <td class="bo-stream__src">{{ CATEGORY[e.category].label }}<span>{{ SOURCE[e.src] }}<template v-if="e.tid"> · #{{ e.tid }}</template></span></td>
                  <td class="bo-stream__msg">{{ e.msg }}</td>
                  <td class="bo-stream__req">
                    <template v-if="e.reqId">
                      <button type="button" class="bo-link bo-mono" :aria-label="`İstek zincirini aç: ${e.reqId}`" @click="traceId = e.reqId">{{ e.reqId.slice(4, 12) }}</button><EkCopyButton :value="e.reqId" label="İstek kimliği" />
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="stream.nextCursor" class="bo-stream__more">
              <EkButton tone="secondary" size="sm" :loading="loadingMore" @click="loadMore">Daha fazla</EkButton>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Sorun detayı -->
    <EkDetailSheet :model-value="!!selected" :identity="selected ? `Sorun · ${CATEGORY[selected.category].label}` : 'Sorun'" @update:model-value="(v: boolean) => !v && closeIssue()">
      <div v-if="selected" class="bo-drawer">
        <header class="bo-drawer__head">
          <p class="bo-drawer__kicker">{{ SOURCE[selected.src] }}<template v-if="selected.integ"> · {{ CHANNEL[selected.integ] ?? selected.integ }}</template></p>
          <h2 class="bo-drawer__title">{{ selected.title }}</h2>
        </header>
        <div class="bo-drawer__chips">
          <EkStatusChip :tone="LEVEL[selected.level].tone" :label="LEVEL[selected.level].label" :icon="LEVEL[selected.level].icon" />
          <EkStatusChip :tone="ISSUE_STATUS[selected.status].tone" :label="ISSUE_STATUS[selected.status].label" dot />
          <EkStatusChip v-if="selected.isNew" tone="danger" label="Yeni" />
        </div>
        <EkDescriptionList
          :items="[
            { label: 'Olay (aralıkta)', value: selected.count },
            { label: 'Etkilenen müşteri', value: selected.tenantCount },
            { label: 'İlk görülme', value: formatDateTime(selected.firstSeen) },
            { label: 'Son görülme', value: formatDateTime(selected.lastSeen) },
            { label: 'Hata sınıfı', value: selected.errClass ?? '—' },
            { label: 'Operasyon', value: selected.op ?? '—' },
          ]"
        />
        <section class="bo-drawer__section">
          <h3>Eğilim</h3>
          <BarTrend v-if="trend" :points="trend.points" :bucket="trend.bucket" :label="`${selected.title} eğilimi`" />
          <EkSkeleton v-else type="cards" :rows="1" />
        </section>
        <section v-if="trend" class="bo-drawer__section">
          <h3>Örnek (maskeli)</h3>
          <pre class="bo-drawer__sample">{{ trend.sample.msg }}</pre>
          <p class="bo-drawer__fp">parmak izi <code>{{ selected.fp }}</code><EkCopyButton :value="selected.fp" label="Parmak izi" /></p>
        </section>
        <section v-if="trend?.tenants.length" class="bo-drawer__section">
          <h3>Etkilenen müşteriler</h3>
          <div class="bo-drawer__tenants">
            <RouterLink v-for="t in trend.tenants" :key="t" :to="`/musteriler/${t}`" class="bo-drawer__tenant ek-num">#{{ t }}</RouterLink>
          </div>
        </section>
        <section v-if="trend?.reqIds.length" class="bo-drawer__section">
          <h3>Son istekler</h3>
          <ul class="bo-drawer__reqs">
            <li v-for="id in trend.reqIds" :key="id">
              <code>{{ id }}</code><EkCopyButton :value="id" label="İstek kimliği" />
              <EkButton tone="ghost" size="sm" icon="mdi-source-branch" @click="traceId = id">İzi aç</EkButton>
            </li>
          </ul>
        </section>
      </div>
    </EkDetailSheet>

    <TraceDialog :req-id="traceId" @close="traceId = null" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkBadge, EkButton, EkChannelDot, EkCopyButton, EkDescriptionList, EkDetailSheet, EkEmptyState, EkRelativeTime, EkSkeleton, EkStatusChip } from '@entegrasyonik/ui/components'
import BoPanelState from '@bo/components/shell/BoPanelState.vue'
import BarTrend from '@bo/components/BarTrend.vue'
import Sparkline from '@bo/components/Sparkline.vue'
import TraceDialog from '@bo/components/TraceDialog.vue'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import { api } from '@bo/api'
import type {
  GetIssueTrendResponse,
  GetVolumeByCategoryResponse,
  IssueGroup,
  ListLogsResponse,
  LogCategory,
  LogLevel,
  LogRange,
  LogSource,
} from '@bo/api/contract'
import { CATEGORY, CHANNEL, ISSUE_STATUS, LEVEL, SOURCE } from '@bo/utils/labels'
import { formatClock, formatDateTime } from '@bo/utils/format'

const RANGES: Array<{ value: LogRange; label: string }> = [
  { value: '1h', label: '1 sa' },
  { value: '24h', label: '24 sa' },
  { value: '7d', label: '7 gün' },
]
const SORTS = [
  { value: 'lastSeen', title: 'Son görülme' },
  { value: 'count', title: 'Olay sayısı' },
  { value: 'tenantCount', title: 'Etkilenen müşteri' },
  { value: 'new', title: 'Önce yeniler' },
]
const LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'info']
const ALL_SOURCES = Object.keys(SOURCE) as LogSource[]

const route = useRoute()
const router = useRouter()
// URL süzgeçleri (genel bakış ve müşteri detayından iz sürme — BO-ELEV E1/E5): ?level=error,fatal · ?category= · ?tid=
const queryList = <T extends string>(key: string, allowed: readonly T[]): T[] =>
  typeof route.query[key] === 'string' ? (route.query[key] as string).split(',').filter((v): v is T => (allowed as readonly string[]).includes(v)) : []
const queryTid = Number(route.query.tid)
const tid = ref<number | undefined>(Number.isInteger(queryTid) && queryTid > 0 ? queryTid : undefined)
const range = ref<LogRange>('24h')
const tab = ref<'issues' | 'stream'>(tid.value ? 'stream' : 'issues')
const sort = ref<'lastSeen' | 'count' | 'tenantCount' | 'new'>('lastSeen')
const category = ref<LogCategory[]>(queryList('category', Object.keys(CATEGORY) as LogCategory[]))
const level = ref<LogLevel[]>(queryList('level', ['fatal', 'error', 'warn', 'info'] as const))
const src = ref<LogSource[]>([])
const text = ref('')

const volume = ref<GetVolumeByCategoryResponse | null>(null)
const issues = ref<IssueGroup[] | null>(null)
const stream = ref<ListLogsResponse | null>(null)
const loading = ref(false)
const loadingMore = ref(false)
const selected = ref<IssueGroup | null>(null)
const trend = ref<GetIssueTrendResponse | null>(null)
const traceId = ref<string | null>(null)
const issuesError = ref<unknown>(null)
const streamError = ref<unknown>(null)

const facets = computed(() => stream.value?.facets)
const sourcesShown = computed(() => ALL_SOURCES.filter((s) => (facets.value?.src[s] ?? 0) > 0 || src.value.includes(s)))
const legacyShare = computed(() => {
  const f = facets.value?.src
  if (!f) return null
  const total = Object.values(f).reduce((a, b) => a + (b ?? 0), 0)
  return total ? Math.round(((f['legacy-console'] ?? 0) / total) * 100) : 0
})
const filtered = computed(() => category.value.length + level.value.length + src.value.length > 0 || !!text.value || !!tid.value)

function toggle<T>(list: T[], value: T) {
  const i = list.indexOf(value)
  if (i >= 0) list.splice(i, 1)
  else list.push(value)
}

function clearFilters() {
  category.value = []
  level.value = []
  src.value = []
  text.value = ''
  tid.value = undefined
}

/** 12.345 → "12,3 bin" (Intl'in "B" kısaltması "milyar" sanılabiliyor). */
const compact = (n: number) =>
  n >= 1000 ? `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(n / 1000)} bin` : new Intl.NumberFormat('tr-TR').format(n)

async function loadIssues() {
  issues.value = null
  issuesError.value = null
  try {
    const res = await api.call('LogCenterService/getIssueGroups', {
      range: range.value,
      sort: sort.value,
      category: category.value.length ? category.value : undefined,
      src: src.value.length ? src.value : undefined,
    })
    // Seviye yüzü sorun gruplarında da uygulanır (grup = tek seviye).
    issues.value = level.value.length ? res.items.filter((i) => level.value.includes(i.level)) : res.items
  } catch (e) {
    issuesError.value = e
  }
}

function streamFilter() {
  return {
    range: range.value,
    level: level.value.length ? level.value : undefined,
    src: src.value.length ? src.value : undefined,
    category: category.value.length ? category.value : undefined,
    text: text.value?.trim() || undefined,
    tid: tid.value,
    limit: 50,
  }
}

async function loadStream() {
  streamError.value = null
  try {
    stream.value = await api.call('LogCenterService/listLogs', streamFilter())
  } catch (e) {
    streamError.value = e
  }
}

async function loadMore() {
  if (!stream.value?.nextCursor) return
  loadingMore.value = true
  try {
    const next = await api.call('LogCenterService/listLogs', { ...streamFilter(), cursor: stream.value.nextCursor })
    stream.value = { ...next, items: [...stream.value.items, ...next.items] }
  } finally {
    loadingMore.value = false
  }
}

async function loadAll() {
  loading.value = true
  try {
    volume.value = null
    const [v] = await Promise.all([api.call('LogCenterService/getVolumeByCategory', { range: range.value }).catch(() => null), loadIssues(), loadStream()])
    volume.value = v
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
function debouncedStream() {
  clearTimeout(timer)
  timer = setTimeout(loadStream, 250)
}

watch(range, loadAll)
watch([category, level, src], () => Promise.all([loadIssues(), loadStream()]), { deep: true })
watch(sort, loadIssues)
watch(tid, (v) => {
  const { tid: _tid, ...rest } = route.query
  router.replace({ query: v ? { ...rest, tid: String(v) } : rest })
  void loadStream()
})

async function openIssue(issue: IssueGroup) {
  selected.value = issue
  trend.value = null
  if (route.query.fp !== issue.fp) router.replace({ query: { ...route.query, fp: issue.fp } })
  trend.value = await api.call('LogCenterService/getIssueTrend', { fp: issue.fp, range: range.value === '1h' ? '24h' : range.value })
}

function closeIssue() {
  selected.value = null
  const { fp: _fp, ...rest } = route.query
  router.replace({ query: rest })
}

onMounted(async () => {
  // Komut paleti / denetim bağlantısı: ?reqId= → istek zinciri doğrudan açılır.
  if (typeof route.query.reqId === 'string' && route.query.reqId) traceId.value = route.query.reqId
  await loadAll()
  const fp = route.query.fp
  const hit = typeof fp === 'string' ? issues.value?.find((i) => i.fp === fp) : undefined
  if (hit) openIssue(hit)
})
</script>

<style scoped>



.bo-cat:focus-visible,
.bo-issue:focus-visible,
.bo-tab:focus-visible,
.bo-link:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 1px;
}

/* ---- müşteri kapsamı (?tid=) ---- */
.bo-logs__scope {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  margin: 0 0 var(--ek-space-3);
}

.bo-logs__scope-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: 28px;
  padding: 0 var(--ek-space-1) 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-logs__scope-chip .v-icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.bo-logs__scope-x {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: none;
  cursor: pointer;
}

.bo-logs__scope-x:hover {
  background: var(--ek-color-surface-muted);
}

.bo-logs__scope-x:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 1px;
}

.bo-logs__scope-note {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* ---- kategori şeridi ---- */
.bo-cats {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--ek-space-3);
}

.bo-cat {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-cat:hover {
  border-color: var(--ek-color-border-strong);
}

.bo-cat.is-on {
  border-color: var(--ek-color-action);
  box-shadow: 0 0 0 1px var(--ek-color-action), var(--ek-shadow-card);
}

.bo-cat__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-cat__head :deep(.v-icon) {
  font-size: var(--ek-icon-sm);
}

.bo-cat__total {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-cat__unit {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-regular);
}

.bo-cat__split {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-cat__split span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.bo-cat__split :deep(.v-icon) {
  font-size: var(--ek-icon-xs);
}

.bo-cat__split .is-error {
  color: var(--ek-color-error-emphasis);
}

.bo-cat__split .is-warn {
  color: var(--ek-color-warning-emphasis);
}

/* ---- gövde ---- */
.bo-logs {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: var(--ek-space-5);
  align-items: start;
}

.bo-facets {
  position: sticky;
  top: calc(var(--ek-app-topbar-height) + var(--ek-space-4));
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.bo-facet {
  margin: 0;
  padding: 0;
  border: 0;
}

.bo-facet legend {
  margin-bottom: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-facet__opt {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 32px;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  cursor: pointer;
}

.bo-facet__opt:hover {
  background: var(--ek-color-surface);
}

.bo-facet__opt input {
  width: 16px;
  height: 16px;
  accent-color: var(--ek-color-action);
}

.bo-facet__opt input:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

.bo-facet__opt :deep(.v-icon) {
  font-size: var(--ek-icon-sm);
}

.bo-facet__opt.lvl-fatal :deep(.v-icon),
.bo-facet__opt.lvl-error :deep(.v-icon) {
  color: var(--ek-color-error);
}

.bo-facet__opt.lvl-warn :deep(.v-icon) {
  color: var(--ek-color-warning);
}

.bo-facet__opt.lvl-info :deep(.v-icon) {
  color: var(--ek-color-info);
}

.bo-facet__n {
  margin-left: auto;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-facet__note {
  margin: 0;
  padding: var(--ek-space-3);
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-lg);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-logs__main {
  min-width: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.bo-tabs {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  padding: var(--ek-space-2) var(--ek-space-3) 0;
  border-bottom: 1px solid var(--ek-color-border-default);
}

.bo-tabs__list {
  display: flex;
  gap: var(--ek-space-1);
}

.bo-tabs__spacer {
  flex: 1;
}

.bo-tabs__sort {
  max-width: 200px;
  margin-bottom: var(--ek-space-2);
}

.bo-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: 40px;
  padding: 0 var(--ek-space-3);
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--ek-color-content-muted);
  font: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
}

.bo-tab[aria-selected='true'] {
  border-bottom-color: var(--ek-color-action);
  color: var(--ek-color-content-strong);
}

.bo-tab__n {
  padding: 0 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* ---- sorun satırları ---- */
.bo-issues {
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-issues li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-issue {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 96px 64px 64px 128px;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 0;
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.bo-issue:hover,
.bo-issue.is-selected {
  background: var(--ek-color-surface-muted);
}

.bo-issue__lvl {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-md);
  font-size: var(--ek-icon-sm);
}

.bo-issue__lvl.lvl-error,
.bo-issue__lvl.lvl-fatal {
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.bo-issue__lvl.lvl-warn {
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.bo-issue__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.bo-issue__title {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-issue__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-issue__meta code,
.bo-issue__op {
  font-family: var(--ek-font-mono);
}

.bo-issue__cat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.bo-issue__cat :deep(.v-icon) {
  font-size: var(--ek-icon-xs);
}

.bo-issue__num {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.bo-issue__num strong {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
}

.bo-issue__num span,
.bo-issue__when {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-issue__when {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

/* ---- akış ---- */
.bo-stream__bar {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.bo-stream {
  overflow-x: auto;
}

.bo-stream table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ek-type-body-size);
}

.bo-stream th {
  padding: var(--ek-space-2) var(--ek-space-3);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-align: left;
  text-transform: uppercase;
}

.bo-stream td {
  padding: var(--ek-space-2) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  vertical-align: top;
}

.bo-stream tr.lvl-error td:first-child,
.bo-stream tr.lvl-fatal td:first-child {
  box-shadow: inset 3px 0 0 var(--ek-color-error);
}

.bo-stream tr.lvl-warn td:first-child {
  box-shadow: inset 3px 0 0 var(--ek-color-warning);
}

.bo-stream__time,
.bo-stream__src {
  white-space: nowrap;
}

.bo-stream__time span,
.bo-stream__src span {
  display: block;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-stream__msg {
  min-width: 280px;
  color: var(--ek-color-content-strong);
}

.bo-stream__more {
  display: flex;
  justify-content: center;
  padding: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ek-color-action-emphasis);
  cursor: pointer;
}

.bo-link:hover {
  text-decoration: underline;
}

/* ---- çekmece ---- */
.bo-drawer {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.bo-drawer__kicker {
  margin: 0 0 var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-drawer__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: 1.35;
  font-weight: var(--ek-type-heading-weight);
}

.bo-drawer__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.bo-drawer__section {
  padding-top: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-drawer__section h3 {
  margin: 0 0 var(--ek-space-3);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-type-subheading-weight);
}

.bo-drawer__sample {
  margin: 0;
  padding: var(--ek-space-3);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-label-size);
  white-space: pre-wrap;
}

.bo-drawer__fp {
  margin: var(--ek-space-2) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-drawer__fp code,
.bo-drawer__reqs code {
  font-family: var(--ek-font-mono);
}

.bo-drawer__tenants {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.bo-drawer__tenant {
  padding: 2px var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  text-decoration: none;
}

.bo-drawer__tenant:hover {
  background: var(--ek-color-action-subtle);
}

.bo-drawer__reqs {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-drawer__reqs li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--ek-type-label-size);
}

@media (max-width: 1439px) {
  .bo-cats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 1023px) {
  .bo-logs {
    grid-template-columns: 1fr;
  }

  .bo-facets {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .bo-issue {
    grid-template-columns: 28px minmax(0, 1fr) 64px;
  }

  .bo-issue__spark,
  .bo-issue__num--tenants,
  .bo-issue__when {
    display: none;
  }
}

@media (max-width: 599px) {
  .bo-cats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bo-issue__title {
    white-space: normal;
  }
}
</style>
