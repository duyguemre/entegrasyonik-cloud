<!--
  E-posta HTML önizlemesi. Sözleşme: `html` sunucuda kaçışlı olsa da YALNIZ `<iframe sandbox srcdoc>` ile gösterilir,
  asla innerHTML/v-html. `sandbox=""` en kısıtlı kip: betik, form, açılır pencere, üst belgeye gezinme ve aynı köken yok.
-->
<template>
  <div class="bo-mail">
    <p class="bo-mail__subject"><span class="bo-muted">Konu:</span> {{ subject }}</p>
    <iframe class="bo-mail__frame" sandbox="" referrerpolicy="no-referrer" :srcdoc="doc" :title="`E-posta önizlemesi: ${subject}`" data-testid="email-frame" />
    <details class="bo-mail__text">
      <summary>Düz metin sürümü</summary>
      <pre>{{ text }}</pre>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ subject: string; html: string; text: string }>()
/**
 * E-posta istemcisi gibi iki temada da açık zeminde çizilir: sistem renkleri (Canvas/CanvasText) + light şeması
 * belgenin <html> etiketinden hemen sonra eklenir (sunucu HTML'i değiştirilmez, yalnız görünüm ipucu).
 */
const LIGHT = '<style>:root{color-scheme:light;background:Canvas;color:CanvasText;font-family:system-ui,sans-serif}</style>'
const doc = computed(() => (/<html[^>]*>/i.test(props.html) ? props.html.replace(/<html[^>]*>/i, (m) => m + LIGHT) : LIGHT + props.html))
</script>

<style scoped>
.bo-mail {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}
.bo-mail__subject {
  margin: 0;
  font-size: var(--ek-type-label-size);
  overflow-wrap: anywhere;
}
.bo-mail__frame {
  width: 100%;
  min-height: 260px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-raised);
}
.bo-mail__text summary {
  cursor: pointer;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-mail__text pre {
  margin: var(--ek-space-2) 0 0;
  padding: var(--ek-space-3);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
  white-space: pre-wrap;
}
</style>
