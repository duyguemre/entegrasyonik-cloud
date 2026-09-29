<!-- Vitrin §6 — form alanları: durumlar + standart ızgara (iç içe geçme yok). -->
<template>
  <DsSpecimen title="Alan durumları" note="Outlined, 40 px, etiket alanın içinde yüzer; yardım metni caption/muted, hata metni error: '<ne oldu> — <ne yapılmalı>'.">
    <EkFormGrid :columns="3">
      <v-text-field label="Varsayılan" placeholder="ör. TY-102348" hint="Pazaryeri sipariş numarası" persistent-hint />
      <v-text-field label="Dolu" model-value="Pamuklu Oversize Tişört" hint="Ürün adı en fazla 100 karakter" persistent-hint />
      <v-text-field label="Odak" model-value="TSH-OVS-001" :focused="true" hint="Klavye odağında aksiyon rengi çerçeve" persistent-hint />
      <v-text-field
        label="Hata"
        model-value="12,5"
        :error-messages="['Stok adedi tam sayı olmalı — ondalık kısmı silin.']"
      />
      <v-text-field label="Devre dışı" model-value="Otomatik hesaplanır" disabled hint="Sistem tarafından doldurulur" persistent-hint />
      <v-text-field label="Yükleniyor" model-value="Kategori özellikleri" loading hint="Trendyol'dan özellik listesi çekiliyor" persistent-hint>
        <template #loader="{ isActive }">
          <v-progress-linear :active="isActive" indeterminate absolute aria-label="Özellik listesi yükleniyor" />
        </template>
      </v-text-field>
      <v-select label="Seçim (select)" :items="channels" model-value="Trendyol" hint="Tek kanal seçin" persistent-hint />
      <v-text-field label="Tarih" type="date" model-value="2026-09-29" prepend-inner-icon="mdi-calendar-outline" hint="gg.aa.yyyy" persistent-hint />
      <v-text-field label="Zorunlu alan *" aria-required="true" hint="* zorunlu alanları işaretler" persistent-hint />
    </EkFormGrid>
    <div class="ds-checks">
      <v-checkbox label="Seçili" :model-value="true" />
      <v-checkbox label="Seçili değil" :model-value="false" />
      <v-checkbox label="Devre dışı" :model-value="true" disabled />
      <v-checkbox label="Hatalı onay" :model-value="false" :error-messages="['Devam etmek için sözleşmeyi onaylayın.']" />
    </div>
  </DsSpecimen>

  <DsSpecimen
    title="Form ızgarası standardı (EkFormGrid)"
    note="Örnek: pazaryeri entegrasyon formu. Eşit kolonlar, sabit 16 px boşluk, her alan kendi hücresinde — alanlar üst üste binmez. Tablet 2, mobil 1 kolon."
  >
    <form class="ds-form" @submit.prevent>
      <fieldset class="ds-form__section">
        <legend class="ds-form__legend">Bağlantı bilgileri</legend>
        <p class="ds-form__help">Pazaryeri satıcı panelindeki "Entegrasyon bilgileri" sayfasından alınır.</p>
        <EkFormGrid :columns="2">
          <v-text-field label="Satıcı ID *" model-value="248113" aria-required="true" />
          <v-text-field label="Mağaza adı" model-value="Örnek Moda" />
          <v-text-field label="API anahtarı *" model-value="••••••••••••" aria-required="true" hint="Kaydedildikten sonra gizlenir" persistent-hint />
          <v-text-field label="API gizli anahtarı *" model-value="••••••••••••" aria-required="true" />
          <v-text-field class="ek-span-2" label="Webhook adresi" model-value="https://app.entegrasyonik.com/hooks/…" readonly hint="Salt okunur — pazaryeri paneline yapıştırın" persistent-hint />
        </EkFormGrid>
      </fieldset>
      <fieldset class="ds-form__section">
        <legend class="ds-form__legend">Eşitleme ayarları</legend>
        <EkFormGrid :columns="3">
          <v-select label="Stok eşitleme" :items="['Anlık', '15 dakikada bir', 'Saatlik']" model-value="15 dakikada bir" />
          <v-text-field label="Fiyat çarpanı" model-value="1,00" />
          <v-select label="Varsayılan kargo" :items="['Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo']" model-value="Yurtiçi Kargo" />
        </EkFormGrid>
      </fieldset>
      <div class="ds-form__bar">
        <span class="ds-form__bar-hint">2 alan değişti</span>
        <EkButton tone="secondary">Vazgeç</EkButton>
        <EkButton tone="primary" icon="mdi-content-save-outline" type="submit">Kaydet</EkButton>
      </div>
    </form>
  </DsSpecimen>
</template>

<script setup lang="ts">
import DsSpecimen from './DsSpecimen.vue'
import EkFormGrid from '@/components/ds/EkFormGrid.vue'
import EkButton from '@/components/ds/EkButton.vue'

const channels = ['Trendyol', 'Hepsiburada', 'N11', 'Pazarama']
</script>

<style scoped>
.ds-checks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2) var(--ek-space-6);
  margin-top: var(--ek-space-4);
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ds-form {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}

.ds-form__section {
  margin: 0;
  padding: 0;
  border: 0;
}

.ds-form__legend {
  margin-bottom: var(--ek-space-1);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-type-subheading-weight);
}

.ds-form__help {
  margin: 0 0 var(--ek-space-4);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-form__legend + .ds-form__help {
  margin-top: 0;
}

.ds-form__section > :deep(.ek-form-grid) {
  margin-top: var(--ek-space-3);
}

.ds-form__bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}

.ds-form__bar-hint {
  flex: 1;
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}
</style>
