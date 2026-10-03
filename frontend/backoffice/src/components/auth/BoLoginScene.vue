<!--
  backoffice/src/components/auth/BoLoginScene.vue

  BO-LOGIN — yönetim girişinin sol panelindeki canlı sahne: "yönetim ne yapar?" sorusunu anlatır. Ortada beyaz kenarlı
  KALKAN (yönetim/güvenlik; "Yönetim" rozetindeki kalkanla aynı dil, içinde Entegrasyonik işareti). Çevresinde yönetimin
  izlediği şeyler sırayla canlanır (tek döngü, 12 sn, tek hız):
    %25  solda mağaza kartı "Askıda → Aktif" olur, sinyal kalkana akar, kalkan halka atar, denetim kaydına satır düşer;
    %50  sağda ERP sağlık noktası sarıya döner ("Sapma"), sinyal kalkana akar, halka, kayıt satırı;
    %80  kalkan onay işareti verir, son kayıt satırı ("Bakım modu kapatıldı") düşer.
  Renk: yalnız lacivert + beyaz (turuncu/kırmızı/kanal rengi yok); uyarı biçimle (kesikli çerçeve, ünlem).
  Tasarım dili: düz yüzey + 1px çerçeve; gölge/ışıma YOK (halka = 1px çerçeve ölçek+opaklık). Yalnız transform/opacity.
  `prefers-reduced-motion`: hareket yok, anlamlı son kare (mağaza aktif, sapma işaretli, son üç kayıt). Tamamen dekoratif
  (`aria-hidden`); erişilebilir anlam panelin başlık/açıklamasında.
-->
<template>
  <div class="bls" aria-hidden="true">
    <div class="bls__row">
      <!-- Mağazalar -->
      <div class="bls__col">
        <p class="bls__label">Mağazalar</p>
        <div class="bls__card">
          <span class="bls__name">Mağaza 1</span>
          <span class="bls__pill bls__pill--ok">Aktif</span>
        </div>
        <div class="bls__card bls__card--change">
          <span class="bls__name">Mağaza 2</span>
          <span class="bls__swap">
            <span class="bls__pill bls__pill--warn bls__swap-a">Askıda</span>
            <span class="bls__pill bls__pill--ok bls__swap-b">Aktif</span>
          </span>
        </div>
      </div>

      <span class="bls__wire"><span class="bls__signal bls__signal--ltr"><span class="bls__dot"></span></span></span>

      <!-- Kalkan -->
      <div class="bls__shield">
        <span class="bls__ring bls__ring--a"></span>
        <span class="bls__ring bls__ring--b"></span>
        <svg class="bls__shield-shape" viewBox="0 0 64 72" focusable="false">
          <path d="M32 3 59 13v21c0 17-11.5 29.5-27 35C16.5 63.5 5 51 5 34V13Z" />
        </svg>
        <!-- Yönetim logosu: backoffice uygulama simgesiyle (public/icons/icon.svg) aynı — E işareti + kalkan rozeti;
             rozet panel kuralı gereği amber değil beyaz. -->
        <span class="bls__shield-mark">
          <svg class="bls__admin-logo" viewBox="0 0 512 512" focusable="false">
            <rect class="bls__admin-tile" width="512" height="512" rx="112" />
            <g transform="translate(19 32) scale(14)">
              <circle class="bls__admin-halo" cx="18.5" cy="16" r="5" />
              <path class="bls__admin-e" d="M20 9.5H13C10.8 9.5 9.5 10.8 9.5 13V19C9.5 21.2 10.8 22.5 13 22.5H20M9.5 16H15.5" />
              <circle class="bls__admin-hub" cx="18.5" cy="16" r="3" />
              <circle class="bls__admin-node" cx="22" cy="9.5" r="2.25" />
              <circle class="bls__admin-node" cx="22" cy="22.5" r="2.25" />
            </g>
            <g transform="translate(352 344)">
              <path class="bls__admin-badge" d="M56 6 98 22v34c0 28-18 46-42 56C32 102 14 84 14 56V22Z" />
              <path class="bls__admin-badge-check" d="m38 58 13 13 25-27" />
            </g>
          </svg>
        </span>
        <span class="bls__check"><v-icon icon="mdi-check" /></span>
      </div>

      <span class="bls__wire"><span class="bls__signal bls__signal--rtl"><span class="bls__dot bls__dot--warn"></span></span></span>

      <!-- Entegrasyon sağlığı -->
      <div class="bls__col">
        <p class="bls__label">Entegrasyon sağlığı</p>
        <div class="bls__health">
          <span class="bls__pulse"></span><span class="bls__name">Pazaryeri</span><span class="bls__state">Sağlıklı</span>
        </div>
        <div class="bls__health">
          <span class="bls__pulse bls__pulse--late"></span><span class="bls__name">E-ticaret</span><span class="bls__state">Sağlıklı</span>
        </div>
        <div class="bls__health bls__health--drift">
          <span class="bls__pulse bls__pulse--drift"></span><span class="bls__name">ERP</span>
          <span class="bls__swap">
            <span class="bls__state bls__swap-a">Sağlıklı</span>
            <span class="bls__state bls__state--warn bls__swap-b"><v-icon icon="mdi-alert-outline" />Sapma</span>
          </span>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">

