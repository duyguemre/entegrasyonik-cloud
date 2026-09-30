<!--
  ADR-0015 N13 "Yakında" — kargo entegrasyonlarının HİÇBİRİNİN backend
  entegrasyonu YOK (`docs/INTEGRATIONS_REGISTRY.md` §5.1: "NET: backend'de
  hiçbir kargo API entegrasyonu YOK"; `ShipmentService.createShipment` içinde
  `hasShipmentIntegration = false` sabit). Bu bileşen daha önce PTT'ye özgü
  gerçek görünen bir "Kaydet" formuydu (ayar DB'ye yazılıyordu ama hiçbir
  kargo API'si bunu OKUMUYORDU) — diğer 8 kargo firmasıyla TUTARLI "Yakında"
  bildirimine normalize edildi (Karar 6 "tek iş = tek desen").
-->
<template>
  <IntegrationComingSoonPanel platform-name="PTT Kargo" category="kargo" alternative-capability="shippingNotice" />
</template>

<script setup lang="ts">
import IntegrationComingSoonPanel from '@/components/integrations/IntegrationComingSoonPanel.vue'

defineProps<{ editingClientIntegration?: any }>()
defineEmits<{ update: [payload: any]; refresh: [code: string] }>()
</script>
