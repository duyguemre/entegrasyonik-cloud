<!--
  PageVerdict — sayfanın "Durum → Karar → Eylem" katmanları (K51; BO_UI_PATTERNS §11). Ayrıntı (mevcut tablolar,
  paneller) bu bloğun ALTINDA, "Ayrıntılar" etiketinden sonra gelir (§11.6 madde 4: ayrıntı = sayfanın kendisi).

    <PageVerdict :verdict="verdict" />      // verdict: PageVerdict | null (null → durum denetleniyor)

  bo-r1b UYARLAYICISI: sayfalar yalnız bu bileşeni ve `utils/verdict.ts` modelini kullanır; çizim bo-r1a'nın triyaj
  bileşenleridir — BoStatusHeader (Durum) · BoActionCard "Önerilen ilk adım" (Eylem) · BoAttentionList (Karar).
  Eşleme: tone success/info → ok · warning → warning · error → critical · neutral → unknown; madde error → critical.
  `unreadable()` maddeleri listeye değil BoAttentionList'in "X okunamadı — Yeniden dene" notuna gider.
  Kalan eylemler sakin bağlantı satırıdır (sayfada tek dolgu/kart kuralı — §11.3).
-->
<template>
  <BoStatusHeader
    :health="health"
    :verdict="verdict?.summary ?? ''"
    :summary="verdict?.note"
    :badge-label="badgeLabel"
    :loading="!verdict"
    label="Sayfa durumu"
    data-testid="page-verdict"
    :data-tone="verdict?.tone ?? 'loading'"
  >
    <BoActionCard
      v-if="first"
      eyebrow="Önerilen ilk adım"
      :title="first.label"
      :text="first.detail"
      :action-label="first.cta ?? (first.to ? 'Aç' : 'Başlat…')"
      :to="first.to"
      :tone="cardTone"
      :icon="first.icon ?? 'mdi-lightbulb-on-outline'"
      :guarded="first.guarded"
      :heading-level="2"
      data-testid="verdict-first-action"
      @act="first.onSelect?.()"
    />
  </BoStatusHeader>

  <section v-if="verdict && (listed.length || degraded.length || verdict.checks?.length)" class="bo-verdict-decide" aria-label="Dikkat isteyenler">
    <BoAttentionList
      :items="listed"
      state="ready"
      :degraded="degraded"
      :checks="verdict.checks"
      :ok-title="verdict.okTitle ?? 'Müdahale gereken bir şey yok'"
      list-label="Bu sayfada dikkat isteyenler"
      :limit="3"
      :heading-level="3"
      data-testid="verdict-attention"
      @retry="retry"
    />
  </section>

  <nav v-if="rest.length" class="bo-verdict-more" aria-label="Diğer eylemler" data-testid="verdict-actions">
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

  <h2 v-if="detailsLabel" class="bo-verdict-details" data-testid="details-label">{{ detailsLabel }}</h2>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import BoStatusHeader from '@bo/components/triage/BoStatusHeader.vue'
import BoAttentionList from '@bo/components/triage/BoAttentionList.vue'
import BoActionCard from '@bo/components/triage/BoActionCard.vue'
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

const listed = computed<AttentionEntry[]>(() =>
  (props.verdict?.attention ?? [])
    .filter((a) => !a.source && a.to)
    .map((a) => ({
      id: a.id,
      severity: SEV[a.tone],
      title: a.title,
      impact: a.impact ?? a.detail ?? '',
      advice: a.advice ?? '',
      action: { label: a.cta ?? 'Göster', to: a.to! },
      since: a.since,
      tenant: a.tenant,
    })),
)
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
const cardTone = computed(() => (health.value === 'critical' ? 'critical' : health.value === 'warning' ? 'warning' : 'neutral'))
</script>

<style scoped>
.bo-verdict-decide {
  min-width: 0;
}

.bo-verdict-more {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-3);
  margin-top: calc(var(--ek-space-2) * -1);
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
</style>
