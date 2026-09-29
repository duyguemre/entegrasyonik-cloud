<!--
  frontend/src/components/ds/EkSkeleton.vue

  ADR-0015 Karar 3.2/6.1 — yükleniyor durumu. İLK yüklemede iskelet
  (`v-skeleton-loader`, tema yüzey renkleri — token), YENİDEN yüklemede
  ince 2px `v-progress-linear` (spinner YOK; dönen/zıplayan yükleme ikonu
  YASAK). Spinner YALNIZCA düğme içinde kullanılır (bu bileşenin kapsamı
  DIŞINDA — `v-btn :loading` zaten bunu sağlar).

  Kullanım:
    <EkSkeleton v-if="loading" type="table" />
    <EkSkeleton v-if="loading" type="cards" :rows="4" />
    <v-progress-linear v-if="refreshing" indeterminate height="2" color="primary" />
-->
<template>
  <v-skeleton-loader :type="skeletonType" :loading="true" />
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    type?: 'table' | 'cards' | 'form' | 'detail'
    rows?: number
  }>(),
  {
    type: 'table',
    rows: 8,
  },
)

/** Vuetify `VSkeletonLoader` "type" mini-dil sözlüğü (bkz. Vuetify docs). */
const skeletonType = computed(() => {
  switch (props.type) {
    case 'table':
      return `table-heading, table-row@${props.rows}`
    case 'cards':
      return `card@${props.rows}`
    case 'form':
      return 'heading, text, text, text, actions'
    case 'detail':
      return 'heading, article, actions'
    default:
      return 'table-row@8'
  }
})
</script>
