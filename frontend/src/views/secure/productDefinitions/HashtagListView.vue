<template>
  <div class="hashtagListView d-flex flex-column h-100 overflow-hidden pt-4"
    style="position: absolute; inset: 0; background-color: #f5f7f9;">

    <LoadingComponent attach=".hashtagListView" ref="loadingComponentRef" />
    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen" title="Grubu Sil?"
      :message="`'${confirmationDelete.item?.title}' grubu kalıcı olarak silinecektir. Emin misiniz?`"
      icon="mdi-delete-alert-outline" color="error" confirmText="SİL" cancelText="İPTAL" @confirm="removeHashtag()"
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
          <v-btn v-bind="{ ...tooltipProps }" flat @click="retrieveHashtags()" size="40" color="white"
            class="premium-cube-btn ml-2">
            <v-icon size="x-large" color="processButtonColor">mdi-refresh</v-icon>
          </v-btn>
        </template>
      </v-tooltip>

      <v-divider vertical class="mx-4" length="40"></v-divider>

      <v-form v-model="newHashtagForm" @submit.prevent="addHashtag" class="d-flex align-center gap-2 flex-grow-1"
        style="max-width: 500px">
        <v-text-field v-model="newHashtagTitle" variant="outlined" density="compact" hide-details
          :rules="newHashtagRules" bg-color="textfieldColor" class="customTextField"
          :placeholder="$t('productDefinitions.hashtag.new.title')">
          <template v-slot:label>
            <span class="font-weight-light" style="color: #94a3b8">{{ $t('productDefinitions.hashtag.new.title')
              }}</span>
          </template>
          <template v-slot:append-inner>
            <v-btn icon="mdi-plus" size="x-small" color="processButtonColor" variant="tonal" class="rounded-lg"
              :disabled="!newHashtagForm || !newHashtagTitle" @click="addHashtag">
            </v-btn>
          </template>
        </v-text-field>
      </v-form>
    </div>

    <div class="table-wrapper mt-2">
      <v-data-table-server :itemsLength="pagination.totalNumberOfRecords" :items="computedHashtags" :headers="headers"
        fixed-header class="pa-0 ma-0 desktop-table">

        <template v-slot:item.title="{ item }: any">
          <div class="d-flex align-center py-2">
            <v-menu v-model="item.showEditMenu" :close-on-content-click="false" location="bottom start"
              transition="scale-transition">
              <template v-slot:activator="{ props }">
                <div v-bind="props" class="cursor-pointer font-weight-bold d-flex align-center"
                  style="color: #455a64; font-size: 14px;" @click="item.tempTitle = item.title">
                  <v-icon size="18" :color="item.color || 'grey'" class="mr-2">mdi-label-variant</v-icon>
                  {{ item.title }}
                  <v-icon size="14" class="ml-2" color="grey-lighten-1">mdi-pencil-outline</v-icon>
                </div>
              </template>
              <v-card min-width="300" class="pa-4 rounded-lg shadow-xl border">
                <v-text-field v-model="item.tempTitle" label="Grup Adını Düzenle" variant="outlined" density="compact"
                  hide-details class="mb-3 customTextField"></v-text-field>

                <div class="text-caption mb-2 text-grey">Grup Rengi</div>
                <div class="d-flex flex-wrap gap-1 mb-4">
                  <div v-for="c in swatchList" :key="c" @click="item.color = c"
                    :style="`background: ${c}; width: 24px; height: 24px; cursor: pointer; border-radius: 4px; border: ${item.color === c ? '2px solid black' : '1px solid #ddd'}`">
                  </div>
                </div>

                <v-btn block color="success" size="40" variant="flat"
                  @click="item.title = item.tempTitle; updateHashtag(item); item.showEditMenu = false;">
                  KAYDET
                </v-btn>
              </v-card>
            </v-menu>
          </div>
        </template>

        <template v-slot:item.hashtags="{ item }: any">
          <div class="d-flex flex-wrap gap-2 py-2 align-center min-h-60">
            <v-chip v-for="val in item.values" :key="val._id" size="small" variant="flat"
              :color="val.color || 'grey-lighten-3'" class="hashtag-chip-item" style="border-radius: 5px;">
              <span class="mr-2 font-weight-bold" :style="`color: ${getTextColor(val.color)}; font-size: 12px`"><v-icon
                  size="12" class="mr-1">mdi-tag</v-icon>{{ val.title }}</span>
              <v-menu v-model="val.showValueMenu" activator="parent" :close-on-content-click="false"
                transition="fade-transition"
                @update:model-value="(state) => state ? item.editingHashtagValue = copy(val) : null">
                <v-card width="260" class="pa-3 rounded-lg border shadow-lg">
                  <v-text-field v-model="item.editingHashtagValue.title" density="compact" variant="outlined"
                    label="Etiket Adı" hide-details class="mb-3 customTextField"></v-text-field>

                  <div class="text-caption mb-2 text-grey">Etiket Rengi</div>
                  <div class="d-flex flex-wrap gap-1 mb-4">
                    <div v-for="c in swatchList" :key="c" @click="item.editingHashtagValue.color = c"
                      :style="`background: ${c}; width: 22px; height: 22px; cursor: pointer; border-radius: 4px; border: ${item.editingHashtagValue.color === c ? '2px solid black' : '1px solid #ddd'}`">
                    </div>
                  </div>

                  <div class="d-flex justify-space-between align-center">
                    <v-menu v-model="val.showValueDeleteConfirm" :close-on-content-click="false" location="top center">
                      <template v-slot:activator="{ props }">
                        <v-btn v-bind="props" icon="mdi-delete" size="30" color="danger" variant="flat"
                          class="premium-cube-btn"></v-btn>
                      </template>
                      <v-card class="pa-3 border shadow-xl rounded-lg bg-danger" min-width="200">
                        <div class="text-caption mb-2 text-center text-white font-weight-bold">Etiketi Sil?</div>
                        <div class="d-flex justify-center gap-2">
                          <v-btn width="60" size="x-small" variant="flat" color="red-lighten-1"
                            class="rounded-sm text-white" @click="val.showValueDeleteConfirm = false"
                            style="border:1px solid white">İPTAL</v-btn>
                          <v-btn width="60" size="x-small" color="red-darken-4" variant="flat"
                            style="border:1px solid white" class="rounded-sm text-white"
                            @click="deleteHashtagValue(item._id, val._id); val.showValueDeleteConfirm = false;">SİL</v-btn>
                        </div>
                      </v-card>
                    </v-menu>
                    <v-btn color="success" size="30" variant="flat" icon="mdi-check" class="premium-cube-btn"
                      @click="updateHashtagValue(item); val.showValueMenu = false;"></v-btn>
                  </div>
                </v-card>
              </v-menu>
            </v-chip>

            <v-text-field v-if="item.showAddInput" v-model="item.tempValueTitle" density="compact" variant="outlined"
              hide-details autofocus class="add-val-input customTextField"
              @keyup.enter="item.editingHashtagValue = { title: item.tempValueTitle }; addHashtagValue(item); item.showAddInput = false; item.tempValueTitle = ''"
              @blur="!item.tempValueTitle ? item.showAddInput = false : null">
              <template v-slot:append-inner>
                <v-icon color="success" size="22" class="opacity-100 font-weight-black mr-1"
                  @click="item.editingHashtagValue = { title: item.tempValueTitle }; addHashtagValue(item); item.showAddInput = false; item.tempValueTitle = ''">mdi-plus-circle</v-icon>
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
          <EmptyState title="Etiket Bulunamadı" message="Arama kriterlerinize uygun herhangi bir etiket grubu bulunamadı." />
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
import { useHashtagsStore } from '@/stores/hashtagsStore';
import { useSnackbarStore } from '@/stores/snackbarStore';
import useFormRules from '@/composables/formrules';
import useRestApi from '@/composables/restapi';
import PaginationComponent from '@/components/PaginationComponent.vue';
import LoadingComponent from '@/components/LoadingComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import EmptyState from '@/components/layout/EmptyState.vue';

