<!--
  frontend/src/components/catalogPages/CatalogSplit.vue

  B7 — Kategoriler / Markalar ana-detay yerleşimi. Geniş kapta (≥ 920px, kap sorgusu) iki bölme yan yana, her biri
  kendi içinde kayar; dar kapta TEK bölme: seçim yokken liste, seçimde detay (üstte "← <liste adı>" geri bağlantısı).
  Liste bölmesi dar kapta gizlenirken DOM'da kalır (arama/açık düğümler/kaydırma korunur).
-->
<template>
  <div ref="hostRef" class="cat-split-host">
  <div class="cat-split" :class="{ 'is-detail': detailOpen }">
    <section class="cat-split__list" :aria-label="listLabel">
      <slot name="list" />
    </section>
    <section class="cat-split__detail" :aria-label="detailLabel">
      <button v-if="detailOpen" type="button" class="cat-split__back" @click="emit('back')">
        <v-icon :icon="icons.back" size="18" aria-hidden="true" />
        <span>{{ backLabel }}</span>
      </button>
      <slot name="detail" />
    </section>
  </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { icons } from '@/design/icons'

/** Kap sorgusuyla AYNI eşik: altında tek bölme. */
const SPLIT_AT = 920

defineProps<{ detailOpen: boolean; listLabel: string; detailLabel: string; backLabel: string }>()
const emit = defineEmits<{ back: []; 'update:narrow': [narrow: boolean] }>()

const hostRef = ref<HTMLElement | null>(null)
const { width } = useElementSize(hostRef)
const narrow = computed(() => width.value > 0 && width.value < SPLIT_AT)
watch(narrow, (v) => emit('update:narrow', v), { immediate: true })
</script>

<style scoped>
.cat-split-host {
  container-type: inline-size;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.cat-split {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ek-space-4);
  min-height: 0;
}

.cat-split__list,
.cat-split__detail {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.cat-split__detail {
  gap: var(--ek-space-4);
}

.cat-split__back {
  display: none;
}

/* Dar kap: tek bölme. */
@container (max-width: 919px) {
  .cat-split.is-detail .cat-split__list {
    display: none;
  }

  .cat-split:not(.is-detail) .cat-split__detail {
    display: none;
  }

  .cat-split__back {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: var(--ek-space-1);
    min-height: var(--ek-control-h-sm);
    padding: 0 var(--ek-space-2) 0 var(--ek-space-1);
    border: 0;
    border-radius: var(--ek-radius-control);
    background: transparent;
    color: var(--ek-color-action);
    font-size: var(--ek-type-label-size);
    font-weight: var(--ek-type-label-weight);
    cursor: pointer;
    transition: var(--ek-transition-colors);
  }

  .cat-split__back:hover {
    background: var(--ek-color-action-subtle);
    color: var(--ek-color-action-emphasis);
  }

  .cat-split__back:focus-visible {
    outline: none;
    box-shadow: var(--ek-focus-ring);
  }
}

@container (min-width: 920px) {
  .cat-split {
    grid-template-columns: minmax(360px, 5fr) minmax(0, 6fr);
    height: 100%;
  }

  .cat-split__list,
  .cat-split__detail {
    height: 100%;
  }

  .cat-split__detail {
    overflow-y: auto;
    padding-right: var(--ek-space-1);
    scrollbar-gutter: stable;
  }
}
</style>
