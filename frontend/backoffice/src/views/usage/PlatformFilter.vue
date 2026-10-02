<!--
  MOB-08 — platform süzgeci: ana kırılım (Tümü / Masaüstü / Mobil) segment olarak; alt tür (PWA, Android uygulaması…)
  "Alt tür" seçiminden. Değer `PlatformFilter | null` (null = tümü). URL eşlemesi çağıranda (`?platform=`).
-->
<template>
  <div class="bo-pf">
    <BoSegmented :model-value="segValue" :options="MAIN" :label="label" @update:model-value="onMain" />
    <label class="bo-pf__sub">
      <span class="ek-sr-only">Alt tür</span>
      <select class="bo-pf__select" :value="subValue" data-testid="platform-subtype" @change="onSub(($event.target as HTMLSelectElement).value)">
        <option value="">Alt tür: tümü</option>
        <option v-for="p in SUBS" :key="p" :value="p">{{ CLIENT_PLATFORM[p].label }}</option>
      </select>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CLIENT_PLATFORMS, type ClientPlatform, type PlatformFilter } from '@entegrasyonik/ui/platform'
import { CLIENT_PLATFORM, PLATFORM_CLASS } from '@bo/utils/labels'
import BoSegmented, { type BoSegmentOption } from '@bo/components/r2/BoSegmented.vue'

const props = withDefaults(defineProps<{ modelValue: PlatformFilter | null; label?: string }>(), { label: 'Platform' })
const emit = defineEmits<{ 'update:modelValue': [PlatformFilter | null] }>()

const MAIN: Array<BoSegmentOption<string | null>> = [
  { value: 'all', label: 'Tümü' },
  { value: 'desktop', label: PLATFORM_CLASS.desktop.label, icon: PLATFORM_CLASS.desktop.icon },
  { value: 'mobile', label: PLATFORM_CLASS.mobile.label, icon: PLATFORM_CLASS.mobile.icon },
]
const SUBS: readonly ClientPlatform[] = CLIENT_PLATFORMS
const isSub = (v: PlatformFilter | null): v is ClientPlatform => v !== null && (SUBS as readonly string[]).includes(v)
/** Alt tür seçiliyken ana segmentte işaretli seçenek yoktur (süzgeç alt türdedir; seçim kutusu gösterir). */
const segValue = computed<string | null>(() => (isSub(props.modelValue) ? null : (props.modelValue ?? 'all')))
function onMain(v: string | null) {
  emit('update:modelValue', v === 'all' || v === null ? null : (v as PlatformFilter))
}
const subValue = computed(() => (isSub(props.modelValue) ? props.modelValue : ''))
function onSub(v: string) {
  emit('update:modelValue', v ? (v as ClientPlatform) : null)
}
</script>

<style scoped>
.bo-pf {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}
.bo-pf__select {
  height: 38px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font: inherit;
  font-size: var(--ek-type-label-size);
}
.bo-pf__select:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
</style>
