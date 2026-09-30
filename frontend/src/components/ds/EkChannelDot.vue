<!--
  frontend/src/components/ds/EkChannelDot.vue

  DS-v2 — satış kanalı / entegrasyon göstergesi. Aşama 5 (kullanıcı geri bildirimi madde 3): kanal rengi
  AKTİF kullanılır — varsayılan görünüm KANAL ÇİPİ: kanalın açık tonu zemin + ince kanal kenarlığı + kanal
  noktası + kanal tonunda ad (AA). Renkler `.ek-ch-<kod>` kapsamından (`design/channels.ts`, tek kaynak
  `palette.ts` `channelPalette`); tanımsız kod nötr çipe düşer. Renk tek başına anlam taşımaz: ad her zaman
  yazılır (`showName=false` ise yalnız nokta + `title` + ekran okuyucu adı).

  Kullanım:
    <EkChannelDot code="trendyol" />                 → (● Trendyol) çip
    <EkChannelDot code="trendyol" variant="plain" /> → ● Trendyol (zeminsiz, yoğun metin içi)
    <EkChannelDot code="xyz" name="Özel kanal" />     → nötr çip
-->
<template>
  <span class="ek-channel" :class="[channelClass(code), `ek-channel--${showName ? variant : 'dot'}`]" :title="showName ? undefined : label">
    <span class="ek-channel__dot" aria-hidden="true"></span>
    <span :class="showName ? 'ek-channel__name' : 'ek-sr-only'">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { channelClass, channelName } from '@/design/channels'

const props = withDefaults(
  defineProps<{ code?: string | null; name?: string | null; showName?: boolean; variant?: 'chip' | 'plain' }>(),
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
  background: var(--ek-ch-solid);
}

.ek-channel__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-channel--chip {
  height: var(--ek-app-chip-h-sm);
  padding: 0 var(--ek-space-2) 0 7px;
  border: 1px solid var(--ek-ch-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-subtle);
  color: var(--ek-ch-text);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-channel--plain .ek-channel__name {
  color: inherit;
}

/* Yalnız nokta: beyaz halka + kanal kenarı — küçük ama zeminden ayrışır. */
.ek-channel--dot .ek-channel__dot {
  width: 10px;
  height: 10px;
  box-shadow: 0 0 0 2px var(--ek-color-surface), 0 0 0 3px var(--ek-ch-border);
}
</style>
