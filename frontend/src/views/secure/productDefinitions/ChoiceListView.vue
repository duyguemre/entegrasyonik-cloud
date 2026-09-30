<template>
  <div class="choiceListView">

    <LoadingComponent attach=".choiceListView" ref="loadingComponentRef" />
    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen" title="Grubu Sil?"
      :message="`'${confirmationDelete.item?.title}' grubu kalıcı olarak silinecektir. Emin misiniz?`"
      icon="mdi-delete-alert-outline" color="error" confirmText="SİL" cancelText="İPTAL" @confirm="removeChoice()"
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
      :search-placeholder="$t('products.product.searchlabel')"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Grup Bulunamadı"
      empty-text="Arama kriterlerinize uygun herhangi bir varyant grubu bulunamadı."
      filtered-empty-title="Grup Bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir varyant grubu bulunamadı."
      empty-icon="mdi-palette-swatch-outline"
      refresh-label="Yenile"
      @update:sort="(s) => { gridSort = s; pagination.page = 1 }"
      @update:page="(p) => (pagination.page = p)"
      @update:page-size="(n) => { pagination.limit = n; pagination.page = 1 }"
      @refresh="retrieveChoices()"
    >
      <template #header-actions>
        <v-form v-model="newChoiceForm" @submit.prevent="addChoice" class="new-choice-form">
          <v-text-field v-model="newChoiceTitle" variant="outlined" density="compact" hide-details :rules="newChoiceRules"
            bg-color="textfieldColor" class="customTextField" :placeholder="$t('productDefinitions.choice.name')">
            <template v-slot:label>
              <span class="font-weight-light new-field-label">{{ $t('productDefinitions.choice.name') }}</span>
            </template>
            <template v-slot:append-inner>
              <v-btn icon="mdi-plus" size="x-small" color="processButtonColor" variant="tonal" class="rounded-lg"
                :aria-label="$t('productDefinitions.choice.new.title')" :disabled="!newChoiceForm || !newChoiceTitle"
                @click="addChoice">
              </v-btn>
            </template>
          </v-text-field>
        </v-form>

        <v-menu offset="5">
          <template v-slot:activator="{ props }">
            <EkButton v-bind="props" tone="secondary" icon="mdi-folder-multiple-plus">Şablonlar</EkButton>
          </template>
          <v-list density="compact" nav width="240">
            <v-list-item prepend-icon="mdi-palette" title="Renk Şablonu"
              @click="addPreparedChoice('color')"></v-list-item>
            <v-list-item prepend-icon="mdi-format-size" title="Beden (XXS-5XL) Şablonu"
              @click="addPreparedChoice('size')"></v-list-item>
            <v-list-item prepend-icon="mdi-numeric" title="Numara Şablonu"
              @click="addPreparedChoice('number')"></v-list-item>
          </v-list>
        </v-menu>
      </template>

      <template #cell-title="{ row: item }">
        <div class="d-flex align-center py-2 choice-title-cell">
          <v-menu v-model="item.showEditMenu" :close-on-content-click="false" location="bottom start"
            transition="scale-transition">
            <template v-slot:activator="{ props }">
              <button v-bind="props" type="button" class="cursor-pointer font-weight-bold d-flex align-center group-title"
                @click="item.tempTitle = item.title">
                {{ item.title }}
                <v-icon size="14" class="ml-2 group-title__icon" aria-hidden="true">mdi-pencil-outline</v-icon>
              </button>
            </template>
            <v-card min-width="300" class="d-flex pa-4 rounded-lg shadow-xl border">
              <v-text-field v-model="item.tempTitle" label="Grup Adını Düzenle" variant="outlined" density="compact"
                hide-details
                @keyup.enter="item.title = item.tempTitle; updateChoice(item); item.showEditMenu = false;"
                class="mb-3 customTextField"></v-text-field>
              <v-btn block color="success" size="40" min-width="0" icon="mdi-check" variant="flat"
                class="premium-cube-btn flex-grow-0 ml-2" aria-label="Kaydet"
                @click="item.title = item.tempTitle; updateChoice(item); item.showEditMenu = false;"></v-btn>
            </v-card>
          </v-menu>

          <v-spacer></v-spacer>

          <v-chip size="x-small" :color="item.isSlicer ? 'green-darken-1' : 'grey-lighten-2'" variant="flat"
            class="mr-2 font-weight-bold rounded-xl" @click="item.isSlicer = !item.isSlicer; updateChoice(item)">
            <v-icon start size="12">mdi-filter-variant</v-icon> GRUP (SLICER)
          </v-chip>
          <v-chip size="x-small" :color="item.isVarianter ? 'passiveColor' : 'grey-lighten-2'" variant="flat"
            class="font-weight-bold rounded-xl" @click="item.isVarianter = !item.isVarianter; updateChoice(item)">
            <v-icon start size="12">mdi-layers-triple</v-icon> VARYANT
          </v-chip>
        </div>
      </template>

      <template #cell-choices="{ row: item }">
          <div class="d-flex flex-wrap gap-2 py-2 align-center min-h-60">
            <v-chip v-for="val in item.values" :key="val._id" size="small" variant="outlined" class="choice-chip-item"
              role="button" tabindex="0">
              <span class="mr-2 font-weight-medium choice-chip-item__text">{{ val.title }}</span>
              <v-menu v-model="val.showValueMenu" activator="parent" :close-on-content-click="false"
                transition="fade-transition"
                @update:model-value="(state) => state ? item.editingChoiceValue = copy(val) : null">
                <v-card width="220" class="pa-3 rounded-lg border shadow-lg">
                  <v-text-field v-model="item.editingChoiceValue.title" density="compact" variant="outlined"
                    label="Değer Adı" hide-details class="mb-3 customTextField"></v-text-field>
                  <div class="d-flex justify-space-between align-center">
                    <v-menu v-model="val.showValueDeleteConfirm" :close-on-content-click="false" location="top center">
                      <template v-slot:activator="{ props }">
                        <v-btn v-bind="props" icon="mdi-delete" size="30" color="danger" variant="flat"
                          class="premium-cube-btn" aria-label="Değeri sil"></v-btn>
                      </template>
                      <v-card class="pa-3 border shadow-xl rounded-lg bg-danger" min-width="200">
                        <div class="text-caption mb-2 text-center text-white font-weight-bold">Değeri Sil?</div>
                        <div class="d-flex justify-center gap-2">
                          <v-btn width="60" size="x-small" variant="flat" color="red-lighten-1"
                            class="rounded-sm text-white confirm-btn" @click="val.showValueDeleteConfirm = false">İPTAL</v-btn>
                          <v-btn width="60" size="x-small" color="red-darken-4" variant="flat"
                            class="rounded-sm text-white confirm-btn"
                            @click="deleteChoiceValue(item._id, val._id); val.showValueDeleteConfirm = false;">SİL</v-btn>
                        </div>
                      </v-card>
                    </v-menu>
                    <v-btn color="success" size="30" variant="flat" icon="mdi-check" class="premium-cube-btn"
                      aria-label="Kaydet" @click="updateChoiceValue(item); val.showValueMenu = false;"></v-btn>
                  </div>
                </v-card>
              </v-menu>
            </v-chip>

            <v-text-field v-if="item.showAddInput" v-model="item.tempValueTitle" density="compact" variant="outlined"
              hide-details autofocus class="add-val-input customTextField" aria-label="Yeni değer"
              @keyup.enter="item.editingChoiceValue = { title: item.tempValueTitle }; addChoiceValue(item); item.showAddInput = false; item.tempValueTitle = ''"
              @blur="!item.tempValueTitle ? item.showAddInput = false : null">
              <template v-slot:append-inner>
                <v-icon color="success" size="22" class="opacity-100 font-weight-black mr-1" aria-label="Değer ekle"
                  @click="item.editingChoiceValue = { title: item.tempValueTitle }; addChoiceValue(item); item.showAddInput = false; item.tempValueTitle = ''">mdi-plus-circle</v-icon>
              </template>
            </v-text-field>

            <v-btn v-else icon="mdi-plus" size="x-small" color="processButtonColor" variant="tonal" class="rounded-lg"
              :aria-label="$t('productDefinitions.choice.newChoiceValue')" @click="item.showAddInput = true"></v-btn>
          </div>
      </template>

      <template #cell-actions="{ row }">
        <EkButton tone="ghost" size="sm" icon="mdi-delete" icon-only class="choice-danger" aria-label="Grubu sil"
          @click="openDeleteConfirm(row)" />
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n';
import { useChoicesStore } from '@/stores/choicesStore';
import { useSnackbarStore } from '@/stores/snackbarStore';
import useFormRules from '@/composables/formrules';
import useRestApi from '@/composables/restapi';
import LoadingComponent from '@/components/LoadingComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import EkListScreen from '@/components/ds/templates/EkListScreen.vue';
import EkButton from '@/components/ds/EkButton.vue';
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue';
import { isRequestError, sortRows } from '@/components/ds/listStandard';

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
    snackbarStore.addSnackbar({ show: true, text: 'Grup Eklendi', color: 'processButtonColor' });
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

