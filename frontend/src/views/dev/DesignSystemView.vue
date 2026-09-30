<!--
  frontend/src/views/dev/DesignSystemView.vue

  DS-v2 Aşama 1 — TASARIM SİSTEMİ VİTRİNİ. YALNIZCA GELİŞTİRMEDE erişilir
  (`/design-system`; rota `import.meta.env.DEV` koşuluyla eklenir, üretim
  derlemesinde rota ve bu dosyanın chunk'ı YOKTUR; menüde yer almaz).
  Token'lar, semantik roller ve DS-v2 bileşenlerinin tüm durumları burada
  gösterilir; kullanıcı onayı bu ekran ve `frontend/docs/design-system-review/`
  görselleri üzerinden verilir. Ayrıntı: `frontend/DESIGN_SYSTEM.md`.
-->
<template>
  <div class="dsv">
    <header class="dsv-hero">
      <div class="dsv-hero__inner">
        <EkBrandLogo tone="inverse" :size="32" />
        <div class="dsv-hero__text">
          <p class="dsv-hero__eyebrow">Entegrasyonik · DS-v2 · Aşama 1</p>
          <h1 class="dsv-hero__title">Tasarım sistemi</h1>
          <p class="dsv-hero__desc">
            Tek kaynak token'lar → Vuetify teması + <code>--ek-*</code> değişkenleri → yeniden kullanılabilir bileşenler.
            Bu sayfa yalnızca geliştirme ortamındadır; ekran göçü onaydan sonra başlar.
          </p>
        </div>
        <div class="dsv-hero__badges">
          <span class="dsv-hero__badge">Onay bekliyor</span>
          <span class="dsv-hero__badge dsv-hero__badge--ghost">WCAG AA · test ile</span>
        </div>
      </div>
    </header>

    <div class="dsv-layout">
      <nav class="dsv-toc" aria-label="Vitrin içindekiler">
        <p class="dsv-toc__label">İçindekiler</p>
        <a v-for="s in sections" :key="s.id" class="dsv-toc__link" :class="{ 'is-active': active === s.id }" :href="`#${s.id}`" @click="active = s.id">
          <span class="dsv-toc__num">{{ s.index }}</span>{{ s.title }}
        </a>
      </nav>

      <main class="dsv-main">
        <DsSection id="renk" index="01" title="Renk paleti ve semantik roller" description="Renk anlam taşır. Tek vurgu rengi (cobalt) yalnızca aksiyon, seçim ve odakta; lacivert yalnızca kimlikte; durum renkleri her yerde aynı anlamda.">
          <DsFoundationColors />
        </DsSection>
        <DsSection id="yuzey" index="02" title="Yüzey katmanları ve kimlik tonları" description="Ağırlıklı beyaz yok: zemin tonlu, kartlar bir kademe açık, çukur alanlar bir kademe koyu, yükselen katmanlar gölgeli.">
          <DsFoundationSurfaces />
        </DsSection>
        <DsSection id="tipografi" index="03" title="Tipografi ve ikon ölçeği" description="Rol tabanlı ölçek; her rolün aynı satırdaki ikon boyutu tanımlı (yazı/ikon orantısı testle korunur).">
          <DsFoundationType />
        </DsSection>
        <DsSection id="olcek" index="04" title="Boşluk, radius, gölge, hareket, katman">
          <DsFoundationScale />
        </DsSection>
        <DsSection id="buton" index="05" title="Düğmeler" description="Dört ton, tek yükseklik ölçeği; tüm durumlar token'dan.">
          <DsButtons />
        </DsSection>
        <DsSection id="form" index="06" title="Form alanları" description="Etiket, yardım ve hata metni standardı; tek ızgara ile alanlar asla üst üste binmez.">
          <DsForms />
        </DsSection>
        <DsSection id="kart" index="07" title="Kart ve KPI kartı" description="Her kart başlığı aynı motif: ikon kapsülü + başlık + sağda yuvarlak aksiyon oku.">
          <DsCards />
        </DsSection>
        <DsSection id="rozet" index="08" title="Durum çipi, rozet, tooltip">
          <DsBadges />
        </DsSection>
        <DsSection id="diyalog" index="09" title="Diyalog ve bağlam menüsü" description="Başlık / içerik / eylem alanı her diyalogda aynı; tehlikeli aksiyon error tonuyla ayrışır.">
          <DsOverlays />
        </DsSection>
        <DsSection id="kabuk" index="10" title="Kabuk: üst bar, akıllı arama, sekmeler, sidebar" description="Kimlik taşıyan üst bar, gruplu ve klavyeyle gezilen arama, gerçek sekme hissi, kesilmeyen menü metinleri.">
          <DsShell />
        </DsSection>
        <DsSection id="liste" index="11" title="Liste standardı: filtre, tablo, sayfalama" description="Tüm liste ekranları için TEK standart.">
          <DsList />
        </DsSection>
        <DsSection id="kademeli" index="12" title="Kademeli çok kolonlu seçici" description="Ürün kategori ağacı ve ekran başlatıcı için.">
          <DsCascade />
        </DsSection>
        <DsSection id="geri-bildirim" index="13" title="Geri bildirim, yükleme ve eylemler" description="Aşama 6b tutarlılık standartları: tek uyarı/hata/boş/toast deseni, marka yükleme işareti, eylem ikonu kayıt defteri, satır eylemleri.">
          <DsFeedback />
        </DsSection>
        <footer class="dsv-foot">
          Aşama 2 göç sırası: kabuk → liste standardı → diyalog/menü/form → dashboard. Ayrıntı ve eski renk envanteri:
          <code>frontend/DESIGN_SYSTEM.md</code>.
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { EkBrandLogo } from '@entegrasyonik/ui/components'
import DsSection from './design-system/DsSection.vue'
import DsFoundationColors from './design-system/DsFoundationColors.vue'
import DsFoundationSurfaces from './design-system/DsFoundationSurfaces.vue'
import DsFoundationType from './design-system/DsFoundationType.vue'
import DsFoundationScale from './design-system/DsFoundationScale.vue'
import DsButtons from './design-system/DsButtons.vue'
import DsForms from './design-system/DsForms.vue'
import DsCards from './design-system/DsCards.vue'
import DsBadges from './design-system/DsBadges.vue'
import DsOverlays from './design-system/DsOverlays.vue'
import DsShell from './design-system/DsShell.vue'
import DsList from './design-system/DsList.vue'
import DsCascade from './design-system/DsCascade.vue'
import DsFeedback from './design-system/DsFeedback.vue'

const sections = [
  { id: 'renk', index: '01', title: 'Renk paleti' },
  { id: 'yuzey', index: '02', title: 'Yüzey katmanları' },
  { id: 'tipografi', index: '03', title: 'Tipografi ve ikon' },
  { id: 'olcek', index: '04', title: 'Boşluk · radius · gölge' },
  { id: 'buton', index: '05', title: 'Düğmeler' },
  { id: 'form', index: '06', title: 'Form alanları' },
  { id: 'kart', index: '07', title: 'Kart ve KPI' },
  { id: 'rozet', index: '08', title: 'Çip · rozet · tooltip' },
  { id: 'diyalog', index: '09', title: 'Diyalog ve menü' },
  { id: 'kabuk', index: '10', title: 'Kabuk' },
  { id: 'liste', index: '11', title: 'Liste standardı' },
  { id: 'kademeli', index: '12', title: 'Kademeli seçici' },
  { id: 'geri-bildirim', index: '13', title: 'Geri bildirim · yükleme · eylem' },
]
const active = ref('renk')
</script>

<style scoped>
.dsv {
  min-height: 100vh;
  background: var(--ek-color-app-bg);
  color: var(--ek-color-content-default);
  font-family: var(--ek-font-sans);
}

.dsv-hero {
  background: var(--ek-gradient-chrome);
  color: var(--ek-color-chrome-text);
  box-shadow: var(--ek-shadow-chrome);
}

.dsv-hero__inner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-5);
  max-width: 1440px;
  margin: 0 auto;
  padding: var(--ek-space-6) var(--ek-space-6);
}

