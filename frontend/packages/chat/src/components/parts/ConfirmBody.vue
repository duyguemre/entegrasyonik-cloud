<!--
  Onay kartı GÖVDESİ — tek kaynak (P-MCP-2, K49). Sohbet onay kartı (PartConfirm, ADR-0034 Karar 4.4) ve MCP işlem onayı
  önizlemesi (web `McpActionPreview`, MCP_UI_CONTRACT §3) aynı gövdeyi çizer: "dış sisteme gönderilir" notu + etkilenen
  kayıtlar. Başlık ve eylemler her yüzeyde kendi bileşeninde kalır (odak / geri sayım sözleşmeleri farklı).
  Saf sunum bileşeni: metinler çağırandan gelir, düz metin olarak basılır (`v-html` yok).
  `layout`: `chips` = kısa kayıt adları (sohbet örneklemi), `lines` = açıklayıcı satırlar (MCP önizleme maddeleri).
-->
<template>
  <p v-if="external" class="ek-confirm-body__external">
    <v-icon icon="mdi-cloud-upload-outline" size="small" aria-hidden="true" />
    <span>{{ externalText }}</span>
  </p>

  <div v-if="items.length || label" class="ek-confirm-body__block">
    <p v-if="label" :id="labelId" class="ek-confirm-body__label">{{ label }}</p>
    <ul v-if="items.length" class="ek-confirm-body__list" :class="`is-${layout}`" :aria-labelledby="label ? labelId : undefined">
      <li v-for="item in items" :key="item.key">
        <v-icon v-if="item.icon" :icon="item.icon" size="x-small" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </li>
      <li v-if="moreText" class="is-more">{{ moreText }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useId } from 'vue'

export interface ConfirmBodyItem {
  key: string
  label: string
  icon?: string
}

withDefaults(
  defineProps<{
    external?: boolean
    externalText?: string
    /** Liste başlığı ("12 kayıt etkilenir"); liste boşken tek başına da gösterilebilir. */
    label?: string
    items?: ConfirmBodyItem[]
    moreText?: string
    layout?: 'chips' | 'lines'
  }>(),
  { external: false, externalText: '', label: '', items: () => [], moreText: '', layout: 'chips' },
)

const labelId = `ek-confirm-body-${useId()}`
</script>

<style scoped>
.ek-confirm-body__external {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.ek-confirm-body__block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.ek-confirm-body__label {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  text-align: left;
}

.ek-confirm-body__list {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-confirm-body__list.is-chips {
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}

.ek-confirm-body__list.is-chips li {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  padding: 0 var(--ek-space-2);
  min-height: var(--ek-app-chip-h-sm);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  font-size: var(--ek-type-caption-size);
}

.ek-confirm-body__list.is-lines {
  flex-direction: column;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}

.ek-confirm-body__list.is-lines li {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  color: var(--ek-color-content-default);
  font-size: var(--ek-font-size-sm);
  overflow-wrap: anywhere;
}

.ek-confirm-body__list.is-lines li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-confirm-body__list li.is-more {
  color: var(--ek-color-content-muted);
}

.ek-confirm-body__list.is-chips li.is-more {
  border-style: dashed;
}
</style>
