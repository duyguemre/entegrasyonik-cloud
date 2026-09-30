<template>
  <template v-for="(category, index) of categories" :key="category._id">

    <div v-if="category.isMain == true" class="mt-1">
      <div class="d-flex">

 <v-form v-model="topLevelCategoryForm" class="category-tree__form" @keydown.enter.prevent @submit.prevent>
          <v-text-field type="tel" maxlength="160" counter clearable
            :hint="$t('productDefinitions.category.subcategoryDesc')" class="ek-cat-add"
            v-model="topLevelCategoryName" :rules="titleRules"
            @keyup.enter="emits('addCategory', { parentId: category._id, title: topLevelCategoryName }); topLevelCategoryName = undefined">
            <template v-slot:label>
              <span class="font-ital1ic font-weight-light">{{ $t('productDefinitions.category.subcategoryName')
                }}</span>
            </template>
            <template v-slot:append-inner>
              <EkButton tone="primary" size="sm" icon="mdi-plus" icon-only aria-label="Alt kategori ekle"
                :disabled="!topLevelCategoryForm || topLevelCategoryName == undefined"
                @click="emits('addCategory', { parentId: category._id, title: topLevelCategoryName }); topLevelCategoryName = undefined" />
            </template>
          </v-text-field>
        </v-form>
      </div>
    </div>

    <div :class="[category.level == 0 ? '' : 'ml-12 mr-2', level % 2 == 0 ? 'is-even' : 'is-odd']"
      v-if="category.isMain != true && (!category.isHidden || category.isHidden == false)"
      class="mb-2 category-menu ek-cat-row">
      <v-list-group :value="category._id" @click="eventBus.emit('pageResize', '')"
        :class="{ 'is-dragging': draggingCategory && draggingCategory._id == category._id }">
        <template v-slot:activator="{ props, isOpen }">
          <v-list-item v-bind="props" :prepend-icon="category.icon" :value="category._id" draggable="true"
            @drag="drag($event)" @drop.stop="drop(draggingCategory, category)" @dragend.stop="dragend"
            @dragover="category.isDropPossible ? $event.preventDefault() : 0" @dragstart="dragstart($event, category)"
            class="pt-0 pb-0  pl-2 mb-0 pr-0  elevation-0 category-list-item"
            :class="['ek-cat-item', (category.isDropPossible = isDropPossible(draggingCategory, category)) ? 'drop-is-possible' : 'drop-is-not-possible', (category.isOpen = isOpen) ? '' : '']">
            <template v-slot:prepend="{ isSelected, isActive }">
              <div class="ek-cat-order ek-num" :class="{ 'is-drop': (category.isOrderDropPossible = isOrderDropPossible(draggingCategory, category)) }"
                @drop.stop="dropForOrder(draggingCategory, category)" @dragover.prevent> {{
                  category.level == 0 ?index:index+1 }}
                <v-icon size="16" :class="{ 'ek-cat-muted': !category.isOrderDropPossible }">mdi-swap-vertical</v-icon>
              </div>
            </template>
            <div class="pt-3 pb-3">
              <v-tooltip :text="constructBreadcrumb(category)">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" :icon="category.children.length > 0 ? 'mdi-folder-outline' : 'mdi-tag-outline'" size="18" class="mr-2 ek-cat-muted" />
                </template>
              </v-tooltip>
              <span :class="category.children.length>0?[]:['font-weight-bold']">
              {{ category.title }}
            </span>
              <span class="text-caption">({{ category.children.filter((item: any) => !item.isHidden
                ||
                item.isHidden==false ).length }}) </span>
              <v-icon v-if="category.isDropPossible" class="ml-2 ek-cat-muted">mdi-arrow-down-thin</v-icon>
              <v-icon v-else-if="draggingCategory" class="ml-2 ek-cat-muted">mdi-cancel</v-icon>
            </div>
            <template v-slot:append="{ isSelected, isActive }">
              <v-list-item-action end>
                <EkButton tone="ghost" size="sm" icon="mdi-cog-outline" icon-only :aria-label="`${category.title} ayarları`"
                  @click.stop="openCategorySync(category)" />

              </v-list-item-action>
            </template>
          </v-list-item>
        </template>
        <template v-if="category.isOpen">
          <div>&nbsp;</div>
          <CategoryTreeComponent :categories="category.children" :level="level + 1" @startEdit="startEdit($event)"
            @addCategory="addCategory($event)" @openCategorySync="openCategorySync($event)" @update="update()"
            @setDraggingCategory="setDraggingCategory($event)" @move="move($event)" @changeOrder="changeOrder($event)"
            :draggingCategory="draggingCategory" />
          <div class="ml-12">
            <div class="d-flex">
              <v-form v-model="category.form" class="category-tree__form" @keydown.enter.prevent @submit.prevent>
                <v-text-field type="tel" maxlength="160" counter clearable
                  :hint="$t('productDefinitions.category.subcategoryDesc')" class="mr-2 ek-cat-add"
                  v-model="category.newTitle" :rules="titleRules"
                  @keyup.enter="emits('addCategory', { parentId: category._id, title: category.newTitle })">
                  <template v-slot:label>
                    <span>{{ category.title }} <v-icon size="small" class="ek-cat-muted">mdi-arrow-right</v-icon>
                      {{ $t('productDefinitions.category.subcategoryName') }}</span>
                  </template>
                  <template v-slot:append-inner>
                    <EkButton tone="primary" size="sm" icon="mdi-plus" icon-only aria-label="Alt kategori ekle"
                      :disabled="!category.form || category.newTitle == undefined"
                      @click="emits('addCategory', { parentId: category._id, title: category.newTitle })" />
                  </template>
                </v-text-field>
              </v-form>
            </div>
          </div>
        </template>
      </v-list-group>
    </div>
  </template>
