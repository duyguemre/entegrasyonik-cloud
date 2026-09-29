<!--
  frontend/src/components/CategoryIntegrationSelectBoxComponent.vue

  Pazaryeri kategori eşleştirme alanı (Kategori tanımları › Senkron). DS-v2
  Aşama 2: binlerce satırlık düz açılır liste yerine salt-okunur alan +
  `EkCascadeDialog` (kademeli kolonlar, tam yol araması, seçili yol vurgusu).
  Sözleşme DEĞİŞMEDİ: `v-model` = seçilen YAPRAK platform kategorisinin
  `_id`'si; her değişimde `change` yayar; `mandatory` → zorunluluk kuralı;
  seçimden sonra komisyon oranı yardım metninde gösterilir.
-->
<template>
  <div class="categorySyncComponent">
    <LoadingComponent ref="loadingComponentRef" attach=".categorySyncComponent"></LoadingComponent>

    <div v-if="integrationCategories.length > 0">
      <v-text-field :model-value="selectedLabel" readonly clearable
        :label="`${platformTitle} kategorisi`" :placeholder="$t('productDefinitions.category.search')"
        :rules="mandatory == true ? formRules.mandatoryRule : []" :hint="hintText" persistent-hint
        append-inner-icon="mdi-file-tree-outline" class="ek-integration-category-field"
        @click="pickerOpen = true" @keydown.enter.prevent="pickerOpen = true" @keydown.space.prevent="pickerOpen = true"
        @click:clear.stop="setCategory(undefined)" @click:append-inner="pickerOpen = true" />

      <EkCascadeDialog v-model="pickerOpen" :nodes="tree" :path="selectedPath"
        :title="`${platformTitle} kategorisi seç`" :subtitle="`${formatNumber(leafCount)} yaprak kategori`"
        @confirm="(ids) => setCategory(ids[ids.length - 1])" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, watch, ref } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore';
import useFormRules from '@/composables/formrules';
import LoadingComponent from './LoadingComponent.vue';
import EkCascadeDialog from '@/components/ds/EkCascadeDialog.vue'
import type { EkCascadeNode } from '@/components/ds/EkCascadePicker.vue'
import { formatNumber } from '@/composables/format'

const integrationStore = useIntegrationStore()
const integrationCategories = ref<any[]>([])
const emits = defineEmits(['change'])
const integrationCategoryCommissionRate: any = ref(0)
const loadingComponentRef: any = ref(null)
const pickerOpen = ref(false)

const categoryId = defineModel({ default: undefined })
const props = defineProps<{ mandatory?: boolean, integrationCode: string }>()
const formRules: any = useFormRules()

watch(() => props.integrationCode, async (newCode) => {
  if (!newCode) return
  let guid = loadingComponentRef.value?.info("")
  try {
    const resp = await integrationStore.getIntegrationCategories(newCode)
    const catMap = new Map();
    resp.forEach((c: any) => catMap.set(c._id, c));

    integrationCategories.value = resp.map((cat: any, idx: number) => {
      const path = [];
      let parent = catMap.get(cat.parentId);
      while (parent) {
        path.unshift(parent.title);
        parent = catMap.get(parent.parentId);
      }
      return {
        ...cat,
        originalIndex: idx + 1,
        isParent: cat.children?.length > 0,
        childrenCount: cat.children?.length || 0,
        breadcrumb: path.join(' > ')
      }
    });
  } catch (e) {
    integrationCategories.value = []
  } finally {
    loadingComponentRef.value?.remove(guid)
  }
}, { immediate: true })

const platformTitle = computed(() => integrationStore.getIntegrationTitle(props.integrationCode) || props.integrationCode)

// Düz platform kategori listesi (parentId) → kademeli seçici ağacı.
const tree = computed<EkCascadeNode[]>(() => {
  const byParent = new Map<string, any[]>()
  const ids = new Set(integrationCategories.value.map((c: any) => String(c._id)))
  for (const c of integrationCategories.value) {
    const parent = c.parentId != null && ids.has(String(c.parentId)) ? String(c.parentId) : ''
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent)!.push(c)
  }
  const build = (parent: string): EkCascadeNode[] =>
    (byParent.get(parent) ?? []).map((c: any) => {
      const children = build(String(c._id))
      return { id: String(c._id), label: c.title, children, count: children.length ? children.length : undefined }
    })
  return build('')
})

const leafCount = computed(() => integrationCategories.value.filter((c: any) => !c.isParent).length)

const selectedPath = computed<string[]>(() => {
  if (categoryId.value == undefined) return []
  const byId = new Map(integrationCategories.value.map((c: any) => [String(c._id), c]))
  const out: string[] = []
  let cur: any = byId.get(String(categoryId.value))
  while (cur) {
    out.unshift(String(cur._id))
    cur = cur.parentId != null ? byId.get(String(cur.parentId)) : undefined
  }
  return out
})

const selectedLabel = computed(() => {
  if (categoryId.value == undefined) return ''
  const byId = new Map(integrationCategories.value.map((c: any) => [String(c._id), c]))
  return selectedPath.value.map((id) => byId.get(id)?.title).filter(Boolean).join(' › ')
})

const hintText = computed(() => {
  const base = `${platformTitle.value} kategorisini buradan seçebilirsiniz.`
  const rate = integrationCategoryCommissionRate.value?.commission
  return categoryId.value != undefined && rate != undefined ? `%${rate} komisyon · ${base}` : base
})

function setCategory(id: string | undefined) {
  // Platform kimlikleri sayısal olabilir: seçilen yol string'dir, orijinal tipe geri çevrilir.
  const original = id == undefined ? undefined : integrationCategories.value.find((c: any) => String(c._id) === id)?._id
  categoryId.value = original
  emits('change', '')
}

watch(() => categoryId.value, async (newId) => {
  if (newId) {
    integrationCategoryCommissionRate.value = await integrationStore.retrieveCommisionForCategoryFromIntegration(props.integrationCode, newId)
  }
})
</script>

<style scoped>
.ek-integration-category-field :deep(input) {
  cursor: pointer;
}
</style>
