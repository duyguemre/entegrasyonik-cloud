<!--
  Kanal bilgisi AYAR SATIRI — solda ad + ne işe yaradığı, sağda giriş (varsayılan yuva); altta durum:
  "Varsayılan kullanılıyor: X" ya da "Özel değer · Varsayılan: X · Varsayılana dön". Ürün formu Detay Bilgiler adımıyla
  aynı görsel dil. Giriş, `id` ile `<label for>`'a bağlanmalı (erişilebilir ad).
-->
<template>
  <div class="ir" :class="{ 'is-custom': custom }">
    <div class="ir__text">
      <label class="ir__label" :for="id">{{ label }}</label>
      <p v-if="desc" class="ir__desc">{{ desc }}</p>
    </div>
    <div class="ir__control">
      <slot />
      <p :id="`${id}-state`" class="ir__state" :class="{ 'is-custom': custom }">
        <template v-if="custom">
          <span class="ir__tag">Özel değer</span>
          <span v-if="defaultText">Varsayılan: {{ defaultText }}</span>
          <button type="button" class="ir__reset" @click="emit('reset')">Varsayılana dön</button>
        </template>
        <template v-else-if="note"><v-icon icon="mdi-information-outline" aria-hidden="true" class="is-info" />{{ note }}</template>
        <template v-else><v-icon icon="mdi-check" aria-hidden="true" />Varsayılan kullanılıyor{{ defaultText ? `: ${defaultText}` : '' }}</template>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ id: string; label: string; desc?: string; custom: boolean; defaultText?: string; note?: string }>()
const emit = defineEmits<{ reset: [] }>()
</script>

<style scoped>
.ir {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 16rem);
  gap: var(--ek-space-2) var(--ek-space-5);
  align-items: start;
  padding: var(--ek-space-4) var(--ek-space-5);
  transition: background-color var(--ek-motion-feedback);
}
.ir.is-custom { background: color-mix(in srgb, var(--ek-color-action-subtle) 45%, var(--ek-color-surface)); }
.ir.is-custom::before {
  content: '';
  position: absolute;
  inset: var(--ek-space-3) auto var(--ek-space-3) 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--ek-color-action);
}
.ir__text { min-width: 0; padding-top: var(--ek-space-2); }
.ir__label { display: block; color: var(--ek-color-content-strong); font-size: var(--ek-type-body-size); font-weight: 600; }
.ir__desc { margin: 2px 0 0; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
.ir__control { display: flex; flex-direction: column; gap: var(--ek-space-1); min-width: 0; }
.ir__control :deep(.v-field) { border-radius: var(--ek-radius-control); background: var(--ek-color-surface); }
.ir__control :deep(input) { font-variant-numeric: tabular-nums; }
.ir__control :deep(.v-text-field__suffix) { color: var(--ek-color-content-muted); opacity: 1; }
.ir__control :deep(input::placeholder) { color: var(--ek-color-content-subtle); opacity: 1; }
.ir__state {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
.ir__state .v-icon { font-size: var(--ek-icon-sm); color: var(--ek-color-success); }
.ir__state .v-icon.is-info { color: var(--ek-color-info); }
.ir__tag {
  padding: 0 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-weight: 600;
}
.ir__reset {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
  padding: 1px var(--ek-space-2);
  color: var(--ek-color-action);
  font-weight: 600;
  text-decoration: none;
  border-radius: var(--ek-radius-control);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}
.ir__reset:hover { background: var(--ek-color-action-subtle); color: var(--ek-color-action-emphasis); }
.ir__reset:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
@media (max-width: 599px) {
  .ir { grid-template-columns: minmax(0, 1fr); padding: var(--ek-space-4); }
  .ir__text { padding-top: 0; }
}
@media (prefers-reduced-motion: reduce) { .ir, .ir__reset { transition: none; } }
</style>
