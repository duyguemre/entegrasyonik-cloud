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
  fe-r3d (APP_IDENTITY §5/§8, K44/K45): metin sitenin fayda diliyle — teknik ayrıntı (algoritma, veritabanı yapısı) yok.
-->
<template>
  <div class="ek-auth-shell">
    <aside class="ek-auth-shell__brand">
      <!-- Doku: seyrek nokta ızgarası (dekor; degrade değil). -->
      <svg class="ek-auth-shell__pattern" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="ek-auth-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ek-auth-dots)" />
      </svg>

      <div class="ek-auth-shell__brand-inner">
        <EkBrandLogo tone="inverse" :size="28" />

        <div class="ek-auth-shell__pitch">
          <p class="ek-auth-shell__eyebrow ek-auth-shell__rise" style="--i: 0">
            <span class="ek-auth-shell__eyebrow-rule"></span>Çok kanallı e-ticaret yönetimi
          </p>
          <p class="ek-auth-shell__tagline ek-auth-shell__rise" style="--i: 1">
            Tüm pazaryerleriniz,<span class="ek-auth-shell__tagline-soft"> tek panelde.</span>
          </p>
          <p class="ek-auth-shell__lede ek-auth-shell__rise" style="--i: 2">
            Ürünlerinizi, stoklarınızı ve siparişlerinizi her kanal için ayrı ayrı değil, tek ekrandan yönetin.
          </p>

          <!-- Otopilot ayrı ürün değil: aynı panelin içindeki operasyon ajanları (fayda dili: site/src/data/agent-claims.ts 'core-short'). -->
          <p class="ek-auth-shell__autopilot ek-auth-shell__rise" style="--i: 3">
            <span class="ek-auth-shell__autopilot-icon"><v-icon size="16" aria-hidden="true">{{ CHAT_ICON }}</v-icon></span>
            <span>
              <strong>{{ CHAT_PRODUCT.name }} ile güçlendirildi.</strong>
              Operasyonunuzu sizin için izler, kararı size bırakır.
            </span>
          </p>

          <!-- Akış şeması: iki yönlü — kanallardan gelen veri merkeze/iş alanlarına, panelden ürün/stok/fiyat kanallara.
               Merkez: Entegrasyonik çekirdeği + çevresinde dolaşan Otopilot uydusu.
               Yalnızca backend'de gerçekten çalışan entegrasyonlar (INTEGRATIONS_REGISTRY.md, doğrulanmış). -->
          <div class="ek-auth-shell__flow ek-auth-shell__rise" style="--i: 4" aria-hidden="true">
            <svg class="ek-auth-shell__wires" viewBox="0 0 460 300" preserveAspectRatio="none" focusable="false">
              <g v-for="(d, n) in wirePaths" :key="d">
                <path class="ek-auth-shell__wire" :d="d" vector-effect="non-scaling-stroke" />
                <path
                  class="ek-auth-shell__pulse"
                  :d="d"
                  pathLength="100"
                  vector-effect="non-scaling-stroke"
                  :style="{ animationDelay: `${(n * 0.45) % 3.6}s` }"
                />
                <path
                  class="ek-auth-shell__pulse ek-auth-shell__pulse--back"
                  :d="d"
                  pathLength="100"
                  vector-effect="non-scaling-stroke"
                  :style="{ animationDelay: `${((n * 0.45) % 3.6) + 1.8}s` }"
                />
              </g>
            </svg>

            <div
              v-for="(m, n) in modules"
              :key="m.title"
              class="ek-auth-shell__module"
              :style="{ top: `${(MODULE_Y[n] / 300) * 100}%` }"
            >
              <span class="ek-auth-shell__module-icon"><v-icon size="16">{{ m.icon }}</v-icon></span>
              <span class="ek-auth-shell__module-text">
                <span class="ek-auth-shell__module-title">{{ m.title }}</span>
                <span class="ek-auth-shell__module-sub">{{ m.sub }}</span>
              </span>
            </div>

            <div class="ek-auth-shell__hub">
              <span class="ek-auth-shell__hub-aura"></span>
              <span class="ek-auth-shell__hub-orbit"></span>
              <!-- Otopilot "kuantum parçacığı": yörüngede tek bir yerde durmaz; bir noktada sönüp başka bir noktada
                   belirir. Silik hayaletler parçacığın bulunabileceği olası konumlardır (süperpozisyon). -->
              <span class="ek-auth-shell__quantum">
                <span v-for="a in QUANTUM_GHOSTS" :key="a" class="ek-auth-shell__ghost" :style="{ '--a': `${a}deg` }"></span>
                <span class="ek-auth-shell__particle-track">
                  <span class="ek-auth-shell__particle"><v-icon size="13">{{ CHAT_ICON }}</v-icon></span>
                </span>
              </span>
              <span class="ek-auth-shell__hub-core"><EkBrandLogo variant="mark" :size="34" /></span>
            </div>

            <div
              v-for="(c, n) in CATEGORIES"
              :key="c.label"
              class="ek-auth-shell__node"
              :style="{ top: `${(CATEGORY_Y[n] / 300) * 100}%` }"
            >
              <v-icon size="15" class="ek-auth-shell__node-icon">{{ c.icon }}</v-icon>
              <span class="ek-auth-shell__node-name">{{ c.label }}</span>
            </div>

            <!-- Güvenlik taraması: yalnızca şemanın üzerinden geçer; bittiğinde altta kalkan rozeti belirir. -->
            <span v-if="phase === 'scan'" :key="cycle" class="ek-auth-shell__scan"></span>
          </div>

          <!-- Güven maddeleri aynı yerde sırayla (görsel); ekran okuyucu için tam liste ayrıca. Rozet görünürken
               sağdaki oklar/noktalarla maddeler arasında gezinilir (maddeler kendiliğinden değişmez). -->
          <div
            class="ek-auth-shell__shield-slot ek-auth-shell__rise"
            style="--i: 5"
          >
            <!-- Rozet hep görünür; tarama aşağı indiğinde yalnızca kalkan çizgisi yeniden çizilir (drawKey),
                 madde metni yerinde yumuşakça değişir. -->
            <div class="ek-auth-shell__shield" aria-hidden="true">
              <span v-if="drawKey" :key="`glow-${drawKey}`" class="ek-auth-shell__shield-glow"></span>
              <span class="ek-auth-shell__shield-mark">
                <svg :key="drawKey" viewBox="0 0 40 46" focusable="false">
                  <path class="ek-auth-shell__shield-ripple" :d="SHIELD_PATH" />
                  <path class="ek-auth-shell__shield-ripple ek-auth-shell__shield-ripple--late" :d="SHIELD_PATH" />
                  <path class="ek-auth-shell__shield-flash" :d="SHIELD_PATH" />
                  <path class="ek-auth-shell__shield-shape" pathLength="100" :d="SHIELD_PATH" />
                </svg>
                <Transition name="ek-auth-swap" mode="out-in">
                  <v-icon :key="trustIndex" size="16">{{ trustItems[trustIndex].icon }}</v-icon>
                </Transition>
              </span>
              <span class="ek-auth-shell__shield-body">
                <span class="ek-auth-shell__shield-kicker">
                  Güvenlik<span class="ek-auth-shell__shield-count">{{ trustIndex + 1 }} / {{ trustItems.length }}</span>
                </span>
                <Transition name="ek-auth-swap" mode="out-in">
                  <span :key="trustIndex" class="ek-auth-shell__shield-text">{{ trustItems[trustIndex].text }}</span>
                </Transition>
              </span>
            </div>

            <div class="ek-auth-shell__shield-nav" role="group" aria-label="Güvenlik maddeleri">
              <button type="button" class="ek-auth-shell__shield-arrow" aria-label="Önceki madde" @click="pick(trustIndex - 1)">
                <v-icon size="16">mdi-chevron-left</v-icon>
              </button>
              <button
                v-for="(item, n) in trustItems"
                :key="item.text"
                type="button"
                class="ek-auth-shell__shield-dot"
                :class="{ 'is-active': n === trustIndex }"
                :aria-label="`Güvenlik maddesi ${n + 1}`"
                :aria-current="n === trustIndex"
                @click="pick(n)"
              ></button>
              <button type="button" class="ek-auth-shell__shield-arrow" aria-label="Sonraki madde" @click="pick(trustIndex + 1)">
                <v-icon size="16">mdi-chevron-right</v-icon>
              </button>
            </div>
          </div>
          <ul class="ek-auth-shell__sr">
            <li v-for="item in trustItems" :key="item.text">{{ item.text }}</li>
          </ul>
        </div>
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
        <li v-for="item in trustItems" :key="item.text">{{ item.text }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { EkBrandLogo } from '@entegrasyonik/ui/components'
import { CHAT_ICON, CHAT_PRODUCT } from '@entegrasyonik/chat/brand'

/** ADR-0015 Karar 4 — yalnızca kanıtlı iddialar (bkz. dosya başı yorumu). */
const trustItems = [
  { icon: 'mdi-key-chain-variant', text: 'Entegrasyon anahtarlarınız şifreli saklanır' },
  { icon: 'mdi-shield-lock-outline', text: 'Verileriniz yalnızca size ait, izole bir alanda korunur' },
  { icon: 'mdi-credit-card-lock-outline', text: 'Kart bilgileriniz sistemimizden geçmez' },
]

/** Entegrasyon türleri (kullanıcı kararı 2026-10-02: girişte marka adı değil kategori). Not: kargo ve e-fatura
 *  bugün yalnızca arayüz formu — backend entegrasyonu yok (CLAUDE.md "Actually implemented"). */
const CATEGORIES = [
  { icon: 'mdi-storefront-outline', label: 'Pazaryeri' },
  { icon: 'mdi-cart-outline', label: 'E-ticaret' },
  { icon: 'mdi-domain', label: 'ERP' },
  { icon: 'mdi-truck-fast-outline', label: 'Kargo' },
  { icon: 'mdi-file-document-check-outline', label: 'E-fatura' },
]

const modules = [
  { icon: 'mdi-package-variant-closed', title: 'Ürünler', sub: 'Tek katalog' },
  { icon: 'mdi-warehouse', title: 'Stok & fiyat', sub: 'Tüm kanallara' },
  { icon: 'mdi-receipt-text-outline', title: 'Siparişler', sub: 'Tek listede' },
]

/* Şema koordinatları (viewBox 460×300): modüller x 0–150, merkez (230,150) r≈34, entegrasyon türleri x 330–460. */
const MODULE_Y = [62, 150, 238]
const CATEGORY_Y = [30, 90, 150, 210, 270]
/* Kuantum parçacığının olası konumları (yörünge açısı, derece; 0 = üst). Animasyondaki sıçrama açılarıyla aynı. */
const QUANTUM_GHOSTS = [28, 142, 236, 318]
const HUB_L = 196
const HUB_R = 264
/* İleri ışık: kanaldan merkeze, merkezden iş alanlarına. Geri ışık (pulse--back) aynı hatta ters akar. */
const wirePaths = [
  ...CATEGORY_Y.map((y) => `M330 ${y} C292 ${y}, 300 150, ${HUB_R} 150`),
  ...MODULE_Y.map((y) => `M${HUB_L} 150 C172 150, 178 ${y}, 150 ${y}`),
]

/* Tarama döngüsü: tara (şema üzerinde) → kalkan mühürlenir → SCAN_EVERY_MS → yeniden tara.
   Güven maddeleri kendiliğinden değişmez. Hareket azaltma tercihinde tarama ve mühürleme yok. */
/* Akış yalnızca zamanlayıcıyla ilerler (animationend'e bağlı değil: sekme arka plandayken ya da HMR'de olay kaçabilir
   ve döngü takılırdı). SCAN_MS = .ek-auth-shell__scan animasyon süresi. */
const SHIELD_PATH = 'M20 2 L36 8.5 V22 C36 32.5 29 40.5 20 44 C11 40.5 4 32.5 4 22 V8.5 Z'
const SCAN_MS = 2800
/** Taramalar arası bekleme. Güven maddeleri kendiliğinden DEĞİŞMEZ (yalnız oklar/noktalar). */
const SCAN_EVERY_MS = 7000
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const phase = ref<'idle' | 'scan'>('idle')
const cycle = ref(0)
const drawKey = ref(0)
const trustIndex = ref(0)
let timer: ReturnType<typeof setTimeout> | undefined

function later(ms: number, fn: () => void) {
  clearTimeout(timer)
  timer = setTimeout(fn, ms)
}

function startScan() {
  cycle.value++
  phase.value = 'scan'
  // Çizgi son %8'de sönerken mühürleme başlasın: arada boşluk hissi olmasın.
  later(SCAN_MS * 0.92, onScanEnd)
}

/** Tarama alta ulaştı: kalkan "mühürlenir" (yeniden çizim + dalga + parlama), sonra bir sonraki tarama. */
function onScanEnd() {
  phase.value = 'idle'
  drawKey.value++
  later(SCAN_EVERY_MS, startScan)
}

function pick(n: number) {
  const total = trustItems.length
  trustIndex.value = (n + total) % total
}

onMounted(() => {
  if (!reduceMotion) later(1000, startScan)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.ek-auth-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ek-color-background);
}

/* ---- Marka paneli ---- (yazı/çizim mürekkebi `--ek-app-login-ink`: app.css, light/dark) */
.ek-auth-shell__brand {
  display: none;
}

@media (min-width: 768px) {
  .ek-auth-shell__brand {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    height: 160px;
    flex: none;
    background: var(--ek-app-login-surface);
    color: var(--ek-app-login-ink);
    padding: 0 var(--ek-space-8);
    overflow: hidden;
  }

  .ek-auth-shell__pattern {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    fill: color-mix(in srgb, var(--ek-app-login-ink) 8%, transparent);
    pointer-events: none;
  }

  .ek-auth-shell__brand-inner {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--ek-space-6);
  }

  .ek-auth-shell__pitch {
    display: contents;
  }

  .ek-auth-shell__tagline {
    margin: 0;
    font-size: var(--ek-font-size-lg);
    font-weight: var(--ek-font-weight-semibold);
  }

  .ek-auth-shell__eyebrow,
  .ek-auth-shell__autopilot,
  .ek-auth-shell__shield-slot,
  .ek-auth-shell__lede,
  .ek-auth-shell__flow,
  .ek-auth-shell__trust {
    display: none;
  }
}

