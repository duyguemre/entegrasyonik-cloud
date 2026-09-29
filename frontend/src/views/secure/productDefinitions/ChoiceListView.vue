<template>
  <div class="choiceListView d-flex flex-column h-100 overflow-hidden pt-4"
    style="position: absolute; inset: 0; background-color: #f5f7f9;">

    <LoadingComponent attach=".choiceListView" ref="loadingComponentRef" />
    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen" title="Grubu Sil?"
      :message="`'${confirmationDelete.item?.title}' grubu kalıcı olarak silinecektir. Emin misiniz?`"
      icon="mdi-delete-alert-outline" color="error" confirmText="SİL" cancelText="İPTAL" @confirm="removeChoice()"
      @cancel="confirmationDelete.isDialogOpen = false" />

    <div class="d-flex pa-2 pt-2 pb-0 mt-0  mb-1 align-start flex-wrap search-section" style="max-width:1200px">
      <v-text-field v-model="searchText" clearable density="compact" :label="$t('products.product.searchlabel')"
        variant="outlined" hide-details bg-color="textfieldColor" class="customTextField" style="max-width: 400px">
        <template #append-inner>
          <v-tooltip open-delay="1000" :text="$t('products.product.search')">
            <template v-slot:activator="{ props: tooltipProps }">
              <v-btn flat size="40" v-bind="{ ...tooltipProps }" class="pa-2 " elevation="0"
                style="border:1px solid white" color="white" @click.stop=""><v-icon size="x-large"
                  color="processButtonColor">mdi-magnify</v-icon></v-btn>
            </template>
          </v-tooltip>
        </template>
      </v-text-field>

      <v-tooltip open-delay="1000" text="Yenile">
        <template v-slot:activator="{ props: tooltipProps }">
          <v-btn v-bind="{ ...tooltipProps }" flat @click="retrieveChoices()" size="40" color="white"
            class="premium-cube-btn ml-2">
            <v-icon size="x-large" color="processButtonColor">mdi-refresh</v-icon>
          </v-btn>
        </template>
      </v-tooltip>

      <v-divider vertical class="mx-4" length="40"></v-divider>

      <v-form v-model="newChoiceForm" @submit.prevent="addChoice" class="d-flex align-center gap-2 flex-grow-1"
        style="max-width: 500px">
        <v-text-field v-model="newChoiceTitle" variant="outlined" density="compact" hide-details :rules="newChoiceRules"
          bg-color="textfieldColor" class="customTextField" :placeholder="$t('productDefinitions.choice.name')">
          <template v-slot:label>
            <span class="font-weight-light" style="color: #94a3b8">{{ $t('productDefinitions.choice.name') }}</span>
          </template>
          <template v-slot:append-inner>
            <v-btn icon="mdi-plus" size="x-small" color="processButtonColor" variant="tonal" class="rounded-lg"
              :disabled="!newChoiceForm || !newChoiceTitle" @click="addChoice">
            </v-btn>
          </template>
        </v-text-field>
      </v-form>

      <v-menu offset="5">
        <template v-slot:activator="{ props }">
          <v-btn v-bind="props" color="processButtonColor" variant="outlined" height="40"
            class="text-capitalize ml-2 rounded-sm" style="border: 1px solid #bbb; background-color: white;">
            <v-icon class="mr-1">mdi-folder-multiple-plus</v-icon> Şablonlar
          </v-btn>
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
    </div>

    <div class="table-wrapper mt-2">
      <v-data-table-server :itemsLength="pagination.totalNumberOfRecords" :items="computedChoices" :headers="headers"
        fixed-header class="pa-0 ma-0 desktop-table">

        <template v-slot:item.title="{ item }: any">
          <div class="d-flex align-center py-2">
            <v-menu v-model="item.showEditMenu" :close-on-content-click="false" location="bottom start"
              transition="scale-transition">
              <template v-slot:activator="{ props }">
                <div v-bind="props" class="cursor-pointer font-weight-bold d-flex align-center"
                  style="color: #455a64; font-size: 14px;" @click="item.tempTitle = item.title">
                  {{ item.title }}
                  <v-icon size="14" class="ml-2" color="grey-lighten-1">mdi-pencil-outline</v-icon>
                </div>
              </template>
              <v-card min-width="300" class="d-flex pa-4 rounded-lg shadow-xl border">
                <v-text-field v-model="item.tempTitle" label="Grup Adını Düzenle" variant="outlined" density="compact"
                  hide-details
                  @keyup.enter="item.title = item.tempTitle; updateChoice(item); item.showEditMenu = false;"
                  class="mb-3 customTextField"></v-text-field>
                <v-btn block color="success" size="40" min-width="0" icon="mdi-check" variant="flat"
                  class="premium-cube-btn flex-grow-0 ml-2"
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

        <template v-slot:item.choices="{ item }: any">
          <div class="d-flex flex-wrap gap-2 py-2 align-center min-h-60">
            <v-chip v-for="val in item.values" :key="val._id" size="small" variant="outlined" class="choice-chip-item"
              style="border: 1px solid #bbb; border-radius: 5px; background: #fcfdfe;">
              <span class="mr-2 text-black font-weight-medium" style="font-size: 12px">{{ val.title }}</span>
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
                          class="premium-cube-btn"></v-btn>
                      </template>
                      <v-card class="pa-3 border shadow-xl rounded-lg bg-danger" min-width="200">
                        <div class="text-caption mb-2 text-center text-white font-weight-bold">Değeri Sil?</div>
                        <div class="d-flex justify-center gap-2">
                          <v-btn width="60" size="x-small" variant="flat" color="red-lighten-1"
                            class="rounded-sm text-white" @click="val.showValueDeleteConfirm = false"
                            style="border:1px solid white">İPTAL</v-btn>
                          <v-btn width="60" size="x-small" color="red-darken-4" variant="flat"
                            style="border:1px solid white" class="rounded-sm text-white"
                            @click="deleteChoiceValue(item._id, val._id); val.showValueDeleteConfirm = false;">SİL</v-btn>
                        </div>
                      </v-card>
                    </v-menu>
                    <v-btn color="success" size="30" variant="flat" icon="mdi-check" class="premium-cube-btn"
                      @click="updateChoiceValue(item); val.showValueMenu = false;"></v-btn>
                  </div>
                </v-card>
              </v-menu>
            </v-chip>

            <v-text-field v-if="item.showAddInput" v-model="item.tempValueTitle" density="compact" variant="outlined"
              hide-details autofocus class="add-val-input customTextField"
              @keyup.enter="item.editingChoiceValue = { title: item.tempValueTitle }; addChoiceValue(item); item.showAddInput = false; item.tempValueTitle = ''"
              @blur="!item.tempValueTitle ? item.showAddInput = false : null">
              <template v-slot:append-inner>
                <v-icon color="success" size="22" class="opacity-100 font-weight-black mr-1"
                  @click="item.editingChoiceValue = { title: item.tempValueTitle }; addChoiceValue(item); item.showAddInput = false; item.tempValueTitle = ''">mdi-plus-circle</v-icon>
              </template>
            </v-text-field>

            <v-btn v-else icon="mdi-plus" size="x-small" color="processButtonColor" variant="tonal" class="rounded-lg"
              @click="item.showAddInput = true"></v-btn>
          </div>
        </template>

        <template v-slot:item.actions="{ item }: any">
          <div class="d-flex justify-end pr-2">
            <v-btn flat size="35" color="danger" class="premium-cube-btn" @click="openDeleteConfirm(item)">
              <v-icon size="x-large" color="white">mdi-delete</v-icon>
            </v-btn>
          </div>
        </template>

        <template v-slot:no-data>
          <EmptyState title="Grup Bulunamadı" message="Arama kriterlerinize uygun herhangi bir varyant grubu bulunamadı." />
        </template>

        <template v-slot:bottom>
          <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
            @setPage="handlePageChange" v-model="pagination.page"
            style="position:relative; border-top:1px solid #ddd" />
        </template>
      </v-data-table-server>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, reactive } from 'vue'
