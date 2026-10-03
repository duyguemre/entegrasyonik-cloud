<!--
  frontend/src/components/ds/EkMenuPanel.vue

  DS-v2 — menü paneli (bağlam menüsü, satır "⋯" menüsü, üst bar menüleri).
  Yapı: gruplar (isteğe bağlı mikro başlık) → aralarında ayraç → öğeler.
  Öğe: [ikon 16] Etiket (+ açıklama) ............ [kısayol]
  Tehlikeli öğe (`danger`) HER ZAMAN en son gruptadır ve error metinle durur.
  Klavye: ↑/↓ gezin (devre dışıları atlar), Home/End, Enter/Space seç, Esc kapat
  (`close` yayar). WAI-ARIA menu deseni: role=menu / menuitem, roving tabindex.
  `EkContextMenu` bunu v-menu içinde açar; vitrin doğrudan çizer.
  `autofocus` (geri uyumlu ek): v-menu içinde her açılışta ilk öğeye odaklanır.
  Aşama 2 (geri uyumlu): isteğe bağlı görünür başlık (`title` + `description`)
  — uzun işlem menülerinde (ör. toplu ürün işlemleri) menünün kapsamını söyler;
  ekran okuyucuya `aria-describedby` ile okunur.
-->
<template>
  <div
    ref="rootRef"
    class="ek-menu"
    role="menu"
    :aria-label="label"
    :aria-describedby="description ? descId : undefined"
    @keydown="onKeydown"
  >
    <div v-if="title" class="ek-menu__head" aria-hidden="true">
      <span class="ek-menu__head-title">{{ title }}</span>
      <span v-if="description" :id="descId" class="ek-menu__head-desc">{{ description }}</span>
    </div>
    <template v-for="(group, gi) in groups" :key="group.label ?? gi">
      <div v-if="gi > 0" class="ek-menu__divider" role="separator"></div>
      <div v-if="group.label" class="ek-menu__group-label" aria-hidden="true">{{ group.label }}</div>
      <button
        v-for="item in group.items"
        :key="item.key"
        type="button"
        class="ek-menu__item"
        :class="{ 'ek-menu__item--danger': item.danger, 'is-hover': forceHoverKey === item.key, 'is-current': item.current }"
        :aria-current="item.current ? 'true' : undefined"
        role="menuitem"
        :tabindex="item.key === focusKey ? 0 : -1"
        :aria-disabled="item.disabled || undefined"
        :data-key="item.key"
        @click="select(item)"
        @mousemove="focusKey = item.disabled ? focusKey : item.key"
      >
        <v-icon v-if="item.icon" class="ek-menu__icon" :icon="item.icon" aria-hidden="true" />
        <span v-else class="ek-menu__icon" aria-hidden="true"></span>
        <span class="ek-menu__text">
          <span class="ek-menu__label">{{ item.label }}</span>
          <span v-if="item.description" class="ek-menu__desc">{{ item.description }}</span>
        </span>
        <EkKbd v-if="item.shortcut" class="ek-menu__shortcut" :keys="item.shortcut" />
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId } from 'vue'
import EkKbd from './EkKbd.vue'

export interface EkMenuItem {
  key: string
  label: string
  icon?: string
  description?: string
  shortcut?: string | string[]
  danger?: boolean
  disabled?: boolean
  /** FE-LOCAL-1047: listedeki ETKİN öğe (ör. açık sekme, seçili hazır aralık) — eylem tonuyla vurgulanır. */
  current?: boolean
}

export interface EkMenuGroup {
  label?: string
  items: EkMenuItem[]
}

const props = defineProps<{
  groups: EkMenuGroup[]
  label: string
  forceHoverKey?: string
  /** Açılır katmanda (v-menu) her açılışta monte edilince ilk etkin öğeye odaklan. */
  autofocus?: boolean
  title?: string
  description?: string
}>()

const descId = `ek-menu-desc-${useId()}`

const emit = defineEmits<{ select: [item: EkMenuItem]; close: [] }>()

const rootRef = ref<HTMLElement | null>(null)
const enabled = computed(() => props.groups.flatMap((g) => g.items).filter((i) => !i.disabled))
const focusKey = ref<string | undefined>(enabled.value[0]?.key)

function focusItem(key: string | undefined) {
  if (!key) return
  focusKey.value = key
  nextTick(() => rootRef.value?.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus())
}

function move(delta: number) {
  const list = enabled.value
  if (!list.length) return
  const index = list.findIndex((i) => i.key === focusKey.value)
  focusItem(list[(index + delta + list.length) % list.length].key)
}

function select(item: EkMenuItem) {
  if (item.disabled) return
  emit('select', item)
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      move(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      move(-1)
      break
    case 'Home':
      event.preventDefault()
      focusItem(enabled.value[0]?.key)
      break
    case 'End':
      event.preventDefault()
      focusItem(enabled.value[enabled.value.length - 1]?.key)
      break
    case 'Escape':
      emit('close')
      break
  }
}

