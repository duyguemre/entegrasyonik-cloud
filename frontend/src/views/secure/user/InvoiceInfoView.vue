<!--
  frontend/src/views/secure/user/InvoiceInfoView.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN, mantık DEĞİŞMEDİ (bkz. e2e/specs/user-account-forms.spec.ts).
  Karakterizasyon: hiçbir alanda `v-model` YOKTU (tamamen durumsuz/inert form), `buttons` script'te
  tanımlı ama template'te HİÇ KULLANILMIYORDU (kaydet düğmesi render edilmiyor) — AYNEN korunuyor,
  YENİ bir v-model/kaydet düğmesi EKLENMEDİ. Eski `style="width:48%"` / `style="width:4%"` inline
  2-sütun hack'i DS grid'iyle değiştirildi. `.invoiceInfoView` kök sınıfı yeni eklendi (kardeş
  ekranlarla aynı isimlendirme kuralı; davranışı ETKİLEMEZ).

  Karakterizasyon notu (çeviri boşluğu, DÜZELTİLMEDİ): `user.invoiceInfo.address` (tr.json)
  çevrilmemiş, literal İngilizce "Address" gösteriyor — metin AYNEN korundu (BACKLOG önerisi
  final rapora yazıldı; `docs/*` salt-okunur olduğu için bu oturumdan BACKLOG.md'ye yazılamadı).

  ADR notu (gap analizi §d): bu ekran "ölü/prototip" sayılıp Aşama 0'a (kaldırma) atanmış — bu
  görev kapsamında yalnızca görsel iyileştirme yapıldı, işlevsel tamamlama EKLENMEDİ (kapsam dışı).
-->
<template>
  <div class="invoiceInfoView ek-static-screen">
    <EkPageHeader section="Ayarlar" :title="$t('menu.invoiceInfo')" />

    <EkSection>
      <v-radio-group inline hide-details class="ek-static-screen__radio">
        <v-radio value="1" :label="$t('customers.customer.new.real')"></v-radio>
        <v-radio value="1" :label="$t('customers.customer.new.corporate')"></v-radio>
      </v-radio-group>

      <div class="ek-static-screen__grid">
        <div class="ek-static-screen__col">
          <v-text-field clearable prepend-inner-icon="mdi-account-outline" density="comfortable"
            :label="$t('user.invoiceInfo.name')" variant="outlined"></v-text-field>
          <v-text-field clearable prepend-inner-icon="mdi-account-outline" density="comfortable"
            :label="$t('user.invoiceInfo.surname')" variant="outlined"></v-text-field>
          <v-text-field clearable prepend-inner-icon="mdi-card-account-details-outline" density="comfortable"
            :label="$t('user.invoiceInfo.tc')" variant="outlined"></v-text-field>
          <v-text-field clearable prepend-inner-icon="mdi-domain" density="comfortable"
            :label="$t('user.invoiceInfo.company')" variant="outlined"></v-text-field>
          <div class="ek-static-screen__row">
            <v-text-field clearable prepend-inner-icon="mdi-bank-outline" density="comfortable"
              :label="$t('user.invoiceInfo.taxissuer')" variant="outlined"></v-text-field>
            <v-text-field clearable prepend-inner-icon="mdi-pound" density="comfortable"
              :label="$t('user.invoiceInfo.taxid')" variant="outlined"></v-text-field>
          </div>
        </div>

        <div class="ek-static-screen__col">
          <v-textarea rows="3" clearable prepend-inner-icon="mdi-map-marker-outline" density="comfortable"
            :label="$t('user.invoiceInfo.address')" variant="outlined"></v-textarea>
          <div class="ek-static-screen__row">
            <v-select clearable prepend-inner-icon="mdi-city-variant-outline" density="comfortable"
              :label="$t('user.invoiceInfo.state')" variant="outlined"></v-select>
            <v-select clearable prepend-inner-icon="mdi-map-marker-radius-outline" density="comfortable"
              :label="$t('user.invoiceInfo.district')" variant="outlined"></v-select>
          </div>
        </div>
      </div>
    </EkSection>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkSection from '@/components/ds/EkSection.vue'

const { t } = useI18n()

var buttons = [
{
  title: t("user.invoiceInfo.save"),
  icon: 'mdi-note-edit-outline',
  color: 'primary',
  to: '',
},
]

</script>

<style scoped>
.invoiceInfoView {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-6);
}

.ek-static-screen__radio {
  margin-bottom: var(--ek-space-2);
}

.ek-static-screen__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-6);
}

.ek-static-screen__col {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.ek-static-screen__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-3);
}

@media (max-width: 1023px) {
  .ek-static-screen__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 599px) {
  .ek-static-screen__row {
    grid-template-columns: 1fr;
  }
}
</style>
