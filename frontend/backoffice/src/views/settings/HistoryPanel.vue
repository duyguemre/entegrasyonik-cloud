<template>
  <section class="bo-panel" aria-labelledby="bo-hist-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-hist-title" class="bo-panel__title">Yayın geçmişi</h2>
        <p class="bo-panel__hint">Son 20 sürüm. Geri alma, eski sürümün içeriğini yeni bir sürüm olarak yayınlar.</p>
      </div>
    </header>
    <EkCard flush>
      <StateBlock :phase="rows.length ? 'ready' : 'empty'" empty-title="Henüz yayın yok" empty-message="İlk yayın yapıldığında sürümler burada listelenir; şu an varsayılan değerler geçerli.">
        <EkDataTable :items="rows" :columns="COLUMNS" row-key="version">
          <template #cell-version="{ item }">
            <span class="bo-cell-stack"><span class="ek-num">v{{ (item as Row).version }}</span><EkStatusChip v-if="(item as Row).status === 'published'" tone="success" label="Yayında" dot /></span>
          </template>
          <template #cell-publishedAt="{ item }">
            <span class="bo-cell-stack"><span>{{ formatRelative((item as Row).publishedAt ?? (item as Row).createdAt) }}</span><span class="ek-num">{{ formatDateTime((item as Row).publishedAt ?? (item as Row).createdAt) }}</span></span>
          </template>
          <template #cell-publishedBy="{ item }"><code v-if="(item as Row).publishedBy" class="bo-code" :title="(item as Row).publishedBy ?? ''">{{ short((item as Row).publishedBy) }}</code><span v-else class="bo-muted">—</span></template>
          <template #cell-reason="{ item }">{{ (item as Row).reason || '—' }}</template>
          <template #cell-diff="{ item }">{{ summary((item as Row).diff) }}</template>
          <template #cell-origin="{ item }"><EkStatusChip :tone="(item as Row).origin === 'rollback' ? 'warning' : 'neutral'" :label="originLabel((item as Row).origin)" /></template>
          <template #cell-actions="{ item }">
            <EkButton v-if="(item as Row).status !== 'published'" size="sm" tone="secondary" icon="mdi-undo-variant" :disabled="cfg.hasDraft" :title="cfg.hasDraft ? 'Açık taslak varken geri alınamaz; önce taslağı yayınlayın ya da vazgeçin.' : undefined" :aria-label="`v${(item as Row).version} sürümüne geri al`" data-testid="rollback" @click="cfg.rollback.open(item as Row)">Bu sürüme geri al</EkButton>
          </template>
        </EkDataTable>
      </StateBlock>
    </EkCard>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkButton, EkCard, EkDataTable, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import type { ConfigDiffEntry, ConfigRevision } from '@bo/api/contract'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import { formatDateTime, formatRelative } from '@bo/utils/format'
import type { PlatformConfig } from './usePlatformConfig'
import '@bo/styles/kit.css'

type Row = ConfigRevision
const props = defineProps<{ cfg: PlatformConfig }>()
const rows = computed(() => (props.cfg.data?.history ?? []) as unknown as Array<Record<string, unknown>>)
const COLUMNS: EkTableColumn[] = [
  { key: 'version', label: 'Sürüm' },
  { key: 'publishedAt', label: 'Zaman' },
  { key: 'publishedBy', label: 'Yayınlayan' },
  { key: 'reason', label: 'Gerekçe' },
  { key: 'diff', label: 'Fark' },
  { key: 'origin', label: 'Kaynak' },
  { key: 'actions', label: '', type: 'actions' },
]
const short = (sub: string | null) => (sub ? `${sub.slice(0, 8)}…` : '—')
const originLabel = (o: string | null) => (o === 'rollback' ? 'Geri alma' : o === 'manual' ? 'Elle' : (o ?? '—'))
function summary(diff: ConfigDiffEntry[] | null): string {
  if (!diff?.length) return 'Değişiklik yok'
  const keys = diff.map((d) => d.key)
  return `${keys.length} ayar: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ` +${keys.length - 3}` : ''}`
}
</script>
