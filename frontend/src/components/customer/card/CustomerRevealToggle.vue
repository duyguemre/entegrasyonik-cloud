<!--
  A13 — KVKK "Kişisel verileri göster/gizle" anahtarı (kart başlığında tek kontrol, `aria-pressed`).
  Varsayılan kapalı (maskeli). Backend'de ayrı görüntüleme izni yok; izin gelirse çağıran `v-if` ile gizler.
-->
<template>
  <EkTooltip :text="label" :open-delay="400">
    <EkButton
      class="ek-cust-reveal"
      :class="{ 'ek-cust-reveal--on': modelValue }"
      tone="ghost"
      size="sm"
      :icon="modelValue ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
      :icon-only="compact"
      :aria-label="label"
      :aria-pressed="modelValue ? 'true' : 'false'"
      data-a13="reveal"
      @click="emit('update:modelValue', !modelValue)"
    ><template v-if="!compact">{{ label }}</template></EkButton>
  </EkTooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkTooltip from '@/components/ds/EkTooltip.vue'

const props = withDefaults(defineProps<{ modelValue: boolean; compact?: boolean }>(), { compact: false })
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const label = computed(() => (props.modelValue ? 'Kişisel verileri gizle' : 'Kişisel verileri göster'))
</script>

<style scoped>
.ek-cust-reveal--on {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}
</style>
