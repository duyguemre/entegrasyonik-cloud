<template>
  <BoSection id="bo-hist" flush class="bo-flushed" title="Yayın geçmişi" description="Son 20 sürüm. Geri alma, eski sürümün içeriğini yeni bir sürüm olarak yayınlar.">
    <!-- Devre dışı "Geri al" nedeni bir kez, görünür metin olarak (yalnız `title` değil); düğmeler bu metne bağlı. -->
    <p v-if="cfg.hasDraft" :id="lockId" class="bo-hist__lock" data-testid="rollback-locked">
      <v-icon icon="mdi-lock-outline" aria-hidden="true" />
      Açık taslak varken geri alınamaz; önce taslağı yayınlayın ya da atın.
    </p>
    <BoDataTable :items="rows" :columns="COLUMNS" row-key="version" label="Yayınlanan sürümler" :phase="rows.length ? 'ready' : 'empty'" empty-title="Henüz yayın yok" empty-message="İlk yayın yapıldığında sürümler burada listelenir; şu an varsayılan değerler geçerli.">
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
            <BoAction v-if="(item as Row).status !== 'published'" kind="rollback" label="Bu sürüme geri al" size="sm" :disabled="cfg.hasDraft" :aria-describedby="cfg.hasDraft ? lockId : undefined" :aria-label="`Bu sürüme geri al: v${(item as Row).version}`" data-testid="rollback" @click="cfg.rollback.open(item as Row)" />
          </template>
    </BoDataTable>
  </BoSection>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoDataTable from '@bo/components/r2/BoDataTable.vue'
import type { ConfigDiffEntry, ConfigRevision } from '@bo/api/contract'
import { formatDateTime, formatRelative } from '@bo/utils/format'
import type { PlatformConfig } from './usePlatformConfig'
import '@bo/styles/kit.css'

type Row = ConfigRevision
const props = defineProps<{ cfg: PlatformConfig }>()
const lockId = `bo-hist-lock-${useId()}`
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

<style scoped>
.bo-hist__lock {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4) 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
.bo-hist__lock .v-icon {
  font-size: var(--ek-icon-sm);
}
.bo-flushed :deep(.bo-section__body) {
  padding-top: var(--ek-space-4);
}

/* BO-LOCAL-01 — geri alma kilidi notu: düz uyarı zemini + ince ton çerçevesi (sol şerit yok). */
.bo-hist__lock {
  margin: var(--ek-space-3) var(--ek-space-4) 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-warning-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}
</style>
