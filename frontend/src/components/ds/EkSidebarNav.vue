<!--
  frontend/src/components/ds/EkSidebarNav.vue

  DS-v2 — sol menü. Bölüm başlığı (mikro etiket, kimlik laciverti) → öğeler
  → alt öğeler. Durumlar: hover (`sidebar-hover`), ETKİN ekran
  (`sidebar-active` zemin + `action-emphasis` metin + solda 3px aksiyon
  göstergesi), açık grup (ok döner, alt öğeler girintili ve dikey kılavuz
  çizgili).
  UZUN METİN KESİLMEZ: etiket gerektiği kadar satıra sarılır (kırpma yok).
  `collapsed` (ray) modunda yalnızca ikonlar; ad `aria-label` + tooltip.
  Klavye: doğal Tab sırası (düğmeler); grup düğmesi `aria-expanded`.
  Etkin öğe bir grubun içindeyse grup kendiliğinden açılır.
  Ek (geri uyumlu): `hookClasses` — kabukta eski spec çapası sınıfları
  (öğe/grup/grup başlığı/alt öğe) düğmelere eklemek için; `#item-trailing`
  — yaprak öğenin sağında, düğmenin KARDEŞİ olarak (iç içe düğme yok) ek
  eylem (ör. favori yıldızı); ray modunda grup tıklaması `expand-request`.
-->
<template>
  <nav class="ek-side" :class="{ 'ek-side--collapsed': collapsed }" :aria-label="label">
    <div v-for="section in sections" :key="section.label" class="ek-side__section">
      <p v-if="!collapsed && section.label" class="ek-side__section-label">{{ section.label }}</p>
      <div v-else-if="collapsed" class="ek-side__section-rule" aria-hidden="true"></div>
      <ul class="ek-side__list">
        <li
          v-for="item in section.items"
          :key="item.key"
          class="ek-side__entry"
          :class="[item.children ? hookClasses?.group : undefined, { 'has-trailing': !!$slots['item-trailing'] && !collapsed }]"
        >
          <v-tooltip :eager="false" transition="fade-transition" :disabled="!collapsed" location="end" :text="item.label">
            <template #activator="{ props: tipProps }">
              <button
                v-bind="tipProps"
                type="button"
                class="ek-side__item"
                :class="[
                  hookClasses?.item,
                  item.children ? hookClasses?.groupHeader : undefined,
                  {
                    'is-active': isActive(item),
                    'is-hover': forceHoverKey === item.key,
                    'is-parent-active': !!item.children && isAncestor(item),
                  },
                ]"
                :data-key="item.key"
                :aria-current="item.key === activeKey ? 'page' : undefined"
                :aria-expanded="item.children && !collapsed ? isOpen(item.key) : undefined"
                :aria-label="collapsed ? item.label : undefined"
                @click="onItem(item)"
              >
                <v-icon class="ek-side__icon" :icon="outlineIcon(item.icon) ?? 'mdi-circle-small'" aria-hidden="true" />
                <span v-if="!collapsed" class="ek-side__label">{{ item.label }}</span>
                <EkBadge v-if="item.badge && !collapsed" variant="count" :tone="item.badgeTone ?? 'action'" :text="item.badge" />
                <v-icon
                  v-if="item.children && !collapsed"
                  class="ek-side__chevron"
                  :class="{ 'is-open': isOpen(item.key) }"
                  icon="mdi-chevron-down"
                  aria-hidden="true"
                />
              </button>
            </template>
          </v-tooltip>
          <span v-if="$slots['item-trailing'] && !collapsed && !item.children" class="ek-side__trailing">
            <slot name="item-trailing" :item="item" />
          </span>
          <ul v-if="item.children && isOpen(item.key) && !collapsed" class="ek-side__sublist">
            <li v-for="child in item.children" :key="child.key">
              <button
                type="button"
                class="ek-side__subitem"
                :class="[hookClasses?.subItem, { 'is-active': child.key === activeKey, 'is-hover': forceHoverKey === child.key }]"
                :data-key="child.key"
                :aria-current="child.key === activeKey ? 'page' : undefined"
                @click="emit('select', child.key)"
              >
                <span class="ek-side__label">{{ child.label }}</span>
                <EkBadge v-if="child.badge" variant="count" :tone="child.badgeTone ?? 'neutral'" :text="child.badge" />
              </button>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { outlineIcon } from '@/design/icons'
import { ref, watch } from 'vue'
import EkBadge from './EkBadge.vue'

export interface EkSideItem {
  key: string
  label: string
  icon?: string
  badge?: string | number
  badgeTone?: 'action' | 'success' | 'warning' | 'error' | 'info' | 'neutral'
  children?: EkSideItem[]
}

export interface EkSideSection {
  label: string
  items: EkSideItem[]
}

