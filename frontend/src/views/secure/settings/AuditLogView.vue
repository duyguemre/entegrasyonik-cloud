<!--
  frontend/src/views/secure/settings/AuditLogView.vue

  ADR-0015 B4-P1c — N10 "Denetim günlüğü" (tenant, YALNIZCA OKUMA; DS-v2 liste standardı).
  Sözleşme: `docs/API_TENANT_SURFACE.md` §4 — `AuditService/getAuditLogs` (admin, owner dahil); kullanıcı adları
  `UserService/getUsers` (admin). Düzen: `EkListFrame` → sayfa içi `EkFilterPanel` (tarih aralığı ≤366 gün, vars. son
  30 gün, tr-TR; olay/olay grubu; kullanıcı; sonuç) + `EkActiveFilters` → yapışkan başlıklı `EkDataGrid` (yalnız
  satırlar kayar) → alta sabit `EkPagerBar` (limit ≤100). Satır → `EkDetailSheet` (meta: yalnız ilkel alanlar).
  `ip`/`tid` DTO'da yok ve gösterilmez. Filtreler istemcide doğrulanır; geçersiz filtreyle istek ATILMAZ (400 önlenir).
  Backend yalnızca `at` azalan sıralar → sıralanabilir kolon YOK (uydurma sıralama sunulmaz).
