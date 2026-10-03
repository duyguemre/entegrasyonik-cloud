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
  <!-- FE-LOCAL-1002b: Geri / Devam (simge düğmeler) alttaki ayrı satır yerine şeridin iki ucunda (yükseklik eklemez; Alt+← / Alt+→). -->
  <div class="pfw-head" :data-pfw="uid">
  <EkTooltip :text="current > 0 ? 'Önceki adım (Alt+←)' : 'İlk adımdasınız'">
    <EkButton class="pfw-head__prev" size="sm" tone="ghost" icon="mdi-chevron-left" icon-only aria-label="Geri"
      :disabled="current <= 0" @click="go(current - 1)" />
  </EkTooltip>
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
  <span v-if="current < 3" class="pfw-head__next">
    <span v-if="nextLockedReason" :id="`${uid}-why`" class="ek-sr-only">{{ nextLockedReason }}</span>
    <EkTooltip :text="nextLockedReason || 'Sonraki adım (Alt+→)'">
      <EkButton size="sm" tone="ghost" icon="mdi-chevron-right" icon-only aria-label="Devam" :disabled="!!nextLockedReason"
        :aria-describedby="nextLockedReason ? `${uid}-why` : undefined" @click="go(current + 1)" />
    </EkTooltip>
  </span>
  </div>

  <!-- FE-LOCAL-1002b: `teleportTo` verilirse kayıt çubuğu sayfa başlığının durum yuvasına taşınır (alan kazanılır);
       kontrol paneli o zaman açılır pencerede. Verilmezse eski yerinde (adım şeridinin altında, yapışkan). -->
  <Teleport defer :to="teleportTo || 'body'" :disabled="!teleportTo">
  <section class="pfw-bar" :class="{ 'is-ready': progress.canSave, 'is-open': panelOpen, 'is-inline': inline }" aria-label="Ürün formu ilerlemesi">
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
        <v-menu v-if="inline" v-model="panelOpen" :close-on-content-click="false" location="bottom end" offset="8">
          <template #activator="{ props: mp }">
            <EkButton v-bind="mp" tone="ghost" class="pfw-toggle" :icon="panelOpen ? 'mdi-chevron-up' : 'mdi-format-list-checks'"
              :aria-controls="`${uid}-panel`">
              <span class="pfw-toggle__label">{{ progress.canSave ? 'Kayıt özeti' : 'Eksikleri göster' }}</span>
              <span v-if="!progress.canSave" class="pfw-toggle__count ek-num" aria-hidden="true">{{ progress.missing.length }}</span>
            </EkButton>
          </template>
          <ProductFormCheckPanel :id="`${uid}-panel`" class="pfw-panel--pop" :progress="progress" :summary-rows="summaryRows"
            :save-label="saveLabel" @issue="onIssue" />
        </v-menu>
        <EkButton
          v-else
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

    <ProductFormCheckPanel v-if="panelOpen && !inline" :id="`${uid}-panel`" :progress="progress" :summary-rows="summaryRows"
      :save-label="saveLabel" @issue="onIssue" />
  </section>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { EkButton, EkTooltip } from '@entegrasyonik/ui/components'
import ProductFormCheckPanel from './ProductFormCheckPanel.vue'
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
  /** Kayıt çubuğunun taşınacağı hedef (ör. sayfa başlığındaki durum yuvası `#pf-status-…`). */
  teleportTo?: string
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

/** Çubuk sayfa başlığında mı (kompakt tek satır + açılır panel). */
const inline = computed(() => !!props.teleportTo)

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

/** Sonraki adım kilitliyse nedeni (Devam kapalı; ipucu + aria-describedby). */
const nextLockedReason = computed(() => {
  const next = progress.value.steps[props.current + 1]
  return next?.locked ? next.lockedReason : undefined
})

function go(step: number) {
  if (step < 0 || step > 3) return
  if (step > props.current && nextLockedReason.value) return
  emit('navigate', { step: step as StepIndex })
}

