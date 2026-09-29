<!--
  ADR-0015 N13 "Yakında" — Shopify'ın backend entegrasyonu YOK
  (`docs/INTEGRATIONS_REGISTRY.md` §3.2: "backend'de kod YOK"). Önceki içerik
  bu platformla alakasız meyve verisi/kod kalıntısıydı (araştırma bulgusu,
  BACKLOG'a taşındı) — `IntegrationComingSoonPanel` ile değiştirildi.
-->
<template>
  <IntegrationComingSoonPanel platform-name="Shopify" category="e-ticaret" />
</template>

<script setup lang="ts">
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'

// `ECommerceView.vue` sözleşmesiyle uyum için tutulur; bu platform henüz
// backend'e bağlı olmadığından `update`/`refresh` HİÇBİR ZAMAN emit edilmez.
defineProps<{ editingClientIntegration?: any }>()
defineEmits<{ update: [payload: any]; refresh: [code: string] }>()
</script>
