<!--
  frontend/src/components/ds/EkPlatformMark.vue

  ADR-0015 Karar 3.11 — pazaryeri/entegrasyon logo yerleşimi, `PlatformImageComponent`'in
  YERİNE (bu görev yalnızca YENİ bileşeni hazırlar; mevcut ekranlardaki
  `PlatformImageComponent` kullanımlarının buna taşınması A3/A5/B'nin işi —
  "bu ekranların İÇERİĞİNE dokunma" kısıtı).

  K13 (FR2 madde 11–12): monogram artık TEK kanal rozetinin kısa formu (`EkChannelBadge form="short"`: koyu kenarlık + açık
  zemin + kısa ad, ör. TY/HB) + platform adı (sm 500). Aşağıdaki C1 "logo zemini" notu tarihseldir (yerini K13 aldı).
  Eski: MONOGRAM rozeti (24/32px yuvarlak kare) + platform adı (sm 500). C1: logo zemini = kanalın RESMİ
  marka rengi (tint yok), harf `onBrand` (siyah/beyaz, ≥ 4.5:1) — `--ek-ch-logo-{bg,fg,accent}`. İkincil renk YALNIZ
  burada: N11 resmi ikonu gibi siyah zemin + pembe harf; Pazarama mavi zemin + alt kenarda 3px pembe şerit. Nötr kıl halka
  (`--ek-channel-ring`) koyu marka renklerini dark zeminden ayırır. Renkler `.ek-ch-<kod>` kapsamından
  (`design/channels.ts`; tek kaynak `palette.ts` `channelPalette`). Veri eksikliğinde / tanımsız kanalda
  NÖTR monogram (nötr açık zemin, varsayılan metin) gösterilir — asla soluk/boş kutu YOK. Resmî logo görseli
  KULLANILMAZ (Açık Soru 2 varsayılanı).

  Kullanım:
    <EkPlatformMark name="Trendyol" code="trendyol" />
    <EkPlatformMark name="Trendyol" code="trendyol" variant="dot" />  (tablo/arama satırı)
    <EkPlatformMark name="Bilinmeyen Kanal" size="lg" />
-->
<template>
  <span class="ek-platform-mark" :class="[channelClass(code), { 'ek-platform-mark--dot': variant === 'dot', 'is-known': !!channelCode(code) }]">
    <span v-if="variant === 'dot'" class="ek-platform-mark__dot" aria-hidden="true"></span>
    <EkChannelBadge v-else class="ek-platform-mark__badge" :class="`ek-platform-mark__badge--${size}`" :code="code" :name="name"
      form="short" :size="size === 'lg' ? 'md' : 'sm'" :aria-hidden="showName ? 'true' : undefined" />
    <span v-if="showName" class="ek-platform-mark__name">{{ name }}</span>
  </span>
</template>

<script setup lang="ts">
import { channelClass, channelCode } from '../tokens/channels'
import EkChannelBadge from './EkChannelBadge.vue'

withDefaults(
  defineProps<{
    name: string
    /** Kanal kodu (`channelPalette` anahtarları); tanımsızsa nötr rozet. */
    code?: string
    size?: 'sm' | 'lg'
    showName?: boolean
    /** `badge` (varsayılan): kısa kanal rozeti. `dot`: tablo/arama satırı için 8px kanal noktası + ad. */
    variant?: 'badge' | 'dot'
  }>(),
  {
    size: 'sm',
    showName: true,
    variant: 'badge',
  },
)
</script>

<style scoped>
.ek-platform-mark {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-platform-mark__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-brand);
  box-shadow: inset 0 0 0 1px var(--ek-channel-ring);
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