/** Alt+← / Alt+→: adımlar arası (yalnız bu form görünürken; tarayıcının geri/ileri kısayolunu bastırır). */
function onKey(e: KeyboardEvent) {
  if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
  const head = document.querySelector<HTMLElement>(`[data-pfw="${uid}"]`)
  if (!head || head.offsetParent === null) return // başka sekme etkin (form gizli)
  e.preventDefault()
  go(props.current + (e.key === 'ArrowRight' ? 1 : -1))
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

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
/* Şerit kartı: [‹] adımlar [Devam ›] */
.pfw-head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.pfw-nav {
  flex: 1 1 auto;
  min-width: 0;
}

.pfw-head__next {
  flex: none;
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

/* Tamamlanan adımlar site aksiyon tonunda (mavi) — yeşil yerine (FE-LOCAL-1002b). */
.pfw-steps__item.is-complete .pfw-steps__link {
  background: var(--ek-color-action);
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
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
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
  color: var(--ek-color-action-emphasis);
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
}

/* Başlıktaki kompakt hâl (teleportTo): kart/yapışkanlık yok, tek satır; ipucu cümlesi ekran okuyucuya kalır
   (Kaydet'in aria-describedby hedefi) ve sayaç üzerine gelince görünür (title). */
.pfw-bar.is-inline {
  position: static;
  margin: 0;
  border: 0;
  background: transparent;
}

.pfw-bar.is-inline::before {
  display: none;
}

.pfw-bar.is-inline .pfw-bar__row {
  gap: var(--ek-space-3);
  padding: 0;
}

.pfw-bar.is-inline .pfw-bar__icon {
  width: 28px;
  height: 28px;
}

.pfw-bar.is-inline .pfw-progress__head {
  max-width: none;
}

.pfw-bar.is-inline .pfw-meter {
  flex: none;
  width: 120px;
}

.pfw-bar.is-inline .pfw-hint {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
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
  color: var(--ek-color-content-strong);
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
  color: var(--ek-color-content-strong); /* sarı üzerine koyu metin (kırmızımsı ton yok) */
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

/* Tablet: adım durum metni gizlenmez; şerit yatay kaydırılmaz — başlıklar kısalır (…). */
@media (max-width: 1023px) {
  .pfw-step {
    gap: var(--ek-space-2);
    padding-right: var(--ek-space-2);
  }

  /* Tablette başlık kesilmez, iki satıra sarılır. */
  .pfw-step__title {
    white-space: normal;
    text-wrap: balance;
  }

  .pfw-steps__link {
    min-width: var(--ek-space-2);
  }
}

/* Mobil: işaretçiler bağlantıyla tek sıra, başlık + durum altta ortalı; kayıt çubuğu iki satır (akışta, yapışkan değil). */
@media (max-width: 599px) {
  .pfw-head {
    padding: var(--ek-space-2);
    gap: var(--ek-space-1);
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

/* ================= FE-LOCAL-1054 — ürün formu adım şeridi: uygulamanın tasarım diliyle =================
   Şerit düz yüzey (gölge yok). Adım işaretleri yuvarlak değil ÇERÇEVELİ KÖŞELİ kutu; etkin adım hap değil, kutu
   köşeli — eylem renginin açık tonu + ince çerçeve, işareti dolu eylem rengi (parıltı halkası yok). Adımlar arası
   bağlantı ince çizgi; tamamlanan adımdan sonra eylem tonunda. */
.pfw-head {
  box-shadow: none;
}

.pfw-step {
  border-radius: var(--ek-radius-tile);
  padding: var(--ek-space-1) var(--ek-space-3) var(--ek-space-1) var(--ek-space-1);
}

.pfw-step__marker {
  border-color: var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}

.is-current .pfw-step__marker {
  box-shadow: none;
}

.is-complete:not(.is-current) .pfw-step__marker {
  color: var(--ek-color-action-emphasis);
}

.pfw-steps__link {
  height: 1px;
  border-radius: 0;
}

.pfw-steps__item.is-complete .pfw-steps__link {
  background: var(--ek-color-action-border);
  opacity: 1;
}

.pfw-head__prev,
.pfw-head__next :deep(.ek-btn) {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
}
</style>
