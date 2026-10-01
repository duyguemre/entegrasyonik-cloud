<!--
  BoFilterBar — TEK FİLTRE ÇUBUĞU (BO2-41). Her listede aynı yerleşim ve davranış:
    [arama] [segmentler / seçimler …] ……… [etkin süzgeç sayısı · Filtreleri temizle] [#trailing]
  - Süzgeç değişince liste baştan yüklenir ve değer URL'e yazılır (sayfanın işi; `useCursorList.reload` + router.replace).
  - "Filtreleri temizle" yalnız `active > 0` iken görünür; sözlükteki `clearFilters` eylemiyle (BO2-50).
  - < 768 px: alanlar tam genişlik, segmentler kendi satırında; yatay kaydırma yok (BO2-71).
  - bo-wdg: sayaç canlı bölgesi kalıcıdır (yalnız metin değişir → ilk süzgeç de duyurulur); "Filtreleri temizle" kendini
    kaldırdığı için odak aramaya (yoksa ilk alana) taşınır.

    <BoFilterBar :active="activeCount" label="Denetim süzgeçleri" @clear="clearFilters">
      <template #search><v-text-field v-model="q" … /></template>
      <BoSegmented v-model="surface" … />
      <v-select v-model="event" … class="bo-filter__field" />
      <template #trailing><BoAction kind="export" … /></template>
    </BoFilterBar>
-->
<template>
  <div ref="root" class="bo-filter" role="search" :aria-label="label" data-bo-filter>
    <span class="ek-sr-only" aria-live="polite" data-testid="filters-live">{{ active ? `Etkin süzgeç sayısı: ${active}` : cleared ? 'Etkin süzgeç yok' : '' }}</span>
    <div v-if="$slots.search" class="bo-filter__search"><slot name="search" /></div>
    <div class="bo-filter__fields"><slot /></div>
    <div v-if="active || $slots.trailing" class="bo-filter__end">
      <template v-if="active">
        <!-- Görünür sayaç; ekran okuyucu aynı metni yukarıdaki kalıcı canlı bölgeden alır (çift okuma yok). -->
        <span class="bo-filter__count" aria-hidden="true">{{ active }} süzgeç etkin</span>
        <BoAction kind="clearFilters" size="sm" data-testid="filters-clear" @click="onClear" />
      </template>
      <slot name="trailing" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import BoAction from './BoAction.vue'

const props = withDefaults(defineProps<{ label: string; active?: number }>(), { active: 0 })
const emit = defineEmits<{ clear: [] }>()

const root = ref<HTMLElement | null>(null)
/** Bir kez süzgeç etkinleşti mi — 0'a dönüş "Süzgeç etkin değil" diye duyurulur, ilk açılışta sessiz. */
const cleared = ref(false)
watch(
  () => props.active,
  (n, prev) => {
    if (!n && prev) cleared.value = true
  },
)

// Gezici tabindex'li segmentte (`tabindex=-1` seçenekler) yalnız sekme durağı olan seçenek alınır.
const FOCUSABLE = ':is(input:not([type="hidden"]), select, textarea, button):not([disabled]):not([tabindex="-1"]), [tabindex="0"]'
function onClear() {
  emit('clear')
  void nextTick(() => {
    const el = root.value
    const target = el?.querySelector<HTMLElement>(`.bo-filter__search :is(${FOCUSABLE})`) ?? el?.querySelector<HTMLElement>(`.bo-filter__fields :is(${FOCUSABLE})`)
    target?.focus()
  })
}
</script>

<style scoped>
.bo-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
}

.bo-filter__search {
  flex: 1 1 260px;
  max-width: 360px;
  min-width: 0;
}

.bo-filter__fields {
  /* Esnek taban: alanlar arama ile aynı satırda kalır, sığmazsa kendi içinde sarar (bütün grup alt satıra düşmez). */
  display: flex;
  flex: 1 1 320px;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
}

.bo-filter__fields :deep(.v-input) {
  flex: 0 1 200px;
  min-width: 150px;
}

.bo-filter__end {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin-left: auto;
}

.bo-filter__count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

@media (max-width: 767px) {
  .bo-filter__search {
    flex-basis: 100%;
    max-width: none;
  }

  .bo-filter__fields,
  .bo-filter__fields :deep(.v-input) {
    flex: 1 1 100%;
  }

  .bo-filter__end {
    margin-left: 0;
  }
}
</style>
