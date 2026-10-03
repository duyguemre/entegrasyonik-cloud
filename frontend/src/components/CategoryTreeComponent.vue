<template>
  <template v-for="(category, index) of categories" :style="{'background-color':level%2==0?'#eee':'#fff'}">



    <div v-if="category.isMain == true" class="mt-1">
      <div class="d-flex">
        <!--ana kategori-->
        <!--       <v-card
        :class="[(isDropPossibleToTop = isDropPossible(draggingCategory, { _id: 0, parentId: 0 })) ? 'drop-is-possible' : 'drop-is-not-possible']"
        @drop.stop="drop(draggingCategory, { _id: 0, parentId: 0 })" draggable="false" @dragend.stop="dragend"
        @dragover="isDropPossibleToTop ? $event.preventDefault() : 0" style="border:1px solid #ccc;height:43px"
        class="text-center justify-center align-center mr-4">
        <div class="font-weight-medium pt-2 pb-2">          
          
          <v-icon style="opacity:.6" class="mr-2 ml-2">mdi-shape</v-icon>Ana Kategori
          <v-icon v-if="isDropPossibleToTop" style="opacity:.6" class="mr-2">mdi-arrow-down-thin</v-icon>
          <v-icon v-else style="opacity:.6" class="mr-2">mdi-cancel</v-icon>
          <v-btn class="ml-2 mr-2 mt-0" density="comfortable" color="processButtonColor" min-width=0 @click.stop="openCategorySync(category)"><span
                    class="">
                    <v-icon size="large" style="opacity:1" btn color="">mdi-cog-sync-outline</v-icon>
                  </span></v-btn>

        </div>
      </v-card>
 --> 
      
 <v-form v-model="topLevelCategoryForm" style="display:contents" @keydown.enter.prevent @submit.prevent>
          <v-text-field variant="outlined" density="compact" type="tel" maxlength="160" counter clearable 
            bg-color="textfieldColor" :hint="$t('productDefinitions.category.subcategoryDesc')" class="customTextField"
            v-model="topLevelCategoryName" :rules="titleRules"
            @keyup.enter="emits('addCategory', { parentId: category._id, title: topLevelCategoryName }); topLevelCategoryName = undefined">
            <template v-slot:label>
              <span class="font-ital1ic font-weight-light">{{ $t('productDefinitions.category.subcategoryName')
                }}</span>
            </template>
            <template v-slot:append-inner>
              <v-btn class="fill-height" size="40" flat min-width=0 density="compact" color="processButtonColor"
                :disabled="!topLevelCategoryForm || topLevelCategoryName == undefined"
                @click="emits('addCategory', { parentId: category._id, title: topLevelCategoryName }); topLevelCategoryName = undefined"><span
                  class="text-captio1n">
                  <v-icon>mdi-plus</v-icon>
                </span></v-btn>
            </template>
          </v-text-field>
        </v-form>
      </div>
    </div>




    <div :class="[category.level == 0 ? '' : 'ml-12 mr-2']"
      v-if="category.isMain != true && (!category.isHidden || category.isHidden == false)"
      style="position:relative;border:1px solid #bbb;border-bottom-left-radius:2px;border-bottom-right-radius:2px;"
      class="mb-3 category-menu" :style="{ 'background-color': level % 2 == 0 ? '#f7f7f7' : '#fbfbfb' }">
      <v-list-group :value="category._id" @click="eventBus.emit('pageResize', '')"
        :style="{ 'background-color': draggingCategory && draggingCategory._id == category._id ? '#f4f4ff' : '' }">
        <template v-slot:activator="{ props, isOpen }">
          <v-list-item v-bind="props" :prepend-icon="category.icon" :value="category._id" draggable="true"
            @drag="drag($event)" @drop.stop="drop(draggingCategory, category)" @dragend.stop="dragend"
            @dragover="category.isDropPossible ? $event.preventDefault() : 0" @dragstart="dragstart($event, category)"
            class="pt-0 pb-0  pl-2 mb-0 pr-0  elevation-0 category-list-item"
            style="padding-inline-start: 8px!important"
            :class="[(category.isDropPossible = isDropPossible(draggingCategory, category)) ? 'drop-is-possible' : 'drop-is-not-possible', (category.isOpen = isOpen) ? '' : '']">
            <template v-slot:prepend="{ isSelected, isActive }">
              <div style="border:1px solid black"
                :style="{ 'background-color': (category.isOrderDropPossible = isOrderDropPossible(draggingCategory, category)) ? '#f3fff3' : 'unset' }"
                class="pr-3 pl-3 mr-4" @drop.stop="dropForOrder(draggingCategory, category)" @dragover.prevent> {{
                  category.level == 0 ?index:index+1 }}
                <v-icon v-if="category.isOrderDropPossible">mdi-swap-vertical</v-icon>
                <v-icon v-else style="opacity:.6">mdi-swap-vertical</v-icon>
              </div>
            </template>
            <div class="pt-3 pb-3">
              <v-tooltip :text="constructBreadcrumb(category)">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" :style="category.children.length>0?{opacity:.6}:{opacity:.8}" :color="category.children.length>0?'primary':'success'" class="mr-2">mdi-shape</v-icon>
                </template>
              </v-tooltip>
              <span :class="category.children.length>0?[]:['font-weight-bold']">
              {{ category.title }}
            </span>
              <span class="text-caption">({{ category.children.filter((item: any) => !item.isHidden
                ||
                item.isHidden==false ).length }}) </span>
              <v-icon v-if="category.isDropPossible" style="opacity:.6" class="ml-2">mdi-arrow-down-thin</v-icon>
              <v-icon v-else-if="draggingCategory" style="opacity:.6" class="ml-2">mdi-cancel</v-icon>
              <v-icon v-else style="opacity:.6" class="ml-2">mdi-arrow-up-down1</v-icon>
            </div>
            <template v-slot:append="{ isSelected, isActive }">
              <v-list-item-action end style="height:100%!important">
                                      <v-icon size="large" @click.stop="openCategorySync(category)" style="opacity:1;" class="mr-4" btn color="processButtonColor">mdi-cog</v-icon>

                <!--                 <v-icon btn :color="isActive ? 'black' : 'black'" v-ripple.stop
                  @click.stop="emits('startEdit', category)" style="opacity:1" class="mr-2">mdi-pencil</v-icon>
 -->
                <!--                   <v-btn class="ml-2" density="comfortable" color="processButtonColor" min-width=0 @click.stop="emits('startEdit', category)"><span
                    class="text-captio1n">
                    <v-icon size="large" style="opacity:1" btn color="">mdi-pencil-outline</v-icon>
                  </span></v-btn>
 -->

