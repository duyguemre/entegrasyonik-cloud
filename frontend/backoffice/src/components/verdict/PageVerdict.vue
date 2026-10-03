<!--
  PageVerdict — sayfanın "Durum → Karar → Eylem" katmanları (K51; BO_UI_PATTERNS §11), genel bakışla AYNI hiyerarşide:
  tek müdahale kutusu (BoVerdictCard) → hüküm + "Önce bu" (ilk yıkıcı olmayan eylem) → kapalı başlayan "Dikkat
  isteyenler" dalı (BoAttentionBranch: maddeler → yerinde ayrıntı) → kutunun alt şeridinde diğer eylemler.
  Ayrıntı (mevcut tablolar, paneller) bu bloğun ALTINDA, "Ayrıntılar" etiketinden sonra gelir.

    <PageVerdict :verdict="verdict" />      // verdict: PageVerdict | null (null → durum denetleniyor)

  Eşleme: tone success/info → ok · warning → warning · error → critical · neutral → unknown; madde error → critical.
  `unreadable()` maddeleri listeye değil dalın "X okunamadı — Yeniden dene" notuna gider.
-->
<template>
  <BoVerdictCard
    :health="health"
    :verdict="verdict?.summary ?? ''"
    :summary="verdict?.note"
    :badge-label="badgeLabel"
    :loading="!verdict"
    :first="firstCard"
    :pills="pills"
    first-testid="verdict-first-action"
    label="Sayfa durumu"
    data-testid="page-verdict"
    :data-tone="verdict?.tone ?? 'loading'"
    @first-act="first?.onSelect?.()"
  >
    <BoAttentionBranch
      v-if="verdict && (listed.length || degraded.length || verdict.checks?.length)"
      :id="branchId"
      title="Dikkat isteyenler"
      icon="mdi-clipboard-alert-outline"
      :items="listed"
      :health="branchHealth"
      :answer="branchAnswer"
      state="ready"
      :degraded="degraded"
      :checks="verdict.checks ?? []"
      :ok-title="verdict.okTitle ?? 'Müdahale gereken bir şey yok'"
      :limit="3"
      data-testid="verdict-attention"
      @retry="retry"
    />

    <template v-if="rest.length" #footer>
      <nav class="bo-verdict-more" aria-label="Diğer eylemler" data-testid="verdict-actions">
        <span class="bo-verdict-more__k">Diğer eylemler</span>
        <ul>
          <li v-for="a in rest" :key="a.id" :data-id="a.id">
            <RouterLink v-if="a.to" :to="a.to" class="bo-verdict-more__link" :class="{ 'is-danger': a.danger }">
              <v-icon :icon="a.icon ?? 'mdi-arrow-right'" aria-hidden="true" />{{ a.label }}
            </RouterLink>
            <button v-else type="button" class="bo-verdict-more__link" :class="{ 'is-danger': a.danger }" @click="a.onSelect?.()">
              <v-icon :icon="a.guarded ? 'mdi-shield-lock-outline' : (a.icon ?? 'mdi-play-circle-outline')" aria-hidden="true" />{{ a.label }}<span v-if="a.guarded" class="ek-sr-only"> (kimlik doğrulama ve gerekçe istenir)</span>
            </button>
          </li>
        </ul>
      </nav>
    </template>
  </BoVerdictCard>

  <h2 v-if="detailsLabel" class="bo-verdict-details" data-testid="details-label">{{ detailsLabel }}</h2>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import BoVerdictCard, { type VerdictFirst } from '@bo/components/triage/BoVerdictCard.vue'
import BoAttentionBranch from '@bo/components/triage/BoAttentionBranch.vue'
import type { AttentionEntry, Health, Severity } from '@bo/components/triage/triage'
import type { AttentionTone, PageVerdict, SuggestedAction, VerdictTone } from '@bo/utils/verdict'

const props = withDefaults(defineProps<{ verdict: PageVerdict | null; detailsLabel?: string | false }>(), { detailsLabel: 'Ayrıntılar' })

const HEALTH: Record<VerdictTone, Health> = { success: 'ok', info: 'ok', warning: 'warning', error: 'critical', neutral: 'unknown' }
const SEV: Record<AttentionTone, Severity> = { error: 'critical', warning: 'warning', info: 'info' }

const health = computed<Health>(() => (props.verdict ? HEALTH[props.verdict.tone] : 'unknown'))
/** Bilgi tonlu sakin sayfa (ör. denetim) "Sağlıklı" değil kendi rozetini taşır; diğerleri HEALTH_BADGE. */
const badgeLabel = computed(() => (props.verdict && (props.verdict.tone === 'info' || props.verdict.badge !== defaultBadge(props.verdict.tone)) ? props.verdict.badge : undefined))
function defaultBadge(t: VerdictTone) {
  return { success: 'Sağlıklı', warning: 'İzlenmeli', error: 'Müdahale gerekli', info: 'Bilgi', neutral: 'Bilinmiyor' }[t]
}

