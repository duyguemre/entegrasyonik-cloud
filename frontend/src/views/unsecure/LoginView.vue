<!--
  frontend/src/views/unsecure/LoginView.vue

  ADR-0015 Karar 4 — kimlik ekranı kabuğu. `AuthShell` (marka paneli + 400px
  form sütunu) içine `LoginComponent`'i (sekmeler: GİRİŞ/KAYIT/ŞİFREMİ
  UNUTTUM) yerleştirir. `.LoginView` kök sınıfı KORUNUR: `LoginComponent`
  içindeki `LoadingComponent` bu sınıfa `attach` ile bağlanır (ADR-0015 Karar
  5.1 Ek A — spec kancası DEĞİL ama davranışsal bağımlılık, dokunulmadı).
-->
<template>
  <div class="LoginView">
    <AuthShell>
      <LoginComponentVue />

      <!-- ADR-0014: girişten tanıtım sitesine dönüş (taban adres VITE_SITE_URL; sabit alan adı yok). -->
      <div class="ek-login-site-link-row">
        <a :href="siteBaseUrl" class="ek-login-site-link" data-testid="site-link">
          <v-icon size="16" aria-hidden="true">mdi-arrow-left</v-icon>
          <span>Ana site</span>
        </a>
      </div>
    </AuthShell>
  </div>
</template>

<script lang="ts" setup>
import AuthShell from '@/components/login/AuthShell.vue'
import LoginComponentVue from '@/components/login/LoginComponent.vue';
import { useIntegrationStore } from '@/stores/integrationStore';
import { siteBaseUrl } from '@/config/siteLinks';

const integrationStore = useIntegrationStore()
integrationStore.init()
</script>

<style scoped>
.LoginView {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  /* Mobilde klavye açılınca scroll olması için */
}

.ek-login-site-link-row {
  display: flex;
  justify-content: center;
  margin-top: var(--ek-space-6);
}

.ek-login-site-link {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: var(--ek-space-8);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  text-decoration: none;
  transition: color var(--ek-duration-fast) var(--ek-easing-standard);
}

.ek-login-site-link:hover,
.ek-login-site-link:focus-visible {
  color: var(--ek-color-primary);
  text-decoration: underline;
}
</style>
