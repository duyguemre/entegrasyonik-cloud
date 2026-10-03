<!--
  Tanım listelerinin (Seçenek grupları / Etiketler) DEĞER ÇİPİ — tek desen:
  küçük hap (24px) · ad = düzenleme açıcı (popover, #edit yuvası) · içinde küçük × (silme onayı ister).
  FE-LOCAL-1048: düz çerçeveli çip. `color` verilirse (etiket rengi VERİdir) çip o rengin AÇIK tonunu + ince çerçevesini
  alır, ikon rengi taşır; metin her zaman okunur içerik renginde (dolu renkli zemin yok).
-->
<template>
  <span class="dv-chip" :class="[tone, { 'is-open': editOpen, 'has-color': !!color }]" :style="color ? { '--dv': color } : undefined">
    <v-menu v-model="editOpen" :close-on-content-click="false" location="bottom start" @update:model-value="(s: boolean) => s && emit('open')">
      <template #activator="{ props: act }">
        <button v-bind="act" type="button" class="dv-chip__label" aria-haspopup="dialog">
          <v-icon v-if="icon" size="14" aria-hidden="true">{{ icon }}</v-icon>{{ label }}
        </button>
      </template>
      <v-card class="dv-pop" :width="width">
        <slot name="edit" :close="() => (editOpen = false)" />
      </v-card>
    </v-menu>
    <v-menu v-model="removeOpen" :close-on-content-click="false" location="top center">
      <template #activator="{ props: act }">
        <button v-bind="act" type="button" class="dv-chip__x" :aria-label="removeLabel">
          <v-icon size="14" aria-hidden="true">mdi-close</v-icon>
        </button>
      </template>
      <v-card class="dv-pop dv-pop--confirm">
        <div class="dv-pop__title">{{ removeTitle }}</div>
        <div class="dv-pop__row">
          <EkButton tone="secondary" size="sm" @click="removeOpen = false">İptal</EkButton>
          <EkButton tone="danger" size="sm" @click="emit('remove'); removeOpen = false">Sil</EkButton>
        </div>
      </v-card>
    </v-menu>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'

const props = withDefaults(defineProps<{
  label: string
  /** Veri rengi (#RRGGBB) — yoksa nötr zemin. */
  color?: string
  icon?: string
  removeLabel: string
  removeTitle: string
  width?: number | string
}>(), { color: undefined, icon: undefined, width: 240 })
const emit = defineEmits<{ open: []; remove: [] }>()

const editOpen = ref(false)
const removeOpen = ref(false)

// WCAG göreli parlaklık: veri zemini üstünde okunur metin (token: inverse / strong).
const tone = computed(() => {
  if (!props.color) return 'is-neutral'
  const c = props.color.replace('#', '')
  const lin = [0, 2, 4].map((i) => {
    const v = parseInt(c.substring(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] > 0.179 ? 'is-on-light' : 'is-on-dark'
})
</script>

<style scoped>
.dv-chip {
  display: inline-flex;
  align-items: center;
  height: 22px;
  border-radius: var(--ek-radius-chip);
  font-size: var(--ek-font-size-xs);
  transition: var(--ek-transition-colors);
}

.dv-chip.is-neutral {
  background: color-mix(in srgb, var(--ek-color-content-strong) 5%, var(--ek-color-surface));
  color: var(--ek-color-content-default);
}

.dv-chip.is-on-dark { color: var(--ek-color-content-inverse); }
.dv-chip.is-on-light { color: var(--ek-color-content-strong); }

.dv-chip__label,
.dv-chip__x {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  height: 100%;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.dv-chip__label {
  padding: 0 var(--ek-space-1) 0 var(--ek-space-3);
  border-radius: var(--ek-radius-chip) 0 0 var(--ek-radius-chip);
}

.dv-chip__x {
  justify-content: center;
  width: 20px;
  margin-inline-end: var(--ek-space-1);
  border-radius: var(--ek-radius-chip);
  opacity: 0.6;
}

.dv-chip__x:hover {
  opacity: 1;
  color: var(--ek-color-error);
  background: var(--ek-color-error-subtle);
}

.dv-chip:hover.is-neutral,
.dv-chip.is-open.is-neutral {
  background: color-mix(in srgb, var(--ek-color-content-strong) 9%, var(--ek-color-surface));
}

.dv-chip__label:focus-visible,
.dv-chip__x:focus-visible {
  outline: 2px solid var(--ek-color-action);
  outline-offset: 1px;
}

.dv-pop {
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
}

.dv-pop--confirm { min-width: 200px; }

.dv-pop__title {
  margin-bottom: var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  text-align: center;
}

.dv-pop__row {
  display: flex;
  justify-content: center;
  gap: var(--ek-space-2);
}

/* ================= FE-LOCAL-1048 — düz çerçeveli çip ================= */
.dv-chip {
  box-sizing: border-box;
  height: 24px;
  border: 1px solid var(--ek-color-border-default);
}

.dv-chip.is-neutral {
  background: var(--ek-color-surface);
}

.dv-chip:hover.is-neutral,
.dv-chip.is-open.is-neutral {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
}

.dv-chip.has-color {
  border-color: color-mix(in srgb, var(--dv) 42%, var(--ek-color-surface));
  background: color-mix(in srgb, var(--dv) 10%, var(--ek-color-surface));
  color: var(--ek-color-content-strong);
}

.dv-chip.has-color:hover,
.dv-chip.has-color.is-open {
  background: color-mix(in srgb, var(--dv) 16%, var(--ek-color-surface));
}

.dv-chip.has-color .dv-chip__label .v-icon {
  color: color-mix(in srgb, var(--dv) 72%, var(--ek-color-content-strong));
}

.dv-pop {
  border-color: var(--ek-color-border-default);
}
</style>