<style scoped>
.choiceListView {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .choiceListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.new-choice-form {
  width: 320px;
  max-width: 100%;
}

.new-field-label {
  color: var(--ek-color-content-muted);
}

/* Global `.customTextField .v-label` (site.css, opacity .8 !important) kontrastı AA altına düşürüyor
   (axe color-contrast) — yalnızca bu alanda yerel olarak düzeltilir. */
.new-choice-form :deep(.v-field .v-field-label) {
  color: var(--ek-color-content-muted) !important;
  opacity: 1 !important;
}

.choice-title-cell {
  min-width: 360px;
}

.choice-danger {
  color: var(--ek-color-error);
}

.group-title {
  color: var(--ek-color-content-default);
  font-size: var(--ek-font-size-sm);
  background: none;
  border: 0;
  padding: 0;
  text-align: start;
}

.group-title__icon {
  color: var(--ek-color-content-subtle);
}

.group-title:focus-visible,
.choice-chip-item:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.choice-chip-item {
  transition: border-color var(--ek-duration-fast) var(--ek-easing-standard);
  cursor: pointer;
  border: 1px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface);
}

.choice-chip-item:hover {
  border-color: var(--ek-color-primary);
}

.choice-chip-item__text {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-xs);
}

.confirm-btn {
  border: 1px solid var(--ek-color-surface);
}

.add-val-input {
  max-width: 160px;
}

.cursor-pointer {
  cursor: pointer;
}

.min-h-60 {
  min-height: 60px;
}

.gap-2 {
  gap: var(--ek-space-2);
}
</style>
