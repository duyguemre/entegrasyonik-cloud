<!--
  frontend/src/components/integrations/IntegrationComingSoonPanel.vue

  ADR-0015 N13 "Yakında" durumu (Karar 2.4 gap eşleme tablosu) — implemente
  EDİLMEMİŞ entegrasyonlar (`docs/INTEGRATIONS_REGISTRY.md`'deki 6 canlı kod
  DIŞINDAKİ her şey: Shopify/WooCommerce/Wix/Opencart/Ticimax/Anka/ETicaretSoft,
  TÜM kargo firmaları, TÜM e-fatura sağlayıcıları) için TEK KAYNAK panel.

  ÖNCEKİ DURUM (araştırma bulgusu, BACKLOG'a taşındı): bu 19 bileşenin çoğu
  kopyala-yapıştır kalıntısıydı — ör. `ShopifyComponent.vue` alakasız meyve
  verisi ve global (scoped OLMAYAN) `<style>` içeriyordu, kargo bileşenleri
  "Aras Kargo" ekranında "Hepsiburada Satıcı Paneli" metni gösteriyordu,
  e-fatura ekranının `onUpdate` işleyicisi yalnızca `console.log` yapıyordu
  (Kaydet düğmesi hiçbir şey KAYDETMİYORDU — E3 "sahte başarı" ihlali). Bu
  panel, çalışmayan/yanıltıcı formlar yerine DÜRÜST bir "Yakında" bildirimi
  gösterir; asla "bağlı/aktif" izlenimi vermez.

  Kullanım:
    <IntegrationComingSoonPanel platform-name="Shopify" category="e-ticaret" />
-->
<template>
  <div class="ek-coming-soon-panel">
    <EkStatusChip tone="neutral" label="Yakında" />
    <EkPlatformMark :name="platformName" size="lg" />
    <p class="ek-coming-soon-panel__text">
      {{ platformName }} {{ category }} entegrasyonu için altyapı çalışmaları sürüyor. Kullanıma açıldığında API
      bağlantı ayarlarını buradan yönetebileceksiniz.
    </p>
  </div>
</template>

<script setup lang="ts">
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'

withDefaults(
  defineProps<{
    platformName: string
    /** "pazaryeri" | "e-ticaret" | "ERP" | "kargo" | "e-fatura" — cümle içinde okunur biçimde. */
    category?: string
  }>(),
  {
    category: '',
  },
)
</script>

<style scoped>
.ek-coming-soon-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-8) var(--ek-space-6);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
}

.ek-coming-soon-panel__text {
  margin: 0;
  max-width: 480px;
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-muted);
}
</style>