// v-menu içeriği geçiş sırasında monte olur; odak bir kare sonra taşınır (katman yerleşsin).
onMounted(() => {
  if (props.autofocus) requestAnimationFrame(() => focusItem(enabled.value[0]?.key))
})

defineExpose({ focusFirst: () => focusItem(enabled.value[0]?.key) })
</script>

<style scoped>
.ek-menu {
  display: flex;
  flex-direction: column;
  min-width: 240px;
  padding: var(--ek-space-1);
  background: var(--ek-color-surface-raised);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-popover);
  box-shadow: var(--ek-shadow-popover);
}

.ek-menu__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: calc(var(--ek-space-1) * -1) calc(var(--ek-space-1) * -1) var(--ek-space-1);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-popover) var(--ek-radius-popover) 0 0;
  background: var(--ek-color-surface-muted);
}

.ek-menu__head-title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ek-menu__head-desc {
  max-width: 320px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-menu__group-label {
  padding: var(--ek-space-2) var(--ek-space-3) var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-menu__divider {
  height: 1px;
  margin: var(--ek-space-1) var(--ek-space-2);
  background: var(--ek-color-border-subtle);
}

.ek-menu__item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: var(--ek-control-h-md);
  padding: var(--ek-space-1) var(--ek-space-3);
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-default);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-menu__item:hover:not([aria-disabled]),
.ek-menu__item.is-hover,
.ek-menu__item:focus-visible {
  outline: none;
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
}

.ek-menu__item:focus-visible {
  box-shadow: var(--ek-selection-ring);
}

.ek-menu__item[aria-disabled] {
  color: var(--ek-color-content-subtle);
  cursor: not-allowed;
}

.ek-menu__icon {
  flex: none;
  width: var(--ek-icon-sm);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.ek-menu__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.ek-menu__label {
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-type-label-weight);
}

.ek-menu__desc {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-menu__shortcut {
  margin-left: var(--ek-space-4);
}

.ek-menu__item--danger,
.ek-menu__item--danger .ek-menu__icon {
  color: var(--ek-color-error);
}

.ek-menu__item--danger:hover:not([aria-disabled]),
.ek-menu__item--danger.is-hover,
.ek-menu__item--danger:focus-visible {
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.ek-menu__item[aria-disabled] .ek-menu__icon {
  color: var(--ek-color-content-subtle);
}

/* ================= FE-LOCAL-1039 — ana sayfa / sol menü diliyle açılır menü =================
   Kart yüzeyi + ince çerçeve; öğe ikonu çerçeveli küçük kutuda (menüdeki ikon kutularıyla aynı aile); üzerine
   gelince / odakta eylem renginin açık tonu, ikon kutusu eylem renginde çerçevelenir. Tehlikeli öğe aynı kalıpta
   kırmızı tonda. */
.ek-menu {
  padding: var(--ek-space-2);
  border-color: var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-menu__head {
  margin: calc(var(--ek-space-2) * -1) calc(var(--ek-space-2) * -1) var(--ek-space-2);
  border-radius: var(--ek-radius-card) var(--ek-radius-card) 0 0;
}

.ek-menu__group-label {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-menu__group-label::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.ek-menu__item {
  gap: var(--ek-space-3);
  padding: var(--ek-space-1) var(--ek-space-3) var(--ek-space-1) var(--ek-space-2);
  border-radius: var(--ek-radius-tile);
}

.ek-menu__icon {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  transition: var(--ek-transition-colors);
}

.ek-menu__item:hover:not([aria-disabled]),
.ek-menu__item.is-hover,
.ek-menu__item:focus-visible {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-menu__item:hover:not([aria-disabled]) .ek-menu__icon,
.ek-menu__item.is-hover .ek-menu__icon,
.ek-menu__item:focus-visible .ek-menu__icon {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-surface);
  color: var(--ek-color-action);
}

.ek-menu__item:focus-visible {
  box-shadow: inset 0 0 0 1px var(--ek-color-action-border);
}

.ek-menu__item--danger .ek-menu__icon {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.ek-menu__item--danger:hover:not([aria-disabled]),
.ek-menu__item--danger.is-hover,
.ek-menu__item--danger:focus-visible {
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.ek-menu__item--danger:hover:not([aria-disabled]) .ek-menu__icon,
.ek-menu__item--danger.is-hover .ek-menu__icon,
.ek-menu__item--danger:focus-visible .ek-menu__icon {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-surface);
  color: var(--ek-color-error-emphasis);
}

.ek-menu__item[aria-disabled] .ek-menu__icon {
  background: transparent;
}

/* ================= FE-LOCAL-1047 — etkin öğe (açık sekme / seçili aralık) =================
   Eylem renginin açık tonu + ince çerçeve; ikon kutusu dolu eylem rengi (sol menü ve sekmelerdeki etkin öğeyle aynı). */
.ek-menu__item.is-current {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-menu__item.is-current .ek-menu__label {
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-menu__item.is-current .ek-menu__icon {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}
</style>
