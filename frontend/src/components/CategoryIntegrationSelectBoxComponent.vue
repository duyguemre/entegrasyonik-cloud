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

    <IntegrationLoadingBlock v-if="status === 'loading' && !loadError" :label="`${platformTitle} kategorileri alınıyor…`" />
    <IntegrationErrorPanel v-else-if="loadError" :info="loadError" :retrying="loading" @retry="retryLoad" />
    <div v-else-if="integrationCategories.length > 0">
      <v-text-field ref="fieldRef" :model-value="selectedLabel" readonly clearable
        :label="`${platformTitle} kategorisi`" :placeholder="$t('productDefinitions.category.search')"
        :rules="mandatory == true ? formRules.mandatoryRule : []" :hint="hintText" persistent-hint
        append-inner-icon="mdi-file-tree-outline" class="ek-integration-category-field"
        @click="pickerOpen = true" @keydown.enter.prevent="pickerOpen = true" @keydown.space.prevent="pickerOpen = true"
        @click:clear.stop="setCategory(undefined)" @click:append-inner="pickerOpen = true" />

      <EkCascadeDialog v-model="pickerOpen" :nodes="tree" :path="selectedPath" :attach="attach"
        :title="`${platformTitle} kategorisi seç`" :subtitle="`${formatNumber(leafCount)} yaprak kategori`"
        @confirm="(ids) => setCategory(ids[ids.length - 1])" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, watch, ref } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore';
import useFormRules from '@/composables/formrules';
import LoadingComponent from './LoadingComponent.vue';
import EkCascadeDialog from '@/components/ds/EkCascadeDialog.vue'
import type { EkCascadeNode } from '@/components/ds/EkCascadePicker.vue'
import { formatNumber } from '@/composables/format'
import IntegrationErrorPanel from '@/components/integrations/IntegrationErrorPanel.vue'
import IntegrationLoadingBlock from '@/components/integrations/IntegrationLoadingBlock.vue'
import { useIntegrationLoad } from '@/composables/useIntegrationError'

const integrationStore = useIntegrationStore()
const integrationCategories = ref<any[]>([])
const emits = defineEmits(['change'])
const integrationCategoryCommissionRate: any = ref(0)
const loadingComponentRef: any = ref(null)
const pickerOpen = ref(false)

const categoryId = defineModel({ default: undefined })
const props = withDefaults(defineProps<{ mandatory?: boolean, integrationCode: string, attach?: string }>(), {
  // Seçici diyalog çalışma alanı sekmesini örter (sol menünün ALTINDA kalmaz).
  attach: '.categoryListView',
})
const formRules: any = useFormRules()

// Pazaryeri kategori ağacı: yükleniyor (iskelet) · hata / boş liste (IntegrationErrorPanel: neden + ne yapmalı +
// Tekrar dene + teknik ayrıntı) · hazır. Hata artık sessiz bir boşluk DEĞİL (bkz. useIntegrationError.ts).
const fieldRef = ref<any>(null)
const { status, error: loadError, loading, run, reset: resetLoad } = useIntegrationLoad(
  () => integrationStore.loadIntegrationCategories(props.integrationCode),
)

function applyCategories(resp: any[]) {
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
}

async function loadCategories(focusOnRecover = false) {
  const hadError = !!loadError.value
  const result = await run()
  if (result.ok) {
    applyCategories(result.data)
    // Hata panelinden "Tekrar dene" ile kurtarıldıysa odak, yeni görünen alana taşınır.
    if (focusOnRecover && hadError) { await nextTick(); fieldRef.value?.focus?.() }
  } else {
    integrationCategories.value = []
  }
}

const retryLoad = () => loadCategories(true)

watch(() => props.integrationCode, async (newCode) => {
  integrationCategories.value = []
  resetLoad()
  if (!newCode) return
  await loadCategories()
}, { immediate: true })

const platformTitle = computed(() => integrationStore.getIntegrationTitle(props.integrationCode) || props.integrationCode)

// Platform kategori listesi → kademeli seçici ağacı. Mağaza verisi iç içe ağacın düzleştirilmiş
// hâlidir (`children` nesne ya da kimlik); ebeveyn ilişkisi `children`'dan, yoksa `parentId`'den kurulur.
const byId = computed(() => new Map(integrationCategories.value.map((c: any) => [String(c._id), c])))
const childrenOf = (c: any): any[] =>
  (c.children ?? []).map((ch: any) => (ch && typeof ch === 'object' ? byId.value.get(String(ch._id)) ?? ch : byId.value.get(String(ch)))).filter(Boolean)
const parentOf = computed(() => {
  const map = new Map<string, string>()
  for (const c of integrationCategories.value) for (const ch of childrenOf(c)) map.set(String(ch._id), String(c._id))
  for (const c of integrationCategories.value)
    if (!map.has(String(c._id)) && c.parentId != null && byId.value.has(String(c.parentId))) map.set(String(c._id), String(c.parentId))
  return map
})

const tree = computed<EkCascadeNode[]>(() => {
  const kids = new Map<string, any[]>()
  const roots: any[] = []
  for (const c of integrationCategories.value) {
    const parent = parentOf.value.get(String(c._id))
    if (parent == undefined) roots.push(c)
    else {
      if (!kids.has(parent)) kids.set(parent, [])
      kids.get(parent)!.push(c)
    }
  }
  const build = (list: any[]): EkCascadeNode[] =>
    list.map((c: any) => {
      const children = build(kids.get(String(c._id)) ?? [])
      return { id: String(c._id), label: c.title, children, count: children.length ? children.length : undefined }
    })
  return build(roots)
})

const leafCount = computed(() => integrationCategories.value.filter((c: any) => !c.isParent).length)

const selectedPath = computed<string[]>(() => {
  if (categoryId.value == undefined || !byId.value.has(String(categoryId.value))) return []
  const out: string[] = []
  let cur: string | undefined = String(categoryId.value)
  while (cur != undefined && !out.includes(cur)) {
    out.unshift(cur)
    cur = parentOf.value.get(cur)
  }
  return out
})

const selectedLabel = computed(() => selectedPath.value.map((id) => byId.value.get(id)?.title).filter(Boolean).join(' › '))

const hintText = computed(() => {
  const base = `${platformTitle.value} kategorisini buradan seçebilirsiniz.`
  const rate = integrationCategoryCommissionRate.value?.commission
  return categoryId.value != undefined && rate != undefined ? `%${rate} komisyon · ${base}` : base
})

function setCategory(id: string | undefined) {
  // Platform kimlikleri sayısal olabilir: seçilen yol string'dir, orijinal tipe geri çevrilir.
  const original = id == undefined ? undefined : byId.value.get(id)?._id
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
