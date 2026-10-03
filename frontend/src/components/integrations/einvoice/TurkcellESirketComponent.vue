<!--
  ADR-0015 N13 "Yakında" — bkz. `GelirIdaresiComponent.vue` gerekçe notu.
-->
<template>
  <IntegrationComingSoonPanel platform-name="Turkcell e-Şirket" category="e-fatura" />
</template>

<script setup lang="ts">
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'

defineProps<{ properties?: any }>()
defineEmits<{ update: [payload: any] }>()
</script>
