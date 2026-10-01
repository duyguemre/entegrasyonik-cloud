<!--
  frontend/src/components/mcp/McpActionPreview.vue

  MCP-6 — bekleyen yazma işleminin önizleme kartı (MCP_UI_CONTRACT §3 "önizleme kartı"). Görsel yapı sohbet onay
  kartıyla (ADR-0034 Karar 4.4, `@entegrasyonik/chat` PartConfirm) aynı ritimde: ikon karosu + başlık + işlem çipi,
  "pazaryerine gönderilir" notu, etkilenen kayıtlar listesi. `preview.*` DÜZ METİNDİR ({{ }} ile basılır; `v-html` YOK —
  statik test korur). Satırlar sözleşme gereği ≤ 20; yine de savunmacı olarak 20'de kesilir.
-->
<template>
  <section class="ek-mcp-preview" role="group" :aria-labelledby="titleId" data-testid="mcp-action-preview">
    <header class="ek-mcp-preview__head">
      <EkIconTile icon="mdi-shield-check-outline" tone="action" size="sm" />
      <div class="ek-mcp-preview__heading">
        <h2 :id="titleId" class="ek-mcp-preview__title">{{ view.preview.title }}</h2>
        <div class="ek-mcp-preview__chips">
          <EkStatusChip tone="info" :label="view.capability.title" />
        </div>
      </div>
    </header>

    <p v-if="view.external" class="ek-mcp-preview__external">
      <v-icon icon="mdi-upload-outline" size="small" aria-hidden="true" />
      <span>{{ $t('mcp.approval.external') }}</span>
    </p>

    <div v-if="lines.length" class="ek-mcp-preview__block">
      <p :id="listId" class="ek-mcp-preview__label">
        {{ typeof view.preview.count === 'number' ? $t('mcp.approval.count', { count: formatNumber(view.preview.count) }) : $t('mcp.approval.affected') }}
      </p>
      <ul class="ek-mcp-preview__lines" :aria-labelledby="listId">
        <li v-for="(line, i) in lines" :key="i">{{ line }}</li>
      </ul>
    </div>
    <p v-else-if="typeof view.preview.count === 'number'" class="ek-mcp-preview__label">
      {{ $t('mcp.approval.count', { count: formatNumber(view.preview.count) }) }}
    </p>

    <slot />
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { EkIconTile, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import type { ApprovalView } from '@/types/McpTypes'

const props = defineProps<{ view: ApprovalView }>()
const uid = useId()
const titleId = `ek-mcp-preview-${uid}`
const listId = `${titleId}-lines`
const lines = computed(() => (Array.isArray(props.view.preview.lines) ? props.view.preview.lines.slice(0, 20) : []))
</script>

<style scoped>
.ek-mcp-preview {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}
.ek-mcp-preview__head {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
}
.ek-mcp-preview__heading {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}
.ek-mcp-preview__title {
  margin: 0;
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  line-height: var(--ek-line-height-tight);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}
.ek-mcp-preview__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}
.ek-mcp-preview__external {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-warning-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-content-default);
  font-size: var(--ek-font-size-sm);
}
.ek-mcp-preview__block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}
.ek-mcp-preview__label {
  margin: 0;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}
.ek-mcp-preview__lines {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}
.ek-mcp-preview__lines li {
  padding: var(--ek-space-2) var(--ek-space-3);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
  overflow-wrap: anywhere;
}
.ek-mcp-preview__lines li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}
</style>