const { t } = useI18n()
const hashtagsStore = useHashtagsStore()
const snackbarStore = useSnackbarStore()
const formRules = useFormRules()
const restApi = useRestApi()

const loadingComponentRef = ref()
const confirmationDelete = reactive({ isDialogOpen: false, item: null as any })
const searchText = ref('')
const newHashtagTitle = ref('')
const newHashtagForm = ref(false)
const hashtagsStoreHashtags = ref<any[]>([])

const pagination = reactive({
  page: 1,
  limit: 15,
  totalNumberOfPages: 1,
  totalNumberOfRecords: 0
})

const newHashtagRules = [...formRules.mandatoryRule, ...formRules.length_2_160]

const swatchList = [
  '#FF0000', '#AA0000', '#550000',
  '#FFFF00', '#AAAA00', '#555500',
  '#00FF00', '#00AA00', '#005500',
  '#00FFFF', '#00AAAA', '#005555',
  '#0000FF', '#0000AA', '#000055',
  '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4', '#009688',
  '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722', '#795548', '#9E9E9E', '#607D8B'
]

onBeforeMount(() => retrieveHashtags())

const copy = (obj: any) => obj ? JSON.parse(JSON.stringify(obj)) : null

const retrieveHashtags = async () => {
  let guid = loadingComponentRef.value?.info(t('loading.info.retrievingData'))
  await hashtagsStore.retrieve()
  const rawData = copy(hashtagsStore.hashtags)
  hashtagsStoreHashtags.value = (rawData || []).map((c: any) => ({
    ...c,
    showAddInput: false,
    tempValueTitle: '',
    tempTitle: c.title,
    editingHashtagValue: {},
    showEditMenu: false,
    showDeleteConfirm: false
  }))
  if (guid) loadingComponentRef.value.remove(guid)
}

