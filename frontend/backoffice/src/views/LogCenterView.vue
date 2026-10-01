<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="summary.updatedAt.value" :stale="summary.stale.value">
      <template #meta>
        <span class="bo-inline-note"><v-icon icon="mdi-flask-outline" aria-hidden="true" />Örnek veriyle taslak — uçlar (L6–L8) henüz yok</span>
      </template>
      <template #actions>
        <CopyViewLink />
        <BoAction kind="refresh" :loading="loading || summary.refreshing.value" data-page-refresh @click="refresh" />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <!-- Kategori şeridi: kontrol merkezinin ana ekseni -->
    <BoSection title="Kategoriler" description="Bir kategoriyi seçerek sorun gruplarını ve olay akışını süzün." icon="mdi-shape-outline">
      <BoTileGrid v-if="volume" :cols="6" :mobile-cols="2" dense>
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
      </BoTileGrid>
      <p v-else-if="!loading" class="bo-muted">Kategori hacmi okunamadı. <button type="button" class="bo-link" @click="loadAll">Yeniden dene</button></p>
      <EkSkeleton v-else type="cards" :rows="1" />
    </BoSection>

    <BoFilterBar class="bo-fb" label="Log süzgeçleri" :active="activeCount" @clear="clearFilters">
      <template v-if="tab === 'akis'" #search>
        <v-text-field v-model="text" label="İleti öneki (regex yok)" prepend-inner-icon="mdi-text-search" density="compact" hide-details clearable @update:model-value="debouncedStream" />
      </template>
      <BoSegmented v-model="range" :options="RANGES" label="Zaman aralığı" />
      <v-select v-model="level" :items="levelItems" label="Seviye" multiple chips density="compact" hide-details clearable data-testid="level-filter">
        <template #item="{ props: ip, item }">
          <v-list-item v-bind="ip"><template #append><span class="bo-facet__n ek-num">{{ facets?.level[item.value as LogLevel] ?? 0 }}</span></template></v-list-item>
        </template>
      </v-select>
      <v-select v-model="src" :items="sourceItems" label="Kaynak" multiple chips density="compact" hide-details clearable data-testid="source-filter">
        <template #item="{ props: ip, item }">
          <v-list-item v-bind="ip"><template #append><span class="bo-facet__n ek-num">{{ facets?.src[item.value as LogSource] ?? 0 }}</span></template></v-list-item>
        </template>
      </v-select>
    </BoFilterBar>

    <p v-if="tid" class="bo-logs__scope" data-testid="tid-scope">
      <span class="bo-logs__scope-chip">
        <v-icon icon="mdi-storefront-outline" aria-hidden="true" />
        Müşteri <RouterLink :to="`/musteriler/${tid}`" class="ek-num bo-hit">#{{ tid }}</RouterLink>
        <button type="button" class="bo-logs__scope-x" :aria-label="`Müşteri #${tid} süzgecini kaldır`" @click="tid = undefined">
          <v-icon icon="mdi-close" aria-hidden="true" />
        </button>
      </span>
      <span class="bo-logs__scope-note" data-testid="tid-scope-note">Olay akışı kesin süzülür; sorun grupları yaklaşıktır (başka müşterinin grubu da görünebilir).</span>
    </p>

    <BoTabs :tabs="tabs" label="Log görünümü" :model-value="tab" @update:model-value="(v: string) => (tab = v === 'akis' ? 'akis' : 'sorunlar')" />

    <!-- Sorun grupları -->
    <BoSection v-if="tab === 'sorunlar'" id="panel-issues" title="Sorun grupları" description="Aynı kök nedene sahip olaylar tek grupta; en çok etkileyen önce." icon="mdi-bug-outline" flush role="tabpanel">
      <template #actions>
        <v-select v-model="sort" :items="SORTS" label="Sırala" density="compact" hide-details class="bo-logs__sort" />
      </template>
      <p v-if="tid && issues" class="bo-logs__scope-note bo-logs__approx" data-testid="issues-approx">
        <v-icon icon="mdi-information-outline" aria-hidden="true" />Yaklaşık: müşteri #{{ tid }} süzgeci kova eşleşmesiyle uygulanır; başka müşterinin grubu da görünebilir.
      </p>
      <BoPanelState v-if="issuesError" state="error" :error="issuesError" error-text="Sorun grupları yüklenemedi" @retry="loadIssues" />
      <EkSkeleton v-else-if="!issues" type="table" :rows="6" />
      <EkEmptyState v-else-if="!issues.length" variant="no-results" title="Bu filtrelerde sorun yok" message="Aralığı genişletin ya da filtreleri temizleyin." />
      <BoTableFrame v-else label="Sorun grupları" density="comfortable" flat>
        <template #head>
          <tr>
            <th scope="col"><span class="ek-sr-only">Seviye</span></th>
            <th scope="col">Sorun</th>
            <th scope="col" class="bo-hide-sm">Eğilim</th>
            <th scope="col" class="is-num">Olay</th>
            <th scope="col" class="is-num bo-hide-sm">Müşteri</th>
            <th scope="col" class="bo-hide-sm">Durum · son görülme</th>
          </tr>
        </template>
        <tr v-for="issue in issues" :key="issue.fp" class="is-link bo-issue-row" :class="{ 'is-selected': selected?.fp === issue.fp }" :data-fp="issue.fp" @click="onIssueRow(issue, $event)">
          <td class="bo-issue-row__lvl">
            <span class="bo-issue__lvl" :class="`lvl-${issue.level}`" :title="LEVEL[issue.level].label"><v-icon :icon="LEVEL[issue.level].icon" aria-hidden="true" /><span class="ek-sr-only">{{ LEVEL[issue.level].label }}</span></span>
          </td>
          <td class="bo-issue-row__main">
            <button type="button" class="bo-issue" :aria-label="`Sorun ayrıntısı: ${issue.title}`" @click="openIssue(issue)">
              <span class="bo-issue__title">
                <EkBadge v-if="issue.isNew" text="Yeni" tone="error" class="bo-issue__new" />
                <span class="bo-issue__text" :title="issue.title">{{ issue.title }}</span>
              </span>
            </button>
            <span class="bo-issue__meta">
              <span class="bo-issue__cat"><v-icon :icon="CATEGORY[issue.category].icon" aria-hidden="true" />{{ CATEGORY[issue.category].label }}</span>
              <span>{{ SOURCE[issue.src] }}</span>
              <code v-if="issue.errClass">{{ issue.errClass }}</code>
              <EkChannelDot v-if="issue.integ" :code="issue.integ" :name="CHANNEL[issue.integ] ?? issue.integ" variant="plain" />
              <span class="bo-issue__op">{{ issue.op }}</span>
            </span>
          </td>
          <td class="bo-hide-sm bo-issue-row__spark"><Sparkline :values="Object.values(issue.daily)" :tone="issue.level === 'warn' ? 'warning' : 'error'" :label="`${issue.title}: 14 günlük eğilim`" /></td>
          <td class="is-num ek-num">{{ issue.count }}</td>
          <td class="is-num ek-num bo-hide-sm">{{ issue.tenantCount || '—' }}</td>
          <td class="bo-hide-sm bo-issue-row__when">
            <EkStatusChip :tone="ISSUE_STATUS[issue.status].tone" :label="ISSUE_STATUS[issue.status].label" dot />
            <span class="ek-num"><EkRelativeTime :value="issue.lastSeen" /></span>
          </td>
        </tr>
      </BoTableFrame>
    </BoSection>

    <!-- Olay akışı -->
    <BoSection v-else id="panel-stream" title="Olay akışı" :description="streamNote" icon="mdi-format-list-bulleted" flush role="tabpanel">
      <template #actions>
        <v-tooltip text="Canlı akış 3 sn aralıklı sorguyla gelecek (uç henüz yok)" location="bottom">
          <template #activator="{ props: tip }">
            <span v-bind="tip"><v-switch label="Canlı" density="compact" hide-details disabled inset /></span>
          </template>
        </v-tooltip>
      </template>
      <BoPanelState v-if="streamError" state="error" :error="streamError" error-text="Olay akışı yüklenemedi" @retry="loadStream" />
      <EkSkeleton v-else-if="!stream" type="table" :rows="8" />
      <EkEmptyState v-else-if="!stream.items.length" variant="no-results" title="Olay yok" message="Bu filtrelerle kayıt bulunamadı." />
      <BoTableFrame v-else label="Olay akışı" flat>
        <template #head>
          <tr>
            <th scope="col">Zaman</th>
            <th scope="col">Seviye</th>
            <th scope="col" class="bo-hide-sm">Kategori · kaynak</th>
            <th scope="col">İleti</th>
            <th scope="col" class="bo-hide-sm">İstek</th>
          </tr>
        </template>
        <tr v-for="e in stream.items" :key="e.id" :class="`lvl-${e.level}`">
          <td class="ek-num bo-stream__time">{{ formatClock(e.t) }}<span><EkRelativeTime :value="e.t" /></span></td>
          <td><EkStatusChip :tone="LEVEL[e.level].tone" :label="LEVEL[e.level].label" /></td>
          <td class="bo-stream__src bo-hide-sm">{{ CATEGORY[e.category].label }}<span>{{ SOURCE[e.src] }}<template v-if="e.tid"> · #{{ e.tid }}</template></span></td>
          <td class="bo-stream__msg">
            {{ e.msg }}
            <button v-if="e.reqId" type="button" class="bo-link bo-mono bo-show-sm bo-stream__req-sm" :aria-label="`İstek zincirini aç: ${e.reqId}`" @click="traceId = e.reqId">{{ e.reqId.slice(4, 12) }}</button>
          </td>
          <td class="bo-stream__req bo-hide-sm">
            <template v-if="e.reqId">
              <button type="button" class="bo-link bo-mono" :aria-label="`İstek zincirini aç: ${e.reqId}`" @click="traceId = e.reqId">{{ e.reqId.slice(4, 12) }}</button><EkCopyButton :value="e.reqId" label="İstek kimliği" />
            </template>
          </td>
        </tr>
      </BoTableFrame>
      <template v-if="stream && stream.items.length" #footer>
        <BoPagination :count="stream.items.length" :has-more="!!stream.nextCursor" :loading="loadingMore" :error="moreError" @more="loadMore" />
      </template>
    </BoSection>

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
        <BoSection title="Eğilim" :heading-level="3" plain>
          <BarTrend v-if="trend" :points="trend.points" :bucket="trend.bucket" :label="`${selected.title} eğilimi`" />
          <EkSkeleton v-else type="cards" :rows="1" />
        </BoSection>
        <BoSection v-if="trend?.tenants.length" title="Etkilenen müşteriler" :heading-level="3" plain>
          <div class="bo-drawer__tenants">
            <RouterLink v-for="t in trend.tenants" :key="t" :to="`/musteriler/${t}`" class="bo-drawer__tenant ek-num bo-hit">#{{ t }}</RouterLink>
          </div>
        </BoSection>
        <!-- Kanıtlar ikinci planda: örnek ileti ve son istekler ihtiyaç olunca açılır. -->
        <div v-if="trend" class="bo-drawer__evidence">
          <BoCollapsible label="Örnek ileti (maskeli)" hint="parmak izi ile">
            <pre class="bo-drawer__sample">{{ trend.sample.msg }}</pre>
            <p class="bo-drawer__fp">parmak izi <code>{{ selected.fp }}</code><EkCopyButton :value="selected.fp" label="Parmak izi" /></p>
          </BoCollapsible>
          <BoCollapsible v-if="trend.reqIds.length" label="Son istekler" :hint="`${trend.reqIds.length} istek`">
            <ul class="bo-drawer__reqs">
              <li v-for="id in trend.reqIds" :key="id">
                <code>{{ id }}</code><EkCopyButton :value="id" label="İstek kimliği" />
                <EkButton tone="ghost" size="sm" icon="mdi-source-branch" @click="traceId = id">İzi aç</EkButton>
              </li>
            </ul>
          </BoCollapsible>
        </div>
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
import BoAction from '@bo/components/r2/BoAction.vue'
import BoCollapsible from '@bo/components/r2/BoCollapsible.vue'
import BoFilterBar from '@bo/components/r2/BoFilterBar.vue'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoSegmented from '@bo/components/r2/BoSegmented.vue'
import BoTableFrame from '@bo/components/r2/BoTableFrame.vue'
import BoTabs from '@bo/components/r2/BoTabs.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import CopyViewLink from '@bo/components/CopyViewLink.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { useVerdictSources } from '@bo/composables/useVerdictSources'
import { logCenterVerdict, type TidScope } from './logCenterVerdict'
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
// Açılışta ?sekme= önceliklidir (hüküm/kayıtlı görünüm bağlantıları); yoksa ?tid= olay akışıyla, aksi halde sorun gruplarıyla başlar.
const tab = ref<'sorunlar' | 'akis'>(route.query.sekme === 'sorunlar' ? 'sorunlar' : route.query.sekme === 'akis' || tid.value ? 'akis' : 'sorunlar')
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
const moreError = ref<{ message: string } | null>(null)
const selected = ref<IssueGroup | null>(null)
const trend = ref<GetIssueTrendResponse | null>(null)
const traceId = ref<string | null>(null)
const issuesError = ref<unknown>(null)
const streamError = ref<unknown>(null)

