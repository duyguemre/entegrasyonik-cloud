<!--
  frontend/src/components/ds/EkPlatformMark.vue

  ADR-0015 Karar 3.11 — pazaryeri/entegrasyon logo yerleşimi, `PlatformImageComponent`'in
  YERİNE (bu görev yalnızca YENİ bileşeni hazırlar; mevcut ekranlardaki
  `PlatformImageComponent` kullanımlarının buna taşınması A3/A5/B'nin işi —
  "bu ekranların İÇERİĞİNE dokunma" kısıtı).

  Varsayılan: MONOGRAM rozeti (24/32px yuvarlak kare) + platform adı (sm 500). C1: logo zemini = kanalın RESMİ
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
    /** Kanal kodu (`channelPalette` anahtarları); tanımsızsa nötr monogram. */
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
  /* Tanımsız kanal: nötr açık zemin + nötr kenar, `content-default` harf. */
  background: var(--ek-color-neutral-subtle);
  box-shadow: inset 0 0 0 1px var(--ek-color-neutral-border);
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-bold);
}

/* Bilinen kanal: logo zemini + harf token'dan; alt şerit ikincil renk (yoksa zeminle aynı → görünmez). */
.ek-platform-mark.is-known .ek-platform-mark__badge {
  background: var(--ek-ch-logo-bg);
  color: var(--ek-ch-logo-fg);
  box-shadow: inset 0 0 0 1px var(--ek-channel-ring), inset 0 -3px 0 var(--ek-ch-logo-accent);
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
