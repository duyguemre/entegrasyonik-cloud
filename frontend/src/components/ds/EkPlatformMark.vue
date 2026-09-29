<!--
  frontend/src/components/ds/EkPlatformMark.vue

  ADR-0015 Karar 3.11 — pazaryeri/entegrasyon logo yerleşimi, `PlatformImageComponent`'in
  YERİNE (bu görev yalnızca YENİ bileşeni hazırlar; mevcut ekranlardaki
  `PlatformImageComponent` kullanımlarının buna taşınması A3/A5/B'nin işi —
  "bu ekranların İÇERİĞİNE dokunma" kısıtı).

  Varsayılan: MONOGRAM rozeti (24/32px yuvarlak kare, `surface-sunken`
  zemin, `content-strong` baş harf) + platform adı (sm 500). Marka rengi
  YALNIZCA 6 canlı entegrasyon için 3px sol şerit/nokta (`integrationAccent`,
  `palette.ts`). Veri eksikliğinde (bugünkü soluk gri renge düşen davranış)
  NÖTR monogram gösterilir — asla soluk/boş kutu YOK. Resmî logo görseli
  KULLANILMAZ (Açık Soru 2 varsayılanı).

  Kullanım:
    <EkPlatformMark name="Trendyol" code="trendyol" />
    <EkPlatformMark name="Bilinmeyen Kanal" size="lg" />
-->
<template>
  <span class="ek-platform-mark">
    <span
      class="ek-platform-mark__badge"
      :class="`ek-platform-mark__badge--${size}`"
    >
      {{ initial }}
    </span>
    <span v-if="showName" class="ek-platform-mark__name">{{ name }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { integrationAccent } from '@/design/tokens/palette'

const props = withDefaults(
  defineProps<{
    name: string
    /** `integrationAccent` anahtarı (trendyol/hepsiburada/n11/pazarama/ideasoft/bizimhesap); tanımsızsa nötr monogram. */
    code?: string
    size?: 'sm' | 'lg'
    showName?: boolean
  }>(),
  {
    size: 'sm',
    showName: true,
  },
)

const initial = computed(() => props.name?.trim().charAt(0).toUpperCase() || '?')
// `v-bind()` (aşağıdaki <style>) ile CSS değişkenine bağlanır — şablonda
// dinamik bir stil bağlaması YAZILMAZ (literal-stil mandalı bu deseni de sayıyor).
const accentBorderColor = computed(() => {
  const hex = props.code ? (integrationAccent as Record<string, string>)[props.code] : undefined
  return hex ?? 'transparent'
})
</script>

<style scoped>
.ek-platform-mark {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-platform-mark__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
  border-left: 3px solid v-bind(accentBorderColor);
}

.ek-platform-mark__badge--sm {
  width: 24px;
  height: 24px;
  font-size: var(--ek-font-size-xs);
}

.ek-platform-mark__badge--lg {
  width: 32px;
  height: 32px;
  font-size: var(--ek-font-size-sm);
}

.ek-platform-mark__name {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
