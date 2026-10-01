<!--
  packages/ui/src/components/EkChannelDot.vue

  Satış kanalı / entegrasyon göstergesi (geri uyumlu API). K13 (FR2 madde 11): rozet biçimli varyantlar artık TEK kanal
  rozetini (`EkChannelBadge`: koyu kenarlık + açık iç zemin + koyu metin) çizer — uygulamadaki her kanal rozeti aynı.
    variant="chip" | "filled"  → uzun rozet   [ Trendyol ]   (filled = eski "dolgulu marka" görünümü; K13 ile aynı rozete eşlendi)
    showName=false             → kısa rozet   [TY]           (ad `title` + ekran okuyucu)
    variant="plain"            → ● Trendyol   (rozet değil: metin içi, zeminsiz; nokta marka rengi + nötr halka)
  Renkler `.ek-ch-<kod>` kapsamından; tanımsız kod nötre düşer. Renk tek başına anlam taşımaz: ad her zaman erişilebilir.

  Kullanım:
    <EkChannelDot code="trendyol" />
    <EkChannelDot code="trendyol" :show-name="false" />
    <EkChannelDot code="trendyol" variant="plain" />
-->
<template>
  <span v-if="variant === 'plain' && showName" class="ek-channel ek-channel--plain" :class="channelClass(code)">
    <span class="ek-channel__dot" aria-hidden="true"></span>
    <span class="ek-channel__name">{{ label }}</span>
  </span>
  <EkChannelBadge v-else :code="code" :name="label" :form="showName ? 'long' : 'short'" size="sm" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { channelClass, channelName } from '../tokens/channels'
import EkChannelBadge from './EkChannelBadge.vue'

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
  color: inherit;
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
</style>
