<!--
  AttentionBoard — genel bakışın DİKKAT PANOSU (kabuk: BoVerdictCard; dallar: BoAttentionBranch). Tek kutuda, büyükten küçüğe:
    1. Hero: hüküm (tek cümle) + ölçüm göstergeleri (kritik · izlenmeli; sistem/müşteri oran çubuğu)
    2. Önce bu: en büyük taş — hükmün alt satırı, aynı metin sütununda (başlıkla yarışmaz, ilk konu olduğu belli)
    3. Sistem / Müşteriler — kutunun ayraçlı dalları, kapalı başlar; açınca maddeler, maddeden ayrıntı (AttentionScope)
  Ciddiyet tonu tek değişkendedir (`--ov-tone`): kalın renkli çerçeve ya da degrade yok — ton yalnız işaret, etiket ve sayaçlarda.
  Sayfa içi çapaya göndermez; her şey bu kutunun içinde katman katman açılır.
-->
<template>
  <BoVerdictCard :health="health" :verdict="verdict" :summary="summary" :badge-label="badgeLabel" :loading="loading" :first="firstCard" :pills="pills" data-testid="status-header">
    <template v-if="!model && error" #error>
      <BoPanelState state="error" :error="error" error-text="Genel durum okunamadı" :retrying="retrying" @retry="$emit('retry')" />
    </template>

    <template #meter>
      <dl class="ov-meter" data-testid="attention-stats">
        <div v-for="s in stats" :key="s.key" class="ov-meter__cell" :class="`is-${s.tone}`" :data-kpi="s.key">
          <dt class="ov-meter__label">{{ s.label }}</dt>
          <dd class="ov-meter__num ek-num">{{ s.value }}</dd>
          <dd class="ov-meter__bar" role="img" :aria-label="`Sistem ${s.system}, müşteri ${s.tenant}`">
            <span v-if="s.system" class="ov-meter__seg is-sys" :style="{ flexGrow: s.system }"></span>
            <span v-if="s.tenant" class="ov-meter__seg is-ten" :style="{ flexGrow: s.tenant }"></span>
          </dd>
          <dd class="ov-meter__legend" aria-hidden="true">
            <span><i class="is-sys"></i>Sistem <b class="ek-num">{{ s.system }}</b></span>
            <span><i class="is-ten"></i>Müşteri <b class="ek-num">{{ s.tenant }}</b></span>
          </dd>
        </div>
      </dl>
    </template>

    <BoAttentionBranch
      id="sistem"
      title="Sistem"
      icon="mdi-server-outline"
      :items="model?.items.system ?? []"
      :health="sys.health"
      :answer="sys.answer"
      :state="listState"
      :error="error"
      :retrying="retrying"
      :total="model?.total.system ?? 0"
      :checks="model?.checks.system ?? []"
      :degraded="model?.degraded.system ?? []"
      :limit="limit"
      ok-title="Müdahale gereken bir şey yok"
      :more="{ label: 'Uyarılar', to: { name: 'alerts' } }"
      @retry="$emit('retry')"
    />
    <BoAttentionBranch
      id="musteriler"
      title="Müşteriler"
      icon="mdi-account-group-outline"
      :items="model?.items.tenant ?? []"
      :health="ten.health"
      :answer="ten.answer"
      :state="model?.source === 'fallback' ? 'unsupported' : listState"
      :error="error"
      :retrying="retrying"
      :total="model?.total.tenant ?? 0"
      :checks="model?.checks.tenant ?? []"
      :degraded="model?.degraded.tenant ?? []"
      :limit="limit"
      ok-title="Müdahale gereken bir şey yok"
      unsupported-text="Sunucu müşteri bazlı özeti sağladığında burada görünür."
      :more="{ label: 'Müşteriler', to: { name: 'tenants' } }"
      @retry="$emit('retry')"
    />
  </BoVerdictCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BoPanelState from '@bo/components/shell/BoPanelState.vue'
import type { AttentionState } from '@bo/components/triage/BoAttentionList.vue'
import { countText, healthOf, type Health } from '@bo/components/triage/triage'
import type { AttentionItem, AttentionModel } from '@bo/api/attention'
import BoVerdictCard, { type VerdictFirst } from '@bo/components/triage/BoVerdictCard.vue'
import BoAttentionBranch from '@bo/components/triage/BoAttentionBranch.vue'
import '@bo/styles/kit.css'

