<!-- Vitrin §13 — Aşama 6b tutarlılık standartları: uyarı/hata/boş/toast (1), yükleme (8), eylem ikonları (10), satır eylemleri (3). -->
<template>
  <div class="ds-fb-grid">
    <DsSpecimen title="Uyarı bandı (EkAlert) — dört ton" note="Ton = anlam; ikon + başlık her zaman var. Ham v-alert kullanılmaz.">
      <div class="ds-fb-stack">
        <EkAlert tone="info" title="Teslimat yolunda" text="Sipariş kargoya verildi; bu aşamada yalnız teslimat takibi yapılabilir." />
        <EkAlert tone="success" title="Fatura oluşturuldu" text="E-arşiv faturası müşteriye e-posta ile gönderildi." />
        <EkAlert tone="warning" title="İşlem devam ediyor" text="Pazaryerinin işlemi tamamlaması için yaklaşık 2 dakika kilit uygulanır." />
        <EkAlert tone="error" title="Finansal uyumsuzluk" text="Platformdaki tutar ile yerel kayıt arasında fark var.">
          <template #actions><EkButton tone="secondary" size="sm">Farkı eşitle</EkButton></template>
        </EkAlert>
      </div>
    </DsSpecimen>
    <DsSpecimen title="Hata durumu (EkProblemState)" note="Ne oldu · olası neden · ne yapmalı · Tekrar dene · katlanır teknik ayrıntı. Entegrasyon yanıtı alınamama da bu desen.">
      <EkProblemState
        title="Trendyol kategori listesi şu an alınamadı"
        cause="Sunucu ya da Trendyol geçici bir hata verdi."
        action="Tekrar deneyin. Sürerse API anahtarlarınızı entegrasyon ayarlarında kontrol edin."
        :details="[{ label: 'HTTP durumu', value: '502' }, { label: 'Servis', value: 'IntegrationService/retrieveCategories' }]"
      >
        <template #actions><EkButton tone="secondary" size="sm" :icon="icons.settings" trailing-icon="mdi-arrow-right">Entegrasyon ayarına git</EkButton></template>
      </EkProblemState>
      <EkProblemState class="mt-3" tone="warning" icon="mdi-lan-disconnect" title="Sunucuya ulaşılamadı" cause="İnternet bağlantınız kesilmiş olabilir." action="Bağlantınızı kontrol edip tekrar deneyin." size="compact" />
    </DsSpecimen>
  </div>

  <div class="ds-fb-grid">
    <DsSpecimen title="Boş durum (EkEmptyState)" note="Hata değildir: nötr ton, ne yapılacağı ve varsa tek eylem.">
      <EkEmptyState variant="no-results" title="Sipariş bulunamadı" message="Filtreleri gevşetmeyi deneyin." />
    </DsSpecimen>
    <DsSpecimen title="Toast (tek kaynak: useToast → EkToastHost)" note="Sağ alt; ton şeridi + süre çizgisi; üzerine gelince durur; hata kullanıcı kapatana dek kalır.">
      <div class="ds-fb-row">
        <EkButton tone="secondary" size="sm" @click="showToast({ tone: 'success', title: 'Kaydedildi', message: 'Ürün bilgileri güncellendi.' })">Başarı</EkButton>
        <EkButton tone="secondary" size="sm" @click="showToast({ tone: 'info', message: 'Aktarım kuyruğa alındı.' })">Bilgi</EkButton>
        <EkButton tone="secondary" size="sm" @click="showToast({ tone: 'warning', message: '3 varyantın stok bilgisi eksik.' })">Uyarı</EkButton>
        <EkButton tone="secondary" size="sm" data-ds="toast-error" @click="showToast({ tone: 'error', title: 'Kaydedilemedi', message: 'Bağlantınızı kontrol edip tekrar deneyin.', actionLabel: 'Tekrar dene' })">Hata</EkButton>
      </div>
    </DsSpecimen>
  </div>

  <div class="ds-fb-grid">
    <DsSpecimen title="Yükleme işareti (EkBrandLoader)" note="Logo motifinden: düğümler sırayla yanar, göbek nefes alır, E çizgisi tamamlanır. Reduced-motion'da statik.">
      <div class="ds-fb-row ds-fb-row--center">
        <EkBrandLoader label="Siparişler yükleniyor…" />
        <EkBrandLoader :size="32" label="Kaydediliyor…" />
      </div>
    </DsSpecimen>
    <DsSpecimen title="Yükleme standardı" note="İlk yükleme = iskelet · engelleyici iş = sekme içi örtü (EkLoadingOverlay) · düğme işi = EkButton loading.">
      <div class="ds-fb-overlay-host">
        <EkSkeleton type="table" :rows="3" />
        <EkLoadingOverlay :model-value="true" attach=".ds-fb-overlay-host" label="İçe aktarılıyor…" :progress="62" />
      </div>
      <div class="ds-fb-row mt-3">
        <EkButton tone="primary" loading>Kaydet</EkButton>
        <EkButton tone="secondary" size="sm" loading>Tekrar dene</EkButton>
      </div>
    </DsSpecimen>
  </div>

  <div class="ds-fb-grid">
    <DsSpecimen title="Eylem ikonu kayıt defteri (design/icons.ts)" note="Aynı iş = aynı ikon, aynı boyut, aynı ton, aynı ipucu dili. Tehlikeli eylem kırmızı + onay.">
      <ul class="ds-fb-icons">
        <li v-for="(def, key) in ACTION_ICONS" :key="key">
          <EkActionButton :action="key" />
          <span class="ds-fb-icons__label">{{ def.label }}</span>
          <code>{{ def.icon.replace('mdi-', '') }}</code>
        </li>
      </ul>
    </DsSpecimen>
    <DsSpecimen title="Satır eylemleri (EkRowActions)" note="≤2 eylem: ikon düğme (tehlikeli en sağda) · 3+ eylem: ana eylem + ⋯ menüsü (grup, ayraç, tehlikeli en sonda).">
      <div class="ds-fb-stack">
        <div class="ds-fb-row"><span class="ds-fb-row__lbl">2 eylem</span>
          <EkRowActions label="Müşteri işlemleri" :items="[{ key: 'v', action: 'view', label: 'Müşteri karnesini görüntüle', onClick: noop }, { key: 'd', action: 'delete', label: 'Müşteriyi sil', onClick: noop }]" />
        </div>
        <div class="ds-fb-row"><span class="ds-fb-row__lbl">3+ eylem</span>
          <EkRowActions label="Fatura işlemleri" :items="[{ key: 'v', action: 'view', label: 'Fatura detaylarını görüntüle', onClick: noop }, { key: 'p', action: 'print', label: 'Faturayı yazdır', onClick: noop }, { key: 'dl', action: 'download', label: 'PDF indir', onClick: noop }, { key: 'd', action: 'delete', label: 'Faturayı sil', onClick: noop }]" />
        </div>
      </div>
    </DsSpecimen>
  </div>
