<!--
  frontend/src/components/productDefinitions/products/ChannelStatusTile.vue

  FR2 madde 21 — tek kanalın durum karosu: kısa kanal rozeti (K13, `EkChannelBadge form="short"`) + sağ altta durum işareti.
    yayında ✓ (başarı) · hatalı ! (tehlike) · bekliyor ◷ (bilgi) · satışa kapalı ‖ (uyarı) · yok → pasif (kesik) rozet, işaret yok
    "Gönderime hazır" işaretli ama henüz gönderilmedi → aksiyon renginde ↑ işareti.
  Görsel yalnız; anlam `label` (ebeveynin erişilebilir adı / ipucu) ile taşınır — renk tek başına anlam taşımaz (işaret şekli farklı).
-->
<template>
  <span class="cst" :class="[`is-${status.key}`, { 'is-ready': status.ready }]" :data-channel-status="status.key" aria-hidden="true">
    <EkChannelBadge :code="status.code" :name="name" form="short" :size="size" :muted="status.key === 'none'" />
    <span v-if="marker" class="cst__mark" :class="`is-${marker.tone}`"><v-icon :icon="marker.icon" /></span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkChannelBadge } from '@entegrasyonik/ui/components'
import type { ProductChannelStatus } from './channelStatus'

const props = withDefaults(defineProps<{ status: ProductChannelStatus; name?: string; size?: 'xs' | 'sm' | 'md' }>(), { size: 'sm' })

const MARKS: Record<string, { tone: string; icon: string }> = {
  live: { tone: 'success', icon: 'mdi-check-bold' },
  failed: { tone: 'danger', icon: 'mdi-exclamation-thick' },
  waiting: { tone: 'info', icon: 'mdi-clock-outline' },
  offsale: { tone: 'warning', icon: 'mdi-pause' },
}

const marker = computed(() => MARKS[props.status.key] ?? (props.status.ready ? { tone: 'action', icon: 'mdi-arrow-up' } : null))
</script>

<style scoped>
.cst {
  position: relative;
  display: inline-flex;
  flex: none;
}

.cst :deep(.ek-chb) {
  min-width: 30px;
}

.cst__mark {
  position: absolute;
  right: -5px;
  bottom: -5px;
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: var(--ek-radius-full);
  box-shadow: 0 0 0 2px var(--ek-color-surface);
}

.cst__mark .v-icon {
  font-size: 10px;
}

.cst__mark.is-success { background: var(--ek-color-success); color: var(--ek-color-success-contrast); }
.cst__mark.is-danger { background: var(--ek-color-error); color: var(--ek-color-error-contrast); }
.cst__mark.is-info { background: var(--ek-color-info); color: var(--ek-color-info-contrast); }
.cst__mark.is-warning { background: var(--ek-color-warning); color: var(--ek-color-warning-contrast); }
.cst__mark.is-action { background: var(--ek-color-action); color: var(--ek-color-action-contrast); }
</style>
