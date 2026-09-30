<!--
  frontend/src/components/ds/EkChannelDot.vue

  DS-v2 — satış kanalı / entegrasyon göstergesi. C1: kanalın RESMİ marka rengi, tint YOK — renk yalnız nokta
  ya da dolgulu çip zemini olarak doğrudan kullanılır; dolguda metin `onBrand` (siyah/beyaz, ≥ 4.5:1). Renkler
  `.ek-ch-<kod>` kapsamından (`design/channels.ts`, tek kaynak `palette.ts` `channelPalette`); tanımsız kod nötre
  düşer. Nokta ve dolgu, iki temada da zeminden ayrılsın diye nötr kıl halka (`--ek-channel-ring`) taşır. Renk tek
  başına anlam taşımaz: ad her zaman yazılır (`showName=false` ise yalnız nokta + `title` + ekran okuyucu adı).

  Kullanım:
    <EkChannelDot code="trendyol" />                  → (● Trendyol) nötr çip + marka noktası (yoğun listeler)
    <EkChannelDot code="trendyol" variant="filled" /> → [Trendyol] marka zeminli çip, onBrand metin (vurgu)
    <EkChannelDot code="trendyol" variant="plain" />  → ● Trendyol (zeminsiz, yoğun metin içi)
    <EkChannelDot code="xyz" name="Özel kanal" />      → nötr çip
-->
<template>
  <span class="ek-channel" :class="[channelClass(code), `ek-channel--${showName ? variant : 'dot'}`]" :title="showName ? undefined : label">
    <span class="ek-channel__dot" aria-hidden="true"></span>
    <span :class="showName ? 'ek-channel__name' : 'ek-sr-only'">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { channelClass, channelName } from '../tokens/channels'

const props = withDefaults(
  defineProps<{ code?: string | null; name?: string | null; showName?: boolean; variant?: 'chip' | 'filled' | 'plain' }>(),
  { code: '', name: '', showName: true, variant: 'chip' },
)

const label = computed(() => channelName(props.code, props.name))
</script>

<style scoped>
.ek-channel {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  vertical-align: middle;
}

.ek-channel__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-brand);
  box-shadow: inset 0 0 0 1px var(--ek-channel-ring);
}

.ek-channel__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-channel--chip,
.ek-channel--filled {
  height: var(--ek-app-chip-h-sm);
  padding: 0 var(--ek-space-2) 0 7px;
  border-radius: var(--ek-radius-chip);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-semibold);
}

/* Nötr çip: yüzey zemin + nötr kenar + varsayılan metin; kanal rengi yalnız noktada. */
.ek-channel--chip {
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
}

/* Dolgulu çip: zemin = marka rengi (değiştirilmeden), metin = onBrand; nokta gereksiz. */
.ek-channel--filled {
  padding: 0 var(--ek-space-2);
  background: var(--ek-ch-brand);
  color: var(--ek-ch-on-brand);
  box-shadow: inset 0 0 0 1px var(--ek-channel-ring);
}

.ek-channel--filled .ek-channel__dot {
  display: none;
}

.ek-channel--plain .ek-channel__name {
  color: inherit;
}

/* Yalnız nokta: biraz büyük; yüzey boşluğu + nötr halka — küçük ama her iki temada zeminden ayrışır. */
.ek-channel--dot .ek-channel__dot {
  width: 10px;
  height: 10px;
  box-shadow: inset 0 0 0 1px var(--ek-channel-ring), 0 0 0 2px var(--ek-color-surface), 0 0 0 3px var(--ek-channel-ring);
}
</style>
