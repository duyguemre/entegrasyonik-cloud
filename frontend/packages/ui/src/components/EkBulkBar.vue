<!--
  frontend/src/components/ds/EkBulkBar.vue

  DS-v2 — liste çerçevesinin üst çubuğu (EkListFrame #toolbar). İki hâl:
    seçim YOK : [#start] ipucu/başlık ........................ [#end]
    seçim VAR : "n <nesne> seçildi" · [#actions] ........ Seçimi kaldır
  Seçim hâlinde `selection` zemin + solda 3px aksiyon göstergesi (satır seçimiyle aynı dil).
  Yalnız ekranda GERÇEKTEN olan toplu eylemler `#actions`'a konur.
  Aşama 6b (Standart 3): TÜM ekranlarda tek toplu işlem çubuğu (liste çerçevesinin üstü, aynı konum/görünüm).
  Tehlikeli toplu eylem `EkActionButton action="delete|cancel" show-label` (kırmızı metin + onay diyaloğu).
-->
<template>
  <div class="ek-bulk" :class="{ 'is-on': count > 0 }" role="region" :aria-label="count > 0 ? 'Toplu işlemler' : 'Liste araç çubuğu'">
    <template v-if="count > 0">
      <span class="ek-bulk__count" aria-live="polite">
        <v-icon class="ek-bulk__check" icon="mdi-checkbox-marked" aria-hidden="true" />
        <strong class="ek-num">{{ count }}</strong> {{ noun }} seçildi
      </span>
      <div class="ek-bulk__actions"><slot name="actions" /></div>
      <span class="ek-bulk__sep" aria-hidden="true"></span>
      <EkButton tone="ghost" size="sm" :icon="icons.close" @click="emit('clear')">Seçimi kaldır</EkButton>
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
import { icons } from '../icons'

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
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  white-space: nowrap;
}

.ek-bulk__check {
  font-size: var(--ek-icon-md);
  color: var(--ek-color-action);
}

.ek-bulk__sep {
  width: 1px;
  height: 20px;
  background: var(--ek-color-action-border);
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