-->
<template>
  <div class="auditLogView ek-audit-view">
    <EkPageHeader :section="t('auditLog.section')" :title="t('auditLog.title')" :description="t('auditLog.description')" />

    <EkEmptyState
      v-if="state === 'forbidden'"
      variant="error"
      :title="t('auditLog.forbidden.title')"
      :message="t('auditLog.forbidden.message')"
    />

    <EkListFrame v-else class="ek-audit-view__frame" :label="t('auditLog.frameAria')">
      <template #filters>
        <EkFilterPanel
          v-model:collapsed="filtersCollapsed"
          :title="t('auditLog.filters.title')"
          :active-count="activeChips.length"
          :loading="state === 'loading'"
          :columns="4"
          @submit="applyFilters"
          @reset="resetFilters"
        >
          <v-text-field
            v-model="draft.from"
            class="ek-audit-view__from"
            :label="t('auditLog.filters.from')"
            placeholder="GG.AA.YYYY"
            inputmode="numeric"
            autocomplete="off"
            maxlength="10"
            prepend-inner-icon="mdi-calendar-start-outline"
            :error-messages="fieldError('from')"
          />
          <v-text-field
            v-model="draft.to"
            class="ek-audit-view__to"
            :label="t('auditLog.filters.to')"
            placeholder="GG.AA.YYYY"
            inputmode="numeric"
            autocomplete="off"
            maxlength="10"
            prepend-inner-icon="mdi-calendar-end-outline"
            :error-messages="fieldError('to')"
          />
          <v-autocomplete
            v-model="draft.eventKey"
            class="ek-audit-view__event ek-span-2"
            :label="t('auditLog.filters.event')"
            :items="eventItems"
            item-title="title"
            item-value="value"
            clearable
            :no-data-text="t('auditLog.filters.noEvent')"
            :error-messages="fieldError('eventKey')"
          >
            <template #item="{ props: itemProps, item }">
              <v-list-item v-bind="itemProps" :prepend-icon="item.raw.kind === 'prefix' ? 'mdi-folder-outline' : 'mdi-circle-small'" />
            </template>
          </v-autocomplete>
          <v-autocomplete
            v-model="draft.userId"
            class="ek-audit-view__user"
            :label="t('auditLog.filters.user')"
            :items="users"
            item-title="name"
            item-value="id"
            clearable
            :no-data-text="t('auditLog.filters.noUser')"
            :error-messages="fieldError('userId')"
          />
          <v-select
            v-model="draft.result"
            class="ek-audit-view__result"
            :label="t('auditLog.filters.result')"
            :items="resultItems"
            item-title="title"
            item-value="value"
            clearable
          />
          <template #extra-actions>
            <span class="ek-audit-view__presets" role="group" :aria-label="t('auditLog.filters.presetsAria')">
              <EkButton v-for="p in PRESETS" :key="p" tone="ghost" size="sm" @click="applyPreset(p)">
                {{ t('auditLog.filters.preset', { days: p }) }}
              </EkButton>
            </span>
          </template>
        </EkFilterPanel>
        <p v-if="hasDraftErrors" class="ek-audit-view__invalid" role="alert">
          <v-icon icon="mdi-alert-circle-outline" size="16" aria-hidden="true" />
          {{ t('auditLog.validation.blocked') }}
        </p>
        <EkActiveFilters :filters="activeChips" @remove="removeChip" @clear="resetFilters" />
      </template>

      <template #toolbar>
        <div class="ek-audit-view__toolbar">
          <p class="ek-audit-view__summary" aria-live="polite">
            <template v-if="state === 'ready'">
              <strong class="ek-num">{{ formatNumber(total) }}</strong>
              {{ t('auditLog.summary', { from: applied.from, to: applied.to }) }}
            </template>
            <template v-else-if="state === 'loading'">{{ t('auditLog.loading') }}</template>
          </p>
          <span class="ek-audit-view__order">
            <v-icon icon="mdi-sort-clock-descending-outline" size="16" aria-hidden="true" />
            {{ t('auditLog.order') }}
          </span>
        </div>
      </template>

      <EkErrorState v-if="state === 'error'" size="inline" class="ek-audit-view__error" :message="t('auditLog.loadError')" @retry="load" />
      <EkDataGrid
        v-else
        :columns="columns"
        :rows="rows"
        :label="t('auditLog.gridAria')"
        row-key="id"
        label-key="eventLabel"
        :loading="state === 'loading'"
        :skeleton-rows="8"
        :empty-title="activeChips.length ? t('auditLog.empty.filteredTitle') : t('auditLog.empty.title')"
        :empty-text="activeChips.length ? t('auditLog.empty.filteredText') : t('auditLog.empty.text')"
        :empty-icon="activeChips.length ? 'mdi-filter-off-outline' : 'mdi-clipboard-text-clock-outline'"
        @row-click="openDetail"
      >
        <template #cell-at="{ row }">
          <span class="ek-audit-view__time ek-num" :title="row.atFull">{{ row.atText }}</span>
        </template>
        <template #cell-event="{ row }">
          <button type="button" class="ek-audit-view__event-btn" :aria-label="t('auditLog.openDetail', { event: row.eventLabel })" @click.stop="openDetail(row)">
            <v-icon :icon="row.icon" size="16" class="ek-audit-view__event-icon" aria-hidden="true" />
            <span class="ek-audit-view__event-text">
              <span class="ek-audit-view__event-label">{{ row.eventLabel }}</span>
              <code v-if="row.eventLabel !== row.event" class="ek-audit-view__event-code">{{ row.event }}</code>
            </span>
          </button>
        </template>
        <template #cell-user="{ row }">
          <span v-if="row.userName" class="ek-audit-view__user-name">{{ row.userName }}</span>
          <span v-else-if="row.userId" class="ek-audit-view__user-unknown">
            {{ t('auditLog.userUnknown') }} <code>{{ row.userShort }}</code>
          </span>
          <span v-else class="ek-audit-view__user-unknown">{{ t('auditLog.userSystem') }}</span>
        </template>
        <template #cell-result="{ row }">
          <EkStatusChip :tone="row.resultTone" :label="row.resultLabel" />
        </template>
        <template #cell-details="{ row }">
          <span class="ek-audit-view__details">{{ row.detailsText || '—' }}</span>
        </template>
        <template #empty-action>
          <EkButton v-if="activeChips.length" tone="secondary" size="sm" icon="mdi-filter-remove-outline" @click="resetFilters">
            {{ t('auditLog.empty.clear') }}
          </EkButton>
        </template>
      </EkDataGrid>

      <template #pager>
        <EkPagerBar
          :page="page"
          :page-size="limit"
          :total="total"
          :page-size-options="[...PAGE_SIZE_OPTIONS]"
          :label="t('auditLog.pagerAria')"
          @update:page="onPage"
          @update:page-size="onPageSize"
        />
      </template>
    </EkListFrame>

    <EkDetailSheet v-if="selected" v-model="detailOpen" :identity="selected.eventLabel">
      <template #status>
        <EkStatusChip :tone="selected.resultTone" :label="selected.resultLabel" />
      </template>
      <EkSection :title="t('auditLog.detail.event')">
        <dl class="ek-audit-view__kv">
          <div><dt>{{ t('auditLog.detail.at') }}</dt><dd class="ek-num">{{ selected.atFull }}</dd></div>
          <div><dt>{{ t('auditLog.detail.eventName') }}</dt><dd><code>{{ selected.event }}</code></dd></div>
          <div>
            <dt>{{ t('auditLog.detail.user') }}</dt>
            <dd>
              <template v-if="selected.userName">{{ selected.userName }}</template>
              <template v-else-if="selected.userId">{{ t('auditLog.userUnknown') }}</template>
              <template v-else>{{ t('auditLog.userSystem') }}</template>
              <code v-if="selected.userId" class="ek-audit-view__muted-code">{{ selected.userId }}</code>
            </dd>
          </div>
          <div><dt>{{ t('auditLog.detail.result') }}</dt><dd>{{ selected.resultLabel }}</dd></div>
          <div><dt>{{ t('auditLog.detail.id') }}</dt><dd><code class="ek-audit-view__muted-code">{{ selected.id }}</code></dd></div>
        </dl>
      </EkSection>
      <EkSection :title="t('auditLog.detail.meta')" :description="t('auditLog.detail.metaHint')">
        <dl v-if="selected.meta.length" class="ek-audit-view__kv">
          <div v-for="m in selected.meta" :key="m.key">
            <dt>{{ m.label }}</dt>
            <dd>{{ m.value }}</dd>
          </div>
        </dl>
        <p v-else class="ek-audit-view__no-meta">{{ t('auditLog.detail.noMeta') }}</p>
      </EkSection>
    </EkDetailSheet>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkListFrame from '@/components/ds/EkListFrame.vue'
