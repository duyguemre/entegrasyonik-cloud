<!-- İmleçli liste alt çubuğu: gösterilen kayıt sayısı + "Daha fazla" (+ yükleme hatası satır içi, liste silinmez). -->
<template>
  <div class="bo-more">
    <span class="bo-more__count" aria-live="polite">{{ count }} kayıt gösteriliyor{{ hasMore ? '' : ' · listenin sonu' }}</span>
    <p v-if="error" class="bo-more__error" role="alert">{{ error.message }}</p>
    <EkButton v-if="hasMore" tone="secondary" size="sm" icon="mdi-chevron-down" :loading="loading" data-testid="load-more" @click="emit('more')">Daha fazla</EkButton>
  </div>
</template>

<script setup lang="ts">
import { EkButton } from '@entegrasyonik/ui/components'
import type { DescribedError } from '@bo/utils/errors'

defineProps<{ count: number; hasMore: boolean; loading: boolean; error?: DescribedError | null }>()
const emit = defineEmits<{ more: [] }>()
</script>

<style scoped>
.bo-more {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}
.bo-more__count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-more__error {
  flex: 1 1 100%;
  margin: 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-label-size);
}
</style>
