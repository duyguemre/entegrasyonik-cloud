<!--
  frontend/src/components/catalogPages/CategoryTreeRow.vue

  B7 — kategori ağacının tek satırı (CategoryTree çizer). 40px sabit yükseklik (sanallaştırma bununla hesaplar).
  Ad: `aria-label` özet ("Tişört, 2/3 platformda eşli") — iç öğeler (sayı, noktalar, ⋯) ekran okuyucuda tekrar okunmaz.
-->
<template>
  <div
    :id="domId"
    role="treeitem"
    class="cat-row"
    :class="[
      `is-d${Math.min(depth, 8)}`,
      {
        'is-selected': selected,
        'is-group': hasChildren,
        'is-root': depth === 0,
        'is-drop-into': dropZone === 'into',
        'is-drop-swap': dropZone === 'swap',
        'is-renaming': renaming,
      },
    ]"
    :aria-level="depth + 1"
    :aria-setsize="setsize"
    :aria-posinset="posinset"
    :aria-expanded="hasChildren ? expanded : undefined"
    :aria-selected="selected"
    :aria-label="ariaLabel"
    :tabindex="tabbable ? 0 : -1"
    :data-cat-path="node.path.join('/')"
    :draggable="!renaming"
    @click="!renaming && emit('activate', node)"
    @focus="emit('focusin', node)"
    @dragstart="(e: DragEvent) => emit('dragstart', node, e)"
    @dragover="(e: DragEvent) => emit('dragover', node, e)"
    @drop="(e: DragEvent) => emit('drop', node, e)"
    @dragend="emit('dragend')"
  >
    <span v-for="d in depth" :key="d" class="cat-row__guide" aria-hidden="true"></span>

    <span
      class="cat-row__chev"
      :class="{ 'is-open': expanded, 'is-leaf': !hasChildren }"
      aria-hidden="true"
      @click.stop="hasChildren && emit('toggle', node)"
    >
      <v-icon v-if="hasChildren" icon="mdi-chevron-right" size="18" />
    </span>

    <v-icon :icon="hasChildren ? (expanded ? 'mdi-folder-open-outline' : 'mdi-folder-outline') : 'mdi-tag-outline'" size="18" class="cat-row__icon" aria-hidden="true" />

    <div v-if="renaming" class="cat-row__edit" @click.stop @keydown.stop>
      <CatNameInput compact :initial="node.title" :label="`${node.title} için yeni ad`" :busy="busy"
        @submit="(v) => emit('rename', node, v)" @cancel="emit('cancelRename')" />
    </div>
    <template v-else>
      <span class="cat-row__title" aria-hidden="true">
        <template v-for="(p, i) in parts" :key="i"><mark v-if="p.match" class="cat-row__mark">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template>
      </span>
      <span v-if="childCount" class="cat-row__count ek-num" aria-hidden="true">{{ childCount }}</span>
      <span class="cat-row__spacer" aria-hidden="true"></span>
      <span v-if="missing" class="cat-row__missing ek-num" aria-hidden="true"><span class="cat-row__missing-dot"></span>{{ missing }} eksik</span>
      <CatMappingDots v-else-if="mapping && mapping.length" :states="mapping" aria-hidden="true" class="cat-row__dots" />

      <span class="cat-row__menu" @click.stop @keydown.stop>
        <EkContextMenu :groups="menuGroups" :label="`${node.title} işlemleri`" @select="(i) => emit('menu', node, i.key as RowMenuAction)">
          <template #activator="{ props: act }">
            <EkButton v-bind="act" tone="ghost" size="sm" :icon="icons.more" icon-only tabindex="-1" :aria-label="`${node.title} işlemleri`" />
          </template>
        </EkContextMenu>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkContextMenu from '@/components/ds/EkContextMenu.vue'
import type { EkMenuGroup } from '@/components/ds/EkMenuPanel.vue'
import { ACTION_ICONS, icons } from '@/design/icons'
import CatMappingDots from './CatMappingDots.vue'
import CatNameInput from './CatNameInput.vue'
import { highlightParts, mappingSummary, type CatNode, type MappingState } from './catalogModel'

export type RowMenuAction = 'select' | 'rename' | 'add' | 'up' | 'down' | 'outdent'

const props = defineProps<{
  domId: string
  node: CatNode
  depth: number
  expanded: boolean
  hasChildren: boolean
  posinset: number
  setsize: number
  selected: boolean
  tabbable: boolean
  query: string
  hit: boolean
  childCount: number
  missing: number
  mapping: MappingState[] | null
  renaming: boolean
  busy: boolean
  dropZone: 'into' | 'swap' | null
  canOutdent: boolean
  canUp: boolean
  canDown: boolean
}>()

