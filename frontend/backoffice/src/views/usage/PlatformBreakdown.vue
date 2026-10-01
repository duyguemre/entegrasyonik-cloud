<!--
  MOB-08 — platform kırılımı: ANA kırılım masaüstü / mobil (+ belirlenemedi) her zaman görünür; alt türler (tarayıcı, PWA,
  Android uygulaması, Electron) açılır ayrıntıda. Değerler metin olarak okunur (MeterList); renk tek başına anlam taşımaz.
-->
<template>
  <div class="bo-pb">
    <MeterList :label="`${label}: masaüstü ve mobil`" :rows="classRows" :max="max" />
    <details class="bo-pb__more" :open="openSub || undefined" data-testid="platform-subtypes">
      <summary>Alt türler <span class="bo-muted">(tarayıcı, kurulu uygulama, Android, masaüstü uygulaması)</span></summary>
      <MeterList :label="`${label}: alt türler`" :rows="subRows" :max="max" />
    </details>
    <p v-if="note" class="bo-muted bo-pb__note">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CLIENT_PLATFORMS, PLATFORM_CLASSES_UI } from './platformOrder'
import MeterList, { type MeterRow } from '@bo/components/kit/MeterList.vue'
import type { ByClass, ByPlatform } from '@bo/api/contract'
import { CLIENT_PLATFORM, PLATFORM_CLASS } from '@bo/utils/labels'
import { formatCount } from '@bo/utils/units'

const props = defineProps<{ byClass: ByClass; byPlatform: ByPlatform; label: string; unit?: string; note?: string; openSub?: boolean }>()
const max = computed(() => Math.max(1, ...Object.values(props.byClass), ...Object.values(props.byPlatform)))
const shown = (n: number) => `${formatCount(n)}${props.unit ? ` ${props.unit}` : ''}`

const classRows = computed<MeterRow[]>(() =>
  PLATFORM_CLASSES_UI.filter((c) => c !== 'unknown' || props.byClass.unknown > 0).map((c) => ({
    key: c, label: PLATFORM_CLASS[c].label, value: props.byClass[c], display: shown(props.byClass[c]), tone: PLATFORM_CLASS[c].tone, dot: true,
  })),
)
const subRows = computed<MeterRow[]>(() =>
  CLIENT_PLATFORMS.map((p) => ({
    key: p, label: CLIENT_PLATFORM[p].label, value: props.byPlatform[p], display: shown(props.byPlatform[p]), tone: PLATFORM_CLASS[CLIENT_PLATFORM[p].cls].tone, dot: true,
  })),
)
</script>

<style scoped>
.bo-pb {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}
.bo-pb__more summary {
  min-height: 32px;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
}
.bo-pb__more summary:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); border-radius: var(--ek-radius-md); }
.bo-pb__more[open] summary { margin-bottom: var(--ek-space-2); }
.bo-pb__note { margin: 0; font-size: var(--ek-type-caption-size); }
</style>
