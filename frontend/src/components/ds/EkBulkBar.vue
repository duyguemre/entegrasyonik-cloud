<!--
  frontend/src/components/ds/EkBulkBar.vue

  DS-v2 — liste çerçevesinin üst çubuğu (EkListFrame #toolbar). İki hâl:
    seçim YOK : [#start] ipucu/başlık ........................ [#end]
    seçim VAR : "n <nesne> seçildi" · [#actions] ........ Seçimi kaldır
  Seçim hâlinde `selection` zemin + solda 3px aksiyon göstergesi (satır seçimiyle aynı dil).
  Yalnız ekranda GERÇEKTEN olan toplu eylemler `#actions`'a konur.
-->
<template>
  <div class="ek-bulk" :class="{ 'is-on': count > 0 }" role="region" :aria-label="count > 0 ? 'Toplu işlemler' : 'Liste araç çubuğu'">
    <template v-if="count > 0">
      <span class="ek-bulk__count" aria-live="polite"><strong>{{ count }}</strong> {{ noun }} seçildi</span>
      <div class="ek-bulk__actions"><slot name="actions" /></div>
      <EkButton tone="ghost" size="sm" icon="mdi-close" @click="emit('clear')">Seçimi kaldır</EkButton>
    </template>
    <template v-else>
      <div class="ek-bulk__start">
        <slot name="start"><span class="ek-bulk__hint">{{ hint }}</span></slot>
      </div>
      <div class="ek-bulk__end"><slot name="end" /></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import EkButton from './EkButton.vue'

withDefaults(defineProps<{ count?: number; noun?: string; hint?: string }>(), {
  count: 0,
  noun: 'kayıt',
  hint: '',
})
const emit = defineEmits<{ clear: [] }>()
</script>

<style scoped>
.ek-bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 48px;
  padding: var(--ek-space-2) var(--ek-space-4);
}

.ek-bulk.is-on {
  background: var(--ek-color-selection);
  box-shadow: inset 3px 0 0 var(--ek-color-action);
}

.ek-bulk__count {
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  white-space: nowrap;
}

.ek-bulk__actions {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
}

.ek-bulk__start {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-bulk__end {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-bulk__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
</style>
