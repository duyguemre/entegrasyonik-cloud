<!--
  ADR-0015 N13 "Yakında" — e-fatura sağlayıcılarının HİÇBİRİNİN backend
  entegrasyonu YOK (`docs/INTEGRATIONS_REGISTRY.md` §5.2: "NET: backend'de
  e-fatura sağlayıcı entegrasyonu YOK"; `InvoiceService.createInvoice` içinde
  `hasIntegratedProvider = false` sabit). Önceki "Kaydet" düğmesi yalnızca
  `console.log` yapıyordu (`EInvoiceView.vue` `onUpdate`) — kullanıcıya
  kaydedildi izlenimi veren ama hiçbir şey YAPMAYAN düğme E3 "sahte başarı"
  ihlaliydi (BACKLOG'a taşındı); dürüst "Yakında" bildirimiyle değiştirildi.
-->
<template>
  <IntegrationComingSoonPanel platform-name="Gelir İdaresi (GİB)" category="e-fatura" alternative-capability="invoiceNotice" />
</template>

<script setup lang="ts">
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'

defineProps<{ properties?: any }>()
defineEmits<{ update: [payload: any] }>()
</script>
