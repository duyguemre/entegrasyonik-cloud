<!--
  BoCollapsible — DARALTILABİLİR BÖLÜM (BO2-70, BO2-P1). İkinci plandaki ayrıntı (açıklama, kanıt, teknik not) kapalı
  başlar; başlık düğmesi `aria-expanded` + `aria-controls`. İçerik ilk açılışta çizilir (`lazy`), sonra korunur.
  `inline`: düğme bulunduğu satıra (ör. eylem satırı) katılır, açılan içerik alt satıra tam genişlikte iner (kapsayıcı
  `display: flex; flex-wrap: wrap` olmalı). Sayfa düzeyinde paylaşılabilir ayrıntı için `BoDetailSection` (`?ayrinti=`) kullanılır; bu bileşen kart/madde içidir.

    <BoCollapsible label="Neden ve ne yapmalı">…</BoCollapsible>
-->
<template>
  <div class="bo-collapse" :class="{ 'is-open': open, 'is-inline': inline }" data-bo-collapsible>
    <button type="button" class="bo-collapse__toggle" :aria-expanded="open" :aria-controls="bodyId" @click="toggle">
      <v-icon class="bo-collapse__chev" icon="mdi-chevron-right" aria-hidden="true" />
      <span>{{ open && openLabel ? openLabel : label }}</span>
      <span v-if="hint && !open" class="bo-collapse__hint">{{ hint }}</span>
    </button>
    <div v-show="open" :id="bodyId" class="bo-collapse__body">
      <slot v-if="rendered" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue'

const props = withDefaults(defineProps<{ label: string; openLabel?: string; hint?: string; defaultOpen?: boolean; lazy?: boolean; inline?: boolean }>(), { lazy: true })
const emit = defineEmits<{ toggle: [open: boolean] }>()
const bodyId = `${useId()}-body`
const open = ref(props.defaultOpen)
const rendered = ref(props.defaultOpen || !props.lazy)

function toggle() {
  open.value = !open.value
  if (open.value) rendered.value = true
  emit('toggle', open.value)
}
</script>

<style scoped>
.bo-collapse__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: 28px;
  padding: 0 var(--ek-space-1) 0 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-action-emphasis);
  font: inherit;
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
}

.bo-collapse__toggle:hover {
  color: var(--ek-color-content-strong);
}

.bo-collapse__toggle:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-collapse__chev {
  font-size: var(--ek-icon-sm);
  transition: transform var(--ek-duration-fast) var(--ek-easing-standard);
}

.bo-collapse.is-open .bo-collapse__chev {
  transform: rotate(90deg);
}

.bo-collapse__hint {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.bo-collapse__body {
  padding-top: var(--ek-space-2);
}

.bo-collapse.is-inline {
  display: contents;
}

.bo-collapse.is-inline .bo-collapse__body {
  flex: 1 1 100%;
  padding-top: 0;
}

@media (pointer: coarse) {
  .bo-collapse__toggle {
    min-height: var(--ek-control-h-touch);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bo-collapse__chev {
    transition: none;
  }
}

/* BO-LOCAL-01 — aç/kapa: ok çerçeveli köşeli küçük kutuda; geçiş uygulamanın tek hız rolüyle. */
.bo-collapse__chev {
  width: 20px;
  height: 20px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  transition: transform var(--ek-motion-reveal);
}

.bo-collapse__toggle {
  gap: var(--ek-space-2);
}

.bo-collapse__toggle:hover .bo-collapse__chev {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}
</style>
