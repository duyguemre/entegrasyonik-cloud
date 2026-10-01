<!--
  frontend/src/components/productDefinitions/products/ChannelStatusTile.vue

  FR3 madde 11 (FR2-21'in yerine) — tek kanalın durum işareti: kısa kanal rozeti (K13, `EkChannelBadge form="short"`) +
  HEMEN YANINDA durum glifi (rozetin üstüne binen küçük nokta değil). Glif `EkStatusChip` ton ailesinin emphasis renginde:
    yayında ✓ (başarı) · hatalı ! (tehlike) · bekliyor ◷ (bilgi) · satışa kapalı ‖ (uyarı)
    gönderilmedi ama "gönderime hazır" işaretli → soluk rozet + ↑ (aksiyon)
  Gönderilmemiş (ve hazır işaretsiz) kanal bu bileşenle çizilmez — hücre onları "+n" olarak sayar.
  Görsel yalnız; anlam ebeveynin erişilebilir adı / ipucu ile taşınır (renk tek başına anlam taşımaz — glif şekli farklı).
-->
<template>
  <span class="cst" :class="[`is-${status.key}`, { 'is-ready': status.ready }]" :data-channel-status="status.key" aria-hidden="true">
    <EkChannelBadge :code="status.code" :name="name" form="short" :size="size" :muted="status.key === 'none'" />
    <v-icon v-if="glyph" class="cst__glyph" :class="`is-${glyph.tone}`" :icon="glyph.icon" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkChannelBadge } from '@entegrasyonik/ui/components'
import type { ProductChannelStatus } from './channelStatus'

const props = withDefaults(defineProps<{ status: ProductChannelStatus; name?: string; size?: 'xs' | 'sm' | 'md' }>(), { size: 'xs' })

const GLYPHS: Record<string, { tone: string; icon: string }> = {
  live: { tone: 'success', icon: 'mdi-check-circle' },
  failed: { tone: 'danger', icon: 'mdi-alert-circle' },
  waiting: { tone: 'info', icon: 'mdi-clock-outline' },
  offsale: { tone: 'warning', icon: 'mdi-pause-circle' },
}

const glyph = computed(() => GLYPHS[props.status.key] ?? (props.status.ready ? { tone: 'action', icon: 'mdi-arrow-up-circle' } : null))
</script>

<style scoped>
.cst {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
}

.cst :deep(.ek-chb) {
  min-width: 28px;
}

.cst__glyph {
  font-size: var(--ek-icon-sm);
}

.cst__glyph.is-success { color: var(--ek-color-success-emphasis); }
.cst__glyph.is-danger { color: var(--ek-color-error-emphasis); }
.cst__glyph.is-info { color: var(--ek-color-info-emphasis); }
.cst__glyph.is-warning { color: var(--ek-color-warning-emphasis); }
.cst__glyph.is-action { color: var(--ek-color-action); }
</style>
