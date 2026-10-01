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

      <!-- FE-CFG-2: destek iletişimi (backoffice `support.*`, public-config). Boş olan öğe yok; ikisi boşsa satır yok. Düz metin. -->
      <nav v-if="supportLinks.length" class="ek-login-support" aria-label="Destek iletişimi" data-testid="login-support">
        <span class="ek-login-support__lead">Yardım mı gerekiyor?</span>
        <a v-for="l in supportLinks" :key="l.key" :href="l.href" class="ek-login-support__link" :aria-label="l.label" :data-testid="l.key">
          <v-icon size="16" aria-hidden="true">{{ l.icon }}</v-icon>
          <span>{{ l.text }}</span>
        </a>
      </nav>
    </AuthShell>
  </div>
</template>

<script lang="ts" setup>
import AuthShell from '@/components/login/AuthShell.vue'
import LoginComponentVue from '@/components/login/LoginComponent.vue';
import { useIntegrationStore } from '@/stores/integrationStore';
import { siteBaseUrl } from '@/config/siteLinks';
import { computed } from 'vue'
import { usePublicConfigStore } from '@/stores/publicConfig'
import { supportContactLinks } from '@/components/layout/supportContact'

const integrationStore = useIntegrationStore()
integrationStore.init()

const publicConfig = usePublicConfigStore()
const supportLinks = computed(() => supportContactLinks(publicConfig.supportEmail, publicConfig.supportPhone))
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
  transition: color var(--ek-motion-feedback);
}

.ek-login-support {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-1) var(--ek-space-4);
  margin-top: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-sm);
}

.ek-login-support__link {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: var(--ek-space-8);
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-semibold);
  text-decoration: none;
  overflow-wrap: anywhere;
  transition: color var(--ek-motion-feedback);
}

@media (pointer: coarse) {
  .ek-login-support__link,
  .ek-login-site-link {
    min-height: var(--ek-control-h-touch);
  }
}

.ek-login-support__link:hover,
.ek-login-support__link:focus-visible,
.ek-login-site-link:hover,
.ek-login-site-link:focus-visible {
  color: var(--ek-color-primary);
  text-decoration: underline;
}
</style>