const linked = computed(() => (props.verdict?.attention ?? []).filter((a) => !a.source && a.to))
const listed = computed<AttentionEntry[]>(() =>
  linked.value.map((a) => ({
    id: a.id,
    severity: SEV[a.tone],
    title: a.title,
    why: a.detail ?? undefined,
    impact: a.impact ?? null,
    advice: a.advice ?? '',
    action: { label: a.cta ?? 'Göster', to: a.to! },
    since: a.since,
    subjects: a.tenant ? [a.tenant] : undefined,
  })),
)
const pills = computed(() => {
  const c = listed.value.filter((i) => i.severity === 'critical').length
  const w = listed.value.filter((i) => i.severity === 'warning').length
  return [...(c ? [{ tone: 'critical' as const, label: `${c} kritik` }] : []), ...(w ? [{ tone: 'warning' as const, label: `${w} uyarı` }] : [])]
})
/** Dal başlığı: acil madde yoksa bilgi sayısı / eksik veri / sorun yok (acil maddelerde rozetleri dal kendisi sayar). */
const branchHealth = computed<Health>(() => (listed.value.some((i) => i.severity !== 'info') ? health.value : degraded.value.length ? 'warning' : 'ok'))
const branchAnswer = computed(() => {
  const infos = listed.value.filter((i) => i.severity === 'info').length
  if (infos) return `${infos} bilgi notu`
  return degraded.value.length ? 'Eksik veri' : 'Sorun yok'
})
const branchId = `dikkat-${Math.random().toString(36).slice(2, 8)}`
const unreadableItems = computed(() => (props.verdict?.attention ?? []).filter((a) => a.source))
const degraded = computed(() => unreadableItems.value.map((a) => a.source!))
function retry() {
  // Kaynaklar genelde tek "hepsini yenile" çağrısı paylaşır: aynı işlevi bir kez çağır.
  new Set(unreadableItems.value.map((a) => a.onSelect).filter(Boolean)).forEach((f) => f!())
}

const actions = computed<SuggestedAction[]>(() => props.verdict?.actions ?? [])
/** §11.3: yıkıcı eylem kartla önerilmez → ilk YIKICI OLMAYAN eylem kart olur. */
const first = computed<(SuggestedAction & { cta?: string }) | undefined>(() => actions.value.find((a) => !a.danger))
const rest = computed(() => actions.value.filter((a) => a !== first.value))
/** Kart düğmesi: eylemin `cta`'sı; yoksa aynı hedefe giden dikkat maddesinin bağlantı metni ("Ölü mektupları aç"); yoksa "Aç". */
const firstCta = computed(() => {
  const f = first.value
  if (!f) return ''
  if (f.cta) return f.cta
  if (!f.to) return 'Başlat…'
  const key = JSON.stringify(f.to)
  return props.verdict?.attention.find((a) => a.cta && a.to && JSON.stringify(a.to) === key)?.cta ?? 'Aç'
})
const firstCard = computed<VerdictFirst | undefined>(() => {
  const f = first.value
  if (!f) return undefined
  return {
    severity: health.value === 'critical' ? 'critical' : health.value === 'warning' ? 'warning' : 'neutral',
    title: f.label,
    detail: f.detail,
    actionLabel: firstCta.value,
    to: f.to,
    guarded: f.guarded,
  }
})
</script>

<style scoped>
.bo-verdict-more {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-3);
}

.bo-verdict-more__k,
.bo-verdict-details {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-verdict-more ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-verdict-more__link {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: 32px;
  margin: 0;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: none;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-verdict-more__link:hover {
  border-color: var(--ek-color-border-strong);
}

.bo-verdict-more__link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-verdict-more__link .v-icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.bo-verdict-more__link.is-danger .v-icon {
  color: var(--ek-color-error-emphasis);
}

.bo-verdict-details {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}

.bo-verdict-details::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ek-color-border-subtle);
}

/* BO-LOCAL-01 — "Ayrıntılar" ve "Diğer eylemler" etiketleri: kısa eylem çizgili mikro etiket (uzun ayraç çizgisi yok);
   diğer eylem bağlantıları çerçeveli köşeli düğmeler. */
.bo-verdict-more__k,
.bo-verdict-details {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-verdict-more__k::before,
.bo-verdict-details::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.bo-verdict-details::after {
  display: none;
}

.bo-verdict-more__link {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
}

.bo-verdict-more__link:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}
</style>
