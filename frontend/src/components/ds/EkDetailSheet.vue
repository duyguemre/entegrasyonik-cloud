<!--
  frontend/src/components/ds/EkDetailSheet.vue

  ADR-0015 Karar 3.8/6.1 — kayıt detayı "yan sayfa" (side-sheet) sunumu.
  `v-dialog` KORUNUR (Alternatif D2 — `role="dialog"` + odak tuzağı Vuetify'dan
  AYNEN gelir, `useBackDismiss` [ADR-0012] yeniden kurulmaz). Sağa yaslı, tam
  yükseklik, 720px (≥1024), tablette %90, mobilde tam ekran.

  Yapı: başlıkta kimlik + `EkStatusChip` (isteğe bağlı) + kapat; gövdede
  `EkSection` blokları (slot); eylemler üst SAĞDA (birincil → ikincil → `⋯`,
  yıkıcı en sonda menüde — `EkPageHeader` ile AYNI eylem sırası kuralı).

  Kullanım:
    <EkDetailSheet v-model="showDetail" :identity="order.orderNumber">
      <template #status><EkStatusChip :tone="entry.tone" :label="..." /></template>
      <template #actions><v-btn color="primary">Faturala</v-btn></template>
      <EkSection title="Teslimat"> ... </EkSection>
    </EkDetailSheet>
-->
<template>
  <v-dialog v-model="isOpen" content-class="ek-detail-sheet" transition="fade-transition">
    <v-card class="ek-detail-sheet__card">
      <header class="ek-detail-sheet__header">
        <div class="ek-detail-sheet__identity">
          <span class="ek-detail-sheet__title">{{ identity }}</span>
          <slot name="status" />
        </div>
        <div class="ek-detail-sheet__header-actions">
          <slot name="actions" />
          <v-btn icon="mdi-close" variant="text" density="comfortable" aria-label="Kapat" @click="isOpen = false" />
        </div>
      </header>
      <div class="ek-detail-sheet__body">
        <slot />
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: boolean
  /** Başlıktaki kimlik metni (ör. sipariş no). */
  identity: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})
</script>

<style>
/* `content-class` Vuetify'ın v-overlay__content'ine eklenir — scoped
 * ATTRIBUTE selector'ları overlay teleport hedefine ULAŞAMAZ, bu yüzden bu
 * blok KASITLI olarak scoped DEĞİLDİR (yalnızca `.ek-detail-sheet` ile
 * sınırlı, global sızıntı riski yok). */
.ek-detail-sheet.v-overlay__content {
  position: fixed;
  top: 0;
  right: 0;
  margin: 0;
  height: 100%;
  max-height: 100%;
  width: 720px;
  max-width: 100%;
  border-radius: 0;
}

@media (max-width: 1279px) {
  .ek-detail-sheet.v-overlay__content {
    width: 90%;
  }
}

@media (max-width: 767px) {
  .ek-detail-sheet.v-overlay__content {
    width: 100%;
  }
}
</style>

<style scoped>
.ek-detail-sheet__card {
  height: 100%;
  /* !important gerekçesi: global vuetify-overrides.css `.v-card` için
   * `radius-lg` yazıyor; yan sayfa sunumu (Karar 3.8) köşeleri KARE ister. */
  border-radius: 0 !important;
  display: flex;
  flex-direction: column;
}

.ek-detail-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4) var(--ek-space-6);
  border-bottom: 1px solid var(--ek-color-border-default);
  flex: none;
}

.ek-detail-sheet__identity {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-detail-sheet__title {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-detail-sheet__header-actions {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  flex: none;
}

.ek-detail-sheet__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--ek-space-6);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-8);
}
</style>
