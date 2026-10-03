<!--
  ADR-0015 N13 "Yakında" — bkz. `PttComponent.vue` gerekçe notu. Önceki içerik
  "Aras Kargo" ekranında "Hepsiburada Satıcı Paneli" metni gösteren kopyala-
  yapıştır kalıntısıydı (araştırma bulgusu, BACKLOG'a taşındı).
-->
<template>
  <IntegrationComingSoonPanel platform-name="Aras Kargo" category="kargo" />
</template>

<script setup lang="ts">
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'

defineProps<{ editingClientIntegration?: any }>()
defineEmits<{ update: [payload: any]; refresh: [code: string] }>()
</script>