<!--                 <v-btn-group elevation="0" class="d-block" density="compact"
                  style="height:47px;border-radius:0px!important;border-top-left-radius:0!important;border-bottom-left-radius:0!important">
                  <v-btn class="ml-0 fill-height" block density="comfortable" style="border:0px solid #ddd;border-radius:0!important"
                    color="transparent" min-width=0
                    @click.stop="openCategorySync(category)"><span
                      class="text-captio1n">
                      <v-icon size="large" style="opacity:1" btn color="processButtonColor">mdi-cog</v-icon>
                    </span></v-btn>
                </v-btn-group>
 -->              </v-list-item-action>
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
              <v-form v-model="category.form" style="display:contents" @keydown.enter.prevent @submit.prevent>
                <v-text-field variant="outlined" density="compact" type="tel" maxlength="160" counter clearable 
                  bg-color="textfieldColor" :hint="$t('productDefinitions.category.subcategoryDesc')" class="mr-2 customTextField"
                  v-model="category.newTitle" :rules="titleRules"
                  @keyup.enter="emits('addCategory', { parentId: category._id, title: category.newTitle })">
                  <template v-slot:label>
                    <span class="font-weight-light">{{ category.title }}<v-icon size="small"
                        style="opacity:.5">mdi-arrow-right</v-icon> <span class="text-ca1ption font-italic mr-1">{{
                          $t('productDefinitions.category.subcategoryName') }} </span></span>
                  </template>
                  <template v-slot:append-inner>
                    <v-btn class="fill-height" size="40" flat min-width=0 density="compact" color="processButtonColor"
                      :disabled="!category.form || category.newTitle == undefined"
                      @click="emits('addCategory', { parentId: category._id, title: category.newTitle })"><span
                        class="text-captio1n">
                        <v-icon>mdi-plus</v-icon>
                      </span></v-btn>
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

<style></style>