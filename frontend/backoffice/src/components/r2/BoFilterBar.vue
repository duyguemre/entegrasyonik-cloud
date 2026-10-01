<!--
  BoFilterBar — TEK FİLTRE ÇUBUĞU (BO2-41). Her listede aynı yerleşim ve davranış:
    [arama] [segmentler / seçimler …] ……… [etkin süzgeç sayısı · Filtreleri temizle] [#trailing]
  - Süzgeç değişince liste baştan yüklenir ve değer URL'e yazılır (sayfanın işi; `useCursorList.reload` + router.replace).
  - "Filtreleri temizle" yalnız `active > 0` iken görünür; sözlükteki `clearFilters` eylemiyle (BO2-50).
  - < 768 px: alanlar tam genişlik, segmentler kendi satırında; yatay kaydırma yok (BO2-71).

    <BoFilterBar :active="activeCount" label="Denetim süzgeçleri" @clear="clearFilters">
      <template #search><v-text-field v-model="q" … /></template>
      <BoSegmented v-model="surface" … />
      <v-select v-model="event" … class="bo-filter__field" />
      <template #trailing><BoAction kind="export" … /></template>
    </BoFilterBar>
-->
<template>
  <div class="bo-filter" role="search" :aria-label="label" data-bo-filter>
    <div v-if="$slots.search" class="bo-filter__search"><slot name="search" /></div>
    <div class="bo-filter__fields"><slot /></div>
    <div v-if="active || $slots.trailing" class="bo-filter__end">
      <template v-if="active">
        <span class="bo-filter__count" aria-live="polite">{{ active }} süzgeç etkin</span>
        <BoAction kind="clearFilters" size="sm" data-testid="filters-clear" @click="emit('clear')" />
      </template>
      <slot name="trailing" />
    </div>
  </div>
</template>

<script setup lang="ts">
import BoAction from './BoAction.vue'

withDefaults(defineProps<{ label: string; active?: number }>(), { active: 0 })
const emit = defineEmits<{ clear: [] }>()
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
