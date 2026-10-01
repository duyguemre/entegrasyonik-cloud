<!-- FE-CFG-3: sabit demo satırları (kişisel veri benzeri) silindi; ortak boş durum gövdesi. -->
<template>
  <LegacyDefinitionEmpty>
    <template #header>
      <EkPageHeader section="Siparişler" :title="$t('definitions.return.title')" />
    </template>
  </LegacyDefinitionEmpty>
</template>

<script setup lang="ts">
import EkPageHeader from '@/components/page/EkPageHeader.vue'
import LegacyDefinitionEmpty from './LegacyDefinitionEmpty.vue'
</script>
