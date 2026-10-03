<!--
  frontend/src/components/productDefinitions/KeyboardHelpMenu.vue

  Ürün formu çalışma alanlarının ORTAK klavye kısayolu kartı: varyant tablosu (ProductVariantsComponent), toplu varyant
  düzenleyici (VariantBulkEditor) ve ürün resim galerisi (ProductImagesComponent) aynı ikonu ve aynı kartı kullanır.
  Alt şerit yerine ikonla açılır (yer kazanılır); üzerine gelince ya da tıklayınca açılır, klavyeyle de erişilir.
-->
<template>
  <v-menu location="bottom end" offset="6" open-on-hover :open-delay="150" :close-on-content-click="false">
    <template #activator="{ props: kp }">
      <EkButton v-bind="kp" size="sm" tone="ghost" icon="mdi-keyboard-outline" icon-only :aria-label="title" />
    </template>
    <div class="khm" role="note" :aria-label="title">
      <span class="khm__title">{{ title }}</span>
      <span v-for="k in keys" :key="k.text" class="khm__row"><EkKbd :keys="k.keys" /><span>{{ k.text }}</span></span>
      <template v-if="mouse?.length">
        <span class="khm__title">Fare</span>
        <span v-for="m in mouse" :key="m.text" class="khm__row"><span class="khm__how">{{ m.how }}</span><span>{{ m.text }}</span></span>
      </template>
    </div>
  </v-menu>
</template>

<script setup lang="ts">
import { EkButton, EkKbd } from '@entegrasyonik/ui/components'

export interface KeyHelp { keys: string | string[]; text: string }
export interface MouseHelp { how: string; text: string }

withDefaults(defineProps<{ keys: KeyHelp[]; mouse?: MouseHelp[]; title?: string }>(), { title: 'Klavye kısayolları' })
</script>

<style scoped>
.khm {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 300px;
  max-width: min(420px, calc(100vw - 32px));
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-raised);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
.khm__title { color: var(--ek-color-content-strong); font-size: var(--ek-type-label-size); font-weight: var(--ek-font-weight-semibold); }
.khm__title:not(:first-child) { margin-top: var(--ek-space-1); }
.khm__row { display: grid; grid-template-columns: 128px minmax(0, 1fr); align-items: center; gap: var(--ek-space-3); }
.khm__how { color: var(--ek-color-content-muted); }
</style>