// Hüküm: süzgeç ve aralıktan bağımsız son 24 saatin sorun grupları (+ ?tid= varsa müşterinin olay sayıları).
// BE-06: `?tid=` sorun gruplarına da uygulanır (kova eşleşmesi → yaklaşık); müşteri sayımı olay akışı yüzlerinden.
const summary = useVerdictSources({
  groups: () => api.call('LogCenterService/getIssueGroups', { range: '24h', sort: 'count', tid: tid.value }),
  tenant: async () => (tid.value ? api.call('LogCenterService/listLogs', { range: '24h', tid: tid.value, limit: 1 }) : null),
})
const tidScope = computed<TidScope | null>(() => {
  const f = summary.sources.tenant.data.value?.facets.level
  return tid.value && f ? { tid: tid.value, errors: (f.error ?? 0) + (f.fatal ?? 0), warns: f.warn ?? 0 } : tid.value ? { tid: tid.value, errors: 0, warns: 0 } : null
})
const verdict = computed(() =>
  summary.settled.value
    ? logCenterVerdict({
        issues: summary.sources.groups.data.value?.items ?? null,
        failed: summary.failed('groups'),
        tid: tidScope.value,
        tidFailed: !!tid.value && summary.failed('tenant'),
        retry: () => summary.load(),
      })
    : null,
)

