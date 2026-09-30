<!--
  frontend/src/components/ds/EkListFrame.vue

  DS-v2 — liste ekranı çerçevesi (filtre + veri + sayfalama standardı).
  Dikey sıra SABİTTİR:
    #filters  (EkFilterPanel — etkin çipler başlığında, A8) — kaymaz
    kart: #toolbar (seçim çubuğu / başlık) → varsayılan slot (EkDataGrid, YALNIZ
          BURASI kayar) → #pager (EkPagerBar, kartın altına sabit)
  Çerçeve kapsayıcısının yüksekliğini doldurur (sekme içerik alanı); <768px'te
  sayfayla kayar, tablo kartı 72vh (min 360px) yüksekliğini korur.
-->
<template>
  <div class="ek-list-frame">
    <div v-if="$slots.filters" class="ek-list-frame__filters"><slot name="filters" /></div>
    <section class="ek-list-frame__card" :aria-label="label">
      <div v-if="$slots.toolbar" class="ek-list-frame__toolbar"><slot name="toolbar" /></div>
      <div class="ek-list-frame__scroll"><slot /></div>
      <div v-if="$slots.pager" class="ek-list-frame__pager"><slot name="pager" /></div>
    </section>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<style scoped>
.ek-list-frame {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  height: 100%;
  min-height: 0;
}

.ek-list-frame__filters {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.ek-list-frame__card {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
}

.ek-list-frame__toolbar {
  flex: none;
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ek-list-frame__scroll {
  flex: 1;
  min-height: 0;
}

.ek-list-frame__pager {
  flex: none;
}

/* Dar ekranda filtreler tek kolona iner ve uzar: çerçeve sayfayla birlikte
 * kayar, tablo kartı kendi yüksekliğini korur (başlık + sayfalama yine sabit). */
@media (max-width: 767px) {
  .ek-list-frame {
    height: auto;
  }

  .ek-list-frame__card {
    flex: none;
    height: 72vh;
    min-height: 360px;
  }
}
</style>
