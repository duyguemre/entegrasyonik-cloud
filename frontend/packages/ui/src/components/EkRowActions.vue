<!--
  frontend/src/components/ds/EkRowActions.vue

  DS-v2 Aşama 6b — Standart 3: SATIR / KART EYLEMLERİ (tek desen, tek kural):
    • en çok 2 eylem → ikisi de ikon düğme (tehlikeli olan EN SAĞDA, kırmızı);
    • 3+ eylem → ana eylem ikon düğme + kalanlar `⋯` bağlam menüsünde (EkContextMenu → EkMenuPanel: ikon, grup,
      ayırıcı, kısayol; tehlikeli eylem EN SONDA ve kırmızı). İkon/ipucu/ton `design/icons.ts` kayıt defterinden. Aynı bileşen masaüstü
  satırının sağ yapışık eylem kolonunda ve mobil kartın sağ üstünde çizilir (EkDataGrid `pin:'end'`).

    <EkRowActions :label="`${row.orderNumber} işlemleri`" :items="[
      { key: 'view', action: 'view', label: 'Siparişi görüntüle', onClick: () => open(row) },
      { key: 'print', action: 'print', label: 'Etiket yazdır', group: 'Belgeler', onClick: ... },
      { key: 'cancel', action: 'cancel', label: 'Siparişi iptal et', onClick: ..., disabled: !canCancel },
    ]" />
-->
<template>
  <div class="ek-row-actions" @click.stop>
    <EkActionButton
      v-for="item in inlineItems"
      :key="item.key"
      :action="item.action"
      :icon="item.icon"
      :label="item.label"
      :disabled="item.disabled"
      :loading="item.loading"
      @click="item.onClick()"
    />
    <EkContextMenu v-if="menuGroups.length" :groups="menuGroups" :label="label" @select="onSelect">
      <!-- ⋯ ipucu yok: menü açılınca ipucu menünün üstüne binerdi; ad aria-label'da. -->
      <template #activator="{ props: act }">
        <EkButton v-bind="act" tone="ghost" size="sm" :icon="icons.more" icon-only :aria-label="label" data-action="more" />
      </template>
    </EkContextMenu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkActionButton from './EkActionButton.vue'
import EkButton from './EkButton.vue'
import EkContextMenu from './EkContextMenu.vue'
import type { EkMenuGroup, EkMenuItem } from './EkMenuPanel.vue'
import { ACTION_ICONS, icons, type ActionKey } from '../icons'

export interface EkRowAction {
  key: string
  action: ActionKey
  label: string
  onClick: () => void
  /** Menü grubu başlığı (aynı gruptakiler ayırıcıyla ayrılır). */
  group?: string
  /** Kayıt defterindeki ikon yerine alan-özel ikon (ör. mdi-truck-outline) — yalnız menüde. */
  icon?: string
  description?: string
  shortcut?: string | string[]
  disabled?: boolean
  loading?: boolean
  /** Görünür (satırda) gösterilsin mi? Verilmezse ilk `inline` tehlikesiz öğe. */
  inline?: boolean
}

const props = withDefaults(defineProps<{ items: EkRowAction[]; label: string; inline?: number }>(), { inline: 1 })
const MAX_INLINE_ALL = 2

const isDanger = (i: EkRowAction) => !!(ACTION_ICONS[i.action] as { danger?: boolean }).danger

const inlineItems = computed(() => {
  const explicit = props.items.filter((i) => i.inline === true)
  if (explicit.length) return explicit
  if (props.items.length <= MAX_INLINE_ALL) return [...props.items.filter((i) => !isDanger(i)), ...props.items.filter(isDanger)]
  return props.items.filter((i) => i.inline !== false && !isDanger(i)).slice(0, props.inline)
})

const menuGroups = computed<EkMenuGroup[]>(() => {
  const rest = props.items.filter((i) => !inlineItems.value.includes(i))
  if (!rest.length) return []
  const safe = rest.filter((i) => !isDanger(i))
  const danger = rest.filter(isDanger)
  const groups: EkMenuGroup[] = []
  for (const item of safe) {
    const name = item.group ?? ''
    let g = groups.find((x) => (x.label ?? '') === name)
    if (!g) groups.push((g = { label: name || undefined, items: [] }))
    g.items.push(toMenu(item))
  }
  if (danger.length) groups.push({ items: danger.map(toMenu) })
  return groups
})

function toMenu(i: EkRowAction): EkMenuItem {
  return { key: i.key, label: i.label, icon: i.icon ?? ACTION_ICONS[i.action].icon, description: i.description, shortcut: i.shortcut, danger: isDanger(i), disabled: i.disabled }
}

function onSelect(item: EkMenuItem) {
  props.items.find((i) => i.key === item.key)?.onClick()
}
</script>

<style scoped>
/* Sola yaslı: ⋯ olmayan satırda ana eylem (göz) aynı kolonda kalır — satırlar arası hizalı. */
.ek-row-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  white-space: nowrap;
}

/* ⋯ düğmesi eylem düğmeleriyle aynı görünüm (EkActionButton): sakin nötr → hover'da açık mavi zemin + mavi ikon. */
.ek-row-actions :deep([data-action='more']) {
  --ek-btn-fg: var(--ek-color-content-muted);
  --ek-btn-bg-hover: color-mix(in srgb, var(--ek-color-action) 10%, transparent);
  --ek-btn-bg-active: color-mix(in srgb, var(--ek-color-action) 18%, transparent);
  --ek-btn-border-hover: transparent;
  border-radius: 8px;
}

.ek-row-actions :deep([data-action='more']:hover:not(:disabled)),
.ek-row-actions :deep([data-action='more'][aria-expanded='true']) {
  color: var(--ek-color-action);
}

.ek-row-actions :deep([data-action='more'][aria-expanded='true']) {
  background: color-mix(in srgb, var(--ek-color-action) 10%, transparent);
}
</style>
