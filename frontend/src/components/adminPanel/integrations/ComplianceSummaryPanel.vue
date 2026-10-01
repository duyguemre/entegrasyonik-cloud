<!--
  frontend/src/components/adminPanel/integrations/ComplianceSummaryPanel.vue

  ADR-0018 Karar 2 "Konsol" — entegrasyon başına özet kartları (`IntegrationComplianceService.summary()`).
  Yalnız backend'in GERÇEKTEN döndürdüğü alanlar gösterilir: `adapterVersion`, `lastVerifiedAt`,
  `openFindings.bySeverity`, `lastProbeRun`. "İzlenen kaynakların durumu" (ADR maddesi) bu uçta YOK —
  gösterilmez (uydurulmaz).

  Son probe turu (DÜRÜSTLÜK NOTU): backend `lastProbeRun`'ı TEK bir platform-düzeyi JobState
  (`compliance.probeRunner`) kaydından okuyup HER karta AYNI değeri koyar. Bu yüzden kart başına
  tekrarlanmaz; kartların üstünde TEK bir "son probe turu" bandı olarak, kapsam notuyla gösterilir.

  Kartlar `<button>`dır (aria-pressed): tıklamak ana listeyi o entegrasyona süzer (ikinci tık kaldırır).
-->
<template>
  <section class="compliance-summary" aria-labelledby="compliance-summary-title">
    <div class="compliance-summary__header">
      <h2 id="compliance-summary-title" class="compliance-summary__title">{{ t('integrationCompliance.summary.title') }}</h2>
      <p class="compliance-summary__description">{{ t('integrationCompliance.summary.description') }}</p>
    </div>

    <EkSkeleton v-if="state === 'loading'" type="cards" />
    <EkErrorState v-else-if="state === 'error'" size="inline" :message="t('integrationCompliance.summary.loadError')" @retry="emit('retry')" />
    <p v-else-if="!items.length" class="compliance-summary__muted">{{ t('integrationCompliance.summary.empty') }}</p>
    <template v-else>
      <div class="compliance-summary__probe" role="group" :aria-label="t('integrationCompliance.probe.title')">
        <v-icon icon="mdi-radar" size="18" class="compliance-summary__probe-icon" aria-hidden="true" />
        <div class="compliance-summary__probe-main">
          <div class="compliance-summary__probe-line">
            <span class="compliance-summary__probe-label">{{ t('integrationCompliance.probe.title') }}</span>
            <template v-if="probe">
              <EkStatusChip v-if="probeOutcome" :tone="probeOutcome.tone" :label="t(probeOutcome.labelKey)" />
              <span v-else class="compliance-summary__probe-meta">{{ t('integrationCompliance.probe.notFinished') }}</span>
              <span v-if="probe.lastFinishedAt" class="compliance-summary__probe-meta ek-num">{{ formatDateTime(probe.lastFinishedAt) }}</span>
              <span v-if="probeCounts" class="compliance-summary__probe-meta">{{ probeCounts }}</span>
            </template>
            <span v-else class="compliance-summary__probe-meta">{{ t('integrationCompliance.probe.never') }}</span>
          </div>
          <p class="compliance-summary__probe-note">{{ t('integrationCompliance.probe.scopeNote') }}</p>
        </div>
      </div>

      <ul class="compliance-summary__grid">
        <li v-for="item in items" :key="item.integrationCode">
          <button
            type="button"
            class="compliance-summary__card"
            :class="{ 'compliance-summary__card--active': activeCode === item.integrationCode }"
            :aria-pressed="activeCode === item.integrationCode"
            :aria-label="cardAriaLabel(item)"
            @click="emit('select', item.integrationCode)"
          >
            <span class="compliance-summary__card-top">
              <span class="compliance-summary__identity">
                <EkPlatformMark :name="item.displayName" :code="item.integrationCode" />
                <span class="compliance-summary__category">{{ categoryLabel(item.category) }}</span>
              </span>
              <span class="compliance-summary__chips">
                <template v-if="item.openFindings.total > 0">
                  <EkStatusChip
                    v-for="sev in severitiesWithCount(item)"
                    :key="sev"
                    :tone="FINDING_SEVERITY_TONE[sev].tone"
                    :label="t('integrationCompliance.summary.severityCount', { label: t(FINDING_SEVERITY_TONE[sev].labelKey), n: item.openFindings.bySeverity[sev] })"
                  />
                </template>
                <EkStatusChip v-else tone="success" :label="t('integrationCompliance.summary.noOpen')" />
              </span>
            </span>

            <span class="compliance-summary__facts">
              <span>{{ t('integrationCompliance.summary.adapterVersion') }} <span class="compliance-summary__fact-value ek-num">{{ item.adapterVersion || '—' }}</span></span>
              <span aria-hidden="true">·</span>
              <span>
                {{ t('integrationCompliance.summary.lastVerifiedAt') }}
                <span class="compliance-summary__fact-value ek-num">{{ item.lastVerifiedAt ? formatDate(item.lastVerifiedAt) : t('integrationCompliance.summary.notVerified') }}</span>
              </span>
            </span>
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EkSkeleton, EkErrorState, EkStatusChip, EkPlatformMark } from '@entegrasyonik/ui/components'
import { FINDING_SEVERITY_TONE, JOB_RUN_OUTCOME_TONE, type JobRunOutcome } from '@/design/status-map'
import { formatDate, formatDateTime } from '@entegrasyonik/ui/format'
import { FINDING_SEVERITIES, type ComplianceSummaryItem, type FindingSeverity, type LastProbeRun } from './useIntegrationComplianceApi'

