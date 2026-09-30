<!--
  frontend/src/views/secure/user/ExitView.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN, mantık DEĞİŞMEDİ (bkz. e2e/specs/user-account-forms.spec.ts).
  Karakterizasyon: bu ekran hiçbir gerçek işlev taşımıyor (kullanılmayan `useRestApi`/`useRouter`
  import'ları, boş `onBeforeMount` — DOKUNULMADI), yalnızca sabit "EXIT" metnini render ediyordu.
  ADR gap analizi (§d) bu ekranı "ölü/prototip" sayıp Aşama 0'a (kaldırma) atıyor — nihai kader
  (silme/gerçek çıkış akışına bağlama) bu görevin kapsamı DIŞI; burada yalnızca aynı metin premium
  token'larla sunuluyor. `.exitView` kök sınıfı yeni eklendi (kardeş ekranlarla aynı isimlendirme
  kuralı — `.authorizationListView`/`.ticketListView` emsali; davranışı ETKİLEMEZ).
-->
<template>
  <div class="exitView ek-static-screen">
    <EkPageHeader section="Ayarlar" :title="$t('menu.exit')" />
    <div class="ek-static-screen__body">
      <v-icon icon="mdi-logout-variant" size="40" class="ek-static-screen__icon" aria-hidden="true" />
      <span class="ek-static-screen__label">EXIT</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeMount } from 'vue';
import useRestApi from '@/composables/restapi';
import { useRouter } from 'vue-router'
import EkPageHeader from '@/components/page/EkPageHeader.vue'
const router = useRouter()

const restApi = useRestApi()

onBeforeMount(() => {
})

</script>

<style scoped>
.exitView {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-6);
}

.ek-static-screen__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-3);
  min-height: 240px;
  color: var(--ek-color-content-muted);
}

.ek-static-screen__icon {
  color: var(--ek-color-content-subtle);
}

.ek-static-screen__label {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  letter-spacing: 0.04em;
}
</style>