const openDeleteConfirm = (item: any) => {
  confirmationDelete.item = item
  confirmationDelete.isDialogOpen = true
}

const handlePageChange = () => { };

const computedSearchHashtags = computed(() => {
  const query = searchText.value?.toLocaleUpperCase('tr') || ''
  const filtered = hashtagsStoreHashtags.value.filter(c =>
    c.title.toLocaleUpperCase('tr').includes(query) ||
    c.values?.some((v: any) => v.title.toLocaleUpperCase('tr').includes(query))
  )

  pagination.totalNumberOfRecords = filtered.length
  pagination.totalNumberOfPages = Math.ceil(filtered.length / pagination.limit) || 1

  return filtered
})

const computedHashtags = computed(() => {
  const start = (pagination.page - 1) * pagination.limit
  return computedSearchHashtags.value.slice(start, start + pagination.limit)
})

const addHashtag = async () => {
  let guid = loadingComponentRef.value.info(t('loading.info.updateData'))
  const res = await hashtagsStore.addHashtag({ title: newHashtagTitle.value })
  if (res) {
    newHashtagTitle.value = ''
    retrieveHashtags()
    snackbarStore.addSnackbar({ show: true, text: 'Grup Eklendi', color: 'processButtonColor' });
  }
  loadingComponentRef.value.remove(guid)
}

const updateHashtag = async (item: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.updateData'))
  await hashtagsStore.updateHashtag({ _id: item._id, title: item.title, color: item.color })
  retrieveHashtags()
  loadingComponentRef.value.remove(guid)
}

const removeHashtag = async () => {
  if (!confirmationDelete.item) return
  let guid = loadingComponentRef.value.info(t('loading.info.updateData'))
  const res = await hashtagsStore.removeHashtag(confirmationDelete.item._id)
  if (res) {
    snackbarStore.addSnackbar({ show: true, text: 'Silindi', color: 'success' });
    retrieveHashtags()
  }
  loadingComponentRef.value.remove(guid)
  confirmationDelete.isDialogOpen = false
}

const addHashtagValue = async (item: any) => {
  if (!item.editingHashtagValue?.title) return
  let guid = loadingComponentRef.value.info(t('loading.info.updateData'))
  const res = await hashtagsStore.addHashtagValue({ _id: item._id, title: item.editingHashtagValue.title })
  if (res) retrieveHashtags()
  loadingComponentRef.value.remove(guid)
}

const updateHashtagValue = async (item: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.updateData'))
  await hashtagsStore.updateHashtagValue({
    _id: item._id,
    id: item.editingHashtagValue._id,
    title: item.editingHashtagValue.title,
    color: item.editingHashtagValue.color
  })
  retrieveHashtags()
  loadingComponentRef.value.remove(guid)
}

const deleteHashtagValue = async (cid: any, vid: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.updateData'))
  await hashtagsStore.removeHashtagValue(cid, vid)
  retrieveHashtags()
  loadingComponentRef.value.remove(guid)
}

const getTextColor = (bgColor: string) => {
  if (!bgColor) return 'black'
  const color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor
  const r = parseInt(color.substring(0, 2), 16)
  const g = parseInt(color.substring(2, 4), 16)
  const b = parseInt(color.substring(4, 6), 16)
  const uicolors = [r / 255, g / 255, b / 255]
  const c = uicolors.map((col) => {
    if (col <= 0.03928) {
      return col / 12.92
    }
    return Math.pow((col + 0.055) / 1.055, 2.4)
  })
  const L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2])
  return (L > 0.179) ? 'black' : 'white'
}

const headers: any = [
  { title: "Etiket Grubu", key: "title", width: '400px', align: 'start' },
  { title: "Etiketler", key: "hashtags", sortable: false, align: 'start' },
  { title: '', key: "actions", sortable: false, align: 'end', width: '60px' },
]
</script>

<style scoped>
.hashtagListView {
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

.hashtag-chip-item {
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

.gap-1 {
  gap: 4px;
}

.gap-2 {
  gap: 8px;
}
</style>