/** Hüküm bağlantıları göreli konumdur (`{ query }`): ?level= ?category= ?sekme=akis|sorunlar ?sirala= ?fp= değişince uygulanır. */
const SORT_KEYS = ['lastSeen', 'count', 'tenantCount', 'new'] as const
function applyQuery() {
  const q = route.query
  const lv = queryList('level', LEVELS)
  const cat = queryList('category', Object.keys(CATEGORY) as LogCategory[])
  if (lv.join() !== level.value.join()) level.value = lv
  if (cat.join() !== category.value.join()) category.value = cat
  if (q.sekme === 'akis' || q.sekme === 'sorunlar') tab.value = q.sekme
  const sirala = SORT_KEYS.find((k) => k === q.sirala)
  if (sirala && sirala !== sort.value) sort.value = sirala
  if (typeof q.fp === 'string' && q.fp && selected.value?.fp !== q.fp) {
    const hit = [...(issues.value ?? []), ...(summary.sources.groups.data.value?.items ?? [])].find((g) => g.fp === q.fp)
    if (hit) void openIssue(hit)
  }
}
watch(() => route.query, applyQuery)

function refresh() {
  void summary.load()
  void loadAll()
}

const facets = computed(() => stream.value?.facets)
const sourcesShown = computed(() => ALL_SOURCES.filter((s) => (facets.value?.src[s] ?? 0) > 0 || src.value.includes(s)))
const legacyShare = computed(() => {
  const f = facets.value?.src
  if (!f) return null
  const total = Object.values(f).reduce((a, b) => a + (b ?? 0), 0)
  return total ? Math.round(((f['legacy-console'] ?? 0) / total) * 100) : 0
})
const streamNote = computed(() => (legacyShare.value !== null ? `Eski console.* payı: %${legacyShare.value} — F-06 göçü ilerledikçe düşer.` : undefined))
const levelItems = LEVELS.map((l) => ({ value: l, title: LEVEL[l].label }))
const sourceItems = computed(() => sourcesShown.value.map((s) => ({ value: s, title: SOURCE[s] })))
const tabs = computed(() => [
  { value: 'sorunlar', label: 'Sorun grupları', count: issues.value?.length ?? null },
  { value: 'akis', label: 'Olay akışı', count: stream.value?.items.length ?? null },
])
/** Etkin süzgeç sayısı (BoFilterBar): kategori + seviye + kaynak + ileti öneki + müşteri kapsamı; aralık her zaman seçili olduğundan sayılmaz. */
const activeCount = computed(() => category.value.length + level.value.length + src.value.length + (text.value ? 1 : 0) + (tid.value ? 1 : 0))

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
      tid: tid.value,
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
  moreError.value = null
  try {
    const next = await api.call('LogCenterService/listLogs', { ...streamFilter(), cursor: stream.value.nextCursor })
    stream.value = { ...next, items: [...stream.value.items, ...next.items] }
  } catch {
    moreError.value = { message: 'Sonraki olaylar yüklenemedi — "Daha fazla" ile yeniden deneyin.' }
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
// Süzgeçler, sekme ve sıra paylaşılabilir adrese yazılır (?level=&category=&sekme=&sirala=; ?tid=/?fp= korunur).
watch([category, level, tab, sort], () => {
  const { level: _l, category: _c, sekme: _s, sirala: _o, ...rest } = route.query
  void router.replace({
    query: {
      ...rest,
      ...(level.value.length ? { level: level.value.join(',') } : {}),
      ...(category.value.length ? { category: category.value.join(',') } : {}),
      ...(tab.value === 'akis' ? { sekme: 'akis' } : tid.value ? { sekme: 'sorunlar' } : {}),
      ...(sort.value !== 'lastSeen' ? { sirala: sort.value } : {}),
    },
  })
}, { deep: true })
watch(sort, loadIssues)
watch(tid, (v) => {
  const { tid: _tid, ...rest } = route.query
  router.replace({ query: v ? { ...rest, tid: String(v) } : rest })
  void loadStream()
  void loadIssues()
  void summary.load()
})

function onIssueRow(issue: IssueGroup, e: MouseEvent) {
  // Düğme kendi işini yapar; metin seçimi satırı açmaz.
  if ((e.target as HTMLElement).closest('a, button') || window.getSelection()?.toString()) return
  void openIssue(issue)
}

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
  void summary.load()
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
.bo-link:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 1px;
}

