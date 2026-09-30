<!--
  frontend/src/views/secure/user/ChangePasswordView.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN, mantık KESİNLİKLE DEĞİŞMEDİ (görev talimatı: oturum/güvenlik
  akışı ekranı — bkz. e2e/specs/user-account-forms.spec.ts). Karakterizasyon: script bloğu BOŞTU,
  hiçbir "Kaydet/Değiştir" düğmesi render EDİLMİYORDU — bu AYNEN korunuyor, YENİ bir düğme/olay
  işleyici EKLENMEDİ. Yalnızca iki alanın düzeni (eski `width:48%` inline hack'i) DS
  grid/token'larıyla değiştirildi. `.changePasswordView` kök sınıfı yeni eklendi (kardeş ekranlarla
  aynı isimlendirme kuralı; davranışı ETKİLEMEZ).

  ADR notu (gap analizi §d, `docs/adr/0015-uygulama-gorsel-yenileme.md`): bu ekranın nihai kaderi
  N1 "Hesabım ve güvenlik" ile DEĞİŞTİRİLMESİDİR (B4-P0) — bu görev kapsamında yalnızca görsel
  iyileştirme yapıldı, işlevsel tamamlama (gerçek şifre değiştirme akışı) bilinçli olarak
  EKLENMEDİ (kapsam dışı, final rapora yazıldı).
-->
<template>
  <div class="changePasswordView ek-static-screen">
    <EkPageHeader section="Ayarlar" :title="$t('menu.changePassword')" />

    <div class="ek-static-screen__form">
      <!-- Karakterizasyon: orijinalde `type` YOK (düz metin girişi) — DEĞİŞTİRİLMEDİ, bkz. dosya başı notu. -->
      <v-text-field clearable prepend-inner-icon="mdi-lock-outline"
        :label="$t('user.changePassword.password')" variant="outlined"></v-text-field>
      <v-text-field clearable prepend-inner-icon="mdi-lock-check-outline"
        :label="$t('user.changePassword.repassword')" variant="outlined"></v-text-field>
    </div>
  </div>
</template>

<script setup lang="ts">
import EkPageHeader from '@/components/page/EkPageHeader.vue'
</script>

<style scoped>
.changePasswordView {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-6);
}

.ek-static-screen__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-4);
  max-width: 560px;
}

@media (max-width: 767px) {
  .ek-static-screen__form {
    grid-template-columns: 1fr;
  }
}
</style>
