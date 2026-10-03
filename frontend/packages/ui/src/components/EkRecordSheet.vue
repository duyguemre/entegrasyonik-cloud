<!--
  packages/ui/src/components/EkRecordSheet.vue

  FR3 madde 12–13 — ORTAK KAYIT DETAYI DİYALOĞU (sipariş, iade, müşteri, fatura, destek talebi). `EkDetailSheet`'in
  yerine geçmez (o kalır); bu desen bölüm hiyerarşisini sabitler:

      ┌ ÜST ÇUBUK (yüzey) ─ tür etiketi · kimlik · durum ……………… [başlık eylemleri] [×] ┐
      │ GÖVDE (zemin = sayfa tuvali, yüzeyden hafif farklı)                                │
      │   #summary   → kayıt özeti (EkRecordSummary) — her zaman en üstte                 │
      │   varsayılan → EkDetailPanel kartları (başlıklı beyaz kutular, tuvalden öne çıkar) │
      └ ALT EYLEM ÇUBUĞU (yüzey, sabit) ─ [#footer-start: ikincil / yıkıcı] …… [#actions] ┘
        (`#footer` verilirse çubuk tamamen ona bırakılır — ör. destek talebinin yanıt alanı)

  Kurallar (FR3_PATTERNS'ten bağımsız, bu bileşenin sözleşmesi):
    • Başlıkta yalnız kimlik + durum + (varsa) sessiz başlık eylemleri (düzenle, ⋯). İş akışı eylemleri ALT ÇUBUKTA:
      sağa yaslı, birincil en sağda (tek primary); iptal/reddet gibi yıkıcı ya da ikincil olanlar solda.
    • Gövdede çıplak içerik yok: her bölüm `EkDetailPanel` (başlık + içerik). Özet ve "sıradaki adım" kartları
      zaten kart dilindedir. Bilgi kartları (`EkInfoCard`, `.ek-detail-panel`) tuvalde kart gölgesiyle öne çıkar.
    • Sunum `EkDetailSheet` ile aynı (sağa yaslı yan sayfa, sekme kabına bağlı, odak tuzağı Vuetify'dan); `size`
      md 720 / lg 960. Dar ekranda tam ekran; alt çubuk sarılır.
  Sınıf uyumu: içerik kabı `ek-detail-sheet` sınıfını da taşır (konumlandırma + mevcut e2e seçicileri).
-->
<template>
  <v-dialog v-model="isOpen" :content-class="['ek-detail-sheet', 'ek-record-sheet', `ek-detail-sheet--${size}`].join(' ')"
    transition="fade-transition" :content-props="{ id: contentId }" v-bind="tabOverlay.overlayProps.value">
    <v-card class="ek-record-sheet__card" :aria-labelledby="titleId">
      <header class="ek-record-sheet__header">
        <div class="ek-record-sheet__identity">
          <span v-if="kind" class="ek-record-sheet__kind">{{ kind }}</span>
          <div class="ek-record-sheet__title-row">
            <h2 :id="titleId" class="ek-record-sheet__title">{{ identity }}</h2>
            <slot name="status" />
          </div>
        </div>
        <div class="ek-record-sheet__header-actions">
          <slot name="header-actions" />
          <v-btn icon="mdi-close" variant="text" density="comfortable" aria-label="Kapat" @click="isOpen = false" />
        </div>
      </header>

      <div class="ek-record-sheet__body ek-detail-sheet__body" tabindex="0" role="region" :aria-label="`${identity} ayrıntıları`">
        <div v-if="$slots.summary" class="ek-record-sheet__summary"><slot name="summary" /></div>
        <slot />
      </div>

      <footer v-if="$slots.footer" class="ek-record-sheet__footer ek-record-sheet__footer--custom"><slot name="footer" /></footer>
      <footer v-else-if="$slots.actions || $slots['footer-start']" class="ek-record-sheet__footer" aria-label="Kayıt eylemleri">
        <div class="ek-record-sheet__footer-start"><slot name="footer-start" /></div>
        <div class="ek-record-sheet__footer-end"><slot name="actions" /></div>
      </footer>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, toRef, useId } from 'vue'
import { useTabOverlay } from '../composables/useTabScope'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    /** Başlıktaki kimlik (sipariş no, müşteri adı, talep no). */
    identity: string
    /** Kimliğin üstündeki küçük tür etiketi (ör. "Sipariş", "İade talebi"). */
    kind?: string
    attach?: string | boolean | Element
    size?: 'md' | 'lg'
  }>(),
  { size: 'md' },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const uid = useId()
const contentId = `ek-record-sheet-${uid}`
const titleId = `ek-record-sheet-title-${uid}`
const tabOverlay = useTabOverlay({
  open: toRef(props, 'modelValue'),
  attach: toRef(props, 'attach'),
  persistent: computed(() => false),
  close: () => emit('update:modelValue', false),
  contentId,
})

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
</script>

<style scoped>
.ek-record-sheet__card {
  height: 100%;
  /* !important gerekçesi: global `.v-card` radius-lg; yan sayfa köşeleri kare (EkDetailSheet ile aynı). */
  border-radius: 0 !important;
  display: flex;
  flex-direction: column;
  background: var(--ek-color-app-bg);
}

.ek-record-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-4);
  min-height: 64px;
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-3) var(--ek-space-6);
  border-bottom: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
  flex: none;
}

.ek-record-sheet__identity {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ek-record-sheet__kind {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-record-sheet__title-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-record-sheet__title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ek-font-size-lg);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-record-sheet__header-actions {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  flex: none;
}

.ek-record-sheet__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--ek-space-5) var(--ek-space-6) var(--ek-space-6);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-record-sheet__body:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.ek-record-sheet__summary {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

/* Tuvaldeki bilgi kartları aynı yüzey dilinde öne çıkar (EkInfoCard kendi başına gölgesizdir). */
.ek-record-sheet__body :deep(.ek-info-card) {
  box-shadow: var(--ek-shadow-card);
}

.ek-record-sheet__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-6);
  border-top: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
  flex: none;
}

/* `#footer`: tam genişlik özel alt çubuk (ör. destek yanıt alanı). */
.ek-record-sheet__footer--custom {
  display: block;
}

.ek-record-sheet__footer-start,
.ek-record-sheet__footer-end {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-record-sheet__footer-end {
  justify-content: flex-end;
  margin-inline-start: auto;
}

@media (max-width: 599px) {
  .ek-record-sheet__header {
    padding: var(--ek-space-2) var(--ek-space-2) var(--ek-space-2) var(--ek-space-4);
  }

  .ek-record-sheet__body {
    padding: var(--ek-space-4) var(--ek-space-3);
    gap: var(--ek-space-3);
  }

  .ek-record-sheet__footer {
    flex-wrap: wrap;
    padding: var(--ek-space-2) var(--ek-space-3);
  }

  .ek-record-sheet__footer-end {
    flex: 1 1 auto;
  }
}

/* ================= FE-LOCAL-1045 — detay sayfası: ana sayfa dili =================
   Tür etiketi (SİPARİŞ / MÜŞTERİ KARTI …) eylem renginde kısa çizgiyle başlar (bölüm başlıklarıyla aynı). */
.ek-record-sheet__kind {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-record-sheet__kind::before {
  content: '';
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}
</style>
