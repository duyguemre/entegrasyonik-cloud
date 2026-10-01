<!--
  frontend/src/components/productDefinitions/crud/ProductFormWizardBar.vue

  Ürün ekleme/düzenleme sihirbazının üst şeridi (ProductDefinitionView + ProductUpdateView ortak).
  Eski `v-stepper` başlığının yerine (390px'te başlıklar kırpılıyor, Kaydet ekran dışına çıkıyordu):
    · 4 adım kutusu: numara/onay + başlık + durum ("Tamam" · "N eksik" · "İsteğe bağlı" · "Kilitli").
      Kilitli adım `aria-disabled` kalır (odaklanabilir) ve kilit nedeni `aria-describedby` ile okunur.
    · Zorunlu bilgi ilerlemesi (`<progress>`), Kaydet düğmesinin neden kapalı olduğunu söyleyen cümle
      (düğmenin `aria-describedby` hedefi) ve "Eksikleri göster" paneli: eksik zorunlu bilgiler + uyarılar
      + kayıt özeti; bir maddeye tıklayınca ilgili adıma/alana gider.
  Hesap saf fonksiyonlardadır (`useProductFormProgress.ts`); kaydetme GÖVDESİ görünümlerde DEĞİŞMEDİ.
  FE R4 B (K61): kutu dizisi yerine bağlı adım şeridi (tamamlanan bağlantı başarı tonunda) + tek satır kayıt çubuğu
  (iş alanında yapışkan; eksik sayısı düğmede). Adım adları/durumları, kilitler, aria bağları ve olaylar AYNI
  (karakterizasyon: `tests/fe-r4b-product-form-characterization.test.ts`).
-->
<template>
  <!-- FE R4 B: iki kök — adım şeridi (akışta) + kayıt çubuğu (iş alanında yapışkan; uzun adımlarda Kaydet hep erişilir). -->
  <nav class="pfw-nav" aria-label="Ürün formu adımları">
    <ol class="pfw-steps">
      <li v-for="s in stepItems" :key="s.index" class="pfw-steps__item"
        :class="{ 'is-current': s.current, 'is-locked': s.locked, 'is-complete': s.complete, 'is-warn': s.tone === 'warn' }">
        <button
          type="button"
          class="pfw-step"
          :aria-current="s.current ? 'step' : undefined"
          :aria-disabled="s.locked ? 'true' : undefined"
          :aria-describedby="s.locked ? `${uid}-status-${s.index} ${uid}-reason-${s.index}` : `${uid}-status-${s.index}`"
          :title="s.locked ? s.lockedReason : undefined"
          @click="onStep(s)"
        >
          <span class="pfw-step__marker" aria-hidden="true">
            <v-icon v-if="s.complete && !s.current" icon="mdi-check" />
            <v-icon v-else-if="s.locked" icon="mdi-lock-outline" />
            <span v-else class="ek-num">{{ s.index + 1 }}</span>
          </span>
          <span class="pfw-step__text">
            <span class="pfw-step__title">{{ s.title }}</span>
            <span :id="`${uid}-status-${s.index}`" class="pfw-step__status" :class="`pfw-step__status--${s.tone}`">{{ s.statusText }}</span>
            <span v-if="s.locked" :id="`${uid}-reason-${s.index}`" class="ek-sr-only">{{ s.lockedReason }}</span>
          </span>
        </button>
        <span v-if="s.index < 3" class="pfw-steps__link" aria-hidden="true"></span>
      </li>
    </ol>
  </nav>

  <section class="pfw-bar" :class="{ 'is-ready': progress.canSave, 'is-open': panelOpen }" aria-label="Ürün formu ilerlemesi">
    <div class="pfw-bar__row">
      <span class="pfw-bar__icon" aria-hidden="true">
        <v-icon :icon="progress.canSave ? 'mdi-check-circle-outline' : 'mdi-progress-check'" />
      </span>
      <div class="pfw-progress">
        <div class="pfw-progress__head">
          <label :for="`${uid}-progress`" class="pfw-progress__label">Zorunlu bilgiler</label>
          <progress
            :id="`${uid}-progress`"
            class="pfw-meter"
            :class="{ 'is-done': progress.canSave }"
            :max="progress.requiredTotal"
            :value="progress.requiredDone"
          />
          <span class="pfw-progress__count ek-num">{{ progress.requiredDone }} / {{ progress.requiredTotal }}</span>
        </div>
        <p :id="`${uid}-hint`" class="pfw-hint" :class="{ 'is-ready': progress.canSave }" data-testid="pfw-hint">{{ hint }}</p>
      </div>
      <div class="pfw-actions">
        <EkButton
          tone="ghost"
          class="pfw-toggle"
          :icon="panelOpen ? 'mdi-chevron-up' : 'mdi-format-list-checks'"
          :aria-expanded="panelOpen ? 'true' : 'false'"
          :aria-controls="`${uid}-panel`"
          @click="panelOpen = !panelOpen"
        >
          <span class="pfw-toggle__label">{{ progress.canSave ? 'Kayıt özeti' : 'Eksikleri göster' }}</span>
          <span v-if="!progress.canSave" class="pfw-toggle__count ek-num" aria-hidden="true">{{ progress.missing.length }}</span>
        </EkButton>
        <EkButton tone="primary" icon="mdi-content-save-outline" :disabled="!progress.canSave || saving" :loading="saving" :aria-describedby="`${uid}-hint`" @click="emit('save')">
          {{ saveLabel }}
        </EkButton>
      </div>
    </div>

    <div v-if="panelOpen" :id="`${uid}-panel`" class="pfw-panel" role="region" aria-label="Kayıt öncesi kontrol">
      <div class="pfw-panel__col">
        <h3 class="pfw-panel__heading">
          Eksik zorunlu bilgiler
          <EkStatusChip v-if="progress.missing.length" tone="warning" :label="`${progress.missing.length} eksik`" />
          <EkStatusChip v-else tone="success" label="Tamam" />
        </h3>
        <ul v-if="progress.missing.length" class="pfw-issues">
          <li v-for="m in progress.missing" :key="m.key">
            <button type="button" class="pfw-issue" @click="onIssue(m)">
              <v-icon icon="mdi-alert-circle-outline" size="18" class="pfw-issue__icon pfw-issue__icon--missing" aria-hidden="true" />
              <span class="pfw-issue__label">{{ m.label }}</span>
              <span class="pfw-issue__where">Adım {{ m.step + 1 }}</span>
              <v-icon icon="mdi-chevron-right" size="18" class="pfw-issue__go" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <p v-else class="pfw-panel__ok">
          <v-icon icon="mdi-check-circle-outline" size="18" aria-hidden="true" />
          Tüm zorunlu bilgiler girildi. {{ saveLabel }} düğmesi etkin.
        </p>

        <template v-if="progress.warnings.length">
          <h3 class="pfw-panel__heading pfw-panel__heading--spaced">
            Uyarılar
            <EkStatusChip tone="info" :label="`${progress.warnings.length}`" />
          </h3>
          <ul class="pfw-issues">
            <li v-for="w in progress.warnings" :key="w.key">
              <button type="button" class="pfw-issue" @click="onIssue(w)">
                <v-icon icon="mdi-information-outline" size="18" class="pfw-issue__icon" aria-hidden="true" />
                <span class="pfw-issue__label">{{ w.label }}</span>
                <span class="pfw-issue__where">Adım {{ w.step + 1 }}</span>
                <v-icon icon="mdi-chevron-right" size="18" class="pfw-issue__go" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </template>
      </div>
      <div class="pfw-panel__col pfw-panel__col--summary">
        <h3 class="pfw-panel__heading">Kayıt özeti</h3>
        <EkDescriptionList class="pfw-summary" :items="summaryRows" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { EkButton, EkDescriptionList, EkStatusChip } from '@entegrasyonik/ui/components'
import {
  buildSummaryRows,
  evaluateProductForm,
  resolveTargetStep,
  saveHint,
  type ProgressItem,
  type StepIndex,
  type StepInfo,
} from '@/composables/useProductFormProgress'

const props = defineProps<{
  form: any
  current: number
  saveLabel: string
  saving?: boolean
  /** Kayıt özeti için görünen adlar (id yerine). */
  categoryTitle?: string
  brandTitle?: string
}>()

const emit = defineEmits<{
  navigate: [payload: { step: StepIndex; field?: string }]
  save: []
}>()

const uid = useId()
const panelOpen = ref(false)

const progress = computed(() => evaluateProductForm(props.form))
const hint = computed(() => saveHint(progress.value, props.saveLabel))
const summaryRows = computed(() => buildSummaryRows(props.form, { category: props.categoryTitle, brand: props.brandTitle }))

interface StepItem extends StepInfo {
  title: string
  current: boolean
  statusText: string
  tone: 'ok' | 'warn' | 'muted'
}

const stepTitle = (index: number) => {
  if (index === 0) return 'Kategori Seçimi'
  if (index === 1) return 'Ürün Tanımı'
  if (index === 2) return props.form?.hasVariant ? 'Varyant Bilgileri' : 'Tekil Ürün Bilgisi'
  return 'Detay Bilgiler'
}

const stepItems = computed<StepItem[]>(() =>
  progress.value.steps.map((s) => {
    let statusText = 'Tamam'
    let tone: StepItem['tone'] = 'ok'
    if (s.locked) {
      statusText = 'Kilitli'
      tone = 'muted'
    } else if (s.missing > 0) {
      statusText = `${s.missing} eksik`
      tone = 'warn'
    } else if (s.optional) {
      statusText = 'İsteğe bağlı'
      tone = 'muted'
    }
    return { ...s, title: stepTitle(s.index), current: s.index === props.current, statusText, tone }
  }),
)

function onStep(s: StepItem) {
  if (s.locked) return
  emit('navigate', { step: s.index })
}

function onIssue(item: ProgressItem) {
  const step = resolveTargetStep(item, progress.value)
  panelOpen.value = false
  emit('navigate', { step, field: step === item.step ? item.field : undefined })
}
</script>

<style scoped>
/* ── adım şeridi ─────────────────────────────────────────────────────────────────────────────── */
.pfw-nav {
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.pfw-steps {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pfw-steps__item {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.pfw-steps__item:last-child {
  flex: 0 1 auto;
}

/* Adımlar arası bağlantı: tamamlanan adımdan sonra başarı tonunda (ilerleme çizgisi). */
.pfw-steps__link {
  flex: 1 1 auto;
  min-width: var(--ek-space-4);
  height: 2px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-border-default);
  transition: background-color var(--ek-motion-feedback);
}

.pfw-steps__item.is-complete .pfw-steps__link {
  background: var(--ek-color-success);
  opacity: 0.55;
}

.pfw-step {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
  min-height: 48px;
  padding: var(--ek-space-1) var(--ek-space-3) var(--ek-space-1) var(--ek-space-1);
  border: 1px solid transparent;
  border-radius: var(--ek-radius-full);
  background: transparent;
  color: var(--ek-color-content-default);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pfw-step:hover {
  background: var(--ek-color-surface-muted);
}

.pfw-step:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.is-current > .pfw-step {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.is-locked > .pfw-step {
  cursor: not-allowed;
}

.is-locked > .pfw-step:hover {
  background: transparent;
}

.pfw-step__marker {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  transition: var(--ek-transition-colors);
}

.pfw-step__marker :deep(.v-icon) {
  font-size: var(--ek-icon-sm);
}

.is-current .pfw-step__marker {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  box-shadow: 0 0 0 3px var(--ek-color-action-subtle);
}

.is-complete:not(.is-current) .pfw-step__marker {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.is-locked .pfw-step__marker {
  border-style: dashed;
  background: transparent;
  color: var(--ek-color-content-muted);
}

.pfw-step__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pfw-step__title {
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.is-current .pfw-step__title {
  color: var(--ek-color-action-emphasis);
}

.is-locked .pfw-step__title {
  color: var(--ek-color-content-muted);
}

.pfw-step__status {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  white-space: nowrap;
}

.pfw-step__status--ok {
  color: var(--ek-color-success-emphasis);
}

.pfw-step__status--warn {
  color: var(--ek-color-warning-emphasis);
  font-weight: var(--ek-font-weight-medium);
}

.pfw-step__status--muted {
  color: var(--ek-color-content-muted);
}

/* ── kayıt çubuğu (yapışkan) ─────────────────────────────────────────────────────────────────── */
.pfw-bar {
  position: sticky;
  top: var(--ek-space-2);
  z-index: var(--ek-z-sticky);
  margin-top: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-raised);
}

/* Yapışkanken üstteki boşluktan kayan içerik görünmesin: zemin renginde perde. */
.pfw-bar::before {
  content: '';
  position: absolute;
  left: -1px;
  right: -1px;
  bottom: 100%;
  height: var(--ek-space-3);
  background: var(--ek-color-app-bg);
  pointer-events: none;
}

.pfw-bar__row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) var(--ek-space-2) var(--ek-space-2) var(--ek-space-4);
}

.pfw-bar__icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
  transition: var(--ek-transition-colors);
}

.pfw-bar__icon :deep(.v-icon) {
  font-size: var(--ek-icon-md);
}

.pfw-bar.is-ready .pfw-bar__icon {
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.pfw-progress {
  flex: 1 1 auto;
  min-width: 0;
}

.pfw-progress__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  max-width: 520px;
}

.pfw-progress__label {
  flex: none;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.pfw-progress__count {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.pfw-meter {
  display: block;
  flex: 1 1 auto;
  min-width: 64px;
  height: 6px;
  border: 0;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-border-subtle);
  appearance: none;
  overflow: hidden;
}

.pfw-meter::-webkit-progress-bar {
  background: var(--ek-color-border-subtle);
}

.pfw-meter::-webkit-progress-value {
  background: var(--ek-color-action);
  border-radius: var(--ek-radius-full);
  transition: width var(--ek-motion-reveal);
}

.pfw-meter::-moz-progress-bar {
  background: var(--ek-color-action);
  border-radius: var(--ek-radius-full);
}

.pfw-meter.is-done::-webkit-progress-value {
  background: var(--ek-color-success);
}

.pfw-meter.is-done::-moz-progress-bar {
  background: var(--ek-color-success);
}

.pfw-hint {
  margin: 2px 0 0;
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pfw-hint.is-ready {
  color: var(--ek-color-success-emphasis);
}

.pfw-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
}

.pfw-toggle__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  margin-left: var(--ek-space-1);
  padding: 0 6px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

/* ── kontrol paneli (çubuğun içinde açılır) ──────────────────────────────────────────────────── */
.pfw-panel {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--ek-space-6);
  max-height: min(60vh, 560px);
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
  overflow: auto;
  overscroll-behavior: contain;
}

.pfw-panel__col--summary {
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  align-self: start;
}

.pfw-panel__heading {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-3);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.pfw-panel__heading--spaced {
  margin-top: var(--ek-space-5);
}

.pfw-panel__ok {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-success-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-type-label-size);
}

.pfw-issues {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pfw-issue {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: var(--ek-control-h-lg);
  padding: var(--ek-space-1) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pfw-issue:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.pfw-issue:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.pfw-issue__icon {
  flex: none;
  color: var(--ek-color-info-emphasis);
}

.pfw-issue__icon--missing {
  color: var(--ek-color-warning-emphasis);
}

.pfw-issue__label {
  flex: 1 1 auto;
  min-width: 0;
}

.pfw-issue__where {
  flex: none;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pfw-issue__go {
  flex: none;
  color: var(--ek-color-content-muted);
}

.pfw-summary {
  grid-template-columns: 1fr;
  gap: var(--ek-space-2);
}

.pfw-summary :deep(.ek-description-list__row) {
  flex-direction: row;
  justify-content: space-between;
  gap: var(--ek-space-4);
}

.pfw-summary :deep(.ek-description-list__value) {
  margin: 0;
  min-width: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

/* Tablet: adım durum metni gizlenmez; şerit yatay kaydırılmaz — başlıklar kısalır (…). */
@media (max-width: 1023px) {
  .pfw-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .pfw-step {
    padding-right: var(--ek-space-2);
  }
}

/* Mobil: işaretçiler bağlantıyla tek sıra, başlık + durum altta ortalı; kayıt çubuğu iki satır (akışta, yapışkan değil). */
@media (max-width: 599px) {
  .pfw-nav {
    padding: var(--ek-space-3) var(--ek-space-2);
  }

  .pfw-steps {
    align-items: flex-start;
    gap: 0;
  }

  .pfw-steps__item,
  .pfw-steps__item:last-child {
    position: relative;
    flex: 1 1 0;
    justify-content: center;
  }

  .pfw-steps__link {
    position: absolute;
    top: 20px;
    left: calc(50% + 20px);
    right: calc(-50% + 20px);
    min-width: 0;
  }

  .pfw-step {
    flex-direction: column;
    gap: var(--ek-space-1);
    width: 100%;
    min-height: 0;
    padding: var(--ek-space-1) 2px;
    border-radius: var(--ek-radius-tile);
    text-align: center;
  }

  .is-current > .pfw-step {
    border-color: transparent;
    background: transparent;
  }

  .pfw-step__text {
    align-items: center;
    width: 100%;
  }

  .pfw-step__title {
    font-size: var(--ek-type-caption-size);
    line-height: var(--ek-type-caption-line);
    white-space: normal;
    text-wrap: balance;
  }

  .pfw-step__status {
    font-size: var(--ek-type-micro-size);
    line-height: var(--ek-type-micro-line);
  }

  .pfw-bar {
    position: static;
    box-shadow: var(--ek-shadow-card);
  }

  .pfw-bar::before {
    display: none;
  }

  .pfw-bar__row {
    flex-wrap: wrap;
    padding: var(--ek-space-3);
  }

  .pfw-progress {
    flex-basis: calc(100% - 48px);
  }

  .pfw-hint {
    white-space: normal;
  }

  .pfw-actions {
    width: 100%;
    justify-content: space-between;
  }

  .pfw-panel {
    max-height: none;
    padding: var(--ek-space-4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pfw-steps__link,
  .pfw-step,
  .pfw-step__marker,
  .pfw-bar__icon,
  .pfw-issue {
    transition: none;
  }

  .pfw-meter::-webkit-progress-value {
    transition: none;
  }
}
</style>