</template>

<script setup lang="ts">
import DsSpecimen from './DsSpecimen.vue'
import { EkAlert, EkButton, EkProblemState, EkEmptyState, EkBrandLoader, EkLoadingOverlay, EkSkeleton, EkActionButton, EkRowActions } from '@entegrasyonik/ui/components'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { ACTION_ICONS, icons } from '@entegrasyonik/ui/icons'

const { showToast } = useToast()
const noop = () => undefined
</script>

<style scoped>
.ds-fb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  gap: var(--ek-space-6);
  margin-bottom: var(--ek-space-6);
}

.ds-fb-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.ds-fb-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.ds-fb-row--center {
  justify-content: space-around;
  padding: var(--ek-space-4) 0;
}

.ds-fb-row__lbl {
  min-width: 72px;
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}

.ds-fb-overlay-host {
  position: relative;
  min-height: 200px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  overflow: hidden;
  background: var(--ek-color-surface);
}

.ds-fb-icons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--ek-space-2) var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ds-fb-icons li {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: var(--ek-space-2);
  align-items: center;
}

.ds-fb-icons li > :first-child {
  grid-row: 1 / 3;
}

.ds-fb-icons__label {
  font-size: var(--ek-type-label-size);
  color: var(--ek-color-content-strong);
}

.ds-fb-icons code {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
}
</style>
