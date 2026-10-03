<template>
  <div class="choiceListView">

    <LoadingComponent attach=".choiceListView" ref="loadingComponentRef" />
    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen" title="Grubu Sil?"
      :message="`'${confirmationDelete.item?.title}' grubu kalıcı olarak silinecektir. Emin misiniz?`"
      icon="mdi-trash-can-outline" color="error" confirmText="Sil" cancelText="İptal" @confirm="removeChoice()"
      @cancel="confirmationDelete.isDialogOpen = false" />

    <EkListScreen ref="listScreenRef"
      summary-toggle
      section="Katalog"
      :title="$t('menu.productDefinitions.choiceList')"
      label="Varyant grupları tablosu"
      noun="grup"
      row-key="_id"
      label-key="title"
      :columns="columns"
      :rows="pagedChoices"
      :loading="loading"
      :error="loadError"
      error-title="Varyant grupları yüklenemedi"
      v-model:search="searchText"
      search-placeholder="Grup veya seçenek ara"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Grup Bulunamadı"
      empty-text="Renk, beden gibi varyant gruplarını oluşturun veya hazır şablonlardan başlayın."
      filtered-empty-title="Grup Bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir varyant grubu bulunamadı."
      empty-icon="mdi-palette-swatch-outline"
      refresh-label="Yenile"
      @update:sort="(s) => { gridSort = s; pagination.page = 1 }"
      @update:page="(p) => (pagination.page = p)"
      @update:page-size="(n) => { pagination.limit = n; pagination.page = 1 }"
      @refresh="retrieveChoices()"
    >
      <!-- FE-LOCAL-1052: Liste | Özet — özet listenin yerine açılır; gruba tıklayınca liste o gruba süzülür. -->
      <template #summary="{ close }">
        <DefinitionGroupsDashboard :cells="dashCells" :groups="dashGroups" group-noun="Seçenek grubu" value-noun="seçenek"
          icon="mdi-shape-outline" :loading="loading" empty-text="Henüz seçenek grubu yok."
          @select="(title) => { searchText = title; close() }" />
      </template>

      <!-- Araç şeridi (sağ): hazır şablon (ikincil) + "Yeni grup" (sayfanın TEK birincil eylemi; ad küçük kartta sorulur). -->
      <template #create>
        <v-menu v-model="templateMenu" location="bottom end" :offset="6">
          <template v-slot:activator="{ props }">
            <EkButton v-bind="props" tone="secondary" icon="mdi-folder-multiple-plus-outline" trailing-icon="mdi-chevron-down">Şablondan ekle</EkButton>
          </template>
          <EkMenuPanel autofocus :groups="TEMPLATE_GROUPS" label="Hazır şablonlar" title="Hazır şablonlar" description="Seçilen şablon değerleriyle birlikte eklenir"
            @select="(item) => { templateMenu = false; addPreparedChoice(item.key) }" @close="templateMenu = false" />
        </v-menu>
        <v-menu v-model="newMenu" :close-on-content-click="false" location="bottom end" :offset="6">
          <template v-slot:activator="{ props }">
            <EkButton v-bind="props" tone="primary" icon="mdi-plus" class="def-new">Yeni grup</EkButton>
          </template>
          <v-card class="def-pop" width="300">
            <div class="def-pop__caption">Yeni seçenek grubu</div>
            <v-form v-model="newChoiceForm" class="def-new-form" @submit.prevent="submitNew">
              <v-text-field v-model="newChoiceTitle" variant="outlined" density="compact" hide-details autofocus :rules="newChoiceRules"
                class="def-new-input" :label="$t('productDefinitions.choice.name')" placeholder="Örn. Renk, Beden" />
            </v-form>
            <div class="def-pop__row">
              <EkButton tone="secondary" size="sm" @click="newMenu = false">Vazgeç</EkButton>
              <EkButton tone="primary" size="sm" icon="mdi-plus" :disabled="!newChoiceForm || !newChoiceTitle" @click="submitNew">Grup ekle</EkButton>
            </div>
          </v-card>
        </v-menu>
      </template>


      <template #cell-title="{ row: item }">
        <div class="def-title-row">
        <!-- Grup kutucuğu (Etiketler ekranıyla aynı dil): site mavisi tonlu seçenek ikonu. -->
        <EkIconTile icon="mdi-shape-outline" tone="action" size="sm" class="def-tile" />
        <div class="def-title-cell">
          <v-menu v-model="item.showEditMenu" :close-on-content-click="false" location="bottom start">
            <template v-slot:activator="{ props }">
              <button v-bind="props" type="button" class="def-title" @click="item.tempTitle = item.title">
                <span class="def-title__text">
                  <span class="def-title__name">{{ item.title }}<v-icon size="14" class="def-title__icon" aria-hidden="true">mdi-pencil-outline</v-icon></span>
                  <span class="def-title__meta">{{ (item.values?.length ?? 0) }} seçenek</span>
                </span>
              </button>
            </template>
            <v-card class="def-pop" width="280">
              <div class="def-pop__caption">Grup adı</div>
              <v-text-field v-model="item.tempTitle" label="Grup adını düzenle" variant="outlined" density="compact"
                hide-details autofocus class="mb-3" @keyup.enter="saveRename(item)" />
              <div class="def-pop__row">
                <EkButton tone="secondary" size="sm" @click="item.showEditMenu = false">İptal</EkButton>
                <EkButton tone="primary" size="sm" icon="mdi-check" @click="saveRename(item)">Kaydet</EkButton>
              </div>
            </v-card>
          </v-menu>
          <div class="def-flags">
            <button type="button" class="def-flag" :class="{ 'is-on': item.isSlicer }" :aria-pressed="!!item.isSlicer"
              @click="toggleFlag(item, 'isSlicer')">
              <v-icon size="14" aria-hidden="true">{{ item.isSlicer ? 'mdi-check' : 'mdi-filter-variant' }}</v-icon>Filtrede kullan
            </button>
            <button type="button" class="def-flag" :class="{ 'is-on': item.isVarianter }" :aria-pressed="!!item.isVarianter"
              @click="toggleFlag(item, 'isVarianter')">
              <v-icon size="14" aria-hidden="true">{{ item.isVarianter ? 'mdi-check' : 'mdi-layers-triple-outline' }}</v-icon>Varyant oluşturur
            </button>
          </div>
        </div>
        </div>
      </template>

      <template #cell-choices="{ row: item }">
        <div class="def-values">
          <DefinitionValueChip v-for="val in item.values" :key="val._id" :label="val.title"
            :remove-label="`${val.title} değerini sil`" remove-title="Değeri Sil?"
            @open="item.editingChoiceValue = copy(val)" @remove="deleteChoiceValue(item._id, val._id)">
            <template #edit="{ close }">
              <v-text-field v-model="item.editingChoiceValue.title" density="compact" variant="outlined"
                label="Değer Adı" hide-details autofocus class="mb-3"
                @keyup.enter="updateChoiceValue(item); close()" />
              <div class="def-pop__row">
                <EkButton tone="secondary" size="sm" @click="close()">İptal</EkButton>
                <EkButton tone="primary" size="sm" icon="mdi-check" @click="updateChoiceValue(item); close()">Kaydet</EkButton>
              </div>
            </template>
          </DefinitionValueChip>
          <DefinitionValueAdd :add-label="$t('productDefinitions.choice.newChoiceValue')" input-label="Yeni değer"
            trigger-text="Değer ekle" @add="(title: string) => addValue(item, title)" />
        </div>
      </template>

      <template #cell-actions="{ row }">
        <EkRowActions :label="`${row.title} işlemleri`" :items="[
          { key: 'edit', action: 'edit', label: 'Grup adını düzenle', onClick: () => openRename(row) },
          { key: 'delete', action: 'delete', label: 'Grubu sil', onClick: () => openDeleteConfirm(row) },
        ]" />
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import { EkRowActions, EkButton, EkIconTile, EkMenuPanel } from '@entegrasyonik/ui/components'
import type { EkGridColumn, EkGridSort, EkMenuGroup } from '@entegrasyonik/ui/components'
import { ref, computed, onBeforeMount, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n';
import { useChoicesStore } from '@/stores/choicesStore';
import { useSnackbarStore } from '@/stores/snackbarStore';
import useFormRules from '@/composables/formrules';
import useRestApi from '@/composables/restapi';
import LoadingComponent from '@/components/LoadingComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import EkListScreen from '@/components/page/templates/EkListScreen.vue';
import DefinitionValueChip from '@/components/productDefinitions/definitions/DefinitionValueChip.vue';
import DefinitionValueAdd from '@/components/productDefinitions/definitions/DefinitionValueAdd.vue';
import DefinitionGroupsDashboard from '@/components/productDefinitions/definitions/DefinitionGroupsDashboard.vue';
import type { ListSummaryCell } from '@/components/page/ListSummaryStrip.vue';
import { formatNumber } from '@entegrasyonik/ui/format';
import { isRequestError, sortRows } from '@entegrasyonik/ui/components/listStandard';
import './definitionLists.css'

const { t } = useI18n()
const choicesStore = useChoicesStore()
const snackbarStore = useSnackbarStore()
const formRules = useFormRules()
const restApi = useRestApi()

const loadingComponentRef = ref()
const confirmationDelete = reactive({ isDialogOpen: false, item: null as any })
const searchText = ref('')
const newChoiceTitle = ref('')
const newChoiceForm = ref(false)
const choicesStoreChoices = ref<any[]>([])
const loading = ref(false)
const loadError = ref(false)
// Sıralama İSTEMCİDE (liste zaten tamamı bellekte; backend sıralaması yok).
const gridSort = ref<EkGridSort>(null)

const pagination = reactive({
  page: 1,
  limit: 25,
  totalNumberOfPages: 1,
  totalNumberOfRecords: 0
})

const newChoiceRules = [...formRules.mandatoryRule, ...formRules.length_2_160]

// FE-LOCAL-1052: araç şeridi menüleri + özet görünümü (sayılar bellekteki listeden; ek istek yok).
const listScreenRef = ref<InstanceType<typeof EkListScreen> | null>(null)
const templateMenu = ref(false)
const newMenu = ref(false)
const TEMPLATE_GROUPS: EkMenuGroup[] = [
  {
    items: [
      { key: 'color', label: 'Renk şablonu', icon: 'mdi-palette-outline' },
      { key: 'size', label: 'Beden şablonu', description: 'XXS – 5XL', icon: 'mdi-format-size' },
      { key: 'number', label: 'Numara şablonu', icon: 'mdi-numeric' },
    ],
  },
]
const submitNew = async () => {
  if (!newChoiceForm.value || !newChoiceTitle.value) return
  newMenu.value = false
  await addChoice()
}
const dashCells = computed<ListSummaryCell[]>(() => {
  const all = choicesStoreChoices.value
  const values = all.reduce((a, c) => a + (c.values?.length ?? 0), 0)
  const slicer = all.filter((c) => c.isSlicer).length
  const variant = all.filter((c) => c.isVarianter).length
  const empty = all.filter((c) => !(c.values?.length)).length
  const cell = (key: string, label: string, n: number, icon: string, tone: ListSummaryCell['tone'], hint: string): ListSummaryCell => ({ key, label, hint, icon, tone, value: formatNumber(n), zero: !n })
  return [
    cell('groups', 'Seçenek grubu', all.length, 'mdi-shape-outline', 'action', 'Tanımlı grup'),
    cell('values', 'Seçenek', values, 'mdi-format-list-bulleted', 'info', 'Tüm gruplardaki değer'),
    cell('variant', 'Varyant oluşturan', variant, 'mdi-layers-triple-outline', 'success', 'Ürün varyantı üretir'),
    cell('slicer', 'Filtrede kullanılan', slicer, 'mdi-filter-variant', 'neutral', 'Listelerde süzme ölçütü'),
    cell('empty', 'Boş grup', empty, 'mdi-alert-outline', 'warning', 'Henüz seçeneği yok'),
  ]
})
const dashGroups = computed(() => choicesStoreChoices.value.map((c) => ({ key: String(c.title), label: String(c.title), count: c.values?.length ?? 0 })))

onBeforeMount(() => retrieveChoices())
watch(searchText, () => { pagination.page = 1 })

const copy = (obj: any) => obj ? JSON.parse(JSON.stringify(obj)) : null

const openRename = (item: any) => { item.tempTitle = item.title; item.showEditMenu = true }
const saveRename = (item: any) => { item.title = item.tempTitle; updateChoice(item); item.showEditMenu = false }
const toggleFlag = (item: any, key: 'isSlicer' | 'isVarianter') => { item[key] = !item[key]; updateChoice(item) }
const addValue = (item: any, title: string) => { item.editingChoiceValue = { title }; addChoiceValue(item) }

const retrieveChoices = async () => {
  loading.value = true
  loadError.value = false
  await choicesStore.retrieve()
  const fetched = choicesStore.choices
  if (isRequestError(fetched) || !Array.isArray(fetched)) {
    loadError.value = isRequestError(fetched)
    choicesStoreChoices.value = []
    loading.value = false
    return
  }
  const rawData = copy(fetched)
  choicesStoreChoices.value = rawData.map((c: any) => ({
    ...c,
    showAddInput: false,
    tempValueTitle: '',
    tempTitle: c.title,
    editingChoiceValue: {},
    showEditMenu: false,
    showDeleteConfirm: false
  }))
  loading.value = false
}

const openDeleteConfirm = (item: any) => {
  confirmationDelete.item = item
  confirmationDelete.isDialogOpen = true
}

const computedSearchChoices = computed(() => {
  const query = searchText.value?.toLocaleUpperCase('tr') || ''
  const filtered = choicesStoreChoices.value.filter(c =>
    c.title.toLocaleUpperCase('tr').includes(query) ||
    c.values?.some((v: any) => v.title.toLocaleUpperCase('tr').includes(query))
  )

  pagination.totalNumberOfRecords = filtered.length
  pagination.totalNumberOfPages = Math.ceil(filtered.length / pagination.limit) || 1

  return filtered
})

const pagedChoices = computed(() => {
  const start = (pagination.page - 1) * pagination.limit
  return sortRows(computedSearchChoices.value, gridSort.value).slice(start, start + pagination.limit)
})

const addChoice = async () => {
  let guid = loadingComponentRef.value.info(t('loading.info.updateVariants'))
  const res = await restApi.post("ChoiceService/addChoice", { title: newChoiceTitle.value, isVarianter: false, isSlicer: false })
  if (res?.result) {
    newChoiceTitle.value = ''
    retrieveChoices()
    snackbarStore.addSnackbar({ show: true, text: 'Grup Eklendi', color: 'neutral' });
  }
  loadingComponentRef.value.remove(guid)
}

const updateChoice = async (item: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.updateVariants'))
  await restApi.post("ChoiceService/updateChoice", { _id: item._id, title: item.title, isVarianter: item.isVarianter, isSlicer: item.isSlicer })
  retrieveChoices()
  loadingComponentRef.value.remove(guid)
}

const removeChoice = async () => {
  if (!confirmationDelete.item) return
  let guid = loadingComponentRef.value.info(t('loading.info.updateVariants'))
  const res = await restApi.post("ChoiceService/removeChoice", { _id: confirmationDelete.item._id })
  if (res?.result?.acknowledged) {
    snackbarStore.addSnackbar({ show: true, text: 'Silindi', color: 'success' });
    retrieveChoices()
  }
  loadingComponentRef.value.remove(guid)
  confirmationDelete.isDialogOpen = false
}

const addChoiceValue = async (item: any) => {
  if (!item.editingChoiceValue?.title) return
  let guid = loadingComponentRef.value.info(t('loading.info.updateVariants'))
  const res = await restApi.post("ChoiceService/addChoiceValue", { _id: item._id, title: item.editingChoiceValue.title })
  if (res === true) retrieveChoices()
  loadingComponentRef.value.remove(guid)
}

const updateChoiceValue = async (item: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.updateVariants'))
  await restApi.post("ChoiceService/updateChoiceValue", {
    _id: item._id,
    id: item.editingChoiceValue._id,
    title: item.editingChoiceValue.title
  })
  retrieveChoices()
  loadingComponentRef.value.remove(guid)
}

const deleteChoiceValue = async (cid: any, vid: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.updateVariants'))
  await restApi.post("ChoiceService/removeChoiceValue", { _id: cid, id: vid })
  retrieveChoices()
  loadingComponentRef.value.remove(guid)
}

const addPreparedChoice = async (mode: string) => {
  let choice: any = {}
  if (mode === 'color') {
    choice = { title: 'Renk', values: [{ title: 'Siyah' }, { title: 'Beyaz' }, { title: 'Kırmızı' }, { title: 'Mavi' }, { title: 'Sarı' }, { title: 'Yeşil' }, { title: 'Mor' }, { title: 'Turuncu' }, { title: 'Gri' }, { title: 'Kahverengi' }] }
  } else if (mode === 'size') {
    choice = { title: 'Beden', values: [{ title: 'XX-Small' }, { title: 'X-Small' }, { title: 'Small' }, { title: 'Medium' }, { title: 'Large' }, { title: 'X-Large' }, { title: '2X-Large' }, { title: '3X-Large' }, { title: '4X-Large' }, { title: '5X-Large' }] }
  } else if (mode === 'number') {
    choice = { title: 'Numara', values: [{ title: '36' }, { title: '37' }, { title: '38' }, { title: '39' }, { title: '40' }, { title: '41' }, { title: '42' }, { title: '43' }, { title: '44' }, { title: '45' }] }
  }
  await restApi.post("ChoiceService/addPreparedChoice", { choice })
  retrieveChoices()
}

const columns: EkGridColumn[] = [
  { key: 'title', label: t('productDefinitions.choice.headers.choiceGroup'), sortable: true },
  { key: 'choices', label: t('productDefinitions.choice.headers.choices'), wrap: true },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
]
</script>