import EkFilterPanel from '@/components/ds/EkFilterPanel.vue'
import EkActiveFilters, { type EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue'
import EkDataGrid, { type EkGridColumn } from '@/components/ds/EkDataGrid.vue'
import EkPagerBar from '@/components/ds/EkPagerBar.vue'
import EkDetailSheet from '@/components/ds/EkDetailSheet.vue'
import EkSection from '@/components/ds/EkSection.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import { formatDateTime, formatNumber } from '@/composables/format'
import type { StatusTone } from '@/design/status-map'
import {
  DEFAULT_LIMIT, PAGE_SIZE_OPTIONS, RESULTS, buildRequest, defaultRange, emptyFilters, eventIcon, eventKeyLabel, eventLabel,
  eventOptions, metaRows, presetRange, resultPresentation, shortId, useAuditLogApi, validateFilters,
  type AuditFilters, type AuditLogEntry, type AuditResult, type AuditUser, type FilterErrors,
} from '@/composables/useAuditLogApi'

interface AuditRow {
  id: string
  at: string
  atText: string
  atFull: string
  event: string
  eventLabel: string
  icon: string
  userId: string | null
  userName: string | null
  userShort: string
  resultTone: StatusTone
  resultLabel: string
  detailsText: string
  meta: { key: string; label: string; value: string }[]
}

const { t } = useI18n()
const api = useAuditLogApi()

const PRESETS = [7, 30, 90] as const

const state = ref<'loading' | 'ready' | 'error' | 'forbidden'>('loading')
/** Dar ekranda (<768px) filtre paneli kapalı başlar: liste ilk ekranda görünür; aktif filtreler çip olarak kalır. */
const filtersCollapsed = ref(typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches)
const draft = reactive<AuditFilters>(emptyFilters())
const applied = reactive<AuditFilters>(emptyFilters())
const draftErrors = ref<FilterErrors>({})
const page = ref(1)
const limit = ref<number>(DEFAULT_LIMIT)
const total = ref(0)
const logs = ref<AuditLogEntry[]>([])
const users = ref<AuditUser[]>([])
const detailOpen = ref(false)
const selected = ref<AuditRow | null>(null)
let requestSeq = 0

const eventItems = eventOptions()
const resultItems = computed(() => RESULTS.map((r) => ({ value: r, title: t(`auditLog.result.${r}`) })))

const columns = computed<EkGridColumn[]>(() => [
  { key: 'at', label: t('auditLog.col.at'), width: '168px' },
  { key: 'event', label: t('auditLog.col.event') },
  { key: 'user', label: t('auditLog.col.user'), width: '200px' },
  { key: 'result', label: t('auditLog.col.result'), width: '120px' },
  { key: 'details', label: t('auditLog.col.details'), type: 'muted' },
])

const userNames = computed(() => new Map(users.value.map((u) => [u.id, u.name])))

const rows = computed<AuditRow[]>(() =>
  logs.value.map((l) => {
    const rp = resultPresentation(l.result)
    const meta = metaRows(l.meta)
    return {
      id: l.id,
      at: l.at,
      atText: formatDateTime(l.at),
      atFull: formatDateTime(l.at),
      event: l.event,
      eventLabel: eventLabel(l.event),
      icon: eventIcon(l.event),
      userId: l.userId,
      userName: l.userId ? userNames.value.get(l.userId) ?? null : null,
      userShort: l.userId ? shortId(l.userId) : '',
      resultTone: rp.tone,
      resultLabel: rp.labelKey ? t(rp.labelKey) : String(l.result ?? '—'),
      detailsText: meta.slice(0, 2).map((m) => `${m.label}: ${m.value}`).join(' · '),
      meta,
    }
  }),
)

// ---- Aktif filtre çipleri (UYGULANMIŞ filtreden) ----
const activeChips = computed<EkActiveFilterChip[]>(() => {
  const chips: EkActiveFilterChip[] = []
  const def = defaultRange()
  if (applied.from !== def.from || applied.to !== def.to) chips.push({ key: 'range', label: t('auditLog.chip.range'), value: `${applied.from} – ${applied.to}` })
  if (applied.eventKey) chips.push({ key: 'eventKey', label: t('auditLog.chip.event'), value: eventKeyLabel(applied.eventKey) })
  if (applied.userId) chips.push({ key: 'userId', label: t('auditLog.chip.user'), value: userNames.value.get(applied.userId) ?? shortId(applied.userId) })
  if (applied.result) chips.push({ key: 'result', label: t('auditLog.chip.result'), value: t(`auditLog.result.${applied.result}`) })
  return chips
})

const hasDraftErrors = computed(() => Object.keys(draftErrors.value).length > 0)

function fieldError(field: keyof FilterErrors): string[] {
  const key = draftErrors.value[field]
  return key ? [t(key, { max: 366 })] : []
}

function copyInto(target: AuditFilters, source: AuditFilters) {
  target.from = source.from
  target.to = source.to
  target.eventKey = source.eventKey ?? null
  target.userId = source.userId ?? null
  target.result = (source.result ?? null) as AuditResult | null
}

async function load() {
  const req = buildRequest(applied, page.value, limit.value)
  if (!req) return // uygulanmış filtre her zaman doğrulanmış olur; savunma amaçlı
  const seq = ++requestSeq
  state.value = 'loading'
  const res = await api.getAuditLogs(req)
  if (seq !== requestSeq) return // daha yeni bir istek yanıtı bekleniyor
  if (res.ok) {
    logs.value = res.data.logs
    total.value = res.data.totalNumberOfRecords
    state.value = 'ready'
  } else {
    logs.value = []
    total.value = 0
    state.value = res.status === 403 ? 'forbidden' : 'error'
  }
}

function applyFilters() {
  const errors = validateFilters(draft)
  draftErrors.value = errors
  if (Object.keys(errors).length) return // 400 önlenir: geçersiz filtre gönderilmez
  copyInto(applied, draft)
  page.value = 1
  load()
}

function resetFilters() {
  const fresh = emptyFilters()
  copyInto(draft, fresh)
  copyInto(applied, fresh)
  draftErrors.value = {}
  page.value = 1
  load()
}

function applyPreset(days: number) {
  const r = presetRange(days)
  draft.from = r.from
  draft.to = r.to
  applyFilters()
}

function removeChip(key: string) {
  if (key === 'range') {
    const def = defaultRange()
    draft.from = applied.from = def.from
    draft.to = applied.to = def.to
  } else if (key === 'eventKey') draft.eventKey = applied.eventKey = null
  else if (key === 'userId') draft.userId = applied.userId = null
  else if (key === 'result') draft.result = applied.result = null
  draftErrors.value = validateFilters(draft)
  page.value = 1
  load()
}

function onPage(p: number) {
  page.value = p
  load()
}

function onPageSize(size: number) {
  limit.value = (PAGE_SIZE_OPTIONS as readonly number[]).includes(size) ? size : DEFAULT_LIMIT
  page.value = 1
  load()
}

/** `EkDataGrid` satırları jenerik (`Record<string, any>`) yayar; satırlar bu ekranın `rows` hesabından gelir. */
function openDetail(row: Record<string, any>) {
  selected.value = row as AuditRow
  detailOpen.value = true
}

onMounted(async () => {
  // Kullanıcı listesi yalnızca ad çözümü içindir; başarısızlığı listeyi engellemez.
  api.getUsers().then((list) => (users.value = list))
  await load()
})
</script>

<style scoped>
.ek-audit-view {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-6);
  overflow: hidden;
}

