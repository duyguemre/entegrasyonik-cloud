<!--
  Tanım listelerinde satır içi değer ekleme: "+ Ekle" hapı → aynı yerde kısa giriş alanı.
  Enter ekler (boş değilse), Esc / boş odak kaybı vazgeçer. Klavye ile tam kullanılır.
-->
<template>
  <span v-if="open" class="dv-add">
    <input ref="inputRef" v-model="text" class="dv-add__input" type="text" maxlength="160" :aria-label="inputLabel"
      :placeholder="inputLabel" @keydown.enter.prevent="commit" @keydown.esc.prevent="cancel" @blur="!text.trim() && cancel()" />
    <button type="button" class="dv-add__ok" :aria-label="addLabel" :disabled="!text.trim()" @mousedown.prevent @click="commit">
      <v-icon size="14" aria-hidden="true">mdi-check</v-icon>
    </button>
  </span>
  <button v-else type="button" class="dv-add__trigger" :aria-label="addLabel" @click="start">
    <v-icon size="14" aria-hidden="true">mdi-plus</v-icon><span>{{ triggerText ?? 'Ekle' }}</span>
  </button>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'

defineProps<{ addLabel: string; inputLabel: string; triggerText?: string }>()
const emit = defineEmits<{ add: [title: string] }>()

const open = ref(false)
const text = ref('')
const inputRef = ref<HTMLInputElement>()

const start = async () => { open.value = true; await nextTick(); inputRef.value?.focus() }
const cancel = () => { open.value = false; text.value = '' }
const commit = () => {
  const v = text.value.trim()
  if (!v) return
  emit('add', v)
  cancel()
}
</script>

<style scoped>
.dv-add__trigger,
.dv-add {
  display: inline-flex;
  align-items: center;
  height: 22px;
  border-radius: var(--ek-radius-chip);
  font-size: var(--ek-font-size-xs);
}

.dv-add__trigger {
  gap: var(--ek-space-1);
  padding: 0 var(--ek-space-3) 0 var(--ek-space-2);
  border: 1px dashed var(--ek-color-border-default);
  background: none;
  color: var(--ek-color-content-muted);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.dv-add__trigger:hover {
  border-color: var(--ek-color-action);
  color: var(--ek-color-action);
}

.dv-add__trigger:focus-visible,
.dv-add__ok:focus-visible {
  outline: 2px solid var(--ek-color-action);
  outline-offset: 1px;
}

.dv-add {
  border: 1px solid var(--ek-color-action);
  background: var(--ek-color-surface);
}

.dv-add__input {
  width: 128px;
  height: 100%;
  padding: 0 var(--ek-space-3);
  border: 0;
  outline: 0;
  background: none;
  color: var(--ek-color-content-strong);
  font: inherit;
}

.dv-add__input::placeholder { color: var(--ek-color-content-muted); }

.dv-add__ok {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-inline-end: 1px;
  border: 0;
  border-radius: var(--ek-radius-chip);
  background: none;
  color: var(--ek-color-action);
  cursor: pointer;
}

.dv-add__ok:disabled { color: var(--ek-color-content-subtle); cursor: default; }
</style>
