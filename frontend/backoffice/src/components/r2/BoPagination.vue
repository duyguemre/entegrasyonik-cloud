<!--
  BoPagination — TEK SAYFALAMA (BO2-41), standart liste kartının alt şeridi. Backoffice uçları imleçlidir (`nextCursor`):
  "N kayıt gösteriliyor · Daha fazla yükle" desenidir ve her listede aynı davranır — aynı süzgeçle sonraki sayfa eklenir,
  liste silinmez, hata satır içinde, sonunda "Listenin sonu". `total` biliniyorsa "24 / 140" + ne kadarının yüklendiğini
  gösteren ince ilerleme çubuğu. `source` → teknik kaynak notu.

    <template #footer>
      <BoPagination :count="list.items.length" :has-more="list.hasMore" :loading="list.loadingMore" :error="list.moreError" @more="list.more()" />
    </template>
-->
<template>
  <div class="bo-pager" data-bo-pagination>
    <div class="bo-pager__info">
      <span class="bo-pager__count" aria-live="polite">
        <template v-if="hasTotal"><b class="ek-num">{{ nf.format(count) }}</b> / <b class="ek-num">{{ nf.format(total!) }}</b> kayıt gösteriliyor</template>
        <template v-else><b class="ek-num">{{ nf.format(count) }}</b> kayıt gösteriliyor</template>
      </span>
      <span v-if="!hasMore && count > 0" class="bo-pager__end"><v-icon icon="mdi-check" aria-hidden="true" />Listenin sonu</span>
      <span v-if="source" class="bo-pager__source">Kaynak: {{ source }}</span>
      <span v-if="hasTotal && total! > 0" class="bo-pager__progress" role="progressbar" :aria-valuenow="count" aria-valuemin="0" :aria-valuemax="total!" :aria-label="`${count} / ${total} kayıt yüklendi`">
        <span :style="{ width: `${Math.min(100, (count / total!) * 100)}%` }"></span>
      </span>
    </div>
    <p v-if="error" class="bo-pager__error" role="alert"><v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />{{ error.message }}</p>
    <EkButton v-if="hasMore" tone="secondary" size="sm" icon="mdi-chevron-down" :loading="loading" data-testid="load-more" @click="emit('more')">Daha fazla yükle</EkButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
import type { DescribedError } from '@bo/utils/errors'

const props = withDefaults(
  defineProps<{ count: number; hasMore?: boolean; loading?: boolean; error?: Pick<DescribedError, 'message'> | null; total?: number | null; source?: string }>(),
  { hasMore: false, loading: false },
)
const emit = defineEmits<{ more: [] }>()
const nf = new Intl.NumberFormat('tr-TR')
const hasTotal = computed(() => props.total !== undefined && props.total !== null)
</script>

<style scoped>
.bo-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2) var(--ek-space-3);
  min-height: 52px;
  padding: var(--ek-space-2) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.bo-pager__info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-3);
  min-width: 0;
}

.bo-pager__count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

.bo-pager__count b {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-pager__end {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-subtle);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-pager__end .v-icon {
  color: var(--ek-color-success);
  font-size: var(--ek-icon-xs);
}

.bo-pager__source {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-pager__progress {
  display: inline-block;
  width: 96px;
  height: 4px;
  overflow: hidden;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-sunken);
}

.bo-pager__progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ek-color-action);
}

.bo-pager__error {
  display: inline-flex;
  flex: 1 1 100%;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

@media (max-width: 600px) {
  .bo-pager {
    padding: var(--ek-space-2) var(--ek-space-4);
  }
}

/* BO-LOCAL-01 — sayfalama bandı: ince çizgi `border-default`; "Listenin sonu" köşeli çerçeveli rozet (hap ve iç gölge yok). */
.bo-pager {
  border-top-color: var(--ek-color-border-default);
}

.bo-pager__end {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  box-shadow: none;
}
</style>
