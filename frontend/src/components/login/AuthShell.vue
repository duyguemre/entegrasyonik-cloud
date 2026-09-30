<!--
  frontend/src/components/login/AuthShell.vue

  ADR-0015 Karar 4 — kimlik ekranları (giriş/kayıt/şifremi unuttum/parola
  sıfırlama) için TEK paylaşılan iki sütunlu iskelet ("tek iş = tek desen",
  Karar 6). Sol: marka paneli (yalnızca ≥768px'te görünür; ≥1024'te tam
  yükseklik, 768-1023 arası 160px üst şerit). Sağ: 400px ortalanmış form
  sütunu (slot). Mobilde (<768) marka paneli GİZLİDİR; onun yerine üstte
  yalnızca işaret+kelime markası ve formun altında güven maddelerinin tek
  satırlık kompakt listesi gösterilir.

  Güven maddeleri YALNIZCA kanıtlı iddialardır (bkz. `site/src/data/capabilities.ts`
  — AES-256-GCM şifreleme, müşteri başına ayrı veritabanı, ödeme sağlayıcısı
  barındırdığı formdan kart verisi bize gelmez). Sahte istatistik/logo YOK.
-->
<template>
  <div class="ek-auth-shell">
    <aside class="ek-auth-shell__brand" aria-hidden="true">
      <div class="ek-auth-shell__brand-inner">
        <EkBrandLogo tone="inverse" :size="28" />
        <p class="ek-auth-shell__tagline">Tüm pazaryerleriniz, tek panelde.</p>

        <ul class="ek-auth-shell__trust">
          <li v-for="item in trustItems" :key="item">
            <v-icon size="16" aria-hidden="true">mdi-check-circle-outline</v-icon>
            <span>{{ item }}</span>
          </li>
        </ul>

        <svg class="ek-auth-shell__illustration" viewBox="0 0 220 140" focusable="false">
          <rect x="70" y="30" width="80" height="80" rx="14" class="ek-auth-shell__illu-hub" />
          <circle cx="110" cy="70" r="16" class="ek-auth-shell__illu-core" />
          <g class="ek-auth-shell__illu-node">
            <circle cx="20" cy="30" r="12" />
            <circle cx="20" cy="110" r="12" />
            <circle cx="200" cy="30" r="12" />
            <circle cx="200" cy="110" r="12" />
          </g>
          <g class="ek-auth-shell__illu-line">
            <line x1="32" y1="34" x2="72" y2="52" />
            <line x1="32" y1="106" x2="72" y2="88" />
            <line x1="188" y1="34" x2="148" y2="52" />
            <line x1="188" y1="106" x2="148" y2="88" />
          </g>
        </svg>
      </div>
    </aside>

    <div class="ek-auth-shell__form">
      <div class="ek-auth-shell__mobile-logo">
        <EkBrandLogo :size="24" />
      </div>

      <div class="ek-auth-shell__form-inner">
        <slot />
      </div>

      <ul class="ek-auth-shell__trust ek-auth-shell__trust--compact">
        <li v-for="item in trustItems" :key="item">{{ item }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import EkBrandLogo from '@/components/ds/EkBrandLogo.vue'

/** ADR-0015 Karar 4 — yalnızca kanıtlı iddialar (bkz. dosya başı yorumu). */
const trustItems = [
  'Pazaryeri API anahtarlarınız AES-256-GCM ile şifrelenir',
  'Her mağazanın verisi ayrı veritabanında tutulur',
  'Kart bilgileriniz sistemimizden geçmez',
]
</script>

<style scoped>
.ek-auth-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ek-color-background);
}

/* ---- Marka paneli ---- */
.ek-auth-shell__brand {
  display: none;
}

@media (min-width: 768px) {
  .ek-auth-shell__brand {
    display: flex;
    align-items: center;
    width: 100%;
    height: 160px;
    flex: none;
    background: var(--ek-app-login-gradient);
    color: var(--ek-color-background);
    padding: 0 var(--ek-space-8);
    overflow: hidden;
  }

  .ek-auth-shell__brand-inner {
    display: flex;
    align-items: center;
    gap: var(--ek-space-4);
  }

  .ek-auth-shell__tagline {
    margin: 0;
    font-size: var(--ek-font-size-lg);
    font-weight: var(--ek-font-weight-semibold);
  }

  .ek-auth-shell__trust,
  .ek-auth-shell__illustration {
    display: none;
  }
}

@media (min-width: 1024px) {
  .ek-auth-shell {
    flex-direction: row;
  }

  .ek-auth-shell__brand {
    height: auto;
    width: 41.6667%;
    align-items: stretch;
    padding: var(--ek-space-12);
  }

  .ek-auth-shell__brand-inner {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: var(--ek-space-6);
    width: 100%;
  }

  .ek-auth-shell__tagline {
    font-size: var(--ek-font-size-2xl);
    font-weight: var(--ek-font-weight-semibold);
    letter-spacing: -0.01em;
    max-width: 22ch;
  }

  .ek-auth-shell__trust {
    display: flex;
    flex-direction: column;
    gap: var(--ek-space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ek-auth-shell__trust li {
    display: flex;
    align-items: center;
    gap: var(--ek-space-2);
    font-size: var(--ek-font-size-sm);
    color: color-mix(in srgb, var(--ek-color-background) 92%, transparent);
  }

  .ek-auth-shell__illustration {
    display: block;
    width: 100%;
    max-width: 260px;
    margin-top: var(--ek-space-4);
  }

  .ek-auth-shell__illu-hub {
    fill: color-mix(in srgb, var(--ek-color-background) 12%, transparent);
  }

  .ek-auth-shell__illu-core {
    fill: var(--ek-color-secondary);
  }

  .ek-auth-shell__illu-node circle {
    fill: color-mix(in srgb, var(--ek-color-background) 22%, transparent);
  }

  .ek-auth-shell__illu-line line {
    stroke: color-mix(in srgb, var(--ek-color-background) 30%, transparent);
    stroke-width: 2;
  }
}

/* ---- Form alanı ---- */
.ek-auth-shell__form {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--ek-space-8) var(--ek-space-4);
}

.ek-auth-shell__form-inner {
  width: 100%;
  max-width: 400px;
}

.ek-auth-shell__mobile-logo {
  display: flex;
  justify-content: center;
  margin-bottom: var(--ek-space-6);
}

@media (min-width: 768px) {
  .ek-auth-shell__mobile-logo {
    display: none;
  }

  .ek-auth-shell__form {
    /* Aşama 3: form sütunu ÜSTE yaslı (ortalı değil) — giriş/kayıt/şifre sekmeleri ve sıfırlama/doğrulama
       sayfalarında başlık aynı yükseklikte durur; içerik boyu değişince zıplamaz. */
    justify-content: flex-start;
    padding: max(var(--ek-space-12), 14vh) var(--ek-space-6) var(--ek-space-10);
  }
}

.ek-auth-shell__trust--compact {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-1);
  margin: var(--ek-space-6) 0 0;
  padding: 0;
  list-style: none;
  text-align: center;
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

@media (min-width: 768px) {
  .ek-auth-shell__trust--compact {
    display: none;
  }
}
</style>