.dsv-hero__text {
  flex: 1;
  min-width: 260px;
}

.dsv-hero__eyebrow {
  margin: 0;
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dsv-hero__title {
  margin: var(--ek-space-1) 0;
  font-size: var(--ek-type-display-size);
  line-height: var(--ek-type-display-line);
  font-weight: var(--ek-type-display-weight);
  letter-spacing: var(--ek-type-display-tracking);
}

.dsv-hero__desc {
  max-width: 760px;
  margin: 0;
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.dsv-hero__desc code {
  color: var(--ek-color-chrome-text);
  font-family: var(--ek-font-mono);
}

.dsv-hero__badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.dsv-hero__badge {
  padding: var(--ek-space-1) var(--ek-space-3);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-bold);
}

.dsv-hero__badge--ghost {
  border: 1px solid var(--ek-color-chrome-border);
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text);
}

.dsv-layout {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  gap: var(--ek-space-6);
  max-width: 1440px;
  margin: 0 auto;
  padding: var(--ek-space-6);
}

.dsv-toc {
  position: sticky;
  top: var(--ek-space-6);
  align-self: start;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-sidebar-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-sidebar-bg);
}

.dsv-toc__label {
  margin: 0;
  padding: var(--ek-space-1) var(--ek-space-3) var(--ek-space-2);
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dsv-toc__link {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-sidebar-text);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  text-decoration: none;
  transition: var(--ek-transition-colors);
}

.dsv-toc__link:hover {
  background: var(--ek-color-sidebar-hover);
  color: var(--ek-color-content-strong);
}

.dsv-toc__link.is-active {
  background: var(--ek-color-sidebar-active);
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.dsv-toc__link:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ek-color-border-focus);
}

.dsv-toc__num {
  min-width: 20px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-variant-numeric: tabular-nums;
}

.dsv-main {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-12);
  min-width: 0;
}

.dsv-foot {
  padding: var(--ek-space-5);
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-card);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

.dsv-foot code {
  color: var(--ek-color-content-strong);
  font-family: var(--ek-font-mono);
}

@media (max-width: 1023px) {
  .dsv-layout {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--ek-space-4);
  }

  .dsv-toc {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    padding: var(--ek-space-2);
  }

  .dsv-toc__label {
    display: none;
  }

  .dsv-toc__link {
    flex: none;
  }
}

@media (max-width: 767px) {
  .dsv-hero__inner {
    padding: var(--ek-space-5) var(--ek-space-4);
  }

  .dsv-layout {
    padding: var(--ek-space-3);
  }

  .dsv-main {
    gap: var(--ek-space-10);
  }
}
</style>
