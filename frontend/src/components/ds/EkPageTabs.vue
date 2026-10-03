<!--
  frontend/src/components/ds/EkPageTabs.vue

  ADR-0015 Karar 6.1 — sayfa içi sekme, TEK KAYNAK. `v-tabs` + `role=tablist`,
  alt çizgi göstergesi (`primary` 2px). Sayfa başlığının ALTINDA, filtre
  çubuğunun ÜSTÜNDE yer alır. URL parametresi olarak yazma (`screens.ts`
  `urlParams`, ADR-0012 `replace`) ÇAĞIRANIN sorumluluğudur — bu bileşen saf
  sunumdur. Entegrasyon ekranlarının platform rayı (Karar 3.11) bunun
  SEÇİLEBİLİR KART varyantıdır, ayrı bir desen değildir — `EkPlatformMark`
  ile birlikte kullanılır.

  Kullanım:
    <EkPageTabs v-model="activeTab" :tabs="[{ value: 'overview', label: 'Genel' }, { value: 'logs', label: 'Kayıtlar' }]" />
-->
<template>
  <v-tabs :model-value="modelValue" class="ek-page-tabs" @update:model-value="(value) => emit('update:modelValue', value as string)">
    <v-tab v-for="tab in tabs" :key="tab.value" :value="tab.value">
      {{ tab.label }}
    </v-tab>
  </v-tabs>
</template>

<script setup lang="ts">
export interface EkPageTab {
  value: string
  label: string
}

defineProps<{
  modelValue: string
  tabs: EkPageTab[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<style scoped>
.ek-page-tabs {
  border-bottom: 1px solid var(--ek-color-border-default);
}
</style>