const props = withDefaults(defineProps<{ model: AttentionModel | null; error?: unknown; retrying?: boolean; limit?: number }>(), { limit: 3 })
defineEmits<{ retry: [] }>()

const loading = computed(() => !props.model)
const listState = computed<AttentionState>(() => (props.model ? 'ready' : props.error ? 'error' : 'loading'))

const sysItems = computed(() => props.model?.items.system ?? [])
const tenItems = computed(() => props.model?.items.tenant ?? [])
const items = computed<AttentionItem[]>(() => [...sysItems.value, ...tenItems.value])
const degradedAll = computed(() => [...(props.model?.degraded.system ?? []), ...(props.model?.degraded.tenant ?? [])])
const bySev = (list: AttentionItem[], s: AttentionItem['severity']) => list.filter((i) => i.severity === s).length
const critical = computed(() => bySev(items.value, 'critical'))
const warnings = computed(() => bySev(items.value, 'warning'))

function scope(list: AttentionItem[], degraded: string[], unsupported = false): { health: Health; answer: string } {
  if (unsupported) return { health: 'unknown', answer: 'Bağlı değil' }
  if (!props.model) return { health: 'unknown', answer: '' }
  const urgent = list.filter((i) => i.severity !== 'info')
  if (urgent.length) return { health: healthOf(list), answer: countText(urgent) }
  if (degraded.length) return { health: 'warning', answer: 'Eksik veri' }
  return { health: 'ok', answer: 'Sorun yok' }
}
const sys = computed(() => scope(sysItems.value, props.model?.degraded.system ?? []))
const ten = computed(() => scope(tenItems.value, props.model?.degraded.tenant ?? [], props.model?.source === 'fallback'))

const health = computed<Health>(() => (critical.value ? 'critical' : warnings.value || degradedAll.value.length ? 'warning' : 'ok'))
const badgeLabel = computed(() => (!critical.value && !warnings.value && degradedAll.value.length ? 'Kısmi bozulma' : undefined))

const verdict = computed(() => {
  const c = critical.value
  const w = warnings.value
  if (c) return `${c} konu şimdi müdahale istiyor`
  if (w) return `Acil bir şey yok; ${w} konu izlenmeli`
  if (degradedAll.value.length) return `${degradedAll.value.join(', ')} okunamadı — durum eksik olabilir`
  return 'Her şey yolunda'
})

/** İkinci cümle: nerede yoğunlaştığı (ayrıntıya boğmadan). */
const summary = computed(() => {
  const c = critical.value
  const w = warnings.value
  if (c || w) {
    const urgentIn = (list: AttentionItem[]) => list.some((i) => i.severity !== 'info')
    const where = [urgentIn(sysItems.value) && 'sistemde', urgentIn(tenItems.value) && 'müşterilerde'].filter(Boolean)
    const tail = c && w ? ` Ayrıca ${w} konu izlenmeli.` : ''
    return `Sorunlar ${where.join(' ve ')} toplanıyor.${tail}`
  }
  const scopeText = props.model?.source === 'fallback' ? 'Sistem denetimleri olağan; müşteri denetimleri henüz bağlı değil.' : 'Sistem ve müşteri denetimleri olağan aralıkta.'
  const infos = items.value.length
  return infos ? `${scopeText} ${infos} bilgi notu var.` : scopeText
})

const stats = computed(() => [
  { key: 'critical', label: 'Şimdi müdahale', value: critical.value, system: bySev(sysItems.value, 'critical'), tenant: bySev(tenItems.value, 'critical'), tone: critical.value ? 'critical' : 'neutral' },
  { key: 'warning', label: 'İzlenmeli', value: warnings.value, system: bySev(sysItems.value, 'warning'), tenant: bySev(tenItems.value, 'warning'), tone: warnings.value ? 'warning' : 'neutral' },
])

/** En büyük taş: en ağır önemdeki eylemli madde; aynı önemde SİSTEM önce (çok müşteriyi etkiler). */
const first = computed(() => {
  const urgent = items.value.filter((i) => i.severity !== 'info' && i.action)
  const top = urgent.some((i) => i.severity === 'critical') ? 'critical' : 'warning'
  return urgent.find((i) => i.severity === top && i.scope === 'system') ?? urgent.find((i) => i.severity === top)
})
const firstTitle = computed(() => {
  const f = first.value
  if (!f) return ''
  const s = f.subjects
  if (s.length === 1) return `${f.title} — #${s[0].tid}${s[0].name ? ` ${s[0].name}` : ''}`
  return f.count ? `${f.title} (${f.count})` : f.title
})
const pills = computed(() => [
  ...(critical.value ? [{ tone: 'critical' as const, label: `${critical.value} kritik` }] : []),
  ...(warnings.value ? [{ tone: 'warning' as const, label: `${warnings.value} uyarı` }] : []),
])
const firstCard = computed<VerdictFirst | undefined>(() =>
  first.value ? { severity: first.value.severity === 'critical' ? 'critical' : 'warning', title: firstTitle.value, detail: first.value.advice ?? first.value.why, since: first.value.since, actionLabel: first.value.action!.label, to: first.value.action!.to } : undefined,
)
</script>

