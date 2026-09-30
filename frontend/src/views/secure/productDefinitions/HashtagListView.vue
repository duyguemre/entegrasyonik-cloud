<template>
  <div class="hashtagListView">

    <LoadingComponent attach=".hashtagListView" ref="loadingComponentRef" />
    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen" title="Grubu Sil?"
      :message="`'${confirmationDelete.item?.title}' grubu kalıcı olarak silinecektir. Emin misiniz?`"
      icon="mdi-delete-alert-outline" color="error" confirmText="Sil" cancelText="İptal" @confirm="removeHashtag()"
      @cancel="confirmationDelete.isDialogOpen = false" />

    <EkListScreen
      section="Katalog"
      :title="$t('menu.productDefinitions.hashtagList')"
      label="Etiket grupları tablosu"
      noun="grup"
      row-key="_id"
      label-key="title"
      :columns="columns"
      :rows="pagedHashtags"
      :loading="loading"
      :error="loadError"
      error-title="Etiketler yüklenemedi"
      v-model:search="searchText"
      :search-placeholder="$t('products.product.searchlabel')"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Etiket Bulunamadı"
      empty-text="Arama kriterlerinize uygun herhangi bir etiket grubu bulunamadı."
      filtered-empty-title="Etiket Bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir etiket grubu bulunamadı."
      empty-icon="mdi-pound"
      refresh-label="Yenile"
      @update:sort="(s) => { gridSort = s; pagination.page = 1 }"
      @update:page="(p) => (pagination.page = p)"
      @update:page-size="(n) => { pagination.limit = n; pagination.page = 1 }"
      @refresh="retrieveHashtags()"
    >
      <template #header-actions>
        <v-form v-model="newHashtagForm" @submit.prevent="addHashtag" class="new-hashtag-form">
          <v-text-field v-model="newHashtagTitle" variant="outlined" density="compact" hide-details
            :rules="newHashtagRules" class="customTextField"
            :placeholder="$t('productDefinitions.hashtag.new.title')">
            <template v-slot:label>
              <span class="font-weight-light new-field-label">{{ $t('productDefinitions.hashtag.new.title') }}</span>
            </template>
            <template v-slot:append-inner>
              <v-btn icon="mdi-plus" size="x-small" color="neutral" variant="tonal" class="rounded-lg"
                :aria-label="$t('productDefinitions.hashtag.new.title')" :disabled="!newHashtagForm || !newHashtagTitle"
                @click="addHashtag">
              </v-btn>
            </template>
          </v-text-field>
        </v-form>
      </template>

      <template #cell-title="{ row: item }">
        <div class="d-flex align-center py-2 hashtag-title-cell">
          <v-menu v-model="item.showEditMenu" :close-on-content-click="false" location="bottom start"
            transition="scale-transition">
            <template v-slot:activator="{ props }">
              <button v-bind="props" type="button" class="cursor-pointer font-weight-bold d-flex align-center group-title"
                @click="item.tempTitle = item.title">
                <v-icon size="18" :color="item.color || undefined" class="mr-2 group-title__tag" aria-hidden="true">mdi-label-variant</v-icon>
                {{ item.title }}
                <v-icon size="14" class="ml-2 group-title__icon" aria-hidden="true">mdi-pencil-outline</v-icon>
              </button>
            </template>
            <v-card min-width="300" class="pa-4 rounded-lg shadow-xl border">
              <v-text-field v-model="item.tempTitle" label="Grup Adını Düzenle" variant="outlined" density="compact"
                hide-details class="mb-3 customTextField"></v-text-field>

              <div class="text-caption mb-2 swatch-caption">Grup Rengi</div>
              <div class="d-flex flex-wrap gap-1 mb-4" role="group" aria-label="Grup Rengi">
                <v-btn v-for="c in swatchList" :key="c" :color="c" variant="flat" icon density="compact" size="24"
                  class="swatch" :class="{ 'swatch--selected': item.color === c }"
                  :aria-label="c" :aria-pressed="item.color === c" @click="item.color = c" />
              </div>

              <v-btn block color="success" size="40" variant="flat"
                @click="item.title = item.tempTitle; updateHashtag(item); item.showEditMenu = false;">
                KAYDET
              </v-btn>
            </v-card>
          </v-menu>
        </div>
      </template>

      <template #cell-hashtags="{ row: item }">
        <div class="d-flex flex-wrap gap-2 py-2 align-center min-h-60">
          <button v-for="val in item.values" :key="val._id" type="button" class="hashtag-chip-item"
            :style="val.color ? { backgroundColor: val.color } : undefined"
            :class="val.color ? (getTextColor(val.color) === 'white' ? 'is-on-dark' : 'is-on-light') : 'is-neutral'">
            <span class="mr-2 font-weight-bold hashtag-chip-item__text"><v-icon
                size="12" class="mr-1" aria-hidden="true">mdi-tag</v-icon>{{ val.title }}</span>
            <v-menu v-model="val.showValueMenu" activator="parent" :close-on-content-click="false"
              transition="fade-transition"
              @update:model-value="(state) => state ? item.editingHashtagValue = copy(val) : null">
              <v-card width="260" class="pa-3 rounded-lg border shadow-lg">
                <v-text-field v-model="item.editingHashtagValue.title" density="compact" variant="outlined"
                  label="Etiket Adı" hide-details class="mb-3 customTextField"></v-text-field>

                <div class="text-caption mb-2 swatch-caption">Etiket Rengi</div>
                <div class="d-flex flex-wrap gap-1 mb-4" role="group" aria-label="Etiket Rengi">
                  <v-btn v-for="c in swatchList" :key="c" :color="c" variant="flat" icon density="compact" size="22"
                    class="swatch" :class="{ 'swatch--selected': item.editingHashtagValue.color === c }"
                    :aria-label="c" :aria-pressed="item.editingHashtagValue.color === c"
                    @click="item.editingHashtagValue.color = c" />
                </div>

                <div class="d-flex justify-space-between align-center">
                  <v-menu v-model="val.showValueDeleteConfirm" :close-on-content-click="false" location="top center">
                    <template v-slot:activator="{ props }">
                      <v-btn v-bind="props" icon="mdi-delete" size="30" color="error" variant="flat"
                        class="premium-cube-btn" aria-label="Etiketi sil"></v-btn>
                    </template>
                    <v-card class="pa-3 border shadow-xl rounded-lg" min-width="200">
                      <div class="text-caption mb-2 text-center font-weight-bold confirm-title">Etiketi Sil?</div>
                      <div class="d-flex justify-center gap-2">
                        <EkButton tone="secondary" size="sm" @click="val.showValueDeleteConfirm = false">İPTAL</EkButton>
                        <EkButton tone="danger" size="sm"
                          @click="deleteHashtagValue(item._id, val._id); val.showValueDeleteConfirm = false;">SİL</EkButton>
                      </div>
                    </v-card>
                  </v-menu>
                  <v-btn color="success" size="30" variant="flat" icon="mdi-check" class="premium-cube-btn"
                    aria-label="Kaydet" @click="updateHashtagValue(item); val.showValueMenu = false;"></v-btn>
                </div>
              </v-card>
            </v-menu>
          </button>

          <v-text-field v-if="item.showAddInput" v-model="item.tempValueTitle" density="compact" variant="outlined"
            hide-details autofocus class="add-val-input customTextField" aria-label="Yeni etiket"
            @keyup.enter="item.editingHashtagValue = { title: item.tempValueTitle }; addHashtagValue(item); item.showAddInput = false; item.tempValueTitle = ''"
            @blur="!item.tempValueTitle ? item.showAddInput = false : null">
            <template v-slot:append-inner>
              <v-icon color="success" size="22" class="opacity-100 font-weight-black mr-1" aria-label="Etiket ekle"
                @click="item.editingHashtagValue = { title: item.tempValueTitle }; addHashtagValue(item); item.showAddInput = false; item.tempValueTitle = ''">mdi-plus-circle</v-icon>
            </template>
          </v-text-field>

          <v-btn v-else icon="mdi-plus" size="x-small" color="neutral" variant="tonal" class="rounded-lg"
            aria-label="Etiket ekle" @click="item.showAddInput = true"></v-btn>
        </div>
      </template>

      <template #cell-actions="{ row }">
        <EkButton tone="ghost" size="sm" icon="mdi-delete" icon-only class="hashtag-danger" aria-label="Grubu sil"
          @click="openDeleteConfirm(row)" />
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeMount, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n';
import { useHashtagsStore } from '@/stores/hashtagsStore';
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