.ek-audit-view__frame {
  flex: 1;
  min-height: 0;
}

.ek-audit-view__presets {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}

.ek-audit-view__invalid {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-caption-size);
}

.ek-audit-view__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--ek-space-2) var(--ek-space-4);
  min-height: 44px;
  padding: var(--ek-space-2) var(--ek-space-4);
  background: var(--ek-color-surface-muted);
}

.ek-audit-view__summary {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

.ek-audit-view__summary strong {
  color: var(--ek-color-content-strong);
}

.ek-audit-view__order {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-audit-view__error {
  margin: var(--ek-space-6);
}

.ek-audit-view__time {
  color: var(--ek-color-content-default);
  white-space: nowrap;
}

.ek-audit-view__event-btn {
  display: inline-flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  max-width: 100%;
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ek-audit-view__event-btn:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-audit-view__event-btn:hover .ek-audit-view__event-label {
  color: var(--ek-color-action-emphasis);
  text-decoration: underline;
}

.ek-audit-view__event-icon {
  flex: none;
  margin-top: 2px;
  color: var(--ek-color-content-muted);
}

.ek-audit-view__event-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ek-audit-view__event-label {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.ek-audit-view__event-code,
.ek-audit-view__user-unknown code,
.ek-audit-view__muted-code {
  color: var(--ek-color-content-muted);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
}

.ek-audit-view__user-name {
  color: var(--ek-color-content-default);
}

.ek-audit-view__user-unknown {
  color: var(--ek-color-content-muted);
}

.ek-audit-view__details {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.ek-audit-view__kv {
  display: grid;
  gap: var(--ek-space-3);
  margin: 0;
}

.ek-audit-view__kv > div {
  display: grid;
  grid-template-columns: minmax(0, 11rem) minmax(0, 1fr);
  gap: var(--ek-space-3);
  padding-bottom: var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ek-audit-view__kv > div:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.ek-audit-view__kv dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  line-height: var(--ek-type-label-line);
  text-transform: uppercase;
}

.ek-audit-view__kv dd {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-2);
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-label-line);
}

.ek-audit-view__no-meta {
  margin: 0;
  color: var(--ek-color-content-muted);
}

@media (max-width: 767px) {
  .ek-audit-view {
    position: static;
    padding: var(--ek-space-4);
    overflow: visible;
  }

  .ek-audit-view__kv > div {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-1);
  }
}
</style>