const props = defineProps<{
  items: ComplianceSummaryItem[]
  state: 'loading' | 'ready' | 'error'
  activeCode?: string | null
}>()

const emit = defineEmits<{ select: [code: string]; retry: [] }>()

const { t, te } = useI18n()

function categoryLabel(code: string) {
  const key = `integrationCompliance.category.${code}`
  return te(key) ? t(key) : code
}

/** Backend her karta AYNI `lastProbeRun`'ı koyar (tek platform turu) — ilk dolu olanı alınır. */
const probe = computed<LastProbeRun | null>(() => props.items.find((i) => i.lastProbeRun)?.lastProbeRun ?? null)

const probeOutcome = computed(() => {
  const status = probe.value?.lastStatus
  return status && status in JOB_RUN_OUTCOME_TONE ? JOB_RUN_OUTCOME_TONE[status as JobRunOutcome] : null
})

/** `lastCounts` backend'de `unknown` (Mixed): yalnız sayısal `processed`/`failed` varsa gösterilir, başka alan UYDURULMAZ. */
const probeCounts = computed(() => {
  const counts = probe.value?.lastCounts as Record<string, unknown> | null | undefined
  if (!counts || typeof counts !== 'object') return ''
  const parts: string[] = []
  if (typeof counts.processed === 'number') parts.push(t('integrationCompliance.probe.processed', { n: counts.processed }))
  if (typeof counts.failed === 'number') parts.push(t('integrationCompliance.probe.failed', { n: counts.failed }))
  return parts.join(' · ')
})

function severitiesWithCount(item: ComplianceSummaryItem): FindingSeverity[] {
  return FINDING_SEVERITIES.filter((s) => (item.openFindings.bySeverity?.[s] ?? 0) > 0)
}

function cardAriaLabel(item: ComplianceSummaryItem) {
  return props.activeCode === item.integrationCode
    ? t('integrationCompliance.summary.filterActive', { name: item.displayName })
    : t('integrationCompliance.summary.filterBy', { name: item.displayName })
}
</script>

<style scoped>
.compliance-summary {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  margin-bottom: var(--ek-space-8);
}

.compliance-summary__header {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.compliance-summary__title {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  margin: 0;
}

.compliance-summary__description {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
  margin: 0;
}

.compliance-summary__muted {
  color: var(--ek-color-content-muted);
}

.compliance-summary__probe {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface-muted);
}

.compliance-summary__probe-icon {
  color: var(--ek-color-content-muted);
  margin-top: 1px;
}

.compliance-summary__probe-main {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.compliance-summary__probe-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  font-size: var(--ek-font-size-sm);
}

.compliance-summary__probe-label {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.compliance-summary__probe-meta {
  color: var(--ek-color-content-default);
}

.compliance-summary__probe-note {
  font-size: var(--ek-font-size-xs);
  /* `surface-muted` zemininde `content-muted` 4,48:1 (AA altı, claims.spec.ts notu) — bu yüzden `content-default`. */
  color: var(--ek-color-content-default);
  margin: 0;
}

.compliance-summary__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ek-space-4);
}

@media (max-width: 1279px) {
  .compliance-summary__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .compliance-summary__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.compliance-summary__card {
  width: 100%;
  height: 100%;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  color: var(--ek-color-content-default);
  cursor: pointer;
  transition: border-color var(--ek-motion-feedback);
}

.compliance-summary__card:hover {
  border-color: var(--ek-color-border-strong);
}

.compliance-summary__card--active {
  border-color: var(--ek-color-primary);
  box-shadow: inset 0 0 0 1px var(--ek-color-primary);
}

.compliance-summary__card:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.compliance-summary__card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
  min-height: 28px;
}

.compliance-summary__identity {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-2);
  min-width: 0;
}

.compliance-summary__category {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  white-space: nowrap;
}

.compliance-summary__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ek-space-1);
}

.compliance-summary__facts {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--ek-space-2);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.compliance-summary__fact-value {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}
</style>
