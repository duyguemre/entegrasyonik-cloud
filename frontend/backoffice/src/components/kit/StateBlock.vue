<!--
  StateBlock — ekran/panel gövdesinin dört durumu tek yerde (premium-ui-standards "durum kapsamı"):
  loading → iskelet · empty → açıklayıcı boş durum · error → EkProblemState (+ Tekrar dene) ·
  degraded (503: bağımlılık hazır değil) → uyarı tonlu EkProblemState · notFound → boş durum. `ready` → varsayılan slot.
  Teknik ayrıntı (kod, HTTP, istek kimliği) katlanır bölümdedir; gövdede ham hata yok.
-->
<template>
  <div class="bo-state" :aria-busy="phase === 'loading' || undefined">
    <EkSkeleton v-if="phase === 'loading'" :type="skeleton" :rows="rows" />
    <EkProblemState
      v-else-if="phase === 'error' || phase === 'degraded'"
      :tone="phase === 'degraded' ? 'warning' : 'error'"
      :icon="phase === 'degraded' ? 'mdi-lan-disconnect' : undefined"
      :title="phase === 'degraded' ? (degradedTitle ?? error?.title ?? 'Bağımlılık hazır değil') : (errorTitle ?? error?.title ?? 'Yüklenemedi')"
      :action="error?.action"
      :size="size"
      :retryable="true"
      :retrying="retrying"
      :details="details"
      @retry="emit('retry')"
    />
    <EkEmptyState v-else-if="phase === 'empty' || phase === 'notFound'" :variant="emptyVariant" :title="emptyTitle" :message="emptyMessage" />
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkEmptyState, EkProblemState, EkSkeleton } from '@entegrasyonik/ui/components'
import type { DescribedError } from '@bo/utils/errors'

const props = withDefaults(
  defineProps<{
    phase: 'loading' | 'ready' | 'empty' | 'error' | 'degraded' | 'notFound'
    error?: DescribedError | null
    skeleton?: 'table' | 'cards' | 'form' | 'detail'
    rows?: number
    emptyTitle?: string
    emptyMessage?: string
    emptyVariant?: 'no-data' | 'no-results'
    errorTitle?: string
    degradedTitle?: string
    size?: 'page' | 'inline' | 'compact'
    retrying?: boolean
  }>(),
  { skeleton: 'table', rows: 6, emptyTitle: 'Kayıt yok', emptyMessage: 'Gösterilecek kayıt bulunmuyor.', emptyVariant: 'no-data', size: 'inline', retrying: false },
)
const emit = defineEmits<{ retry: [] }>()

const details = computed(() => {
  const e = props.error
  if (!e) return undefined
  return [
    { label: 'Kod', value: e.code },
    { label: 'HTTP', value: String(e.status || '—') },
    ...(e.requestId ? [{ label: 'İstek kimliği', value: e.requestId }] : []),
  ]
})
</script>

<style scoped>
.bo-state {
  min-width: 0;
}
</style>
