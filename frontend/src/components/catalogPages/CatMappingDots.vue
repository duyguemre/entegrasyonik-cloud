<!--
  frontend/src/components/catalogPages/CatMappingDots.vue

  B7 — pazaryeri eşleme göstergesi (yalnız Kategoriler / Markalar sayfaları). Platform başına nokta: eşli = kanal
  renginde DOLU nokta, eşli değil = boş halka (nötr). Renk tek başına anlam taşımaz: yanında "2/3" metni
  (`showCount`), ipucunda ve ekran okuyucu metninde platform platform döküm.
-->
<template>
  <EkTooltip :text="tooltip" :open-delay="350">
    <span class="cat-dots" :class="{ 'is-lg': size === 'lg' }" role="img" :aria-label="spoken">
      <span v-for="s in states" :key="s.code" class="cat-dots__dot" :class="[channelClass(s.code), s.mapped ? 'is-on' : 'is-off']" aria-hidden="true"></span>
      <span v-if="showCount && states.length" class="cat-dots__count ek-num" :class="{ 'is-full': mapped === states.length, 'is-none': mapped === 0 }" aria-hidden="true">
        {{ mapped }}/{{ states.length }}
      </span>
    </span>
  </EkTooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkTooltip from '@/components/ds/EkTooltip.vue'
import { channelClass } from '@/design/channels'
import { mappingSpoken, mappingSummary, type MappingState } from './catalogModel'

const props = withDefaults(defineProps<{ states: MappingState[]; showCount?: boolean; size?: 'md' | 'lg' }>(), { showCount: true, size: 'md' })

const mapped = computed(() => props.states.filter((s) => s.mapped).length)
const spoken = computed(() => `Pazaryeri eşlemesi: ${mappingSummary(props.states)}. ${mappingSpoken(props.states)}`)
const tooltip = computed(() => props.states.map((s) => `${s.mapped ? '●' : '○'} ${s.name} — ${s.mapped ? 'eşli' : 'eşlenmedi'}`).join(' · '))
</script>

<style scoped>
.cat-dots {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 3px;
}

.cat-dots__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  box-sizing: border-box;
}

.cat-dots.is-lg .cat-dots__dot {
  width: 10px;
  height: 10px;
}

.cat-dots__dot.is-on {
  background: var(--ek-ch-solid);
}

.cat-dots__dot.is-off {
  border: 1.5px solid var(--ek-color-border-strong);
  background: transparent;
}

.cat-dots__count {
  min-width: 26px;
  margin-left: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-align: right;
}

.cat-dots__count.is-full {
  color: var(--ek-color-success-emphasis);
}
</style>
