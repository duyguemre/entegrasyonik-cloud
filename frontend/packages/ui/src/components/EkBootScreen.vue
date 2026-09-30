<!--
  EkBootScreen — AÇILIŞ / OTURUM YÜKLEME EKRANI (FR2-39; müşteri uygulaması + backoffice ORTAK, tek bileşen).
  Kartsız, tam ekran "sahne": uygulama zemini üzerinde marka rengiyle çok hafif bir ışık halesi, ortada EkBrandLoader,
  ürün adı + durum metni ve ince, belirsiz ilerleme çizgisi. Kart/çerçeve YOK — ekran yüklenirken ürünün kendisi gibi görünür.
  - Titreme yok: zemin ilk karede boyanır; içerik `delay` (varsayılan 200 ms) dolmadan görünmez. Hızlı açılışta kullanıcı
    yalnız düz zemini görür, logo yanıp sönmez.
  - Hareket: yalnız opaklık (240 ms, ease-out) + ilerleme çizgisi kayması; `prefers-reduced-motion` → anında görünür,
    çizgi durağan, işaret statik (EkBrandLoader kuralı).
  - Açık/koyu: yalnız token (app-bg, brand, secondary, content-*).
  - Erişilebilirlik: `role=status` + `aria-live=polite`; görünür metin = ekran okuyucu metni.

    <EkBootScreen v-if="booting" label="Oturum kontrol ediliyor…" product="Yönetim" />
-->
<template>
  <div class="ek-boot" :class="{ 'is-visible': visible }" role="status" aria-live="polite" aria-busy="true" data-testid="boot-screen">
    <div class="ek-boot__halo" aria-hidden="true"></div>
    <div class="ek-boot__stage">
      <EkBrandLoader :size="56" :label="label" hide-label />
      <div class="ek-boot__text">
        <p class="ek-boot__product">
          <span>Entegrasyonik</span>
          <span v-if="product" class="ek-boot__tag">{{ product }}</span>
        </p>
        <p class="ek-boot__label">{{ label }}</p>
      </div>
      <div class="ek-boot__track" aria-hidden="true"><span class="ek-boot__bar"></span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import EkBrandLoader from './EkBrandLoader.vue'

const props = withDefaults(
  defineProps<{
    label?: string
    /** Ürün etiketi (ör. "Yönetim"); müşteri uygulamasında boş. */
    product?: string
    /** İçeriğin görünmeden önce beklediği süre (ms) — hızlı açılışta yanıp sönmeyi önler. */
    delay?: number
  }>(),
  { label: 'Yükleniyor…', product: '', delay: 200 },
)

const visible = ref(props.delay <= 0)
let timer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  if (!visible.value) timer = setTimeout(() => (visible.value = true), props.delay)
})
onBeforeUnmount(() => clearTimeout(timer))
</script>

<style scoped>
.ek-boot {
  position: fixed;
  inset: 0;
  z-index: var(--ek-z-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--ek-color-app-bg);
  color: var(--ek-color-content-default);
}

/* Işık halesi: marka + ikincil renkten çok düşük yoğunluklu iki radyal geçiş (kart yerine derinlik). */
.ek-boot__halo {
  position: absolute;
  inset: -20%;
  background:
    radial-gradient(38% 32% at 50% 46%, color-mix(in srgb, var(--ek-color-brand) 14%, transparent), transparent 70%),
    radial-gradient(22% 18% at 56% 52%, color-mix(in srgb, var(--ek-color-secondary) 10%, transparent), transparent 72%);
  opacity: 0;
  transition: opacity var(--ek-duration-slow) var(--ek-easing-enter);
  pointer-events: none;
}

.ek-boot__stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-5);
  opacity: 0;
  transform: translateY(var(--ek-motion-distance-sm));
  transition:
    opacity var(--ek-duration-slow) var(--ek-easing-enter),
    transform var(--ek-duration-slow) var(--ek-easing-enter);
}

.ek-boot.is-visible .ek-boot__halo,
.ek-boot.is-visible .ek-boot__stage {
  opacity: 1;
  transform: none;
}

.ek-boot__text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-1);
  text-align: center;
}

.ek-boot__product {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: -0.01em;
}

.ek-boot__tag {
  padding-left: var(--ek-space-2);
  border-left: 1px solid var(--ek-color-border-strong);
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
}

.ek-boot__label {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

/* İnce belirsiz ilerleme çizgisi: sabit genişlikli iz, içinde kayan kısa bölüt (yalnız transform). */
.ek-boot__track {
  position: relative;
  width: 160px;
  height: 2px;
  overflow: hidden;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-border-subtle);
}

.ek-boot__bar {
  position: absolute;
  inset: 0 auto 0 0;
  width: 40%;
  border-radius: inherit;
  background: var(--ek-color-brand);
  animation: ek-boot-slide 1.4s ease-in-out infinite;
}

@keyframes ek-boot-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}

@media (prefers-reduced-motion: reduce) {
  .ek-boot__halo,
  .ek-boot__stage {
    transition: none;
    transform: none;
  }

  .ek-boot__bar {
    width: 100%;
    opacity: 0.35;
    animation: none;
  }
}
</style>
