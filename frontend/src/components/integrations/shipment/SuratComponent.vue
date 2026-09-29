<!--
  ADR-0015 N13 "Yakında" — bkz. `PttComponent.vue` gerekçe notu.
-->
<template>
  <IntegrationComingSoonPanel platform-name="Sürat Kargo" category="kargo" />
</template>

<script setup lang="ts">
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'

defineProps<{ editingClientIntegration?: any }>()
defineEmits<{ update: [payload: any]; refresh: [code: string] }>()
</script>
