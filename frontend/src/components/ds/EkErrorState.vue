<!--
  frontend/src/components/ds/EkErrorState.vue

  ADR-0015 Karar 3.2/6.1 — hata durumu: "<ne oldu> — <ne yapılmalı>" +
  "Tekrar dene". Ham hata, HTTP kodu ve stack GÖSTERİLMEZ (skill: insan-
  okunur, aksiyon alınabilir mesaj). İki boyut: `size="inline"` (tablo
  gövdesi içinde) ve `size="page"` (sayfa düzeyi, varsayılan).

  Kullanım:
    <EkErrorState
      message="Siparişler yüklenemedi — bağlantınızı kontrol edip tekrar deneyin."
      @retry="refetch"
    />
    <EkErrorState size="inline" message="Kayıtlar yüklenemedi." @retry="refetch" />
-->
<template>
  <div class="ek-error-state" :class="`ek-error-state--${size}`">
    <v-icon icon="mdi-alert-circle-outline" :size="size === 'page' ? 40 : 24" class="ek-error-state__icon" aria-hidden="true" />
    <p class="ek-error-state__message">{{ message }}</p>
    <v-btn variant="outlined" prepend-icon="mdi-refresh" @click="emit('retry')">
      Tekrar dene
    </v-btn>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** "<ne oldu> — <ne yapılmalı>" biçiminde, ham hata/HTTP kodu/stack YOK. */
    message: string
    size?: 'page' | 'inline'
  }>(),
  {
    size: 'page',
  },
)

const emit = defineEmits<{ retry: [] }>()
</script>

<style scoped>
.ek-error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-default);
}

.ek-error-state--page {
  padding: var(--ek-space-8) var(--ek-space-4);
  min-height: 240px;
}

.ek-error-state--inline {
  padding: var(--ek-space-4);
}

.ek-error-state__icon {
  color: var(--ek-color-error);
}

.ek-error-state__message {
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-muted);
  max-width: 420px;
  margin: 0;
}
</style>
