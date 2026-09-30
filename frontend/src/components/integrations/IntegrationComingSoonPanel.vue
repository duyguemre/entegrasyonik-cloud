<!--
  frontend/src/components/integrations/IntegrationComingSoonPanel.vue

  ADR-0015 N13 "Yakında" durumu (Karar 2.4 gap eşleme tablosu) + C1.2 madde 4 — implemente EDİLMEMİŞ entegrasyonlar
  (backend `getCatalog` manifestosunda KODU OLMAYAN her sağlayıcı: Shopify/WooCommerce/Wix/Opencart/Ticimax/Anka/
  ETicaretSoft, TÜM kargo firmaları, TÜM e-fatura sağlayıcıları) için TEK KAYNAK panel.

  ÖNCEKİ DURUM (araştırma bulgusu, BACKLOG'a taşındı): bu 19 bileşenin çoğu kopyala-yapıştır kalıntısıydı — ör.
  `ShopifyComponent.vue` alakasız meyve verisi ve global (scoped OLMAYAN) `<style>` içeriyordu, kargo bileşenleri
  "Aras Kargo" ekranında "Hepsiburada Satıcı Paneli" metni gösteriyordu, e-fatura ekranının `onUpdate` işleyicisi
  yalnızca `console.log` yapıyordu (Kaydet düğmesi hiçbir şey KAYDETMİYORDU — E3 "sahte başarı" ihlali). Bu panel,
  çalışmayan/yanıltıcı formlar yerine DÜRÜST bir "Yakında" bildirimi gösterir; asla "bağlı/aktif" izlenimi vermez.

  C1.2: kimlik bilgisi alanı YOK; "Kaydet" gizlenmez, NEDENLİ devre dışıdır (neden metni `aria-describedby` ile
  bağlı). Daha önce kaydedilmiş ayarlar SİLİNMEZ (yalnız arayüz). `alternativeCapability` verilirse, bugün bu işi
  kısmen karşılayan CANLI kanallar katalogdan (`getCatalog`) listelenir — uydurma liste yok; katalog alınamazsa bölüm
  gösterilmez.

  Kullanım:
    <IntegrationComingSoonPanel platform-name="Shopify" category="e-ticaret" />
    <IntegrationComingSoonPanel category="kargo" alternative-capability="shippingNotice" />   (kategori düzeyi)
-->
<template>
  <section class="ek-coming-soon-panel" :aria-labelledby="titleId">
    <div class="ek-coming-soon-panel__body">
      <div class="ek-coming-soon-panel__mark">
        <EkPlatformMark v-if="platformName" :name="platformName" size="lg" />
        <EkIconTile v-else icon="mdi-timer-sand" tone="neutral" size="lg" />
        <EkStatusChip tone="neutral" :label="t('integrationComingSoon.badge')" />
      </div>
      <h2 :id="titleId" class="ek-coming-soon-panel__title">{{ title }}</h2>
      <p class="ek-coming-soon-panel__text">{{ platformName ? t('integrationComingSoon.message') : t('integrationComingSoon.categoryMessage') }}</p>
      <ul class="ek-coming-soon-panel__facts">
        <li>
          <v-icon icon="mdi-key-remove" size="16" aria-hidden="true" />
          <span>{{ t('integrationComingSoon.noCredentials') }}</span>
        </li>
        <li>
          <v-icon icon="mdi-content-save-check-outline" size="16" aria-hidden="true" />
          <span>{{ t('integrationComingSoon.keepsSettings') }}</span>
        </li>
      </ul>

      <div v-if="alternatives.length" class="ek-coming-soon-panel__alt">
        <h3 class="ek-coming-soon-panel__micro">{{ t('integrationComingSoon.alternativesTitle') }}</h3>
        <p class="ek-coming-soon-panel__alt-text">{{ t(`integrationComingSoon.alternatives.${alternativeCapability}`) }}</p>
        <ul class="ek-coming-soon-panel__alt-list" :aria-label="t('integrationComingSoon.alternativesTitle')">
          <li v-for="alt in alternatives" :key="alt.code" class="ek-coming-soon-panel__alt-item">
            <EkPlatformMark :name="alt.name" :code="alt.code" size="sm" />
            <span v-if="alt.level !== 'supported'" class="ek-coming-soon-panel__alt-level">· {{ t(`integrationCoverage.level.${alt.level}`).toLocaleLowerCase('tr-TR') }}</span>
          </li>
        </ul>
      </div>
    </div>

    <footer class="ek-coming-soon-panel__actions">
      <p :id="reasonId" class="ek-coming-soon-panel__reason">
        <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
        <span>{{ t('integrationComingSoon.saveReason') }}</span>
      </p>
      <EkButton tone="primary" icon="mdi-content-save-outline" disabled :aria-describedby="reasonId">
        {{ t('integrationComingSoon.save') }}
      </EkButton>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkButton from '@/components/ds/EkButton.vue'
import { useIntegrationCatalog, type CapabilityLevel } from './integrationCatalog'

const props = withDefaults(
  defineProps<{
    /** Boşsa kategori düzeyi panel ("Kargo entegrasyonu henüz yok"). */
    platformName?: string
    /** "pazaryeri" | "e-ticaret" | "ERP" | "kargo" | "e-fatura" — cümle içinde okunur biçimde. */
    category?: string
    /** Bugün bu işi kısmen karşılayan canlı kanalları göstermek için yetenek anahtarı (ör. `shippingNotice`). */
    alternativeCapability?: 'shippingNotice' | 'invoiceNotice'
  }>(),
  {
    platformName: '',
    category: '',
    alternativeCapability: undefined,
  },
)

const { t } = useI18n()
const { getCatalog } = useIntegrationCatalog()
const uid = useId()
const titleId = `ek-coming-soon-${uid}`
const reasonId = `ek-coming-soon-reason-${uid}`

const title = computed(() =>
  props.platformName
    ? t('integrationComingSoon.title', { name: props.platformName, category: props.category })
    : t('integrationComingSoon.categoryTitle', { category: props.category }),
)

const alternatives = ref<{ code: string; name: string; level: CapabilityLevel }[]>([])

onMounted(async () => {
  const key = props.alternativeCapability
  if (!key) return
  const res = await getCatalog()
  if (!res.ok) return
  alternatives.value = res.data
    .filter((e) => e.capabilities[key] && ['supported', 'limited', 'platform_auto'].includes(e.capabilities[key].level))
    .map((e) => ({ code: e.code, name: e.displayName, level: e.capabilities[key].level }))
})
</script>

<style scoped>
.ek-coming-soon-panel {
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.ek-coming-soon-panel__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-8) var(--ek-space-6) var(--ek-space-6);
}