const newHashtagRules = [...formRules.mandatoryRule, ...formRules.length_2_160]

// Etiket rengi VERİdir (DB'de '#RRGGBB' olarak saklanır) — tasarım token'ı değil, kullanıcının seçtiği palet.
// 24-bit tamsayı olarak tutulur, kayıt biçimine (`#RRGGBB`) çevrilir.
const swatchRgb = [
  0xff0000, 0xaa0000, 0x550000, 0xffff00, 0xaaaa00, 0x555500, 0x00ff00, 0x00aa00,
  0x005500, 0x00ffff, 0x00aaaa, 0x005555, 0x0000ff, 0x0000aa, 0x000055, 0xe91e63,
  0x9c27b0, 0x673ab7, 0x3f51b5, 0x2196f3, 0x03a9f4, 0x00bcd4, 0x009688, 0x4caf50,
  0x8bc34a, 0xcddc39, 0xffeb3b, 0xffc107, 0xff9800, 0xff5722, 0x795548, 0x9e9e9e,
  0x607d8b,
]
const swatchList = swatchRgb.map((rgb) => '#' + rgb.toString(16).padStart(6, '0').toUpperCase())

watch(searchText, () => { pagination.page = 1 })

onBeforeMount(() => retrieveHashtags())

const copy = (obj: any) => obj ? JSON.parse(JSON.stringify(obj)) : null

