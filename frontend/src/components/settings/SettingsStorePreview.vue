<!--
  frontend/src/components/settings/SettingsStorePreview.vue

  FE R4 C1 (K61) — mağaza kimliği canlı önizlemesi (ad, marka rengi, logo). Geniş ekranda ayarlar gezinmesinin altında
  YAPIŞKAN durur (her bölümden görünür); dar ekranda "Mağaza kimliği" bölümünün sonunda. Sayfada tek kopya render edilir.
  Marka rengi kullanıcı VERİSİDİR (tenant ayarı), tasarım token'ı değildir: şerit ve örnek kare `--sl-brand` özel
  özelliğinden boyanır — değeri ebeveyn (`SettingListView` `.sl-layout`) tek bağlamayla verir (stil mandalı: yeni satır içi stil yok).
-->
<template>
  <aside class="ssp" aria-label="Önizleme">
    <div class="ssp__head">
      <p class="ssp__overline">Önizleme</p>
      <EkStatusChip tone="success" label="Canlı" />
    </div>
    <div class="ssp__card">
      <span class="ssp__band" aria-hidden="true"></span>
      <div class="ssp__body">
        <v-avatar size="56" rounded="lg" class="ssp__avatar">
          <v-img v-if="logo" :src="logo" cover alt="">
            <template v-slot:placeholder><v-skeleton-loader type="image" /></template>
          </v-img>
          <v-icon v-else size="24" class="ssp__avatar-icon" aria-hidden="true">mdi-image-plus-outline</v-icon>
        </v-avatar>
        <div class="ssp__text">
          <h3 class="ssp__name">{{ storeName || 'Mağaza adı' }}</h3>
          <div class="ssp__verified">
            <v-icon size="14" color="success" aria-hidden="true">mdi-check-decagram-outline</v-icon>
            <span>Doğrulanmış mağaza</span>
          </div>
        </div>
      </div>
      <div class="ssp__swatch-row">
        <span class="ssp__swatch" aria-hidden="true"></span>
        <span class="ssp__code ek-num" translate="no">{{ brandColor }}</span>
      </div>
    </div>
    <p class="ssp__help">Ad, renk ve logo değiştikçe önizleme anında güncellenir; kaydettiğinizde saklanır.</p>
  </aside>
</template>

<script setup lang="ts">
import { EkStatusChip } from '@entegrasyonik/ui/components'

defineProps<{ storeName?: string; logo?: string; brandColor?: string }>()
</script>

<style scoped>
.ssp {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ssp__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ssp__overline {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ssp__card {
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-sunken);
}

.ssp__band {
  display: block;
  background: var(--sl-brand, var(--ek-color-action));
  height: 6px;
  transition: var(--ek-transition-colors);
}

.ssp__body {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-3) var(--ek-space-2);
}

.ssp__avatar {
  flex: none;
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
}

.ssp__avatar-icon {
  color: var(--ek-color-content-subtle);
}

.ssp__text {
  min-width: 0;
}

.ssp__name {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
  overflow-wrap: anywhere;
}

.ssp__verified {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ssp__swatch-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ssp__swatch {
  background: var(--sl-brand, var(--ek-color-action));
  width: 14px;
  height: 14px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: 4px;
}

.ssp__help {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

@media (prefers-reduced-motion: reduce) {
  .ssp__band {
    transition: none;
  }
}
</style>
