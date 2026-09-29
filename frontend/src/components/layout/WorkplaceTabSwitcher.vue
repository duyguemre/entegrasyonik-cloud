<template>
  <v-list density="compact" role="listbox" aria-label="Açık sekmeler" class="tab-switcher-list py-1">
    <v-list-item v-for="element in tabSelectors" :key="element.id" role="option"
      :aria-selected="isActive(element)" class="tab-switcher-item" :class="{ 'tab-switcher-item--active': isActive(element) }"
      @click="$emit('select', element)">
      <template #prepend>
        <v-icon size="18" class="mr-2">{{ iconOf(element) }}</v-icon>
      </template>
      <v-list-item-title class="text-body-2">{{ titleOf(element) }}</v-list-item-title>
      <template #append v-if="idOf(element) !== 0">
        <v-btn icon size="x-small" variant="text" :aria-label="`Sekmeyi kapat: ${titleOf(element)}`"
          @click.stop="$emit('close', element)">
          <v-icon size="16">mdi-close</v-icon>
        </v-btn>
      </template>
    </v-list-item>

    <v-divider v-if="tabSelectors.length > 1" class="my-1" />
    <v-list-item v-if="tabSelectors.length > 1" density="compact" class="tab-switcher-close-all"
      @click="$emit('close-all')">
      <v-list-item-title class="text-caption text-center font-weight-medium">Tümünü Kapat</v-list-item-title>
    </v-list-item>
  </v-list>
</template>

<script lang="ts" setup>
// ADR-0012 Karar 5 — masaüstü/tablet "tüm sekmeler" taşma menüsü VE mobil sekme değiştirici
// (`v-bottom-sheet`) tarafından PAYLAŞILAN liste. Kabuk gezinme altyapısının parçasıdır (T4a).
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  tabSelectors: any[]
  activeCode: string | undefined
}>()
defineEmits<{ select: [element: any]; close: [element: any]; 'close-all': [] }>()

const { t } = useI18n({ useScope: 'global' })

const linkOf = (element: any) => (element.list ? element.selectedTabSelector.link : element.link)
const idOf = (element: any) => (element.list ? element.selectedTabSelector.id : element.id)
const iconOf = (element: any) => linkOf(element)?.icon || 'mdi-view-grid-outline'
const titleOf = (element: any) => {
  const link = linkOf(element)
  if (!link) return ''
  return link.singleton == false ? link.title : t(link.fullPath)
}
const isActive = (element: any) => linkOf(element)?.code === props.activeCode
</script>

<style scoped>
.tab-switcher-list {
  min-width: 240px;
  max-width: 320px;
}

.tab-switcher-item {
  min-height: 44px !important;
  cursor: pointer;
}

.tab-switcher-item--active {
  background-color: var(--ek-color-surface-muted);
  font-weight: var(--ek-font-weight-semibold);
}

.tab-switcher-close-all {
  min-height: 40px !important;
  cursor: pointer;
}
</style>
