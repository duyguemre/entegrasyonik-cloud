<!--
  frontend/src/components/common/QuickCreateCategoryDialog.vue

  FR2-PFORM madde 23 — yeni kategori: ad + (isteğe bağlı) üst kategori. Hem kategori combobox'ı
  (CategorySelectBoxComponent) hem ürün formunun kademeli kategori seçicisi (CategorySelectBoxLevelComponent)
  kullanır. Yineleme denetimi aynı üst kategori altındaki kardeşlerle yapılır (farklı dallarda aynı ad olabilir).
  Uç: `CategoryService/addCategory` `{ parentCategoryId?, title }` (üst yoksa ana kök — backend).
-->
<template>
  <QuickCreateDialog v-model="open" noun="kategori" icon="mdi-file-tree-outline" :initial-name="initialName"
    :existing="siblings" :create="create" :description="description"
    :hint="parentId ? `“${parentTitle}” altına eklenir` : 'Ana seviyeye eklenir'"
    @created="(id, title) => emit('created', id, title)" @picked="(id) => emit('picked', id)">
    <v-autocomplete v-model="parentId" :items="parentOptions" item-value="_id" item-title="title" clearable
      label="Üst kategori" placeholder="Ana seviye (üst kategori yok)" persistent-placeholder
      hint="Boş bırakırsanız ana seviyeye eklenir." persistent-hint data-qc-field="parent">
      <template #item="{ item, props: itemProps }: any">
        <v-list-item v-bind="itemProps" :subtitle="item.raw.breadcrumb || undefined" />
      </template>
    </v-autocomplete>
  </QuickCreateDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCategoriesStore } from '@/stores/categoriesStore'
import QuickCreateDialog from './QuickCreateDialog.vue'

const props = defineProps<{ initialName?: string; /** Önceden seçili üst kategori (kademeli seçicide açık klasör). */ initialParentId?: string }>()
const open = defineModel<boolean>({ default: false })
const emit = defineEmits<{ created: [id: string, title: string]; picked: [id: string] }>()

const categoriesStore = useCategoriesStore()
const parentId = ref<string | null>(null)
watch(open, (on) => { if (on) parentId.value = props.initialParentId ?? null }, { immediate: true })

interface Row { _id: string; title: string; parentId?: unknown; isMain?: boolean; breadcrumb?: string[] | string }
const all = computed<Row[]>(() => (categoriesStore.getSelectCategories()?.value as Row[] | undefined) ?? [])
const mainId = computed(() => all.value.find((c) => c.isMain)?._id)

const parentOptions = computed(() => all.value
  .filter((c) => !c.isMain)
  .map((c) => {
    const trail = Array.isArray(c.breadcrumb) ? c.breadcrumb.filter((_, i, a) => i < a.length - 1) : []
    return { _id: c._id, title: c.title, breadcrumb: trail.filter((t) => t !== all.value.find((x) => x.isMain)?.title).join(' › ') }
  }))

const parentTitle = computed(() => all.value.find((c) => c._id === parentId.value)?.title ?? '')
const sameId = (a: unknown, b: unknown) => a != null && b != null && String(a) === String(b)
const siblings = computed(() => all.value.filter((c) =>
  !c.isMain && (parentId.value ? sameId(c.parentId, parentId.value) : (sameId(c.parentId, mainId.value) || !c.parentId))))

const description = 'Kategori ağacınıza eklenir ve seçilir. Pazaryeri kategori eşleşmesini Tanımlar › Kategoriler’den yapabilirsiniz.'

const create = (title: string) => categoriesStore.addCategory({ parentId: parentId.value || undefined, title })
</script>