</script>

<style scoped>
.bls {
  --bls-cycle: 12s;
  --bls-row: 30px;
  /* Panel yalnız lacivert + beyaz (kullanıcı kararı: turuncu/kırmızı/marka rengi yok). Uyarı renkle değil BİÇİMLE
     anlatılır: kesikli çerçeve + ünlem simgesi + etiket metni. */
  --bls-ink: var(--ek-color-chrome-text);
  --bls-ink-60: color-mix(in srgb, var(--ek-color-chrome-text) 60%, transparent);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  color: var(--ek-color-chrome-text);
  font-size: var(--ek-type-caption-size);
}

.bls__row {
  display: grid;
  /* Sağ sütun (kanal adı + durum) biraz daha geniş: 1366'da kanal adları kesilmeden sığar. */
  grid-template-columns: minmax(0, 0.9fr) 28px auto 28px minmax(0, 1.1fr);
  align-items: center;
}

.bls__col {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.bls__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 2px;
  color: var(--ek-color-chrome-text-muted);
  font-size: 10.5px;
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.bls__label :deep(.v-icon) {
  font-size: 14px;
}

.bls__card,
.bls__health {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
  height: 34px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-chrome-raised);
}

.bls__mono {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-md);
  font-size: 11px;
  font-weight: var(--ek-font-weight-bold);
}

.bls__name {
  overflow: hidden;
  flex: 1;
  min-width: 0;
  font-weight: var(--ek-font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bls__pill,
.bls__state {
  flex: none;
  padding: 1px 5px;
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-chrome-text-muted);
  font-size: 11px;
  font-weight: var(--ek-font-weight-semibold);
}

.bls__pill--ok {
  border-color: var(--bls-ink-60);
  color: var(--bls-ink);
}

/* Uyarı: kesikli beyaz çerçeve (+ "Sapma"da ünlem simgesi). */
.bls__pill--warn,
.bls__state--warn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border-style: dashed;
  border-color: var(--bls-ink);
  color: var(--bls-ink);
}

.bls__state--warn :deep(.v-icon) {
  font-size: 12px;
}

/* Durum değişimi: iki etiket üst üste; A söner, B belirir. */
.bls__swap {
  display: grid;
  flex: none;
}

.bls__swap > * {
  grid-area: 1 / 1;
  justify-self: end;
}

.bls__card--change .bls__swap-a { animation: bls-out-25 var(--bls-cycle) linear infinite; }
.bls__card--change .bls__swap-b { animation: bls-in-25 var(--bls-cycle) linear infinite; }
.bls__health--drift .bls__swap-a { animation: bls-out-50 var(--bls-cycle) linear infinite; }
.bls__health--drift .bls__swap-b { animation: bls-in-50 var(--bls-cycle) linear infinite; }
.bls__health--drift { animation: bls-drift-row var(--bls-cycle) linear infinite; }

@keyframes bls-out-25 { 0%, 22% { opacity: 1; } 25%, 100% { opacity: 0; } }
@keyframes bls-in-25 { 0%, 22% { opacity: 0; } 25%, 100% { opacity: 1; } }
@keyframes bls-out-50 { 0%, 46% { opacity: 1; } 49%, 100% { opacity: 0; } }
@keyframes bls-in-50 { 0%, 46% { opacity: 0; } 49%, 100% { opacity: 1; } }
@keyframes bls-drift-row {
  0%, 46% { border-color: var(--ek-color-chrome-border); border-style: solid; }
  49%, 100% { border-color: var(--bls-ink-60); border-style: dashed; }
}

/* Sağlık noktaları: sakin nabız (ölçek + opaklık). */
.bls__pulse {
  flex: none;
  width: 8px;
  height: 8px;
  border: 1px solid var(--bls-ink-60);
  border-radius: 2px;
  background: var(--bls-ink-60);
  animation: bls-pulse 3s ease-in-out infinite;
}

.bls__pulse--late { animation-delay: -1.5s; }

.bls__pulse--drift {
  animation: bls-pulse 3s ease-in-out infinite, bls-to-hollow var(--bls-cycle) linear infinite;
}

@keyframes bls-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(0.8); } }
/* Sapma: dolu kare → içi boş kare (renk değişmez). */
@keyframes bls-to-hollow {
  0%, 46% { background: var(--bls-ink-60); }
  49%, 100% { background: transparent; }
}

/* Teller ve akan sinyal. Sarmalayıcı telin genişliğinde → translateX(%100) uca götürür. */
.bls__wire {
  position: relative;
  height: 1px;
  background: var(--ek-color-chrome-border);
}

.bls__signal {
  position: absolute;
  inset: -3px 0 auto;
  height: 7px;
  opacity: 0;
}

