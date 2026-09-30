<!--
  frontend/src/components/ds/EkPagerBar.vue

  DS-v2 — sayfalama çubuğu; liste çerçevesinin ALTINA SABİTTİR (tablo
  kayarken yerinde kalır). Üç bölge:
    sol: sayfa boyutu seçici + "n kayıt" · orta: ‹ 1 2 3 … 9 › · sağ: #trailing (ör. Dışa aktar)
  Etkin sayfa `aria-current="page"`; önceki/sonraki devre dışıyken de adlandırılmış.
  Mobilde orta bölge üstte tam genişlik, sol/sağ altta.
-->
<template>
  <nav class="ek-pager" :aria-label="label">
    <div class="ek-pager__start">
      <label class="ek-pager__size">
        <span class="ek-sr-only">Sayfa başına kayıt</span>
        <select class="ek-pager__select" :value="pageSize" @change="onSize">
          <option v-for="n in sizeOptions" :key="n" :value="n">{{ n }}</option>
        </select>
        <v-icon class="ek-pager__select-icon" icon="mdi-chevron-down" aria-hidden="true" />
      </label>
      <span class="ek-pager__total">
        <strong>{{ formatNumber(total) }}</strong> kayıt
        <span v-if="total" class="ek-pager__range">· {{ rangeText }}</span>
      </span>
    </div>
    <div class="ek-pager__pages">
      <button type="button" class="ek-pager__btn" :disabled="page <= 1" aria-label="Önceki sayfa" @click="go(page - 1)">
        <v-icon icon="mdi-chevron-left" aria-hidden="true" />
      </button>
      <template v-for="(p, i) in items" :key="`${p}-${i}`">
        <span v-if="p === 'gap'" class="ek-pager__gap" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          class="ek-pager__btn ek-pager__btn--num"
          :class="{ 'is-current': p === page }"
          :aria-current="p === page ? 'page' : undefined"
          :aria-label="`Sayfa ${p}`"
          @click="go(p)"
        >
          {{ p }}
        </button>
      </template>
      <button type="button" class="ek-pager__btn" :disabled="page >= pageCount" aria-label="Sonraki sayfa" @click="go(page + 1)">
        <v-icon icon="mdi-chevron-right" aria-hidden="true" />
      </button>
    </div>
    <div class="ek-pager__end"><slot name="trailing" /></div>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber } from '../format'

const props = withDefaults(
  defineProps<{
    page: number
    pageSize: number
    total: number
    pageSizeOptions?: number[]
    label?: string
  }>(),
  { pageSizeOptions: () => [10, 25, 50, 100], label: 'Sayfalama' },
)

const emit = defineEmits<{ 'update:page': [page: number]; 'update:pageSize': [size: number] }>()

/** Standart boyutlar 10/25/50/100 (tüm listeler). Dışarıdan standart dışı bir boyut gelirse seçici boş görünmesin diye eklenir (tests/page-size-standard.test.ts ekranların standart dışı değer kullanmasını engeller). */
const sizeOptions = computed(() => [...new Set([...props.pageSizeOptions, props.pageSize])].sort((a, b) => a - b))

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const rangeText = computed(() => {
  const from = (props.page - 1) * props.pageSize + 1
  const to = Math.min(props.total, props.page * props.pageSize)
  return `${formatNumber(from)}–${formatNumber(to)}`
})

/** 1 … (p-1) p (p+1) … N — en fazla 7 öğe. */
const items = computed<Array<number | 'gap'>>(() => {
  const n = pageCount.value
  const p = props.page
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1)
  const set = [1, n, p - 1, p, p + 1].filter((x) => x >= 1 && x <= n)
  if (p <= 3) set.push(2, 3, 4)
  if (p >= n - 2) set.push(n - 1, n - 2, n - 3)
  const sorted = [...new Set(set)].sort((a, b) => a - b)
  const out: Array<number | 'gap'> = []
  sorted.forEach((x, i) => {
    if (i > 0 && x - sorted[i - 1] > 1) out.push('gap')
    out.push(x)
  })
  return out
})

function go(p: number) {
  if (p >= 1 && p <= pageCount.value && p !== props.page) emit('update:page', p)
}

function onSize(event: Event) {
  emit('update:pageSize', Number((event.target as HTMLSelectElement).value))
}
</script>

<style scoped>
.ek-pager {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ek-space-4);
  min-height: 52px;
  padding: var(--ek-space-2) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
}

.ek-pager__start,
.ek-pager__end {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
}

.ek-pager__end {
  justify-content: flex-end;
}

.ek-pager__size {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.ek-pager__select {
  height: var(--ek-control-h-sm);
  padding: 0 var(--ek-space-8) 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-input);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  appearance: none;
  cursor: pointer;
}

.ek-pager__select:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-pager__select-icon {
  position: absolute;
  right: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
  pointer-events: none;
}

.ek-pager__total {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  white-space: nowrap;
}

.ek-pager__total strong {
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.ek-pager__range {
  font-variant-numeric: tabular-nums;
}

.ek-pager__pages {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.ek-pager__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--ek-control-h-sm);
  height: var(--ek-control-h-sm);
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-pager__btn :deep(.v-icon) {
  font-size: var(--ek-icon-md);
}

.ek-pager__btn:hover:not(:disabled):not(.is-current) {
  border-color: var(--ek-color-border-input);
  background: var(--ek-color-surface-sunken);
}

.ek-pager__btn:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-pager__btn.is-current {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  box-shadow: var(--ek-shadow-card);
}

.ek-pager__btn:disabled {
  color: var(--ek-color-content-subtle);
  background: transparent;
  border-color: transparent;
  cursor: not-allowed;
}

.ek-pager__gap {
  min-width: 20px;
  color: var(--ek-color-content-muted);
  text-align: center;
}

@media (max-width: 767px) {
  .ek-pager {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--ek-space-2) var(--ek-space-3);
  }

  .ek-pager__pages {
    grid-column: 1 / -1;
    grid-row: 1;
    justify-content: center;
  }

  .ek-pager__range {
    display: none;
  }
}
</style>
