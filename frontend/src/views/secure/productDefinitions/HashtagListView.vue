<template>
  <div class="hashtagListView">

    <LoadingComponent attach=".hashtagListView" ref="loadingComponentRef" />
    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen" title="Grubu Sil?"
      :message="`'${confirmationDelete.item?.title}' grubu kalıcı olarak silinecektir. Emin misiniz?`"
      icon="mdi-trash-can-outline" color="error" confirmText="Sil" cancelText="İptal" @confirm="removeHashtag()"
      @cancel="confirmationDelete.isDialogOpen = false" />

    <EkListScreen ref="listScreenRef"
      summary-toggle
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
      search-placeholder="Grup veya etiket ara"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Etiket Bulunamadı"
      empty-text="Ürünlerinizi gruplamak için ilk etiket grubunu oluşturun."
      filtered-empty-title="Etiket Bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir etiket grubu bulunamadı."
      empty-icon="mdi-pound"
      refresh-label="Yenile"
      @update:sort="(s) => { gridSort = s; pagination.page = 1 }"
      @update:page="(p) => (pagination.page = p)"
      @update:page-size="(n) => { pagination.limit = n; pagination.page = 1 }"
      @refresh="retrieveHashtags()"
    >
      <!-- FE-LOCAL-1052: Liste | Özet — özet listenin yerine açılır; gruba tıklayınca liste o gruba süzülür. -->
      <template #summary="{ close }">
        <DefinitionGroupsDashboard :cells="dashCells" :groups="dashGroups" group-noun="Etiket grubu" value-noun="etiket"
          icon="mdi-pound" :loading="loading" empty-text="Henüz etiket grubu yok."
          @select="(title) => { searchText = title; close() }" />
      </template>

      <!-- Araç şeridi (sağ): "Yeni grup" (sayfanın TEK birincil eylemi; ad küçük kartta sorulur) — arama solda. -->
      <template #create>
        <v-menu v-model="newMenu" :close-on-content-click="false" location="bottom end" :offset="6">
          <template v-slot:activator="{ props }">
            <EkButton v-bind="props" tone="primary" icon="mdi-plus" class="def-new">Yeni grup</EkButton>
          </template>
          <v-card class="def-pop" width="300">
            <div class="def-pop__caption">Yeni etiket grubu</div>
            <v-form v-model="newHashtagForm" class="def-new-form" @submit.prevent="submitNew">
              <v-text-field v-model="newHashtagTitle" variant="outlined" density="compact" hide-details autofocus
                :rules="newHashtagRules" class="def-new-input" label="Grup adı" placeholder="Örn. Kampanya, Sezon" />
            </v-form>
            <div class="def-pop__row">
              <EkButton tone="secondary" size="sm" @click="newMenu = false">Vazgeç</EkButton>
              <EkButton tone="primary" size="sm" icon="mdi-plus" :disabled="!newHashtagForm || !newHashtagTitle" @click="submitNew">Grup ekle</EkButton>
            </div>
          </v-card>
        </v-menu>
      </template>

      <template #cell-title="{ row: item }">
        <div class="def-title-cell">
          <v-menu v-model="item.showEditMenu" :close-on-content-click="false" location="bottom start">
            <template v-slot:activator="{ props }">
              <button v-bind="props" type="button" class="def-title def-title--grouped" @click="item.tempTitle = item.title">
                <!-- Grup kutucuğu: grubun kendi rengiyle tonlu "#" (renk yoksa site mavisi). -->
                <span class="def-group-tile" :style="{ '--grp': item.color || 'var(--ek-color-action)' }" aria-hidden="true">
                  <v-icon icon="mdi-pound" />
                </span>
                <span class="def-title__text">
                  <span class="def-title__name">{{ item.title }}<v-icon size="14" class="def-title__icon" aria-hidden="true">mdi-pencil-outline</v-icon></span>
                  <span class="def-title__meta">{{ (item.values?.length ?? 0) }} etiket</span>
                </span>
              </button>
            </template>
            <v-card class="def-pop" width="300">
              <div class="def-pop__caption">Grup adı</div>
              <v-text-field v-model="item.tempTitle" label="Grup adını düzenle" variant="outlined" density="compact"
                hide-details autofocus class="mb-3" @keyup.enter="saveRename(item)" />

              <div class="def-pop__caption">Grup rengi</div>
              <div class="def-swatches" role="group" aria-label="Grup Rengi">
                <v-btn v-for="c in swatchList" :key="c" :color="c" variant="flat" icon density="compact" size="24"
                  class="def-swatch" :class="{ 'is-selected': item.color === c }"
                  :aria-label="c" :aria-pressed="item.color === c" @click="item.color = c" />
              </div>

              <div class="def-pop__row">
                <EkButton tone="secondary" size="sm" @click="item.showEditMenu = false">İptal</EkButton>
                <EkButton tone="primary" size="sm" icon="mdi-check" @click="saveRename(item)">Kaydet</EkButton>
              </div>
            </v-card>
          </v-menu>
        </div>
      </template>

      <template #cell-hashtags="{ row: item }">
        <div class="def-values">
          <DefinitionValueChip v-for="val in item.values" :key="val._id" :label="val.title" :color="val.color"
            icon="mdi-tag-outline" :remove-label="`${val.title} etiketini sil`" remove-title="Etiketi Sil?" width="280"
            @open="item.editingHashtagValue = copy(val)" @remove="deleteHashtagValue(item._id, val._id)">
            <template #edit="{ close }">
              <v-text-field v-model="item.editingHashtagValue.title" density="compact" variant="outlined"
                label="Etiket Adı" hide-details autofocus class="mb-3"
                @keyup.enter="updateHashtagValue(item); close()" />

              <div class="def-pop__caption">Etiket rengi</div>
              <div class="def-swatches" role="group" aria-label="Etiket Rengi">
                <v-btn v-for="c in swatchList" :key="c" :color="c" variant="flat" icon density="compact" size="22"
                  class="def-swatch" :class="{ 'is-selected': item.editingHashtagValue.color === c }"
                  :aria-label="c" :aria-pressed="item.editingHashtagValue.color === c"
                  @click="item.editingHashtagValue.color = c" />
              </div>

              <div class="def-pop__row">
                <EkButton tone="secondary" size="sm" @click="close()">İptal</EkButton>
                <EkButton tone="primary" size="sm" icon="mdi-check" @click="updateHashtagValue(item); close()">Kaydet</EkButton>
              </div>
            </template>
          </DefinitionValueChip>
          <DefinitionValueAdd add-label="Etiket ekle" input-label="Yeni etiket" trigger-text="Etiket ekle"
            @add="(title: string) => addValue(item, title)" />
        </div>
      </template>

      <template #cell-actions="{ row }">
        <EkRowActions :label="`${row.title} işlemleri`" :items="[
          { key: 'edit', action: 'edit', label: 'Grup adını ve rengini düzenle', onClick: () => openRename(row) },
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
import { useHashtagsStore } from '@/stores/hashtagsStore';
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

