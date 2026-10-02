<!--
  BoPagination — TEK SAYFALAMA (BO2-41). Backoffice uçları imleçlidir (`nextCursor`): sayfalama "N kayıt gösteriliyor ·
  Daha fazla" desenidir ve her listede aynı davranır — aynı süzgeçle sonraki sayfa eklenir, liste silinmez, hata satır
  içinde gösterilir, sonunda "listenin sonu". `total` biliniyorsa "12 / 40 kayıt". `source` → teknik kaynak notu.

    <template #footer>
      <BoPagination :count="list.items.length" :has-more="list.hasMore" :loading="list.loadingMore" :error="list.moreError" @more="list.more()" />
    </template>
-->
<template>
  <div class="bo-pager" data-bo-pagination>
    <span class="bo-pager__count" aria-live="polite">
      <template v-if="total !== undefined && total !== null">{{ nf.format(count) }} / {{ nf.format(total) }} kayıt</template>
      <template v-else>{{ nf.format(count) }} kayıt gösteriliyor</template>
      <template v-if="!hasMore && count > 0"> · listenin sonu</template>
      <span v-if="source" class="bo-pager__source"> · kaynak: {{ source }}</span>
    </span>
    <p v-if="error" class="bo-pager__error" role="alert">{{ error.message }}</p>
    <EkButton v-if="hasMore" tone="secondary" size="sm" icon="mdi-chevron-down" :loading="loading" data-testid="load-more" @click="emit('more')">Daha fazla</EkButton>
  </div>
</template>

<script setup lang="ts">
import { EkButton } from '@entegrasyonik/ui/components'
import type { DescribedError } from '@bo/utils/errors'

withDefaults(
  defineProps<{ count: number; hasMore?: boolean; loading?: boolean; error?: Pick<DescribedError, 'message'> | null; total?: number | null; source?: string }>(),
  { hasMore: false, loading: false },
)
const emit = defineEmits<{ more: [] }>()
const nf = new Intl.NumberFormat('tr-TR')
</script>

<style scoped>
.bo-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  min-height: 48px;
  padding: var(--ek-space-2) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-pager__count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-pager__error {
  flex: 1 1 100%;
  margin: 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}
</style>