const props = withDefaults(
  defineProps<{
    sections: EkSideSection[]
    activeKey?: string
    label?: string
    collapsed?: boolean
    defaultOpen?: string[]
    forceHoverKey?: string
    /** Kabuk entegrasyonu: düğmelere eklenecek ek sınıflar (spec çapaları). */
    hookClasses?: { item?: string; group?: string; groupHeader?: string; subItem?: string }
  }>(),
  { label: 'Ana menü', collapsed: false, defaultOpen: () => [] },
)

const emit = defineEmits<{ select: [key: string]; 'expand-request': [key: string] }>()
const open = ref(new Set(props.defaultOpen))

// Etkin öğe kapalı bir grubun içindeyse grubu aç (kullanıcı nerede olduğunu görsün).
watch(
  () => [props.activeKey, props.sections] as const,
  () => {
    for (const section of props.sections) {
      for (const item of section.items) {
        if (item.children?.some((c) => c.key === props.activeKey) && !open.value.has(item.key)) {
          open.value = new Set([...open.value, item.key])
        }
      }
    }
  },
  { immediate: true },
)

const isOpen = (key: string) => open.value.has(key)
const isAncestor = (item: EkSideItem) => !!item.children?.some((c) => c.key === props.activeKey)
const isActive = (item: EkSideItem) => item.key === props.activeKey || (props.collapsed && isAncestor(item))

function onItem(item: EkSideItem) {
  if (!item.children) return emit('select', item.key)
  if (props.collapsed) return emit('expand-request', item.key)
  const next = new Set(open.value)
  if (next.has(item.key)) next.delete(item.key)
  else next.add(item.key)
  open.value = next
}
</script>

<style scoped>
.ek-side {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-sidebar-bg);
  color: var(--ek-color-sidebar-text);
}

.ek-side__section-label {
  margin: 0;
  padding: 0 var(--ek-space-3) var(--ek-space-2);
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-side__section-rule {
  height: 1px;
  margin: 0 var(--ek-space-2) var(--ek-space-2);
  background: var(--ek-color-sidebar-border);
}

.ek-side__list,
.ek-side__sublist {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-side__item,
.ek-side__subitem {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: var(--ek-control-h-md);
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-type-label-weight);
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-side__item:hover,
.ek-side__item.is-hover,
.ek-side__subitem:hover,
.ek-side__subitem.is-hover {
  background: var(--ek-color-sidebar-hover);
  color: var(--ek-color-content-strong);
}

.ek-side__item:focus-visible,
.ek-side__subitem:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.ek-side__item.is-active,
.ek-side__subitem.is-active {
  background: var(--ek-color-sidebar-active);
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-side__item.is-active::before,
.ek-side__subitem.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: var(--ek-space-2);
  bottom: var(--ek-space-2);
  width: 3px;
  border-radius: 0 var(--ek-radius-sm) var(--ek-radius-sm) 0;
  background: var(--ek-color-action);
}

.ek-side__item.is-parent-active {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-side__icon {
  flex: none;
  font-size: var(--ek-icon-md);
  color: var(--ek-color-content-muted);
}

.ek-side__item.is-active .ek-side__icon,
.ek-side__item.is-parent-active .ek-side__icon {
  color: var(--ek-color-action);
}

.ek-side__label {
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
}

.ek-side__entry {
  position: relative;
}

.ek-side__entry.has-trailing > .ek-side__item {
  padding-right: calc(var(--ek-space-3) + 24px);
}

.ek-side__trailing {
  position: absolute;
  top: 0;
  right: var(--ek-space-2);
  display: flex;
  align-items: center;
  height: var(--ek-control-h-md);
}

.ek-side__chevron {
  flex: none;
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-muted);
  transition: transform var(--ek-duration-base) var(--ek-easing-standard);
}

.ek-side__chevron.is-open {
  transform: rotate(180deg);
}

.ek-side__sublist {
  position: relative;
  margin: 2px 0 var(--ek-space-1) calc(var(--ek-space-3) + var(--ek-icon-md) / 2);
  padding-left: var(--ek-space-3);
  border-left: 1px solid var(--ek-color-sidebar-border);
}

.ek-side__subitem {
  min-height: var(--ek-control-h-sm);
  padding: var(--ek-space-1) var(--ek-space-3);
  font-weight: var(--ek-font-weight-regular);
}

.ek-side--collapsed {
  align-items: center;
  padding: var(--ek-space-3) var(--ek-space-2);
}

.ek-side--collapsed .ek-side__item {
  justify-content: center;
  width: var(--ek-control-h-lg);
  padding: 0;
}

@media (prefers-reduced-motion: reduce) {
  .ek-side__entry {
  position: relative;
}

.ek-side__entry.has-trailing > .ek-side__item {
  padding-right: calc(var(--ek-space-3) + 24px);
}

.ek-side__trailing {
  position: absolute;
  top: 0;
  right: var(--ek-space-2);
  display: flex;
  align-items: center;
  height: var(--ek-control-h-md);
}

.ek-side__chevron {
    transition: none;
  }
}
</style>
