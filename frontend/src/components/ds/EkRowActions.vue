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
      <template #activator="{ props: act }">
        <EkTooltip :text="label" :open-delay="500">
          <EkButton v-bind="act" tone="ghost" size="sm" :icon="icons.more" icon-only :aria-label="label" data-action="more" />
        </EkTooltip>
      </template>
    </EkContextMenu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkActionButton from './EkActionButton.vue'
import EkButton from './EkButton.vue'
import EkContextMenu from './EkContextMenu.vue'
import EkTooltip from './EkTooltip.vue'
import type { EkMenuGroup, EkMenuItem } from './EkMenuPanel.vue'
import { ACTION_ICONS, icons, type ActionKey } from '@/design/icons'

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
.ek-row-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-1);
  white-space: nowrap;
}
</style>