const emit = defineEmits<{
  activate: [node: CatNode]
  toggle: [node: CatNode]
  focusin: [node: CatNode]
  menu: [node: CatNode, action: RowMenuAction]
  rename: [node: CatNode, title: string]
  cancelRename: []
  dragstart: [node: CatNode, e: DragEvent]
  dragover: [node: CatNode, e: DragEvent]
  drop: [node: CatNode, e: DragEvent]
  dragend: []
}>()

const parts = computed(() => (props.hit ? highlightParts(props.node.title, props.query) : [{ text: props.node.title, match: false }]))

const ariaLabel = computed(() => {
  const bits = [props.node.title]
  if (props.childCount) bits.push(`${props.childCount} alt kategori`)
  if (props.missing) bits.push(`${props.missing} yaprak kategoride eşleme eksik`)
  else if (props.mapping?.length) bits.push(mappingSummary(props.mapping))
  return bits.join(', ')
})

const menuGroups = computed<EkMenuGroup[]>(() => [
  {
    items: [
      { key: 'select', label: 'Ayrıntıları aç', icon: ACTION_ICONS.view.icon, shortcut: 'Enter' },
      { key: 'rename', label: 'Yeniden adlandır', icon: ACTION_ICONS.edit.icon, shortcut: 'F2' },
      { key: 'add', label: 'Alt kategori ekle', icon: ACTION_ICONS.add.icon },
    ],
  },
  {
    label: 'Konum',
    items: [
      { key: 'up', label: 'Yukarı taşı', icon: 'mdi-arrow-up', shortcut: ['Alt', '↑'], disabled: !props.canUp },
      { key: 'down', label: 'Aşağı taşı', icon: 'mdi-arrow-down', shortcut: ['Alt', '↓'], disabled: !props.canDown },
      { key: 'outdent', label: 'Bir üst seviyeye çıkar', icon: 'mdi-format-indent-decrease', disabled: !props.canOutdent },
    ],
  },
])
</script>

<style scoped>
.cat-row {
  --cat-indent: 20px;
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  height: 40px;
  padding: 0 var(--ek-space-1) 0 var(--ek-space-2);
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  cursor: pointer;
  user-select: none;
  transition: var(--ek-transition-colors);
}

.cat-row:hover {
  background: var(--ek-color-surface-sunken);
}

.cat-row:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.cat-row.is-selected {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.cat-row.is-selected::before {
  content: '';
  position: absolute;
  inset: 8px auto 8px 0;
  width: 3px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action);
}

.cat-row.is-drop-into {
  background: var(--ek-color-action-subtle);
  box-shadow: inset 0 0 0 1px var(--ek-color-action);
}

.cat-row.is-drop-swap {
  box-shadow: inset 0 2px 0 var(--ek-color-action);
}

.cat-row.is-renaming {
  cursor: default;
}

/* Girinti rehberi: her seviye 20px, ortasında ince dikey çizgi. */
.cat-row__guide {
  position: relative;
  flex: none;
  align-self: stretch;
  width: var(--cat-indent);
}

.cat-row__guide::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 9px;
  width: 1px;
  background: var(--ek-color-border-subtle);
}

.cat-row__chev {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-content-muted);
  transition: transform var(--ek-duration-base) var(--ek-easing-standard), var(--ek-transition-colors);
}

.cat-row__chev:not(.is-leaf):hover {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.cat-row__chev.is-open {
  transform: rotate(90deg);
}

.cat-row__icon {
  flex: none;
  margin-right: var(--ek-space-1);
  color: var(--ek-color-content-muted);
}

.cat-row.is-selected .cat-row__icon {
  color: var(--ek-color-action);
}

.cat-row__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cat-row.is-group .cat-row__title {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.cat-row.is-root .cat-row__title {
  font-weight: var(--ek-font-weight-semibold);
}

.cat-row.is-selected .cat-row__title {
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.cat-row__mark {
  padding: 0 1px;
  border-radius: 3px;
  background: var(--ek-color-highlight);
  color: var(--ek-color-content-strong);
}

.cat-row__count {
  flex: none;
  min-width: 20px;
  padding: 0 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: 18px;
  text-align: center;
}

.cat-row.is-selected .cat-row__count {
  background: var(--ek-color-surface);
}

.cat-row__spacer {
  flex: 1;
  min-width: var(--ek-space-2);
}

.cat-row__missing {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: 18px;
  white-space: nowrap;
}

.cat-row__missing-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-warning);
}

.cat-row__edit {
  flex: 1;
  min-width: 0;
}

.cat-row__menu {
  display: inline-flex;
  flex: none;
  margin-left: var(--ek-space-1);
}

@media (hover: hover) {
  .cat-row__menu {
    opacity: 0;
    transition: opacity var(--ek-duration-fast) var(--ek-easing-standard);
  }

  .cat-row:hover .cat-row__menu,
  .cat-row:focus-within .cat-row__menu,
  .cat-row.is-selected .cat-row__menu {
    opacity: 1;
  }
}
</style>