const retrieveHashtags = async () => {
  loading.value = true
  loadError.value = false
  await hashtagsStore.retrieve()
  const fetched: any = hashtagsStore.hashtags
  if (isRequestError(fetched)) {
    loadError.value = true
    hashtagsStoreHashtags.value = []
    loading.value = false
    return
  }
  const rawData = Array.isArray(fetched) ? copy(fetched) : []
  hashtagsStoreHashtags.value = (rawData || []).map((c: any) => ({
    ...c,
    showAddInput: false,
    tempValueTitle: '',
    tempTitle: c.title,
    editingHashtagValue: {},
    showEditMenu: false,
    showDeleteConfirm: false
  }))
  loading.value = false
}

const openDeleteConfirm = (item: any) => {
  confirmationDelete.item = item
  confirmationDelete.isDialogOpen = true
}

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

const pagedHashtags = computed(() => {
  const start = (pagination.page - 1) * pagination.limit
  return sortRows(computedSearchHashtags.value, gridSort.value).slice(start, start + pagination.limit)
})

const addHashtag = async () => {
  let guid = loadingComponentRef.value.info(t('loading.info.updateData'))
  const res = await hashtagsStore.addHashtag({ title: newHashtagTitle.value })
  if (res) {
    newHashtagTitle.value = ''
    retrieveHashtags()
    snackbarStore.addSnackbar({ show: true, text: 'Grup Eklendi', color: 'neutral' });
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

const columns: EkGridColumn[] = [
  { key: 'title', label: 'Etiket grubu', sortable: true },
  { key: 'hashtags', label: 'Etiketler', wrap: true },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
]
</script>

<style scoped>
.hashtagListView {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .hashtagListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.new-hashtag-form {
  width: 320px;
  max-width: 100%;
}

.new-field-label {
  color: var(--ek-color-content-muted);
}

/* Global `.customTextField .v-label` (site.css, opacity .8 !important) kontrastı AA altına düşürüyor
   (axe color-contrast) — yalnızca bu alanda yerel olarak düzeltilir. */
.new-hashtag-form :deep(.v-field .v-field-label) {
  color: var(--ek-color-content-muted) !important;
  opacity: 1 !important;
}

.hashtag-title-cell {
  min-width: 260px;
}

.hashtag-danger {
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

.group-title__tag {
  color: var(--ek-color-content-subtle);
}

.group-title__icon {
  color: var(--ek-color-content-subtle);
}

.group-title:focus-visible,
.hashtag-chip-item:focus-visible,
.swatch:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.swatch-caption {
  color: var(--ek-color-content-muted);
}

/* Renk kutuları: zemin, kullanıcının seçtiği VERİ rengidir (v-btn `color` prop'u) — token değil. */
.swatch {
  border-radius: var(--ek-radius-sm);
  border: 1px solid var(--ek-color-border-default);
}

.swatch--selected {
  border: 2px solid var(--ek-color-content-strong);
}

.hashtag-chip-item {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 var(--ek-space-3);
  border: 0;
  transition: box-shadow var(--ek-duration-fast) var(--ek-easing-standard);
  cursor: pointer;
  border-radius: var(--ek-radius-sm);
}

/* Etiket rengi veri; metin rengi zemin parlaklığına göre (getTextColor) token'dan seçilir. */
.hashtag-chip-item.is-on-dark {
  color: var(--ek-color-content-inverse);
}

.hashtag-chip-item.is-on-light {
  color: var(--ek-color-content-strong);
}

.hashtag-chip-item.is-neutral {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-strong);
}

.hashtag-chip-item__text {
  font-size: var(--ek-font-size-xs);
}

.confirm-title {
  color: var(--ek-color-content-strong);
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
  gap: var(--ek-space-1);
}

.gap-2 {
  gap: var(--ek-space-2);
}
</style>
