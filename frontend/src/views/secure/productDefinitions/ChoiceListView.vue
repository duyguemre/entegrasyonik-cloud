<template>
  <div class="choiceListView">

    <LoadingComponent attach=".choiceListView" ref="loadingComponentRef" />
    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen" title="Grubu Sil?"
      :message="`'${confirmationDelete.item?.title}' grubu kalıcı olarak silinecektir. Emin misiniz?`"
      icon="mdi-trash-can-outline" color="error" confirmText="Sil" cancelText="İptal" @confirm="removeChoice()"
      @cancel="confirmationDelete.isDialogOpen = false" />

    <EkListScreen
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
      <!-- Araç şeridi (sağ): hazır şablon + satır içi yeni grup — arama solda (EkListScreen standart şeridi). -->
      <template #create>
        <v-menu offset="5">
          <template v-slot:activator="{ props }">
            <EkButton v-bind="props" tone="ghost" icon="mdi-folder-multiple-plus-outline" trailing-icon="mdi-chevron-down">Şablondan ekle</EkButton>
          </template>
          <v-list density="compact" nav width="240">
            <v-list-item prepend-icon="mdi-palette-outline" title="Renk Şablonu"
              @click="addPreparedChoice('color')"></v-list-item>
            <v-list-item prepend-icon="mdi-format-size" title="Beden (XXS-5XL) Şablonu"
              @click="addPreparedChoice('size')"></v-list-item>
            <v-list-item prepend-icon="mdi-numeric" title="Numara Şablonu"
              @click="addPreparedChoice('number')"></v-list-item>
          </v-list>
        </v-menu>
        <v-form v-model="newChoiceForm" @submit.prevent="addChoice" class="def-new-form">
          <v-text-field v-model="newChoiceTitle" variant="outlined" density="compact" hide-details :rules="newChoiceRules"
            class="def-new-input" :placeholder="$t('productDefinitions.choice.name')"
            :aria-label="$t('productDefinitions.choice.name')" />
          <EkButton tone="primary" icon="mdi-plus" class="def-new" :disabled="!newChoiceForm || !newChoiceTitle"
            @click="addChoice">Grup ekle</EkButton>
        </v-form>
      </template>


      <template #cell-title="{ row: item }">
        <div class="def-title-row">
        <!-- Grup kutucuğu (Etiketler ekranıyla aynı dil): site mavisi tonlu seçenek ikonu. -->
        <span class="def-group-tile" style="--grp: var(--ek-color-action)" aria-hidden="true"><v-icon icon="mdi-shape-outline" /></span>
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
              <v-text-field v-model="item.tempTitle" label="Grup Adını Düzenle" variant="outlined" density="compact"
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
              <v-icon size="14" aria-hidden="true">mdi-filter-variant</v-icon>GRUP (SLICER)
            </button>
            <button type="button" class="def-flag" :class="{ 'is-on': item.isVarianter }" :aria-pressed="!!item.isVarianter"
              @click="toggleFlag(item, 'isVarianter')">
              <v-icon size="14" aria-hidden="true">mdi-layers-triple-outline</v-icon>VARYANT
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
import { EkRowActions, EkButton } from '@entegrasyonik/ui/components'
import type { EkGridColumn, EkGridSort } from '@entegrasyonik/ui/components'
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


