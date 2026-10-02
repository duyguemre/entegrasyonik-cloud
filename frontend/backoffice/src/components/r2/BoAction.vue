<!--
  BoAction — eylem sözlüğünün (actions.ts, BO2-50) TEK çizimi. İkon, etiket ve varyant sözlükten gelir; ekran yalnız
  türü (`kind`) ve gerekirse nesneyi verir. `to` verilirse düğme görünümünde bağlantı (RouterLink) çizilir.

    <BoAction kind="refresh" :loading="loading" data-page-refresh @click="load" />          → ikincil · "Yenile"
    <BoAction kind="edit" icon-only object="Duyuruyu" @click="edit(row)" />                → ikon düğme · aria "Duyuruyu düzenle"
    <BoAction kind="detail" :to="{ name: 'tenant', params: { tid } }">Müşteriye git</BoAction>
-->
<template>
  <RouterLink
    v-if="to"
    :to="to"
    class="bo-action-link"
    :class="[`is-${tone}`, `is-${size}`, { 'is-icon-only': iconOnly }]"
    :aria-label="iconOnly ? accessibleLabel : undefined"
    :title="iconOnly ? accessibleLabel : undefined"
    :data-action="kind"
  >
    <v-icon v-if="kind !== 'detail'" :icon="def.icon" aria-hidden="true" />
    <span v-if="!iconOnly"><slot>{{ text }}</slot></span>
    <v-icon v-if="kind === 'detail'" :icon="def.icon" aria-hidden="true" />
  </RouterLink>
  <EkButton
    v-else
    :tone="tone"
    :size="size"
    :icon="kind === 'detail' ? undefined : def.icon"
    :trailing-icon="kind === 'detail' ? def.icon : undefined"
    :icon-only="iconOnly"
    :loading="loading"
    :disabled="disabled"
    :aria-label="iconOnly ? accessibleLabel : undefined"
    :title="iconOnly ? accessibleLabel : undefined"
    :class="{ 'bo-action--danger': def.danger && iconOnly }"
    :data-action="kind"
    @click="emit('click', $event)"
  >
    <slot>{{ text }}</slot>
  </EkButton>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { EkButton } from '@entegrasyonik/ui/components'
import { BO_ACTIONS, boActionLabel, type BoActionDef, type BoActionKind, type BoActionTone } from './actions'

const props = withDefaults(
  defineProps<{
    kind: BoActionKind
    /** Etiketi değiştirir (ör. "Yeni duyuru"); ikon ve varyant sözlükte kalır. */
    label?: string
    /** Erişilebilir ad için nesne: "Duyuruyu" → "Duyuruyu düzenle". */
    object?: string
    /** Varyantı yalnız sözlüğün izin verdiği yönde değiştirir: ana iş `primary`, satırda `ghost`. */
    tone?: BoActionTone
    size?: 'sm' | 'md'
    iconOnly?: boolean
    loading?: boolean
    disabled?: boolean
    to?: RouteLocationRaw
  }>(),
  { size: 'md' },
)
const emit = defineEmits<{ click: [e: MouseEvent] }>()

const def = computed<BoActionDef>(() => BO_ACTIONS[props.kind])
const text = computed(() => props.label ?? def.value.label)
const tone = computed<BoActionTone>(() => props.tone ?? (props.iconOnly && !def.value.danger ? 'ghost' : def.value.tone))
const accessibleLabel = computed(() => (props.label && !props.object ? props.label : boActionLabel(props.kind, props.object)))
</script>

<style scoped>
.bo-action-link {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-4);
  border: 1px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
  text-decoration: none;
  transition: var(--ek-transition-colors);
}

.bo-action-link.is-sm {
  height: var(--ek-control-h-sm);
  padding: 0 var(--ek-space-3);
}

.bo-action-link.is-icon-only {
  width: var(--ek-control-h-md);
  padding: 0;
  justify-content: center;
}

.bo-action-link.is-sm.is-icon-only {
  width: var(--ek-control-h-sm);
}

.bo-action-link:hover {
  border-color: var(--ek-color-border-input);
  background: var(--ek-color-surface-muted);
}

.bo-action-link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-action-link .v-icon {
  font-size: var(--ek-icon-sm);
}

.bo-action-link.is-primary {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}

.bo-action-link.is-primary:hover {
  border-color: var(--ek-color-action-hover);
  background: var(--ek-color-action-hover);
}

.bo-action-link.is-ghost {
  border-color: transparent;
  background: transparent;
  color: var(--ek-color-content-muted);
}

.bo-action-link.is-ghost:hover {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

/* Yıkıcı ikon düğmesi sakin durur; yalnız üzerine gelince kırmızılaşır (CONSOLE_IDENTITY "Yap/yapma"). */
.bo-action--danger:not(:hover):not(:focus-visible) {
  --ek-btn-fg: var(--ek-color-content-muted);
}
</style>