.bls__dot {
  position: absolute;
  top: 0;
  left: -3px;
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--ek-color-chrome-text);
}

.bls__dot--warn { border: 1px solid var(--bls-ink); background: transparent; }

.bls__signal--ltr { animation: bls-ltr var(--bls-cycle) linear infinite; }
.bls__signal--rtl { animation: bls-rtl var(--bls-cycle) linear infinite; }

@keyframes bls-ltr {
  0%, 25% { opacity: 0; transform: translateX(0); }
  26% { opacity: 1; transform: translateX(0); }
  31% { opacity: 1; transform: translateX(100%); }
  32%, 100% { opacity: 0; transform: translateX(100%); }
}

@keyframes bls-rtl {
  0%, 50% { opacity: 0; transform: translateX(100%); }
  51% { opacity: 1; transform: translateX(100%); }
  56% { opacity: 1; transform: translateX(0); }
  57%, 100% { opacity: 0; transform: translateX(0); }
}

/* Kalkan */
.bls__shield {
  position: relative;
  display: grid;
  place-items: center;
  width: 70px;
  height: 79px;
}

.bls__shield-shape {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.bls__shield-shape path {
  fill: var(--ek-color-chrome-raised);
  stroke: var(--bls-ink);
  stroke-width: 1.5;
  stroke-linejoin: round;
}

.bls__shield-mark {
  position: relative;
  display: grid;
  place-items: center;
  margin-top: -4px;
}

.bls__admin-logo {
  width: 30px;
  height: 30px;
  overflow: visible;
}
.bls__admin-tile { fill: var(--ek-color-chrome); stroke: var(--bls-ink-60, currentColor); stroke-width: 12; }
.bls__admin-halo { fill: var(--ek-color-secondary); fill-opacity: 0.22; }
.bls__admin-e { fill: none; stroke: var(--ek-color-chrome-text); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
.bls__admin-hub { fill: var(--ek-color-secondary); }
.bls__admin-node { fill: var(--ek-color-chrome-text); }
.bls__admin-badge { fill: var(--ek-color-chrome-text); stroke: var(--ek-color-chrome); stroke-width: 10; stroke-linejoin: round; }
.bls__admin-badge-check { fill: none; stroke: var(--ek-color-chrome); stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; }

/* Olay tepkisi: 1px çerçeveli halka büyüyüp söner (ışıma/gölge yok). */
.bls__ring {
  position: absolute;
  inset: 4px;
  border: 1px solid var(--bls-ink-60);
  border-radius: var(--ek-radius-card);
  opacity: 0;
}

.bls__ring--a { animation: bls-ring-a var(--bls-cycle) linear infinite; }
.bls__ring--b { animation: bls-ring-b var(--bls-cycle) linear infinite; }

@keyframes bls-ring-a {
  0%, 31% { opacity: 0; transform: scale(0.9); }
  32% { opacity: 0.9; transform: scale(0.95); }
  40% { opacity: 0; transform: scale(1.45); }
  100% { opacity: 0; transform: scale(1.45); }
}

@keyframes bls-ring-b {
  0%, 56% { opacity: 0; transform: scale(0.9); }
  57% { opacity: 0.9; transform: scale(0.95); }
  65% { opacity: 0; transform: scale(1.45); }
  78% { opacity: 0; transform: scale(0.9); }
  79% { opacity: 0.9; transform: scale(0.95); }
  87%, 100% { opacity: 0; transform: scale(1.45); }
}

.bls__check {
  position: absolute;
  right: 2px;
  bottom: 4px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--bls-ink);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-chrome);
  color: var(--bls-ink);
  opacity: 0;
  animation: bls-check var(--bls-cycle) linear infinite;
}

.bls__check :deep(.v-icon) { font-size: 14px; }

@keyframes bls-check {
  0%, 78% { opacity: 0; transform: scale(0.6); }
  81% { opacity: 1; transform: scale(1); }
  95% { opacity: 1; transform: scale(1); }
  98%, 100% { opacity: 0; transform: scale(0.6); }
}

/* Denetim kaydı: 3 satırlık pencere; liste adım adım aşağı kayar (yenisi üstten girer), döngü sonunda söner. */






.bls__who {
  color: var(--ek-color-chrome-text);
  font-weight: var(--ek-font-weight-semibold);
}

.bls__time {
  margin-left: auto;
  font-size: 11px;
}


/* Hareket istemeyen kullanıcı: anlamlı son kare. */
@media (prefers-reduced-motion: reduce) {
  .bls *,
  .bls__health--drift {
    animation: none !important;
  }

  .bls__card--change .bls__swap-a,
  .bls__health--drift .bls__swap-a,
  .bls__signal,
  .bls__ring {
    opacity: 0;
  }

  .bls__card--change .bls__swap-b,
  .bls__health--drift .bls__swap-b,
  .bls__check {
    opacity: 1;
  }

  .bls__health--drift { border-color: var(--bls-ink-60); border-style: dashed; }
  .bls__pulse--drift { background: transparent; }
}
</style>