import { useI18n } from 'vue-i18n';
import { useChoicesStore } from '@/stores/choicesStore';
import { useSnackbarStore } from '@/stores/snackbarStore';
import useFormRules from '@/composables/formrules';
import useRestApi from '@/composables/restapi';
import PaginationComponent from '@/components/PaginationComponent.vue';
import LoadingComponent from '@/components/LoadingComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import EmptyState from '@/components/layout/EmptyState.vue';

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

const pagination = reactive({
  page: 1,
  limit: 15,
  totalNumberOfPages: 1,
  totalNumberOfRecords: 0
})

const newChoiceRules = [...formRules.mandatoryRule, ...formRules.length_2_160]

onBeforeMount(() => retrieveChoices())

const copy = (obj: any) => obj ? JSON.parse(JSON.stringify(obj)) : null

const retrieveChoices = async () => {
  await choicesStore.retrieve()
  const rawData = copy(choicesStore.getChoices().value)
  choicesStoreChoices.value = rawData.map((c: any) => ({
    ...c,
    showAddInput: false,
    tempValueTitle: '',
    tempTitle: c.title,
    editingChoiceValue: {},
    showEditMenu: false,
    showDeleteConfirm: false
  }))
}

const openDeleteConfirm = (item: any) => {
  confirmationDelete.item = item
  confirmationDelete.isDialogOpen = true
}

const handlePageChange = () => { };

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

const computedChoices = computed(() => {
  const start = (pagination.page - 1) * pagination.limit
  return computedSearchChoices.value.slice(start, start + pagination.limit)
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

const headers: any = [
  { title: t('productDefinitions.choice.headers.choiceGroup'), key: "title", width: '400px', align: 'start' },
  { title: t('productDefinitions.choice.headers.choices'), key: "choices", sortable: false, align: 'start' },
  { title: '', key: "actions", sortable: false, align: 'end', width: '60px' },
]
</script>

<style scoped>
.choiceListView {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #f5f7f9;
}

.search-section {
  flex-shrink: 0;
  z-index: 10;
}

.table-wrapper {
  flex-grow: 1;
  position: relative;
  min-height: 0;
}

.desktop-table {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-top: 1px solid #96a9b7;
  background-color: white !important;
}

/* Header titremesini önleyen kritik CSS */
:deep(.v-data-table__th) {
  background-color: white !important;
  z-index: 2 !important;
}

:deep(.v-table__wrapper) {
  flex-grow: 1 !important;
  height: 100% !important;
  overflow-y: auto !important;
}

:deep(.v-data-table-header__content) {
  font-weight: 700 !important;
}

.choice-chip-item {
  transition: all 0.2s;
  cursor: pointer;
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
  gap: 8px;
}
</style>