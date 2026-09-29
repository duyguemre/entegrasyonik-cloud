<!--
  ADR-0015 N13 "Yakında" — Wix'in backend entegrasyonu YOK
  (`docs/INTEGRATIONS_REGISTRY.md` §3.2). Bkz. `ShopifyComponent.vue` gerekçe notu.
-->
<template>
  <IntegrationComingSoonPanel platform-name="Wix" category="e-ticaret" />
</template>

<script setup lang="ts">
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'

defineProps<{ editingClientIntegration?: any }>()
defineEmits<{ update: [payload: any]; refresh: [code: string] }>()
</script>