<style scoped>
/* ---------- ölçüm göstergeleri: büyük sayı + sistem/müşteri oran çubuğu ---------- */
.ov-meter {
  display: grid;
  grid-auto-columns: minmax(168px, 1fr);
  grid-auto-flow: column;
  flex: none;
  margin: 0;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-lg);
  background: color-mix(in srgb, var(--ek-color-surface) 85%, transparent);
}

.ov-meter__cell {
  --cell: var(--ek-color-content-subtle);
  --cell-strong: var(--ek-color-content-strong);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--ek-space-4);
}

.ov-meter__cell.is-critical,
.ov-meter__cell.is-warning {
  background: color-mix(in srgb, var(--cell) var(--cell-wash), var(--ek-color-surface));
}

.ov-meter__cell.is-critical {
  --cell-wash: 8%;
}

.ov-meter__cell.is-warning {
  --cell-wash: 20%;
}

.ov-meter__cell:first-child {
  border-radius: var(--ek-radius-lg) 0 0 var(--ek-radius-lg);
}

.ov-meter__cell:last-child {
  border-radius: 0 var(--ek-radius-lg) var(--ek-radius-lg) 0;
}

.ov-meter__cell + .ov-meter__cell {
  border-left: 1px solid var(--ek-color-border-subtle);
}

.ov-meter__cell.is-critical {
  --cell: var(--ek-color-error);
  --cell-strong: var(--ek-color-error-emphasis);
}

.ov-meter__cell.is-warning {
  --cell: var(--ov-warn-fill);
  --cell-strong: var(--ov-warn-ink);
}

.ov-meter dd {
  margin: 0;
}

.ov-meter__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ov-meter__num {
  color: var(--cell-strong);
  font-size: var(--ek-type-display-size);
  line-height: 1;
  font-weight: var(--ek-type-display-weight);
  letter-spacing: var(--ek-type-display-tracking);
}

.ov-meter__bar {
  display: flex;
  gap: 2px;
  height: 6px;
  overflow: hidden;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-sunken);
}

.ov-meter__seg {
  flex-basis: 0;
  border-radius: var(--ek-radius-full);
}

.ov-meter__seg.is-sys,
.ov-meter__legend i.is-sys {
  background: var(--cell);
}

.ov-meter__seg.is-ten,
.ov-meter__legend i.is-ten {
  background: color-mix(in srgb, var(--cell) 42%, var(--ek-color-surface));
}

.ov-meter__legend {
  display: flex;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  white-space: nowrap;
}

.ov-meter__legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.ov-meter__legend i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.ov-meter__legend b {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

@media (max-width: 1100px) {
  .ov-meter {
    margin-left: 0;
  }
}

@media (max-width: 600px) {
  .ov-meter {
    grid-auto-columns: minmax(0, 1fr);
    margin-left: 0;
  }

  .ov-meter__num {
    font-size: var(--ek-type-metric-size);
  }
}

/* ================= BO-LOCAL-01 — ölçüm şeridi: uygulamanın tasarım diliyle =================
   Tek şerit, hücreler ince çizgiyle ayrılır (KPI şeridiyle aynı aile); ton hücresi tonun DÜZ açık zemini (uydurma
   karışım yok); kutu köşesi; müşteri payı aynı rengin soluk hâli. */
.ov-meter {
  overflow: hidden;
  border-color: var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
}

.ov-meter__cell:first-child,
.ov-meter__cell:last-child {
  border-radius: 0;
}

.ov-meter__cell.is-critical {
  background: var(--ek-color-error-subtle);
}

.ov-meter__cell.is-warning {
  background: var(--ek-color-warning-subtle);
}

.ov-meter__seg.is-ten,
.ov-meter__legend i.is-ten {
  background: var(--cell);
  opacity: 0.4;
}
</style>
