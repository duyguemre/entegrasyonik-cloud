<!--
  ADR-0015 N13 "Yakında" — bkz. `GelirIdaresiComponent.vue` gerekçe notu.
-->
<template>
  <IntegrationComingSoonPanel platform-name="Trendyol e-Faturam" category="e-fatura" alternative-capability="invoiceNotice" />
</template>

<script setup lang="ts">
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'

defineProps<{ properties?: any }>()
defineEmits<{ update: [payload: any] }>()
</script>