// FE-LOCAL-1052: "Yeni grup" kartı + özet görünümü (sayılar bellekteki listeden; ek istek yok).
const listScreenRef = ref<InstanceType<typeof EkListScreen> | null>(null)
const newMenu = ref(false)
const submitNew = async () => {
  if (!newHashtagForm.value || !newHashtagTitle.value) return
  newMenu.value = false
  await addHashtag()
}
const dashCells = computed<ListSummaryCell[]>(() => {
  const all = hashtagsStoreHashtags.value
  const values = all.reduce((a, g) => a + (g.values?.length ?? 0), 0)
  const empty = all.filter((g) => !(g.values?.length)).length
  const cell = (key: string, label: string, n: number, icon: string, tone: ListSummaryCell['tone'], hint: string): ListSummaryCell => ({ key, label, hint, icon, tone, value: formatNumber(n), zero: !n })
  return [
    cell('groups', 'Etiket grubu', all.length, 'mdi-pound', 'action', 'Tanımlı grup'),
    cell('values', 'Etiket', values, 'mdi-tag-outline', 'info', 'Tüm gruplardaki etiket'),
    cell('empty', 'Boş grup', empty, 'mdi-alert-outline', 'warning', 'Henüz etiketi yok'),
  ]
})
const dashGroups = computed(() => hashtagsStoreHashtags.value.map((g) => ({ key: String(g.title), label: String(g.title), count: g.values?.length ?? 0 })))

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

const openRename = (item: any) => { item.tempTitle = item.title; item.showEditMenu = true }
const saveRename = (item: any) => { item.title = item.tempTitle; updateHashtag(item); item.showEditMenu = false }
const addValue = (item: any, title: string) => { item.editingHashtagValue = { title }; addHashtagValue(item) }

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

const columns: EkGridColumn[] = [
  { key: 'title', label: 'Etiket grubu', sortable: true },
  { key: 'hashtags', label: 'Etiketler', wrap: true },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
]
</script>


