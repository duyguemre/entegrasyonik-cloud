<!-- Fark tablosu: ayar · önce → sonra · risk. Yalnız düz metin basılır (v-html yok). -->
<template>
  <div class="bo-diff-wrap">
    <table v-if="diff.length" class="bo-diff">
      <caption class="bo-sr">{{ caption }}</caption>
      <thead>
        <tr><th scope="col">Ayar</th><th scope="col">Önce</th><th scope="col">Sonra</th><th scope="col">Risk</th></tr>
      </thead>
      <tbody>
        <tr v-for="d in diff" :key="d.key">
          <th scope="row"><span class="bo-cell-stack"><span>{{ labelOf(d.key) }}</span><code class="bo-code">{{ d.key }}</code></span></th>
          <td class="bo-diff__from">{{ formatValue(d.from) }}</td>
          <td class="bo-diff__to">{{ formatValue(d.to) }}</td>
          <td><EkStatusChip :tone="DANGER[d.danger].tone" :label="DANGER[d.danger].label" /></td>
        </tr>
      </tbody>
    </table>
    <p v-else class="bo-panel__hint">Yayındaki değerlerle fark yok.</p>
  </div>
</template>

<script setup lang="ts">
import { EkStatusChip } from '@entegrasyonik/ui/components'
import type { ConfigDiffEntry } from '@bo/api/contract'
import { formatValue } from './usePlatformConfig'

const props = defineProps<{ diff: ConfigDiffEntry[]; labels?: Record<string, string>; caption?: string }>()
const labelOf = (key: string) => props.labels?.[key] ?? key

const DANGER = {
  safe: { tone: 'success', label: 'Güvenli' },
  caution: { tone: 'warning', label: 'Dikkat' },
  dangerous: { tone: 'danger', label: 'Tehlikeli' },
} as const
</script>

<style scoped>
.bo-diff-wrap {
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}
.bo-diff {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ek-type-label-size);
}
.bo-diff th,
.bo-diff td {
  padding: var(--ek-space-2) var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  text-align: start;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.bo-diff thead th {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}
.bo-diff tbody th {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}
.bo-diff tbody tr:last-child > * {
  border-bottom: 0;
}
.bo-diff__from {
  color: var(--ek-color-content-muted);
}
.bo-diff__to {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}
.bo-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