</template>

<script lang="ts" setup>
import { inject, ref, onBeforeUnmount } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
import { useI18n } from 'vue-i18n';

var props = defineProps<{
  categories: any,
  level: number,
  draggingCategory: any
}>()

const selectedCategoryId:any = ref(-1)
const { t } = useI18n()
const titleRules = [
  (v: any) => !!v || (!v && v === 0) || t("rules.mandatory"),
  (v: string) => !((v != null && v.length > 0) && (v != null && (v.length < 2 || v.length > 160))) || t("rules.2_160characters"),
]
const eventBus: any = inject('eventBus')
const emits = defineEmits(['update', 'setDraggingCategory', 'startEdit', 'addCategory', 'move', 'changeOrder', 'openCategorySync'])
const topLevelCategoryName = ref()
const topLevelCategoryForm = ref()
const isDropPossibleToTop = ref(false)
var outerDragDiv: any = undefined


onBeforeUnmount(() => {
  topLevelCategoryName.value = undefined
  topLevelCategoryForm.value = undefined
  outerDragDiv = undefined
})

const constructBreadcrumb = (category: any) => {
  if (!category.breadcrumb) return category.title
  return category.breadcrumb.join(' > ')
}

const startEdit = (ec: any) => {
  emits('startEdit', ec)
}

const openCategorySync = (cs: any) => {
  const cloneCategory = JSON.parse(JSON.stringify(cs))  
/*   { _id: category._id, title: category.title, choiceIds:category.choiceIds,mainChoiceId:category.mainChoiceId,platforms:category.platforms, numberOfSubCategories:category.children?.length } */

selectedCategoryId.value = cs._id
  emits('openCategorySync', cloneCategory)
}

const addCategory = (ac: any) => {
  emits('addCategory', ac)
}

const update = () => {
  emits('update')
}

const setDraggingCategory = (dc: any) => {
  emits('setDraggingCategory', dc)
}

const move = (mc: any) => {
  emits('move', mc)
}

const changeOrder = (co: any) => {
  emits('changeOrder', co)
}

const isOrderDropPossible = (draggingCategory: any, category: any) => {
  return draggingCategory && draggingCategory._id != category._id && draggingCategory.parentId == category.parentId
}

const checkDraggingCategoryChildren = (children: any, categoryId: number) => {
  if (children && Array.isArray(children)) {
    for (let child of children) {
      if (child._id == categoryId) return false
      if (!checkDraggingCategoryChildren(child.children, categoryId)) return false
    }
  }
  return true
}

const isDropPossible = (draggingCategory: any, category: any) => {
  if (draggingCategory) {
    if (draggingCategory.parentId == category._id) {
      return false
    }
    if (draggingCategory._id != category._id) {
      return checkDraggingCategoryChildren(draggingCategory.children, category._id)
    } else {
      return false
    }
  } else {
    return false
  }
}

const dragend = (event: any) => {
  outerDragDiv.remove()
  emits('setDraggingCategory', undefined)
}

const dragstart = (event: any, category: any) => {
  emits('setDraggingCategory', category)

  outerDragDiv = document.createElement('div');
  outerDragDiv.classList.add('outer-drag-div');
  outerDragDiv.style.position = 'absolute'
  outerDragDiv.style.display = 'block'
  outerDragDiv.style.left = '-1000px'
  outerDragDiv.style.zIndex = '1000'
  outerDragDiv.textContent = category.title + ' (' + category.children.length + ')';

  const innerDragDiv = document.createElement('div');
  innerDragDiv.classList.add('inner-drag-div');
  innerDragDiv.textContent = '* Kategoriyi diğer kategorilerin altına taşıyabilirsiniz, ya da aynı seviye de sırasını değiştirebilirsiniz.';

  outerDragDiv.appendChild(innerDragDiv);
  document.body.appendChild(outerDragDiv);
  event.dataTransfer.setDragImage(new Image(), -15, 0);
}

const drag = (event: any) => {
  if (!outerDragDiv) return
  if (!event) return
  const dragX = (<any>event).clientX;
  const dragY = (<any>event).clientY;
  if (dragX == 0) {
    outerDragDiv.style.left = '-1000px'
    outerDragDiv.style.zIndex = '-1000'
  } else {
    outerDragDiv.style.left = 20 + dragX + "px"
    outerDragDiv.style.top = 5 + dragY + "px"
  }
}

const drop = (draggingCategory: any, category: any) => {
  const isDroppable = isDropPossible(draggingCategory, category)
  if (isDroppable)
    emits('move', category)
}

const dropForOrder = (draggingCategory: any, category: any) => {
  const isDroppable = isOrderDropPossible(draggingCategory, category)
  if (isDroppable)
    emits('changeOrder', category)
}
</script>

<style scoped>
.category-tree__form {
  display: contents;
}

.ek-cat-row {
  position: relative;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
}

.ek-cat-row.is-odd {
  background: var(--ek-color-surface-muted);
}

.ek-cat-row :deep(.is-dragging) {
  background: var(--ek-color-action-subtle);
}

.ek-cat-item {
  padding-inline-start: var(--ek-space-2) !important;
}

.ek-cat-order {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin-right: var(--ek-space-3);
  padding: 2px var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-cat-order.is-drop {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.ek-cat-muted {
  color: var(--ek-color-content-muted);
}

.ek-cat-add {
  margin-bottom: var(--ek-space-2);
}
</style>