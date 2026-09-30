<!--
  frontend/src/components/catalogPages/CatCoverage.vue

  B7 — platform başına eşleme kapsaması (genel bakış). Satır: kanal noktası + ad · "9 / 33" · yüzde; altında 4px çubuk
  (kanal renginde dolgu, nötr iz). Değerler metin olarak da yazılır (renk tek başına anlam taşımaz).
-->
<template>
  <ul class="cat-cov" :aria-label="label">
    <li v-for="row in rows" :key="row.code" class="cat-cov__row" :class="channelClass(row.code)">
      <div class="cat-cov__head">
        <span class="cat-cov__name"><span class="cat-cov__dot" aria-hidden="true"></span>{{ row.name }}</span>
        <span class="cat-cov__value ek-num">
          <strong>{{ row.mapped }}</strong> / {{ row.total }} {{ unit }}
          <span class="cat-cov__pct">· %{{ pct(row) }}</span>
        </span>
      </div>
      <progress class="cat-cov__track" :value="row.mapped" :max="Math.max(row.total, 1)"
        :aria-label="`${row.name}: ${row.total} ${unit} içinden ${row.mapped} eşli`"></progress>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { channelClass } from '@/design/channels'

defineProps<{ rows: Array<{ code: string; name: string; mapped: number; total: number }>; unit: string; label: string }>()
const pct = (r: { mapped: number; total: number }) => (r.total ? Math.round((r.mapped / r.total) * 100) : 0)
</script>

<style scoped>
.cat-cov {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cat-cov__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ek-space-1) var(--ek-space-3);
  margin-bottom: var(--ek-space-2);
}

.cat-cov__name {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
}

.cat-cov__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-solid);
}

.cat-cov__value {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.cat-cov__value strong {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.cat-cov__track {
  display: block;
  width: 100%;
  height: 4px;
  overflow: hidden;
  border: 0;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-ch-solid);
  appearance: none;
}

.cat-cov__track::-webkit-progress-bar {
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-border-subtle);
}

.cat-cov__track::-webkit-progress-value {
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-solid);
  transition: width var(--ek-duration-slow) var(--ek-easing-standard);
}

.cat-cov__track::-moz-progress-bar {
  border-radius: var(--ek-radius-chip);
  background: var(--ek-ch-solid);
}
</style>