@media (min-width: 1024px) {
  .ek-auth-shell {
    flex-direction: row;
  }

  .ek-auth-shell__brand {
    height: auto;
    min-height: 100vh;
    width: 41.6667%;
    align-items: stretch;
    padding: var(--ek-space-10) clamp(var(--ek-space-8), 4.5vw, var(--ek-space-16));
  }

  .ek-auth-shell__pattern {
    fill: color-mix(in srgb, var(--ek-app-login-ink) 5%, transparent);
  }

  /* Üç bant: üstte logo, ortada vaat + akış şeması, altta güven şeridi. */
  .ek-auth-shell__brand-inner {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: var(--ek-space-10);
    width: 100%;
    max-width: 520px;
  }

  /* Logo üstte; vaat + şema + kalkan kalan alanda dikey ortalı. */
  .ek-auth-shell__pitch {
    display: flex;
    flex-direction: column;
    gap: var(--ek-space-4);
    margin-block: auto;
  }

  .ek-auth-shell__eyebrow {
    display: flex;
    align-items: center;
    gap: var(--ek-space-3);
    margin: 0;
    font-size: var(--ek-font-size-xs);
    font-weight: var(--ek-font-weight-semibold);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--ek-app-login-ink) 66%, transparent);
  }

  .ek-auth-shell__eyebrow-rule {
    width: 28px;
    height: 1px;
    background: currentColor;
  }

  .ek-auth-shell__tagline {
    font-size: clamp(2rem, 2.9vw, 2.875rem);
    font-weight: var(--ek-font-weight-semibold);
    line-height: 1.08;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }

  /* İkinci satır: aynı mürekkep, kısık ton — editoryal iki ses. */
  .ek-auth-shell__tagline-soft {
    display: block;
    color: color-mix(in srgb, var(--ek-app-login-ink) 52%, transparent);
  }

  .ek-auth-shell__lede {
    display: block;
    margin: 0;
    max-width: 42ch;
    font-size: var(--ek-font-size-md, 1rem);
    line-height: 1.65;
    color: color-mix(in srgb, var(--ek-app-login-ink) 74%, transparent);
  }

  /* ---- Akış şeması ---- (tüm konumlar viewBox 460×300'e oranlı) */
  .ek-auth-shell__flow {
    position: relative;
    display: block;
    container-type: inline-size;
    width: 100%;
    aspect-ratio: 460 / 300;
    margin-top: var(--ek-space-3);
  }

  .ek-auth-shell__wires {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    fill: none;
  }

  .ek-auth-shell__wire {
    stroke: color-mix(in srgb, var(--ek-app-login-ink) 20%, transparent);
    stroke-width: 1;
  }

  /* Hat boyunca ilerleyen ışık: kısa çizgi parçası, dashoffset ile kayar. */
  .ek-auth-shell__pulse {
    stroke: color-mix(in srgb, var(--ek-app-login-ink) 92%, transparent);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-dasharray: 12 88;
    stroke-dashoffset: 12;
    opacity: 0;
    animation: ek-auth-pulse var(--ek-app-login-pulse) var(--ek-app-login-ease-flow) infinite;
  }

  @keyframes ek-auth-pulse {
    0% { stroke-dashoffset: 12; opacity: 0; }
    12% { opacity: 1; }
    55% { stroke-dashoffset: -88; opacity: 1; }
    62%, 100% { stroke-dashoffset: -88; opacity: 0; }
  }

  .ek-auth-shell__module,
  .ek-auth-shell__node {
    position: absolute;
    display: flex;
    align-items: center;
    transform: translateY(-50%);
    border: 1px solid color-mix(in srgb, var(--ek-app-login-ink) 16%, transparent);
    background: color-mix(in srgb, var(--ek-app-login-ink) 7%, var(--ek-app-login-surface));
    color: var(--ek-app-login-ink);
    white-space: nowrap;
  }

  .ek-auth-shell__module {
    left: 0;
    width: 32.6%;
    gap: clamp(6px, 2cqw, 10px);
    padding: clamp(6px, 1.8cqw, 9px) clamp(6px, 2cqw, 10px);
    border-radius: var(--ek-radius-lg);
  }

  .ek-auth-shell__module-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: clamp(24px, 6.4cqw, 30px);
    aspect-ratio: 1;
    border-radius: var(--ek-radius-md);
    background: color-mix(in srgb, var(--ek-app-login-ink) 12%, transparent);
  }

  .ek-auth-shell__module-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.25;
  }

  .ek-auth-shell__module-title {
    font-size: clamp(11px, 2.7cqw, 13px);
    font-weight: var(--ek-font-weight-semibold);
  }

  .ek-auth-shell__module-sub {
    font-size: clamp(10px, 2.2cqw, 11px);
    color: color-mix(in srgb, var(--ek-app-login-ink) 60%, transparent);
  }

  .ek-auth-shell__node {
    left: 71.74%;
    width: 28.26%;
    gap: 8px;
    height: 13%;
    padding: 0 clamp(8px, 2.2cqw, 12px);
    border-radius: var(--ek-radius-chip, 999px);
  }

  .ek-auth-shell__node-icon {
    flex: none;
    color: color-mix(in srgb, var(--ek-app-login-ink) 75%, transparent);
  }

  .ek-auth-shell__node-name {
    font-size: clamp(11px, 2.7cqw, 13px);
    font-weight: var(--ek-font-weight-medium);
  }

  /* Merkez: marka işareti, etrafında yavaş dönen kesikli yörünge. */
  .ek-auth-shell__hub {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 14.8%;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
  }

  .ek-auth-shell__hub-core {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--ek-app-login-ink);
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--ek-app-login-ink) 10%, transparent);
  }

  .ek-auth-shell__hub-orbit {
    position: absolute;
    inset: -28%;
    border-radius: 50%;
    border: 1px dashed color-mix(in srgb, var(--ek-app-login-ink) 28%, transparent);
    animation: ek-auth-orbit var(--ek-app-login-orbit) var(--ek-easing-linear) infinite;
  }

  @keyframes ek-auth-orbit {
    to { transform: rotate(360deg); }
  }

  @container (max-width: 400px) {
    .ek-auth-shell__module-sub {
      display: none;
    }
  }

  /* Geri yönlü ışık: aynı hat üzerinde ters akar (panelden kanallara). Biraz daha kısık, ayırt edilsin. */
  .ek-auth-shell__pulse--back {
    stroke: var(--ek-auth-autopilot);
    animation-name: ek-auth-pulse-back;
  }

  @keyframes ek-auth-pulse-back {
    0% { stroke-dashoffset: -88; opacity: 0; }
    12% { opacity: 1; }
    55% { stroke-dashoffset: 12; opacity: 1; }
    62%, 100% { stroke-dashoffset: 12; opacity: 0; }
  }

  /* ---- Otopilot: ana vaadin altında tek satır + merkezde "güçlendirilmiş çekirdek" ---- */
  .ek-auth-shell__brand {
    --ek-auth-autopilot: color-mix(in srgb, var(--ek-color-secondary) 85%, var(--ek-app-login-ink));
  }

  .ek-auth-shell__autopilot {
    display: flex;
    align-items: center;
    gap: var(--ek-space-3);
    max-width: 46ch;
    margin: var(--ek-space-1) 0 0;
    font-size: var(--ek-font-size-sm);
    line-height: 1.5;
    color: color-mix(in srgb, var(--ek-app-login-ink) 72%, transparent);
  }

  .ek-auth-shell__autopilot strong {
    font-weight: var(--ek-font-weight-semibold);
    color: var(--ek-app-login-ink);
  }

  .ek-auth-shell__autopilot-icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--ek-radius-md);
    background: var(--ek-auth-autopilot);
    color: var(--ek-app-login-surface);
  }

  /* Çekirdeğin çevresinde nefes alan halka: Otopilot'un sürekli izlediğini anlatır. */
  .ek-auth-shell__hub-aura {
    position: absolute;
    inset: -14%;
    border-radius: 50%;
    border: 1.5px solid var(--ek-auth-autopilot);
    opacity: 0;
    animation: ek-auth-aura var(--ek-app-login-aura) var(--ek-app-login-ease-out) infinite;
  }

  @keyframes ek-auth-aura {
    0% { transform: scale(0.92); opacity: 0.7; }
    100% { transform: scale(1.45); opacity: 0; }
  }

  /* ---- Otopilot kuantum parçacığı ----
     Parçacık yörüngede dönmez, SIÇRAR: dört olası konumdan birinde belirir (ışık patlaması), titreşir, söner;
     sönükken iz (track) bir sonraki konuma geçer. Hayaletler olası konumlarda silik titrer. Süre: 4 × 4 s — her konumda ~2,5 s görünür, ardından ~1,5 s boşluk (fasılalı). */
  .ek-auth-shell__quantum {
    position: absolute;
    inset: -28%;
    pointer-events: none;
  }

  .ek-auth-shell__ghost,
  .ek-auth-shell__particle-track {
    position: absolute;
    inset: 0;
  }

  .ek-auth-shell__ghost {
    transform: rotate(var(--a));
  }

  .ek-auth-shell__ghost::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background: var(--ek-auth-autopilot);
    opacity: 0;
    animation: ek-auth-ghost var(--ek-app-login-ghost) var(--ek-app-login-ease-flow) infinite;
    animation-delay: inherit;
  }

  .ek-auth-shell__ghost:nth-child(2) { animation-delay: calc(var(--ek-app-login-ghost) * 0.25); }
  .ek-auth-shell__ghost:nth-child(3) { animation-delay: calc(var(--ek-app-login-ghost) * 0.55); }
  .ek-auth-shell__ghost:nth-child(4) { animation-delay: calc(var(--ek-app-login-ghost) * 0.8); }

  @keyframes ek-auth-ghost {
    0%, 100% { opacity: 0; }
    40% { opacity: 0.4; }
    48% { opacity: 0.1; }
    56% { opacity: 0.35; }
  }

  .ek-auth-shell__particle-track {
    animation: ek-auth-quantum-jump var(--ek-app-login-quantum) var(--ek-easing-linear) infinite;
  }

  @keyframes ek-auth-quantum-jump {
    0%, 23% { transform: rotate(28deg); }
    25%, 48% { transform: rotate(142deg); }
    50%, 73% { transform: rotate(236deg); }
    75%, 98% { transform: rotate(318deg); }
    100% { transform: rotate(388deg); }
  }

  .ek-auth-shell__particle {
    position: absolute;
    top: 0;
    left: 50%;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    translate: -50% -50%;
    background: var(--ek-auth-autopilot);
    color: var(--ek-app-login-surface);
    box-shadow:
      0 0 0 3px var(--ek-app-login-surface),
      0 0 14px 4px color-mix(in srgb, var(--ek-auth-autopilot) 65%, transparent);
    opacity: 0;
    animation:
      ek-auth-quantum-blink var(--ek-app-login-quantum) var(--ek-easing-linear) infinite,
      ek-auth-quantum-upright var(--ek-app-login-quantum) var(--ek-easing-linear) infinite;
  }

  /* Simge dik kalsın: izin dönüşünü tersine çevirir (aynı sıçrama anları). */
  @keyframes ek-auth-quantum-upright {
    0%, 23% { rotate: -28deg; }
    25%, 48% { rotate: -142deg; }
    50%, 73% { rotate: -236deg; }
    75%, 98% { rotate: -318deg; }
    100% { rotate: -388deg; }
  }

  /* Belirme anındaki ışık halkası. */
  .ek-auth-shell__particle::after {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    border: 1px solid var(--ek-auth-autopilot);
    opacity: 0;
    animation: ek-auth-quantum-burst var(--ek-app-login-quantum) var(--ek-app-login-ease-out) infinite;
  }

  @keyframes ek-auth-quantum-blink {
    0%, 25%, 50%, 75% { opacity: 0; scale: 0.2; filter: blur(3px); }
    4%, 29%, 54%, 79% { opacity: 1; scale: 1.3; filter: blur(0); }
    7%, 32%, 57%, 82% { opacity: 1; scale: 1; filter: blur(0); }
    15%, 40%, 65%, 90% { opacity: 1; scale: 1; filter: blur(0); }
    19%, 44%, 69%, 94%, 100% { opacity: 0; scale: 0.4; filter: blur(3px); }
  }

  @keyframes ek-auth-quantum-burst {
    0%, 2.9%, 25%, 27.9%, 50%, 52.9%, 75%, 77.9% { opacity: 0; scale: 0.5; }
    3%, 28%, 53%, 78% { opacity: 0.9; scale: 0.5; }
    14%, 39%, 64%, 89%, 100% { opacity: 0; scale: 2.8; }
  }

  .ek-auth-shell__hub-core {
    box-shadow:
      0 0 0 4px var(--ek-app-login-surface),
      0 0 0 5.5px var(--ek-auth-autopilot);
  }

  /* ---- Güvenlik taraması + kalkan rozeti ----
     Döngü (betikte): tarama çizgisi YALNIZCA şemanın üzerinden yukarıdan aşağı geçer → bittiği yerde, şemanın hemen
     altındaki kalkan "mühürlenir" (bkz. aşağıdaki mühürleme bloğu) → 7 sn → yeniden tarama. Rozet ve metin hep
     görünür; maddeler kendiliğinden değişmez, yalnız oklar/noktalarla. Yuva sabit yükseklikte: madde değişirken üstteki içerik kaymaz. */
  .ek-auth-shell__scan {
    position: absolute;
    left: -3%;
    right: -3%;
    top: 0;
    z-index: 2;
    height: 1px;
    background: var(--ek-auth-autopilot);
    box-shadow:
      0 0 2px var(--ek-auth-autopilot),
      0 0 16px 3px color-mix(in srgb, var(--ek-auth-autopilot) 55%, transparent);
    pointer-events: none;
    animation: ek-auth-scan var(--ek-app-login-scan) var(--ek-app-login-ease-flow) both;
  }

  /* Uçlardaki küçük köşe işaretleri: tarayıcı başlığı hissi. */
  .ek-auth-shell__scan::before,
  .ek-auth-shell__scan::after {
    content: '';
    position: absolute;
    top: -3px;
    width: 1px;
    height: 7px;
    background: var(--ek-auth-autopilot);
  }

  .ek-auth-shell__scan::before { left: 0; }
  .ek-auth-shell__scan::after { right: 0; }

  @keyframes ek-auth-scan {
    0% { top: 0; opacity: 0; }
    8% { opacity: 1; }
    92% { opacity: 1; }
    100% { top: 100%; opacity: 0; }
  }

  .ek-auth-shell__shield-slot {
    display: block;
    position: relative;
    height: 84px;
    margin-top: var(--ek-space-2);
  }

  .ek-auth-shell__shield {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    margin-inline: auto;
    display: flex;
    align-items: center;
    gap: var(--ek-space-4);
    width: min(100%, 448px);
    padding: var(--ek-space-3) var(--ek-space-5) var(--ek-space-3) var(--ek-space-3);
    border: 1px solid color-mix(in srgb, var(--ek-auth-autopilot) 38%, transparent);
    border-radius: var(--ek-radius-xl);
    background: color-mix(in srgb, var(--ek-app-login-ink) 6%, var(--ek-app-login-surface));
  }

  /* Kalkan: çizgi kendini çizer, sonra hafif dolgu; içinde maddenin simgesi. */
  .ek-auth-shell__shield {
    padding-right: 118px;
  }

  /* Gezinme: rozetin sağında, rozetten bağımsız (madde değişirken yerinde durur). */
  .ek-auth-shell__shield-nav {
    position: absolute;
    top: 50%;
    right: calc((100% - min(100%, 448px)) / 2 + var(--ek-space-3));
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 2px;
    transform: translateY(-50%);
  }

  .ek-auth-shell__shield-arrow,
  .ek-auth-shell__shield-dot {
    border: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
  }

  .ek-auth-shell__shield-arrow {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: color-mix(in srgb, var(--ek-app-login-ink) 60%, transparent);
    transition: color var(--ek-motion-feedback), background-color var(--ek-motion-feedback);
  }

  .ek-auth-shell__shield-arrow:hover {
    color: var(--ek-app-login-ink);
    background: color-mix(in srgb, var(--ek-app-login-ink) 10%, transparent);
  }

  /* Nokta: 24px tıklama alanı, içte küçük işaret; etkin olan uzar. */
  .ek-auth-shell__shield-dot {
    display: grid;
    place-items: center;
    width: 14px;
    height: 24px;
  }

  .ek-auth-shell__shield-dot::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--ek-app-login-ink) 30%, transparent);
    transition: width var(--ek-motion-reveal), background-color var(--ek-motion-reveal);
  }

  .ek-auth-shell__shield-dot.is-active {
    width: 22px;
  }

  .ek-auth-shell__shield-dot.is-active::before {
    width: 16px;
    background: var(--ek-auth-autopilot);
  }

  .ek-auth-shell__shield-arrow:focus-visible,
  .ek-auth-shell__shield-dot:focus-visible {
    outline: 2px solid var(--ek-auth-autopilot);
    outline-offset: 1px;
    border-radius: var(--ek-radius-sm, 4px);
  }

  /* ---- Kalkan mühürleme (tarama alta ulaşınca) ----
     1) çizgi yeniden çizilir  2) içi kısa bir an ışır  3) kalkan biçiminde iki dalga dışa yayılır
     4) rozet kenarı Otopilot tonunda ışıyıp söner. Hepsi ~1,2 sn, tek sefer. */
  .ek-auth-shell__shield-ripple,
  .ek-auth-shell__shield-flash {
    transform-box: fill-box;
    transform-origin: center;
  }

  .ek-auth-shell__shield-ripple {
    fill: none;
    stroke: var(--ek-auth-autopilot);
    stroke-width: 1;
    opacity: 0;
    animation: ek-auth-shield-ripple var(--ek-app-login-seal) var(--ek-app-login-ease-out) both;
  }

  .ek-auth-shell__shield-ripple--late {
    animation-delay: var(--ek-app-login-seal-delay);
  }

  @keyframes ek-auth-shield-ripple {
    0% { opacity: 0.85; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.75); }
  }

  .ek-auth-shell__shield-flash {
    fill: var(--ek-auth-autopilot);
    opacity: 0;
    animation: ek-auth-shield-flash calc(var(--ek-app-login-seal) * 0.8) var(--ek-app-login-ease-out) both;
  }

  @keyframes ek-auth-shield-flash {
    0% { opacity: 0; transform: scale(0.7); }
    25% { opacity: 0.55; transform: scale(1); }
    100% { opacity: 0; transform: scale(1); }
  }

  .ek-auth-shell__shield-glow {
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    pointer-events: none;
    animation: ek-auth-shield-glow calc(var(--ek-app-login-seal) * 1.3) var(--ek-app-login-ease-out) both;
  }

  @keyframes ek-auth-shield-glow {
    0% { box-shadow: 0 0 0 0 transparent; border: 1px solid transparent; }
    25% {
      box-shadow: 0 0 22px 2px color-mix(in srgb, var(--ek-auth-autopilot) 30%, transparent);
      border: 1px solid var(--ek-auth-autopilot);
    }
    100% { box-shadow: 0 0 0 0 transparent; border: 1px solid transparent; }
  }

  .ek-auth-shell__shield-mark {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 46px;
    color: var(--ek-auth-autopilot);
  }

  .ek-auth-shell__shield-mark svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .ek-auth-shell__shield-shape {
    fill: color-mix(in srgb, var(--ek-auth-autopilot) 14%, transparent);
    fill-opacity: 0;
    stroke: var(--ek-auth-autopilot);
    stroke-width: 1.4;
    stroke-linejoin: round;
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
    animation: ek-auth-shield-draw calc(var(--ek-app-login-seal) * 0.7) var(--ek-app-login-ease-flow) forwards;
  }

  @keyframes ek-auth-shield-draw {
    70% { fill-opacity: 0; }
    100% { stroke-dashoffset: 0; fill-opacity: 1; }
  }

  .ek-auth-shell__shield-mark .v-icon {
    position: relative;
    margin-top: -2px;
    color: var(--ek-app-login-ink);
  }

  .ek-auth-shell__shield-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .ek-auth-shell__shield-kicker {
    display: flex;
    align-items: center;
    gap: var(--ek-space-2);
    font-size: 10.5px;
    font-weight: var(--ek-font-weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ek-auth-autopilot);
  }

  .ek-auth-shell__shield-count {
    letter-spacing: 0.04em;
    color: color-mix(in srgb, var(--ek-app-login-ink) 45%, transparent);
  }

  .ek-auth-shell__shield-text {
    font-size: var(--ek-font-size-sm);
    font-weight: var(--ek-font-weight-medium);
    line-height: 1.4;
    color: var(--ek-app-login-ink);
  }

  /* Madde değişimi: metin ve simge yerinde, kısa bulanık geçişle. */
  .ek-auth-swap-enter-active,
  .ek-auth-swap-leave-active {
    transition: opacity var(--ek-motion-reveal), filter var(--ek-motion-reveal), transform var(--ek-motion-reveal);
  }

  .ek-auth-swap-enter-from {
    opacity: 0;
    filter: blur(3px);
    transform: translateY(3px);
  }

  .ek-auth-swap-leave-to {
    opacity: 0;
    filter: blur(3px);
    transform: translateY(-3px);
  }

  /* Giriş: içerik sırayla, kısa mesafeden yükselir. */
  .ek-auth-shell__rise {
    animation: ek-auth-rise var(--ek-app-login-rise) var(--ek-app-login-ease-out) both;
    animation-delay: calc((var(--i, 0) + 1) * var(--ek-app-login-step));
  }

  @keyframes ek-auth-rise {
    from { opacity: 0; transform: translateY(var(--ek-motion-distance-md, 8px)); }
    to { opacity: 1; transform: none; }
  }
}

