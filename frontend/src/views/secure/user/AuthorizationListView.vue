<!--
  frontend/src/views/secure/user/AuthorizationListView.vue

  DS-v2 Aşama 2 — liste standardı (EkListScreen). API sözleşmesi DEĞİŞMEDİ: `UserService/getUsers|
  getRoles|createUser|updateUser|deleteUser`, sayfalama alanları, `checkAuthorization` kapısı,
  mağaza yöneticisi (`item.owner`) silme kısıtı AYNEN korundu. Sıralama SUNUCUDA (name, email, roleCode).
  Karakterizasyon (DÜZELTİLMEDİ): rol rozeti ham `roleCode` değerini gösterir (rol adına çevrilmez).
-->
<template>
  <div class="authorizationListView">
    <template v-if="userApi.checkAuthorization('navigation.authorization')" class="pa-12 text-center h-100">
      <NoAuthorizationComponent />
    </template>

    <template v-else>
      <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef" />

      <EkConfirmDialog
        v-model="actionDialog.show"
        :title="actionDialog.title"
        :description="actionDialog.description"
        confirm-label="Personeli Sil"
        danger
        @confirm="actionDialog.onConfirm"
      />

      <UserAddComponent v-if="addUserFormMenu" :editUser="selectedUser" @close="addUserFormMenu = false"
        @refreshUsers="getUsers(true)" @onSave="createOrUpdateUser" />

      <EkListScreen
        section="Ayarlar"
        :title="$t('menu.authorization')"
        description="Mağazanıza erişimi olan personeli ve yetki gruplarını yönetin."
        label="Personel tablosu"
        noun="personel"
        row-key="_id"
        label-key="email"
        :columns="columns"
        :rows="users"
        :loading="loading"
        :error="loadError"
        error-title="Personel listesi yüklenemedi"
        :search="searchUserForm.search"
        search-placeholder="İsim, e-posta veya yetki ara..."
        :chips="activeChips"
        :filter-count="panelFilterCount"
        :sort="gridSort"
        :page="pagination.page"
        :page-size="pagination.limit"
        :total="pagination.totalNumberOfRecords"
        empty-title="Personel bulunamadı"
        empty-text="Mağazanıza erişimi olan personel burada listelenir."
        empty-icon="mdi-account-group-outline"
        filtered-empty-title="Personel bulunamadı"
        filtered-empty-text="Arama kriterlerinizi değiştirmeyi veya filtreleri temizlemeyi deneyin."
        @update:search="onSearchInput"
        @update:sort="onGridSort"
        @update:page="onPageChange"
        @update:page-size="onPageSizeChange"
        @filter-submit="getUsers(true)"
        @filter-reset="resetFilters"
        @remove-chip="removeChip"
        @clear-filters="clearSearch"
        @refresh="getUsers(true)"
      >
        <template #header-actions>
          <EkButton icon="mdi-plus" @click="openAddUser()">Yeni personel</EkButton>
        </template>

        <template #filters>
          <v-select v-model="searchUserForm.filters.roleCodes" :items="globalRoles" label="Yetki grubu"
            multiple chips clearable item-title="name" item-value="code" class="ek-span-2" />
        </template>

        <template #cell-name="{ row }">
          <span class="ek-auth-person">
            <span class="ek-auth-person__name">{{ row.name }} {{ row.surname }}</span>
            <span class="ek-auth-person__meta ek-num">Eklenme: {{ formatDate(row.createdAt) }}</span>
          </span>
        </template>
        <template #cell-roleCode="{ row }">
          <EkStatusChip :tone="roleTone(row)" :label="roleLabel(row)" />
        </template>
        <template #cell-actions="{ row }">
          <EkRowActions :label="`${row.name ?? row.email} işlemleri`" :items="[
            { key: 'edit', action: 'edit', label: 'Düzenle', onClick: () => openAddUser(row) },
            { key: 'delete', action: 'delete', label: row.owner ? 'Mağaza yöneticisi silinemez' : 'Sil', disabled: row.owner, onClick: () => triggerDelete(row) },
          ]" />
        </template>
      </EkListScreen>
    </template>
  </div>
</template>

