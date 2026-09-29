<!-- Vitrin §2 — yüzey katmanları: koyudan açığa katman sırası ve kimlik tonları. -->
<template>
  <DsSpecimen title="Katman sırası" note="Zemin → kart → kart içi çukur → yükselen katman. Ayrım ton + kenarlık + gölgeyle; saf beyaz yalnızca içerik yüzeyinde.">
    <div class="ds-layers">
      <div class="ds-layers__rail">
        <span class="ds-tag">tabstrip-bg</span>
      </div>
      <div class="ds-layers__canvas">
        <span class="ds-tag">app-bg · çalışma alanı zemini</span>
        <div class="ds-layers__card">
          <div class="ds-layers__band"><span class="ds-tag">surface-muted · kart başlık bandı</span></div>
          <div class="ds-layers__card-body">
            <span class="ds-tag">surface · kart / tablo gövdesi</span>
            <div class="ds-layers__well"><span class="ds-tag">surface-sunken · filtre gövdesi, değer kuyusu</span></div>
          </div>
        </div>
        <div class="ds-layers__raised">
          <span class="ds-tag">surface-raised + shadow-popover</span>
          <span class="ds-layers__raised-note">menü · açılır liste · arama sonuçları</span>
        </div>
        <div class="ds-layers__inverse"><span>surface-inverse · tooltip</span></div>
      </div>
    </div>
  </DsSpecimen>

  <div class="ds-identity">
    <DsSpecimen title="Kimlik kabuğu (chrome)" note="Kimliği taşıyan TEK boyalı alan: tek marka degradesi.">
      <div class="ds-chrome">
        <span class="ds-chrome__title">--ek-gradient-chrome</span>
        <span class="ds-chrome__muted">chrome → chrome-end · metin chrome-text / chrome-text-muted</span>
        <span class="ds-chrome__control">chrome-raised · kontrol zemini</span>
      </div>
    </DsSpecimen>
    <DsSpecimen title="Sidebar ve sekme tonları" note="Sidebar zeminden bir kademe açık; etkin sekme içerikle birleşir.">
      <div class="ds-side-tones">
        <div class="ds-side-tones__side">
          <span class="ds-side-tones__section">BÖLÜM ETİKETİ</span>
          <span class="ds-side-tones__item">sidebar-text</span>
          <span class="ds-side-tones__item is-hover">sidebar-hover</span>
          <span class="ds-side-tones__item is-active">sidebar-active</span>
        </div>
        <div class="ds-side-tones__tabs">
          <span class="ds-side-tones__tab">pasif sekme</span>
          <span class="ds-side-tones__tab is-active">tab-active</span>
          <span class="ds-side-tones__tab is-hover">tab-hover</span>
        </div>
      </div>
    </DsSpecimen>
  </div>
</template>

<script setup lang="ts">
import DsSpecimen from './DsSpecimen.vue'
</script>

<style scoped>
.ds-tag {
  display: inline-block;
  color: var(--ek-color-content-default);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ds-layers {
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
}

.ds-layers__rail {
  padding: var(--ek-space-2) var(--ek-space-4);
  background: var(--ek-color-tabstrip-bg);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ds-layers__canvas {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--ek-space-5);
  padding: var(--ek-space-5);
  background: var(--ek-color-app-bg);
}

.ds-layers__canvas > .ds-tag {
  grid-column: 1 / -1;
}

.ds-layers__card {
  overflow: hidden;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
}

.ds-layers__band {
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ds-layers__card-body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
}

.ds-layers__well {
  padding: var(--ek-space-4);
  background: var(--ek-color-surface-sunken);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
}

.ds-layers__raised {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  align-self: start;
  padding: var(--ek-space-4);
  background: var(--ek-color-surface-raised);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-popover);
  box-shadow: var(--ek-shadow-popover);
}

.ds-layers__raised-note {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-layers__inverse {
  justify-self: start;
  grid-column: 2;
  padding: var(--ek-space-1) var(--ek-space-2);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-inverse);
  color: var(--ek-color-content-inverse);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.ds-identity {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--ek-space-4);
}

.ds-chrome {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-5);
  border-radius: var(--ek-radius-card);
  background: var(--ek-gradient-chrome);
  color: var(--ek-color-chrome-text);
  box-shadow: var(--ek-shadow-chrome);
}

.ds-chrome__title {
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-bold);
}

.ds-chrome__muted {
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-type-caption-size);
}

.ds-chrome__control {
  align-self: flex-start;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-chrome-raised);
  font-size: var(--ek-type-caption-size);
}

.ds-side-tones {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
}

.ds-side-tones__side {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ek-space-3);
  background: var(--ek-color-sidebar-bg);
  border-right: 1px solid var(--ek-color-sidebar-border);
}

.ds-side-tones__section {
  padding: 0 var(--ek-space-2) var(--ek-space-1);
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: var(--ek-type-micro-tracking);
}

.ds-side-tones__item {
  padding: var(--ek-space-2);
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-sidebar-text);
  font-size: var(--ek-type-caption-size);
}

.ds-side-tones__item.is-hover {
  background: var(--ek-color-sidebar-hover);
}

.ds-side-tones__item.is-active {
  background: var(--ek-color-sidebar-active);
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
  box-shadow: inset 3px 0 0 var(--ek-color-action);
}

.ds-side-tones__tabs {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: var(--ek-space-6) var(--ek-space-2) 0;
  background: var(--ek-color-tabstrip-bg);
}

.ds-side-tones__tab {
  padding: var(--ek-space-2) var(--ek-space-3);
  border-radius: var(--ek-radius-tab) var(--ek-radius-tab) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  white-space: nowrap;
}

.ds-side-tones__tab.is-hover {
  background: var(--ek-color-tab-hover);
  color: var(--ek-color-content-strong);
}

.ds-side-tones__tab.is-active {
  background: var(--ek-color-tab-active);
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
  box-shadow: inset 0 2px 0 var(--ek-color-action);
}

@media (max-width: 767px) {
  .ds-layers__canvas,
  .ds-side-tones {
    grid-template-columns: minmax(0, 1fr);
  }

  .ds-layers__inverse {
    grid-column: 1;
  }
}
</style>
