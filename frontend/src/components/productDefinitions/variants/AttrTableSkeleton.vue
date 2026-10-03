<!--
  Kanal özellik tablosunun YÜKLENİYOR durumu — tablonun kendi şeklinde iskelet (özellik adı · değer kutusu · [şu an]).
  Dönen gösterge yok (ADR-0015 Karar 3.2); ışıltı yalnız hareket tercihine izin varsa. Ekran okuyucuya tek duyuru.
-->
<template>
  <div class="ats" role="status" :aria-label="label">
    <div class="ats__head">
      <span class="ats__bar ats__bar--h" /><span class="ats__bar ats__bar--h" /><span v-if="columns === 3" class="ats__bar ats__bar--h" />
    </div>
    <div v-for="i in rows" :key="i" class="ats__row" :class="`ats__row--c${columns}`">
      <span class="ats__name"><span class="ats__bar" :class="`ats__w${(i % 3) + 1}`" /><span class="ats__bar ats__bar--chip" /></span>
      <span class="ats__field" />
      <span v-if="columns === 3" class="ats__bar ats__w2" />
    </div>
    <p class="ats__label">{{ label }}</p>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label: string; rows?: number; columns?: 2 | 3 }>(), { rows: 6, columns: 3 })
</script>

<style scoped>
.ats { display: flex; flex-direction: column; }
.ats__head, .ats__row { display: grid; align-items: center; gap: var(--ek-space-4); padding: 0 var(--ek-space-3); }
.ats__head { grid-template-columns: 30% 40% 1fr; height: 40px; background: var(--ek-color-surface-muted); border-bottom: 1px solid var(--ek-color-border-default); }
.ats__row { height: 52px; border-bottom: 1px solid var(--ek-color-border-subtle); }
.ats__row--c3 { grid-template-columns: 30% 40% 1fr; }
.ats__row--c2 { grid-template-columns: 36% 1fr; }
.ats__name { display: flex; flex-direction: column; gap: 6px; }
.ats__bar {
  display: block;
  height: 10px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
}
.ats__bar--h { width: 40%; height: 8px; }
.ats__bar--chip { width: 48px; height: 8px; }
.ats__w1 { width: 70%; }
.ats__w2 { width: 50%; }
.ats__w3 { width: 85%; }
.ats__field { height: 36px; border: 1px solid var(--ek-color-border-subtle); border-radius: var(--ek-radius-control); background: var(--ek-color-surface); }
.ats__label { margin: 0; padding: var(--ek-space-3); color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); text-align: center; }

@media (prefers-reduced-motion: no-preference) {
  .ats__bar, .ats__field {
    background-image: linear-gradient(90deg, transparent 0, color-mix(in srgb, var(--ek-color-surface) 70%, transparent) 50%, transparent 100%);
    background-size: 200% 100%;
    background-repeat: no-repeat;
    animation: ats-shine var(--ek-motion-loop-pulse) var(--ek-easing-standard) infinite;
  }
}
/* uygulama içi hareket ayarı (duraklatılmış/azaltılmış) */
:global(html:is([data-motion='paused'], [data-motion='reduced'])) .ats__bar,
:global(html:is([data-motion='paused'], [data-motion='reduced'])) .ats__field { animation: none; }
@keyframes ats-shine {
  from { background-position: 150% 0; }
  to { background-position: -50% 0; }
}
</style>