<script setup lang="ts">
import EkRowActions from '@/components/ds/EkRowActions.vue'
import { useI18n } from 'vue-i18n';
import { ref, onMounted, onBeforeMount, onActivated, computed, onDeactivated } from 'vue'
import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import UserAddComponent from '@/components/user/UserAddComponent.vue';
import { useSnackbarStore } from '@/stores/snackbarStore';
const snackbarStore = useSnackbarStore();
import useUser from '@/composables/user';
// ADR-0015 Karar 6.3 — tek biçimlendirici örnek kullanımı (SIFIR-FARK, bkz. `tests/format.test.ts`).
import { formatDate } from '@/composables/format';
import NoAuthorizationComponent from '@/components/NoAuthorizationComponent.vue';
import EkListScreen from '@/components/ds/templates/EkListScreen.vue'
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue'
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue'
import { isRequestError } from '@/components/ds/listStandard'
import type { StatusTone } from '@/design/status-map'
const userApi = useUser()

const selectedUser = ref()
const dialogAttach: any = ref("")

const actionDialog = ref<any>({
  show: false,
  title: '',
  description: '',
  onConfirm: () => { }
})

const isMounted = ref(false)
const restApi = useRestApi()
const loadingComponentRef: any = ref(null)
const searchUserForm = ref<any>({
  search: '',
  menu: false,
  filters: {
    roleCodes: []
  }
})

const addUserFormMenu = ref(false)

const users: any = ref<any>([])
const fromTo: any = ref({})
const loading = ref(false)
const loadError = ref(false)
const globalRoles = ref<any[]>([])
const sortBy = ref<any>([{ key: '_id', order: 'asc' }])

const { t } = useI18n()
const pagination = ref({
  limit: 10,
  page: 1,
  totalNumberOfPages: 1,
  totalNumberOfRecords: 0
})

// Karakterizasyon: `item.roleCode` HAM değeri korunuyor — yalnızca EkStatusChip'e taşınıyor.
function roleLabel(item: any): string {
  if (item.isGlobalAdmin) return 'SÜPER YÖNETİCİ'
  if (item.owner) return 'MAĞAZA YÖNETİCİSİ'
  return item.roleCode || 'PERSONEL'
}
function roleTone(item: any): StatusTone {
  if (item.isGlobalAdmin) return 'danger'
  if (item.owner) return 'warning'
  return 'neutral'
}

// DS-v2 liste standardı. UserService.getUsers `sortBy.key` ile SUNUCUDA sıralar (izinli alanlar:
// _id, name, email, roleCode); sıralanabilir kolonlar: personel, e-posta, yetki grubu.
const columns: EkGridColumn[] = [
  { key: 'name', label: 'Personel', sortable: true },
  { key: 'email', label: 'E-posta', sortable: true },
  { key: 'roleCode', label: 'Yetki grubu', sortable: true },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
]

const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value?.[0]
  return current ? { key: current.key, dir: current.order === 'asc' ? 'asc' : 'desc' } : null
})

const onGridSort = (sort: EkGridSort) => {
  sortBy.value = sort ? [{ key: sort.key, order: sort.dir }] : []
  getUsers(true)
}

// Aktif filtre çipleri — SON SORGULANAN değerlerden.
const applied = ref<{ search: string; roleCodes: string[] }>({ search: '', roleCodes: [] })

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const a = applied.value
  const chips: EkActiveFilterChip[] = []
  if (a.search) chips.push({ key: 'search', label: 'Arama', value: a.search })
  if (a.roleCodes.length) chips.push({ key: 'roleCodes', label: 'Yetki grubu', value: a.roleCodes.map(c => globalRoles.value.find(r => r.code === c)?.name ?? c).join(', ') })
  return chips
})

const panelFilterCount = computed(() => activeChips.value.filter(c => c.key !== 'search').length)

const removeChip = (key: string) => {
  if (key === 'search') searchUserForm.value.search = ''
  else searchUserForm.value.filters.roleCodes = []
  getUsers(true)
}

// Panel "Temizle": yalnız panel alanları (arama korunur).
const resetFilters = () => {
  searchUserForm.value.filters = { roleCodes: [] }
  getUsers(true)
}

const openAddUser = (user?: any) => {
  selectedUser.value = user || {}
  addUserFormMenu.value = true
}


