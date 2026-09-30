<!--
  frontend/src/components/ds/EkPlatformMark.vue

  ADR-0015 Karar 3.11 — pazaryeri/entegrasyon logo yerleşimi, `PlatformImageComponent`'in
  YERİNE (bu görev yalnızca YENİ bileşeni hazırlar; mevcut ekranlardaki
  `PlatformImageComponent` kullanımlarının buna taşınması A3/A5/B'nin işi —
  "bu ekranların İÇERİĞİNE dokunma" kısıtı).

  Varsayılan: MONOGRAM rozeti (24/32px yuvarlak kare) + platform adı (sm 500). Aşama 5: kanal tonlu
  avatar (açık kanal zemini, kanal halkası + alt şerit, kanal tonunda harf) — renkler `.ek-ch-<kod>`
  kapsamından (`design/channels.ts`; tek kaynak `palette.ts` `channelPalette`). Veri eksikliğinde (bugünkü soluk gri renge düşen davranış)
  NÖTR monogram gösterilir — asla soluk/boş kutu YOK. Resmî logo görseli
  KULLANILMAZ (Açık Soru 2 varsayılanı).

  Kullanım:
    <EkPlatformMark name="Trendyol" code="trendyol" />
    <EkPlatformMark name="Trendyol" code="trendyol" variant="dot" />  (tablo/arama satırı)
    <EkPlatformMark name="Bilinmeyen Kanal" size="lg" />
-->
<template>
  <span class="ek-platform-mark" :class="[channelClass(code), { 'ek-platform-mark--dot': variant === 'dot', 'is-known': !!channelCode(code) }]">
    <span v-if="variant === 'dot'" class="ek-platform-mark__dot" aria-hidden="true"></span>
    <span
      v-else
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
import { channelClass, channelCode } from '@/design/channels'

const props = withDefaults(
  defineProps<{
    name: string
    /** Kanal kodu (trendyol/hepsiburada/n11/pazarama/ideasoft/bizimhesap); tanımsızsa nötr monogram. */
    code?: string
    size?: 'sm' | 'lg'
    showName?: boolean
    /** `badge` (varsayılan): kanal tonlu avatar. `dot`: tablo/arama satırı için 8px kanal noktası + ad. */
    variant?: 'badge' | 'dot'
  }>(),
  {
    size: 'sm',
    showName: true,
    variant: 'badge',
  },
)

const initial = computed(() => props.name?.trim().charAt(0).toUpperCase() || '?')
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
  border-radius: var(--ek-radius-tile);
  /* Aşama 5: kanal rengi AKTİF — avatar zemini kanalın açık tonu, ince kanal halkası, baş harf kanal tonunda (AA).
     Tanımsız kanal `.ek-ch-neutral` (nötr zemin, `content-default` harf). */
  background: var(--ek-ch-subtle);
  box-shadow: inset 0 0 0 1px var(--ek-ch-border);
  color: var(--ek-ch-text);
  font-weight: var(--ek-font-weight-bold);
}

/* Bilinen kanalda alt kenarda 3px kanal şeridi — avatar küçükken bile rengi taşır. */
.ek-platform-mark.is-known .ek-platform-mark__badge {
  box-shadow: inset 0 0 0 1px var(--ek-ch-border), inset 0 -3px 0 var(--ek-ch-solid);
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

.ek-platform-mark__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-solid);
}

.ek-platform-mark--dot {
  gap: var(--ek-space-1);
}

.ek-platform-mark--dot .ek-platform-mark__name {
  font-size: var(--ek-type-caption-size);
  color: var(--ek-color-content-muted);
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