/* Alçak ekranlar (ör. 1366×768): dikey boşluklar sıkışır, şema yüksekliğe göre ölçeklenir — kalkan ekranda kalır. */
@media (min-width: 1024px) and (max-height: 880px) {
  .ek-auth-shell__brand {
    padding-top: var(--ek-space-6);
    padding-bottom: var(--ek-space-6);
  }

  .ek-auth-shell__brand-inner {
    gap: var(--ek-space-4);
  }

  .ek-auth-shell__pitch {
    gap: var(--ek-space-3);
  }

  .ek-auth-shell__tagline {
    font-size: clamp(1.75rem, 2.5vw, 2.5rem);
  }

  .ek-auth-shell__flow {
    max-width: calc(44vh * 460 / 300);
    margin-top: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ek-auth-shell__rise,
  .ek-auth-shell__hub-orbit,
  .ek-auth-shell__hub-aura,
  .ek-auth-shell__particle-track,
  .ek-auth-shell__particle,
  .ek-auth-shell__particle::after,
  .ek-auth-shell__ghost::before,
  .ek-auth-shell__shield-shape {
    animation: none;
    stroke-dashoffset: 0;
    fill-opacity: 1;
  }

  .ek-auth-shell__shield-ripple,
  .ek-auth-shell__shield-flash,
  .ek-auth-shell__shield-glow {
    display: none;
  }

  .ek-auth-shell__pulse,
  .ek-auth-shell__scan {
    display: none;
  }

  .ek-auth-shell__particle {
    opacity: 1;
  }
}

/* Ekran okuyucu için görünmez tam liste (marka panelinde güven maddeleri görsel olarak döner). */
.ek-auth-shell__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ---- Form alanı ---- */
.ek-auth-shell__form {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--ek-space-8) var(--ek-space-4);
}

.ek-auth-shell__form-inner {
  width: 100%;
  max-width: 460px;
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

/* GL-FE2: kısa dizüstü ekranlarda (≤ 900px yükseklik) üst boşluk küçülür — giriş formu kaydırmasız sığar. */
@media (min-width: 768px) and (max-height: 900px) {
  .ek-auth-shell__form {
    padding-top: max(var(--ek-space-10), 7vh);
    padding-bottom: var(--ek-space-6);
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