.ek-coming-soon-panel__mark {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
}

.ek-coming-soon-panel__title {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-type-heading-weight);
  line-height: var(--ek-type-heading-line);
}

.ek-coming-soon-panel__text {
  margin: 0;
  max-width: 560px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-coming-soon-panel__facts {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-coming-soon-panel__facts li {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

.ek-coming-soon-panel__facts .v-icon {
  color: var(--ek-color-content-muted);
}

.ek-coming-soon-panel__alt {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  width: 100%;
  margin-top: var(--ek-space-2);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-info-subtle);
}

.ek-coming-soon-panel__micro {
  margin: 0;
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  line-height: var(--ek-type-micro-line);
  text-transform: uppercase;
}

.ek-coming-soon-panel__alt-text {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-coming-soon-panel__alt-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: var(--ek-space-1) 0 0;
  padding: 0;
  list-style: none;
}

.ek-coming-soon-panel__alt-item {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  padding: var(--ek-space-1) var(--ek-space-3) var(--ek-space-1) var(--ek-space-1);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
}

.ek-coming-soon-panel__alt-level {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-coming-soon-panel__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-6);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.ek-coming-soon-panel__reason {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 200px;
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

@media (max-width: 599px) {
  .ek-coming-soon-panel__body {
    padding: var(--ek-space-6) var(--ek-space-4) var(--ek-space-4);
  }

  .ek-coming-soon-panel__actions {
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .ek-coming-soon-panel__reason {
    flex-basis: 100%;
    min-width: 0;
  }
}
</style>
