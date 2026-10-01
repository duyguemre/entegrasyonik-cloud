<!--
  BoViewSwitch — GÖRÜNÜM DEĞİŞTİRİCİ (BO2-70). Aynı verinin iki yoğunluğu (ör. "Özet" / "Ayrıntılı") arasında geçiş;
  değer URL'de `?gorunum=` (varsayılan yazılmaz). Sekmeden farkı: içerik aynı, sunum farklı. Görsel dil `BoSegmented`.

    <BoViewSwitch v-model="view" :options="[{ value: 'ozet', label: 'Özet' }, { value: 'ayrinti', label: 'Ayrıntılı' }]" />
-->
<template>
  <BoSegmented :model-value="current" :options="options" :label="label" data-bo-view-switch @update:model-value="set" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BoSegmented, { type BoSegmentOption } from './BoSegmented.vue'

const props = withDefaults(defineProps<{ options: Array<BoSegmentOption<string>>; modelValue?: string; label?: string; query?: string }>(), {
  label: 'Görünüm',
  query: 'gorunum',
})
const emit = defineEmits<{ 'update:modelValue': [v: string] }>()
const route = useRoute()
const router = useRouter()

const fallback = computed(() => props.options[0]?.value ?? '')
const current = computed(() => {
  const v = route.query[props.query]
  if (typeof v === 'string' && props.options.some((o) => o.value === v)) return v
  return props.modelValue ?? fallback.value
})

function set(v: string) {
  emit('update:modelValue', v)
  void router.replace({ query: { ...route.query, [props.query]: v === fallback.value ? undefined : v } })
}
</script>