const createOrUpdateUser = async (user: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.closeTicket'))
  const serviceUrl = user.value._id ? 'UserService/updateUser' : 'UserService/createUser'

  try {
    let response = await restApi.post(serviceUrl, { user: user.value })
    if (response == true) {
      getUsers(true)
      snackbarStore.addSnackbar({
        show: true,
        text: user.value._id ? 'Kullanıcı bilgileri güncellendi.' : 'Kullanıcı oluşturuldu.',
        timeout: 5000,
        color: 'success'
      })
    } else {
      throw new Error('İşlem başarısız')
    }
  } catch (error) {
    snackbarStore.addSnackbar({
      show: true,
      text: 'İşlem sırasında bir hata oluştu.',
      timeout: 5000,
      color: 'error'
    })
  } finally {
    loadingComponentRef.value.remove(guid)
  }
}

const onSearchInput = (value: string) => {
  searchUserForm.value.search = value
  getUsers(true)
}

const clearSearch = () => {
  searchUserForm.value.search = ''
  searchUserForm.value.filters = { roleCodes: [] }
  getUsers(true)
}

const onPageChange = (page: number) => {
  pagination.value.page = page
  getUsers()
}

const onPageSizeChange = (pageSize: number) => {
  pagination.value.limit = pageSize
  getUsers(true)
}

const getUsers = async (reset: boolean = false) => {
  if (reset) pagination.value.page = 1
  loading.value = true
  loadError.value = false
  applied.value = { search: searchUserForm.value.search, roleCodes: [...searchUserForm.value.filters.roleCodes] }

  try {
    let sortPayload: any = undefined
    if (sortBy.value && sortBy.value.length > 0) {
      sortPayload = {
        key: sortBy.value[0].key,
        order: sortBy.value[0].order
      }
    }

    let response = await restApi.post("UserService/getUsers", {
      pagination: pagination.value,
      sortBy: sortPayload,
      search: searchUserForm.value.search,
      filters: searchUserForm.value.filters
    })

    if (isRequestError(response)) {
      loadError.value = true
      return
    }
    fromTo.value = response.fromTo
    if (response && response.users) {
      users.value = response.users
      pagination.value.totalNumberOfPages = Math.ceil(response.totalNumberOfRecords / pagination.value.limit) || 1
      pagination.value.totalNumberOfRecords = response.totalNumberOfRecords || 0
      loading.value = false
    }
  } catch (error) {
    loadError.value = true
    snackbarStore.addSnackbar({ text: "Veri yükleme hatası!", color: "error" })
  } finally {
    loading.value = false
  }
}

const fetchRoles = async () => {
  const roles = await userApi.getRoles()
  globalRoles.value = roles || []
}


const triggerDelete = (item: any) => {
  actionDialog.value = {
    show: true,
    title: "Personel Hesabı Silinsin mi?",
    description: `${item.name} ${item.surname} personeli sistemden kaldırılacak. Bu işlem geri alınamaz; kullanıcı sisteme artık giriş yapamayacaktır.`,
    onConfirm: async () => {
      try {
        actionDialog.value.show = false
        let guid = loadingComponentRef.value.info(t('loading.info.deleteProduct'))
        const response = await restApi.post("UserService/deleteUser", { userId: item._id })
        loadingComponentRef.value.remove(guid)

        if (response == true) {
          getUsers(true)
          snackbarStore.addSnackbar({
            show: true,
            text: 'Kullanıcı başarıyla silindi.',
            timeout: 5000,
            color: 'success'
          })
        }
      } catch (e) {
        snackbarStore.addSnackbar({ text: "Silme işlemi başarısız.", color: "error" })
      }
    }
  }
}



var props = defineProps<{
  isRendered: boolean
}>()


const initialize = async () => {
  if (!userApi.checkAuthorization('navigation.authorization')) {
    getUsers()
    fetchRoles()
  }
}
const activate = async () => {
  await fetchRoles()
}

const destroy = async () => {
  reset()
}


onActivated(() => {
});
onDeactivated(() => {
})

defineExpose({
  initialize,
  activate,
  destroy
});

onMounted(() => {
  isMounted.value = true
  dialogAttach.value = '.authorizationListView'
  getUsers(true)

});

onBeforeMount(() => {
  reset()
})

const reset = () => {
  searchUserForm.value = {
    search: '',
    menu: false,
    filters: {
      roleCodes: []
    }
  }
  pagination.value.page = 1;
  sortBy.value = [{ key: '_id', order: 'asc' }]
}

</script>

<style scoped>
.authorizationListView {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .authorizationListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.ek-auth-person {
  display: flex;
  flex-direction: column;
}

.ek-auth-person__name {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.ek-auth-person__meta {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-row-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}

.ek-auth-danger {
  color: var(--ek-color-error);
}
</style>
