<!--
  frontend/src/components/ds/EkTooltip.vue

  DS-v2 — ipucu. Ters yüzey (surface-inverse) + caption tipografisi +
  isteğe bağlı kısayol (EkKbd). Tetikleyici varsayılan slot'tur; ipucu
  tetikleyiciye `aria-describedby` ile bağlanır (Vuetify v-tooltip).
  Yalnız-ikon düğmelerde `aria-label` ZORUNLU kalır — tooltip onun yerine geçmez.

    <EkTooltip text="Filtreleri temizle" :shortcut="['Alt', 'C']">
      <EkButton tone="ghost" icon="mdi-filter-remove-outline" icon-only aria-label="Filtreleri temizle" />
    </EkTooltip>
-->
<template>
  <span v-if="inline" class="ek-tooltip-inline">
    <span class="ek-tooltip__anchor"><slot /></span>
    <span class="ek-tooltip-inline__bubble" role="tooltip">
      <span>{{ text }}</span>
      <EkKbd v-if="shortcut" :keys="shortcut" tone="inverse" />
    </span>
  </span>
  <!-- Aşama 6b: tembel (`eager=false`) — kapalı ipucu metni DOM'da kalmaz (erişilebilir ad/metin çiftlenmesi yok). -->
  <v-tooltip
    v-else v-model="shown" :location="location" :open-delay="openDelay" :eager="false" transition="fade-transition">
    <template #activator="{ props: activatorProps }">
      <!-- fe-polish: tetikleyiciye tıklanınca ipucu kapanır — tıklama bir katman (detay sayfası, diyalog) açtığında
           ipucu kapanmadan katmanın arkasında asılı kalıyordu (axe aria-tooltip-name). -->
      <span class="ek-tooltip__anchor" v-bind="activatorProps" @click.capture="shown = false">
        <slot />
      </span>
    </template>
    <span class="ek-tooltip__content">
      <span>{{ text }}</span>
      <EkKbd v-if="shortcut" :keys="shortcut" tone="inverse" />
    </span>
  </v-tooltip>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import EkKbd from './EkKbd.vue'

const props = withDefaults(
  defineProps<{
    text: string
    shortcut?: string | string[]
    location?: 'top' | 'bottom' | 'start' | 'end'
    openDelay?: number
    forceOpen?: boolean
    /** Yalnızca vitrin: ipucunu overlay'siz, tetikleyicinin altında statik çizer. */
    inline?: boolean
  }>(),
  { location: 'bottom', openDelay: 400, forceOpen: false, inline: false },
)

const open = ref(false)
/** `forceOpen` (vitrin) her zaman açık tutar; aksi hâlde Vuetify'ın hover/odak durumu. */
const shown = computed({
  get: () => props.forceOpen || open.value,
  set: (v: boolean) => { open.value = v },
})
</script>

<style scoped>
.ek-tooltip__anchor {
  display: inline-flex;
}

.ek-tooltip__content {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}
.ek-tooltip-inline {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-tooltip-inline__bubble {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-1) var(--ek-space-2);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-inverse);
  color: var(--ek-color-content-inverse);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-medium);
  box-shadow: var(--ek-shadow-raised);
  white-space: nowrap;
}
</style>
