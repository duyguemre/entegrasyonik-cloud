<template>
  <!-- Yalnız dev + sahte API: üretim paketine girmez (LoginView bu bileşeni DEV koşuluyla tembel yükler). -->
  <EkAlert tone="info" dense title="Örnek ortam (sahte API)">
    <span>Kayıtlı: <code>yonetici@ornek.test</code> · İlk giriş: <code>yeni.yonetici@ornek.test</code> · parola <code>ornek-parola</code> · kod: herhangi 6 hane</span>
  </EkAlert>
</template>

<script setup lang="ts">
import { EkAlert } from '@entegrasyonik/ui/components'
</script>

<style scoped>
code {
  font-family: var(--ek-font-mono);
}
</style>