/* ---- müşteri kapsamı (?tid=) ---- */
.bo-logs__approx {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4) 0;
}

.bo-logs__scope {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  margin: 0;
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

.bo-logs__sort {
  min-width: 180px;
}

/* ---- kategori kutusu ---- */
.bo-cat {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
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
  background: var(--ek-color-action-subtle);
  box-shadow: 0 0 0 1px var(--ek-color-action);
}

.bo-cat__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-cat__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-cat__head :deep(.v-icon) {
  font-size: var(--ek-icon-sm);
}

.bo-cat__total {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-type-heading-weight);
}

.bo-cat__unit {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-regular);
}

.bo-cat__split {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-3);
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

.bo-facet__n {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* ---- sorun satırları ---- */
.bo-issue-row.is-selected > * {
  background: var(--ek-color-surface-muted);
}

.bo-issue-row__lvl {
  width: 44px;
}

.bo-issue-row__main {
  min-width: 260px;
}

.bo-issue-row__spark {
  width: 120px;
}

.bo-issue-row__when {
  white-space: nowrap;
}

.bo-issue-row__when .ek-num {
  display: block;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-issue-row > td {
  padding-top: var(--ek-space-2);
  padding-bottom: var(--ek-space-2);
}

.bo-issue {
  display: block;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ek-color-content-strong);
  font: inherit;
  font-weight: var(--ek-font-weight-medium);
  text-align: left;
  cursor: pointer;
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

.bo-issue__title {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
}

.bo-issue__new {
  flex: none;
}

/* NT-06: başlık iki satıra kadar sarılır, tam metin title özniteliğinde. */
.bo-issue__text {
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow-wrap: anywhere;
}

.bo-issue__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px var(--ek-space-3);
  margin-top: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-regular);
  white-space: normal;
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

/* ---- akış ---- */
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

:deep(.bo-table tbody tr.lvl-error > :first-child),
:deep(.bo-table tbody tr.lvl-fatal > :first-child) {
  box-shadow: inset 3px 0 0 var(--ek-color-error);
}

:deep(.bo-table tbody tr.lvl-warn > :first-child) {
  box-shadow: inset 3px 0 0 var(--ek-color-warning);
}

.bo-stream__msg {
  min-width: 200px;
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}

.bo-stream__req-sm {
  display: none;
}

@media (max-width: 767px) {
  .bo-stream__req-sm {
    display: block;
    min-height: 44px;
  }

  .bo-issue-row__main {
    min-width: 0;
  }
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
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
  overflow-wrap: anywhere;
}

.bo-drawer__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.bo-drawer__evidence {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
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
  overflow-wrap: anywhere;
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
</style>
