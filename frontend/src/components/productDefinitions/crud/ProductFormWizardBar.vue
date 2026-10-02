<!--
  frontend/src/components/productDefinitions/crud/ProductFormWizardBar.vue

  Ürün ekleme/düzenleme sihirbazının ürün rayı (ProductDefinitionView + ProductUpdateView ortak).
  Eski `v-stepper` başlığının yerine (390px'te başlıklar kırpılıyor, Kaydet ekran dışına çıkıyordu):
    · 4 adım: numara/onay + başlık + durum ("Tamam" · "N eksik" · "İsteğe bağlı" · "Kilitli").
      Kilitli adım `aria-disabled` kalır (odaklanabilir) ve kilit nedeni `aria-describedby` ile okunur.
    · Zorunlu bilgi ilerlemesi (`<progress>`), Kaydet düğmesinin neden kapalı olduğunu söyleyen cümle
      (düğmenin `aria-describedby` hedefi) ve "Eksikleri göster" paneli: eksik zorunlu bilgiler + uyarılar
      + kayıt özeti; bir maddeye tıklayınca ilgili adıma/alana gider.
  Hesap saf fonksiyonlardadır (`useProductFormProgress.ts`); kaydetme GÖVDESİ görünümlerde DEĞİŞMEDİ.

  FE R5 B (yeniden tasarım): üç kök — ürün önizleme kartı · dikey adım gezintisi · durum kartı (tamamlanma halkası,
  ipucu, Eksikler, Kaydet, kayıt geri bildirimi). Görünümler üçünü `.pdv-rail` içinde toplar:
    - geniş kap (≥ 960px, `@container pform`): solda yapışkan ÜRÜN RAYI (önizleme → adımlar → durum), sağda geniş içerik;
    - dar kap: önizleme + yatay adım şeridi içeriğin üstünde, durum kartı ALTTA yapışkan kayıt çubuğu (panel yukarı açılır).
  Adım adları/durumları, kilitler, aria bağları ve olaylar AYNI (karakterizasyon: `tests/fe-r4b-product-form-characterization.test.ts`).
-->
<template>
  <div class="pfw-preview" :class="{ 'has-cover': !!coverSrc, 'is-collapsed': collapsed }">
    <span class="pfw-preview__cover">
      <img v-if="coverSrc" :src="coverSrc" alt="" loading="lazy" decoding="async" />
      <v-icon v-else icon="mdi-image-outline" aria-hidden="true" />
    </span>
    <div class="pfw-preview__body">
      <span class="pfw-preview__type">{{ form?.hasVariant ? 'Varyantlı ürün' : 'Tekil ürün' }}</span>
      <p class="pfw-preview__title" :class="{ 'is-empty': !titleText }">{{ titleText || 'Adsız ürün' }}</p>
      <p class="pfw-preview__meta">{{ brandTitle || 'Marka seçilmedi' }}</p>
      <p class="pfw-preview__meta pfw-preview__path" :title="pathText || undefined">
        <v-icon icon="mdi-file-tree-outline" aria-hidden="true" />
        <span>{{ pathText || 'Kategori seçilmedi' }}</span>
      </p>
    </div>
    <div class="pfw-preview__stats">
      <span class="pfw-stat pfw-stat--price">
        <span class="pfw-stat__label">Fiyat</span>
        <span class="pfw-stat__value ek-num" :title="priceText">{{ priceText }}</span>
      </span>
      <span class="pfw-stat">
        <span class="pfw-stat__label">Stok</span>
        <span class="pfw-stat__value ek-num">{{ stockText }}</span>
      </span>
      <span class="pfw-stat">
        <span class="pfw-stat__label">Varyant</span>
        <span class="pfw-stat__value ek-num">{{ variantText }}</span>
      </span>
    </div>
    <EkButton v-if="collapsible" tone="ghost" size="sm" icon-only class="pfw-collapse"
      :icon="collapsed ? 'mdi-chevron-double-right' : 'mdi-chevron-double-left'"
      :aria-label="collapsed ? 'Ürün panelini genişlet' : 'Ürün panelini daralt'" :aria-expanded="collapsed ? 'false' : 'true'"
      @click="emit('toggle-collapse')" />
  </div>

  <nav class="pfw-nav" :class="{ 'is-collapsed': collapsed }" aria-label="Ürün formu adımları">
    <span class="pfw-nav__head" aria-hidden="true">
      <span>Adımlar</span>
      <span class="ek-num">{{ current + 1 }} / 4</span>
    </span>
    <ol class="pfw-steps">
      <li v-for="s in stepItems" :key="s.index" class="pfw-steps__item"
        :class="{ 'is-current': s.current, 'is-locked': s.locked, 'is-complete': s.complete, 'is-warn': s.tone === 'warn' }">
        <button
          type="button"
          class="pfw-step"
          :aria-current="s.current ? 'step' : undefined"
          :aria-disabled="s.locked ? 'true' : undefined"
          :aria-describedby="s.locked ? `${uid}-status-${s.index} ${uid}-reason-${s.index}` : `${uid}-status-${s.index}`"
          :title="s.locked ? s.lockedReason : collapsed ? `${s.title} · ${s.statusText}` : undefined"
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
          <v-icon v-if="s.current" class="pfw-step__go" icon="mdi-chevron-right" aria-hidden="true" />
        </button>
        <span v-if="s.index < 3" class="pfw-steps__link" aria-hidden="true"></span>
      </li>
    </ol>
  </nav>

  <section class="pfw-bar" :class="{ 'is-ready': progress.canSave, 'is-open': panelOpen, 'is-collapsed': collapsed }" aria-label="Ürün formu ilerlemesi">
    <div class="pfw-bar__status">
      <span class="pfw-ring" :class="{ 'is-done': progress.canSave }" aria-hidden="true">
        <svg viewBox="0 0 48 48" class="pfw-ring__svg">
          <circle class="pfw-ring__track" cx="24" cy="24" r="20" />
          <circle class="pfw-ring__value" cx="24" cy="24" r="20" :stroke-dasharray="RING" :stroke-dashoffset="ringOffset" />
        </svg>
        <span class="pfw-ring__text ek-num">
          <v-icon v-if="progress.canSave" icon="mdi-check" />
          <template v-else>{{ percentText }}</template>
        </span>
      </span>
      <div class="pfw-progress">
        <div class="pfw-progress__head">
          <label :for="`${uid}-progress`" class="pfw-progress__label">Zorunlu bilgiler</label>
          <span class="pfw-progress__count ek-num">{{ progress.requiredDone }} / {{ progress.requiredTotal }}</span>
        </div>
        <progress
          :id="`${uid}-progress`"
          class="pfw-meter"
          :class="{ 'is-done': progress.canSave }"
          :max="progress.requiredTotal"
          :value="progress.requiredDone"
        />
        <p :id="`${uid}-hint`" class="pfw-hint" :class="{ 'is-ready': progress.canSave }" data-testid="pfw-hint">{{ hint }}</p>
      </div>
    </div>

    <div class="pfw-feedback-slot" role="status" aria-live="polite">
      <div v-if="feedback" class="pfw-feedback" :class="`pfw-feedback--${feedback.tone}`">
        <v-icon :icon="feedback.tone === 'success' ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'" aria-hidden="true" />
        <span class="pfw-feedback__text">
          <strong>{{ feedback.title }}</strong>
          <span v-if="feedback.message">{{ feedback.message }}</span>
        </span>
      </div>
    </div>

    <div class="pfw-actions">
      <EkButton
        tone="ghost"
        class="pfw-toggle"
        :icon="panelOpen ? 'mdi-close' : 'mdi-format-list-checks'"
        :aria-expanded="panelOpen ? 'true' : 'false'"
        :aria-controls="`${uid}-panel`"
        @click="panelOpen = !panelOpen"
      >
        <span class="pfw-toggle__label">{{ progress.canSave ? 'Kayıt özeti' : 'Eksikleri göster' }}</span>
        <span v-if="!progress.canSave" class="pfw-toggle__count ek-num" aria-hidden="true">{{ progress.missing.length }}</span>
      </EkButton>
      <EkButton tone="primary" class="pfw-save" icon="mdi-content-save-outline" :disabled="!progress.canSave || saving" :loading="saving" :aria-describedby="`${uid}-hint`" @click="emit('save')">
        <span class="pfw-save__label">{{ saveLabel }}</span>
      </EkButton>
    </div>

    <div v-if="panelOpen" :id="`${uid}-panel`" class="pfw-panel" role="region" aria-label="Kayıt öncesi kontrol"
      @keydown.esc.stop="panelOpen = false">
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
import { formatMoney, formatNumber } from '@entegrasyonik/ui/format'
import {
  buildSummaryRows,
  evaluateProductForm,
  resolveTargetStep,
  saveHint,
  type ProgressItem,
  type StepIndex,
  type StepInfo,
} from '@/composables/useProductFormProgress'

export interface ProductFormFeedback {
  tone: 'success' | 'error'
  title: string
  message?: string
}

const props = defineProps<{
  form: any
  current: number
  saveLabel: string
  saving?: boolean
  /** Kayıt özeti için görünen adlar (id yerine). */
  categoryTitle?: string
  brandTitle?: string
  /** FE R5 B — önizleme kartı: kapak görseli küçük resmi ve kategori yolu (kökten yaprağa adlar). */
  coverSrc?: string
  categoryPath?: string[]
  /** FE R5 B — son kayıt denemesinin satır içi geri bildirimi (toast'a ek; `role="status"`). */
  feedback?: ProductFormFeedback | null
  /** FE R5 B — geniş kapta ray daraltılabilir (yalnız işaretçiler, halka ve Kaydet simgesi kalır). */
  collapsible?: boolean
  collapsed?: boolean
}>()

const emit = defineEmits<{
  navigate: [payload: { step: StepIndex; field?: string }]
  save: []
  'toggle-collapse': []
}>()

const uid = useId()
const panelOpen = ref(false)

const progress = computed(() => evaluateProductForm(props.form))
const hint = computed(() => saveHint(progress.value, props.saveLabel))
const summaryRows = computed(() => buildSummaryRows(props.form, { category: props.categoryTitle, brand: props.brandTitle }))

// ── önizleme ─────────────────────────────────────────────────────────────────────────────────────
const variants = computed<any[]>(() => (Array.isArray(props.form?.variants) ? props.form.variants : []))
const titleText = computed(() => (props.form?.title ? String(props.form.title).trim() : ''))
const pathText = computed(() => (props.categoryPath?.length ? props.categoryPath.join(' › ') : props.categoryTitle || ''))
const priceText = computed(() => {
  const priced = variants.value.filter((v) => v?.prices && v.prices.isPlatformBasedPrice !== true)
  const sales = priced.map((v) => Number(v.prices.salePrice)).filter((n) => Number.isFinite(n) && n > 0)
  if (!sales.length) return variants.value.length && !priced.length ? 'Kanal fiyatı' : '—'
  const min = Math.min(...sales)
  const max = Math.max(...sales)
  return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`
})
const stockText = computed(() => formatNumber(variants.value.reduce((n, v) => n + (Number(v?.stock) || 0), 0)))
const variantText = computed(() => (props.form?.hasVariant ? formatNumber(variants.value.length) : 'Tekil'))

// ── tamamlanma halkası (dekoratif; anlam `<progress>` + sayaçta) ────────────────────────────────────
const RING = 2 * Math.PI * 20
const ratio = computed(() => (progress.value.requiredTotal ? progress.value.requiredDone / progress.value.requiredTotal : 0))
const ringOffset = computed(() => RING * (1 - ratio.value))
const percentText = computed(() => `%${formatNumber(Math.round(ratio.value * 100))}`)

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
/*
 * Taban = DAR kap düzeni (önizleme satırı + yatay adım şeridi üstte, durum kartı altta yapışkan çubuk).
 * `@container pform (min-width: 960px)` = ürün rayı (görünüm `.pdv-rail` içinde dikey yığın).
 * Yerleşim alanları (`grid-area`) görünümün `.pdv-grid` ızgarasına aittir: preview · nav · main.
 */

/* ── ortak kart kabuğu ───────────────────────────────────────────────────────────────────────── */
.pfw-preview,
.pfw-nav,
.pfw-bar {
  min-width: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

/* ── önizleme kartı ──────────────────────────────────────────────────────────────────────────── */
.pfw-preview {
  grid-area: preview;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ek-space-3) var(--ek-space-4);
  padding: var(--ek-space-3);
}

.pfw-preview__cover {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-subtle);
}

.pfw-preview__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pfw-preview__cover :deep(.v-icon) {
  font-size: var(--ek-icon-xl);
}

.pfw-preview__body {
  min-width: 0;
}

.pfw-preview__type {
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pfw-preview__title {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
}

.pfw-preview__title.is-empty {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
}

.pfw-preview__meta {
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pfw-preview__path {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-1);
  margin-top: 0;
  white-space: normal;
}

.pfw-preview__path :deep(.v-icon) {
  flex: none;
  margin-top: 1px;
  font-size: var(--ek-icon-xs);
}

.pfw-collapse {
  display: none;
}

.pfw-preview__stats {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: var(--ek-space-1);
}

.pfw-stat {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: var(--ek-space-1) var(--ek-space-3);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
}

.pfw-stat__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.pfw-stat__value {
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── adım gezintisi (taban: yatay şerit) ─────────────────────────────────────────────────────── */
.pfw-nav {
  grid-area: nav;
  padding: var(--ek-space-3);
}

.pfw-nav__head {
  display: none;
}

.pfw-steps {
  display: flex;
  align-items: flex-start;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pfw-steps__item {
  position: relative;
  display: flex;
  flex: 1 1 0;
  justify-content: center;
  min-width: 0;
}

.pfw-steps__link {
  position: absolute;
  top: 20px;
  left: calc(50% + 22px);
  right: calc(-50% + 22px);
  height: 2px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-border-default);
  transition: background-color var(--ek-motion-feedback);
}

.pfw-steps__item.is-complete .pfw-steps__link {
  background: var(--ek-color-success);
  opacity: 0.6;
}

.pfw-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-1);
  width: 100%;
  min-width: 0;
  padding: var(--ek-space-1) 2px;
  border: 0;
  border-radius: var(--ek-radius-tile);
  background: transparent;
  color: var(--ek-color-content-default);
  font-family: inherit;
  text-align: center;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.pfw-step:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.is-locked > .pfw-step {
  cursor: not-allowed;
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
  box-shadow: 0 0 0 4px var(--ek-color-action-subtle);
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
  align-items: center;
  min-width: 0;
  width: 100%;
}

.pfw-step__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-semibold);
  text-wrap: balance;
}

.is-current .pfw-step__title {
  color: var(--ek-color-action-emphasis);
}

.is-locked .pfw-step__title {
  color: var(--ek-color-content-muted);
}

.pfw-step__status {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  white-space: nowrap;
}

.pfw-step__status--ok {
  color: var(--ek-color-success-emphasis);
}

.pfw-step__status--warn {
  color: var(--ek-color-warning-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.pfw-step__status--muted {
  color: var(--ek-color-content-muted);
}

.pfw-step__go {
  display: none;
}

/* ── durum kartı (taban: altta yapışkan kayıt çubuğu) ────────────────────────────────────────── */
.pfw-bar {
  grid-area: main;
  position: sticky;
  bottom: var(--ek-space-3);
  z-index: var(--ek-z-sticky);
  align-self: end;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  padding: var(--ek-space-2) var(--ek-space-2) var(--ek-space-2) var(--ek-space-3);
  box-shadow: var(--ek-shadow-popover);
}

.pfw-bar__status {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
}

.pfw-ring {
  position: relative;
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
}

.pfw-ring__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.pfw-ring__track,
.pfw-ring__value {
  fill: none;
  stroke-width: 4;
}

.pfw-ring__track {
  stroke: var(--ek-color-border-subtle);
}

.pfw-ring__value {
  stroke: var(--ek-color-action);
  stroke-linecap: round;
  transition: stroke-dashoffset var(--ek-motion-reveal), stroke var(--ek-motion-feedback);
}

.pfw-ring.is-done .pfw-ring__value {
  stroke: var(--ek-color-success);
}

.pfw-ring__text {
  position: relative;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-semibold);
}

.pfw-ring.is-done .pfw-ring__text {
  color: var(--ek-color-success-emphasis);
}

.pfw-ring__text :deep(.v-icon) {
  font-size: var(--ek-icon-md);
}

.pfw-progress {
  min-width: 0;
}

.pfw-progress__head {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-2);
}

.pfw-progress__label {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.pfw-progress__count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

/* `<progress>` anlamı taşır (ekran okuyucu + etiket); görsel karşılığı halka. */
.pfw-meter {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
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

.pfw-feedback-slot {
  grid-column: 1 / -1;
}

.pfw-feedback-slot:empty {
  display: none;
}

.pfw-feedback {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.pfw-feedback :deep(.v-icon) {
  flex: none;
  font-size: var(--ek-icon-md);
}

.pfw-feedback--success {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.pfw-feedback--error {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.pfw-feedback__text {
  display: flex;
  flex-direction: column;
}

.pfw-feedback__text strong {
  font-weight: var(--ek-font-weight-semibold);
}

.pfw-actions {
  display: flex;
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

/* ── kontrol paneli (çubuğun üstüne açılan katman) ───────────────────────────────────────────── */
.pfw-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + var(--ek-space-2));
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ek-space-4);
  max-height: min(60vh, 560px);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-popover);
  background: var(--ek-color-surface-muted);
  box-shadow: var(--ek-shadow-popover);
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

/* ── dar kap ayrıntıları ─────────────────────────────────────────────────────────────────────── */
@container pform (min-width: 600px) {
  .pfw-step__title {
    font-size: var(--ek-type-label-size);
    line-height: var(--ek-type-label-line);
  }

  .pfw-step__status {
    font-size: var(--ek-type-caption-size);
    line-height: var(--ek-type-caption-line);
  }

  .pfw-panel {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  }
}

/* Telefon: önizlemede istatistikler alta; kayıt çubuğunda eylemler ikinci satırda tam genişlik. */
@container pform (max-width: 599px) {
  .pfw-preview {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .pfw-preview__stats {
    grid-column: 1 / -1;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .pfw-bar {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--ek-space-3);
  }

  .pfw-hint {
    white-space: normal;
  }

  .pfw-actions > :deep(*) {
    flex: 1 1 auto;
  }
}

/* ── ÜRÜN RAYI (geniş kap) ───────────────────────────────────────────────────────────────────── */
@container pform (min-width: 960px) {
  .pfw-preview {
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--ek-space-3);
    padding: var(--ek-space-3);
  }

  .pfw-preview__cover {
    width: 56px;
    height: 56px;
  }

  .pfw-preview {
    position: relative;
  }

  .pfw-preview__body {
    padding-right: var(--ek-space-6);
  }

  .pfw-preview__path {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pfw-preview__path :deep(.v-icon) {
    margin: -2px var(--ek-space-1) 0 0;
    vertical-align: middle;
  }

  .pfw-preview__stats {
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.15fr);
  }

  .pfw-stat {
    padding: var(--ek-space-1) var(--ek-space-2);
  }

  .pfw-collapse {
    position: absolute;
    top: var(--ek-space-2);
    right: var(--ek-space-2);
    display: inline-flex;
  }

  /* ── daraltılmış ray: işaretçiler + halka + Kaydet simgesi; metinler görsel olarak gizli (erişilebilir ad aynı) ── */
  .pfw-preview.is-collapsed {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ek-space-2);
    padding: var(--ek-space-3) var(--ek-space-2);
  }

  .pfw-preview.is-collapsed .pfw-preview__cover {
    width: 44px;
    height: 44px;
  }

  .pfw-preview.is-collapsed .pfw-preview__body,
  .pfw-preview.is-collapsed .pfw-preview__stats {
    display: none;
  }

  .pfw-preview.is-collapsed .pfw-collapse {
    position: static;
  }

  .pfw-nav.is-collapsed {
    padding: var(--ek-space-2) var(--ek-space-1);
  }

  .pfw-nav.is-collapsed .pfw-nav__head,
  .pfw-nav.is-collapsed .pfw-step__go {
    display: none;
  }

  .pfw-nav.is-collapsed .pfw-step {
    justify-content: center;
    padding: var(--ek-space-2) 0;
  }

  .pfw-nav.is-collapsed .pfw-steps__link {
    left: calc(50% - 1px);
  }

  .pfw-nav.is-collapsed .pfw-step__text,
  .pfw-bar.is-collapsed .pfw-progress,
  .pfw-bar.is-collapsed .pfw-feedback__text,
  .pfw-bar.is-collapsed .pfw-save__label,
  .pfw-bar.is-collapsed .pfw-toggle__label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .pfw-bar.is-collapsed {
    justify-items: center;
    padding: var(--ek-space-3) var(--ek-space-1);
  }

  .pfw-bar.is-collapsed .pfw-feedback {
    padding: var(--ek-space-1);
  }

  .pfw-bar.is-collapsed .pfw-toggle__count {
    margin-left: 0;
  }

  .pfw-bar.is-collapsed .pfw-actions > :deep(*) {
    min-width: 0;
    padding-inline: var(--ek-space-2);
  }

  .pfw-nav {
    padding: var(--ek-space-3) var(--ek-space-2);
  }

  .pfw-nav__head {
    display: flex;
    justify-content: space-between;
    padding: 0 var(--ek-space-2) var(--ek-space-2);
    color: var(--ek-color-content-muted);
    font-size: var(--ek-type-micro-size);
    line-height: var(--ek-type-micro-line);
    font-weight: var(--ek-type-micro-weight);
    letter-spacing: var(--ek-type-micro-tracking);
    text-transform: uppercase;
  }

  .pfw-steps {
    flex-direction: column;
    align-items: stretch;
  }

  .pfw-steps__item {
    justify-content: stretch;
  }

  /* Dikey bağlantı: işaretçiler arası ilerleme çizgisi. */
  .pfw-steps__link {
    top: 41px;
    bottom: -7px;
    left: 23px;
    right: auto;
    width: 2px;
    height: auto;
  }

  .pfw-step {
    flex-direction: row;
    align-items: center;
    gap: var(--ek-space-3);
    min-height: 48px;
    margin: 1px 0;
    padding: var(--ek-space-1) var(--ek-space-2);
    border-radius: var(--ek-radius-control);
    text-align: left;
  }

  .pfw-step:hover {
    background: var(--ek-color-surface-muted);
  }

  .is-locked > .pfw-step:hover {
    background: transparent;
  }

  .is-current > .pfw-step {
    background: var(--ek-color-action-subtle);
    box-shadow: inset 3px 0 0 var(--ek-color-action);
  }

  .pfw-step__text {
    flex: 1 1 auto;
    align-items: flex-start;
  }

  .pfw-step__title {
    text-wrap: pretty;
  }

  .pfw-step__go {
    display: inline-flex;
    flex: none;
    color: var(--ek-color-action);
    font-size: var(--ek-icon-md);
  }

  .pfw-bar {
    position: relative;
    bottom: auto;
    align-self: auto;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-3);
    padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-3) var(--ek-space-4);
    box-shadow: var(--ek-shadow-card);
  }

  .pfw-ring {
    width: 48px;
    height: 48px;
  }

  .pfw-ring__text {
    font-size: var(--ek-type-caption-size);
  }

  .pfw-hint {
    white-space: normal;
  }

  /* Kaydet üstte tam genişlik (tek birincil eylem), Eksikler/Kayıt özeti altında — her durumda aynı düzen. */
  .pfw-actions {
    flex-direction: column-reverse;
    align-items: stretch;
    gap: var(--ek-space-1);
  }

  .pfw-save {
    min-height: var(--ek-control-h-lg);
  }

  /* Panel rayın sağına, içeriğin üzerine açılır (yükseklik ekrana sığar, iç kaydırma). */
  .pfw-panel {
    left: calc(100% + var(--ek-space-3));
    right: auto;
    bottom: 0;
    width: min(520px, 60cqw);
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pfw-steps__link,
  .pfw-step,
  .pfw-step__marker,
  .pfw-ring__value,
  .pfw-issue {
    transition: none;
  }
}
</style>
