<!--
  frontend/src/components/ds/EkDialogHost.vue

  DS-v2 Aşama 2 — kendi kartını çizen PANEL bileşenlerini (ör. ürün resim galerisi,
  varyant özellikleri, toplu fiyat) standart diyalog kabuğunda açar. `EkDialog`
  başlık/eylem bandını KENDİSİ çizer; bu bileşen ise yalnızca kabuğu verir:
  perde (`scrim-veil`), ortalama (veya sağa yaslı yan panel), genişlik ön ayarı,
  diyalog köşe/gölge rolü, sekmeye iliştirme (`attach` → yalnızca o çalışma alanı
  sekmesini örter). İçerideki panel kartı (CardComponent / EkDialogCard) kök
  öğe olarak verilir; köşe ve gölge diyalog rolüne çekilir.

  Önceki desen (kaldırılan): her ekranda sürekli açık, görünmez (`visibility:hidden`)
  tutulan tam alan `v-dialog` + içinde koşullu paneller. Artık diyalog yalnızca bir
  panel açıkken açıktır; Esc / perde tıklaması `update:modelValue(false)` yayar
  (çağıran açık paneli kapatır). `persistent` ile kapatma engellenebilir.

    <EkDialogHost :model-value="isImagesDialog" attach=".productDefinitionView" width="xl"
      @update:model-value="(v) => !v && (isImagesDialog = false)">
      <ProductImagesComponent v-if="isImagesDialog" @close="isImagesDialog = false" />
    </EkDialogHost>
-->
<template>
  <v-dialog
    :model-value="modelValue"
    :retain-focus="retainFocus"
    v-bind="tabOverlay.overlayProps.value"
    :class="['ek-dialog-overlay', 'ek-dialog-host', `ek-dialog-host--${placement}`]"
    :content-class="`ek-dialog-content ek-dialog-host__content ek-dialog-content--${maxWidth ? 'custom' : width}`"
    :content-props="contentProps"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <slot />
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, toRef, useId } from 'vue'
import { useTabOverlay } from '../composables/useTabScope'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    width?: 'sm' | 'md' | 'lg' | 'xl'
    maxWidth?: number | string
    attach?: string | boolean | Element
    /** center: ortalanmış diyalog · end: sağa yaslı, tam yükseklik yan panel */
    placement?: 'center' | 'end'
    persistent?: boolean
    retainFocus?: boolean
  }>(),
  { width: 'lg', attach: false, placement: 'center', persistent: false, retainFocus: false },
)

const emit = defineEmits<{ 'update:modelValue': [open: boolean] }>()

const cssWidth = (v: number | string) => (typeof v === 'number' || /^\d+$/.test(v) ? `${v}px` : v)
const contentId = `ek-dialog-host-${useId()}`
// Aşama 6b (Standart 7): sekme kabına bağlanır (yalnız o sekmenin içeriğini örter); Esc/perde kapanışı sekme içi.
const tabOverlay = useTabOverlay({
  open: toRef(props, 'modelValue'),
  attach: toRef(props, 'attach'),
  persistent: toRef(props, 'persistent'),
  close: () => emit('update:modelValue', false),
  contentId,
})
const contentProps = computed(() => ({ id: contentId, ...(props.maxWidth ? { style: { maxWidth: `${cssWidth(props.maxWidth)} !important` } } : {}) }))
</script>

<style src="./ek-dialog-overlay.css"></style>

<style>
/* Panelin kök kartı diyalog rolünü alır (köşe/gölge); içerik yüksekliği taşarsa kart kendi içinde kayar. */
.ek-dialog-host__content > * {
  max-height: 100%;
  overflow: auto;
  border-radius: var(--ek-radius-dialog) !important;
  box-shadow: var(--ek-shadow-dialog) !important;
}

/* Yan panel: sağa yaslı, tam yükseklik. */
.v-dialog.ek-dialog-host--end {
  justify-content: flex-end;
}

.v-dialog.ek-dialog-host--end > .ek-dialog-host__content.v-overlay__content {
  height: calc(100% - var(--ek-space-6)) !important;
  max-height: calc(100% - var(--ek-space-6)) !important;
  margin: var(--ek-space-3) var(--ek-space-3) var(--ek-space-3) auto !important;
}

.v-dialog.ek-dialog-host--end > .ek-dialog-host__content > * {
  height: 100%;
}
</style>
