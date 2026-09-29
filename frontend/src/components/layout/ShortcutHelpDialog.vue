<!--
  frontend/src/components/layout/ShortcutHelpDialog.vue

  DS-v2 Aşama 2 — klavye kısayolları listesi (`?` veya Yardım/Hesap menüsü).
  İçerik `navigation/shortcuts.ts` kaydından okunur — liste, global dinleyici
  ve ipuçları aynı TEK kaynaktan beslenir. Standart `EkDialog` (başlık bandı ·
  içerik · eylem çubuğu).
-->
<template>
  <EkDialog
    :model-value="modelValue"
    title="Klavye kısayolları"
    description="Kabuk genelinde çalışır; metin alanında yazarken yalnızca Ctrl'li kısayollar etkindir."
    icon="mdi-keyboard-outline"
    width="md"
    @update:model-value="(v: boolean) => $emit('update:modelValue', v)"
  >
    <!-- Dar ekranda gövde kayar: kaydırma bölgesi klavyeyle erişilebilsin diye liste odaklanabilir (axe scrollable-region-focusable). -->
    <div class="ek-shortcuts" tabindex="0" role="group" aria-label="Kısayol listesi">
      <section v-for="group in SHORTCUT_GROUPS" :key="group.label" class="ek-shortcuts__group" :aria-labelledby="`ek-shortcuts-${group.label}`">
        <h3 :id="`ek-shortcuts-${group.label}`" class="ek-shortcuts__label">{{ group.label }}</h3>
        <dl class="ek-shortcuts__list">
          <div v-for="item in group.items" :key="item.id" class="ek-shortcuts__row">
            <dt class="ek-shortcuts__desc">{{ item.label }}</dt>
            <dd class="ek-shortcuts__keys"><EkKbd :keys="[...item.keys]" /></dd>
          </div>
        </dl>
      </section>
      <p class="ek-shortcuts__note">
        Sekme şeridinde ayrıca: <EkKbd :keys="['←', '→']" /> sekmeler arası, <EkKbd keys="Delete" /> kapat,
        <EkKbd :keys="['Shift', 'F10']" /> sekme menüsü. Aramada: <EkKbd :keys="['↑', '↓']" /> gezin, <EkKbd keys="Enter" /> aç,
        <EkKbd keys="Esc" /> kapat.
      </p>
    </div>
    <template #actions>
      <EkButton tone="primary" @click="$emit('update:modelValue', false)">Tamam</EkButton>
    </template>
  </EkDialog>
</template>

<script lang="ts" setup>
import EkDialog from '@/components/ds/EkDialog.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkKbd from '@/components/ds/EkKbd.vue'
import { SHORTCUT_GROUPS } from '@/navigation/shortcuts'

defineProps<{ modelValue: boolean }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<style scoped>
.ek-shortcuts {
  border-radius: var(--ek-radius-control);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}

.ek-shortcuts:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 4px;
}

.ek-shortcuts__label {
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-shortcuts__list {
  margin: 0;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
}

.ek-shortcuts__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-4);
  padding: var(--ek-space-2) var(--ek-space-3);
}

.ek-shortcuts__row + .ek-shortcuts__row {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-shortcuts__desc {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-shortcuts__keys {
  flex: none;
  margin: 0;
}

.ek-shortcuts__note {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: 1.9;
}
</style>
