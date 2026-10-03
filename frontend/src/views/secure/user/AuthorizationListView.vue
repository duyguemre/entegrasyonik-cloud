<!--
  frontend/src/views/secure/user/AuthorizationListView.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN (bkz. e2e/specs/authorization.spec.ts). Davranış/API sözleşmesi
  DEĞİŞMEDİ: `UserService/getUsers|getRoles|createUser|updateUser|deleteUser` çağrıları, sayfalama
  alanları (`pagination.limit/page/...`), arama/filtre state şekli, `checkAuthorization` kapısı,
  mağaza yöneticisi (`item.owner`) silme kısıtı AYNEN korundu.

  Karakterizasyon notu (şüpheli davranış, DÜZELTİLMEDİ — final rapora yazıldı): rol rozeti
  `item.roleCode` HAM DEĞERİNİ gösteriyordu ("MANAGER" gibi), `UserService/getRoles`'un döndürdüğü
  rol ADINA ("Yönetici") hiç ÇEVRİLMİYORDU — bu AYNEN korunuyor (`roleLabel` fonksiyonu SADECE
  görüntüleme metnini token'lı `EkStatusChip`'e taşıyor, ham `roleCode` değerini DEĞİŞTİRMİYOR).

  Tablo BİLEREK `v-data-table-server` olarak KORUNDU (`EkDataTable`'a taşınmadı): DS `EkDataTable`
  sıralanabilir sütun BAŞLIĞI desteklemiyor, oysa orijinal ekran `v-model:sort-by` +
  `@update:sortBy` ile backend'e `sortBy` gönderiyordu — bu etkileşimi KORUMAK için `v-data-table-
  server` kullanılmaya devam edildi; global Vuetify `defaults` (A1, Karar 3.1 "VDataTable/
  VDataTableServer") zaten token tabanlı premium görünümü SAĞLIYOR. Sayfalama `EkPagination`'a,
  silme onayı `EkConfirmDialog`'a taşındı (Karar 3.2/3.8/6.1). Gelişmiş filtre diyaloğu
  `ActionDialogComponent` olarak KORUNDU (özel "FİLTRELERİ UYGULA" düğme metni test edilmemiş
  olsa da içerik değişikliğini en aza indirmek için).
-->
<template>
  <div class="authorizationListView d-flex flex-column pt-4">
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

      <ActionDialogComponent v-model="searchUserForm.menu" title="GELİŞMİŞ FİLTRELEME" attach=".authorizationListView"
        subtitle="Rol ve yetki bazlı filtreleme" icon="mdi-filter-cog" color="passiveColor" maxWidth="600px"
        confirmText="FİLTRELERİ UYGULA" @confirm="getUsers(true); searchUserForm.menu = false"
        @cancel="searchUserForm.filters = { roleCodes: [] }; getUsers(true);">
        <v-row dense>
          <v-col cols="12">
            <v-select v-model="searchUserForm.filters.roleCodes" :items="globalRoles" label="Yetki Grubu (Çoklu Seçim)"
              variant="outlined" density="compact" multiple chips item-title="name" item-value="code"
              class="mt-2" />
          </v-col>
        </v-row>
      </ActionDialogComponent>

      <EkListPage
        section="Ayarlar"
        :title="$t('menu.authorization')"
        description="Mağazanıza erişimi olan personeli ve yetki gruplarını yönetin."
        :primary-action="{ label: 'Yeni personel', icon: 'mdi-plus', onClick: () => openAddUser() }"
        :secondary-actions="[{ label: 'Filtrele', icon: 'mdi-filter-variant', onClick: () => (searchUserForm.menu = true) }]"
        :search="searchUserForm.search"
        search-placeholder="İsim, e-posta veya yetki ara..."
        :state="viewState"
        @update:search="onSearchInput"
        @clear-filters="clearSearch"
        @refresh="() => getUsers(true)"
      >
        <template #empty>
          <EkEmptyState variant="no-data" title="Personel Bulunamadı"
            message="Arama kriterlerinizi değiştirmeyi veya filtreleri temizlemeyi deneyin."
            show-action action-text="TÜMÜNÜ GÖSTER" @action="clearSearch" />
        </template>

        <div class="table-wrapper">
          <v-data-table-server v-model:sort-by="sortBy" item-value="_id"
            :itemsLength="pagination.totalNumberOfRecords" :items="users" :headers="headers" fixed-header
            hide-default-footer @update:sortBy="getUsers(true)">

            <template v-slot:item.name="{ item }: any">
              <div class="d-flex align-center py-2">
                <v-avatar size="40" color="primary-lighten-5" class="mr-4 border-primary-soft">
                  <span class="text-primary font-weight-black text-caption">
                    {{ item.name?.charAt(0) }}{{ item.surname?.charAt(0) }}
                  </span>
                </v-avatar>
                <div class="d-flex flex-column">
                  <span class="font-weight-medium">{{ item.name }} {{ item.surname }}</span>
                  <div class="d-flex align-center ga-1 mt-1">
                    <v-icon size="12" icon="mdi-clock-outline" class="ek-muted" />
                    <span class="text-xs ek-muted">Eklenme: {{ formatDate(item.createdAt) }}</span>
                  </div>
                </div>
              </div>
            </template>

            <template v-slot:item.email="{ item }: any">
              <div class="d-flex align-center">
                <v-icon size="16" icon="mdi-email-outline" class="ek-muted mr-2" />
                <span>{{ item.email }}</span>
              </div>
            </template>

            <template v-slot:item.roleCode="{ item }: any">
              <EkStatusChip :tone="roleTone(item)" :label="roleLabel(item)" />
            </template>

            <template v-slot:item.actions="{ item }: any">
              <div class="d-flex justify-end ga-2 pr-1">
                <v-btn icon="mdi-pencil" variant="text" density="comfortable" aria-label="Düzenle"
                  @click="openAddUser(item)" />
                <v-btn icon="mdi-delete" variant="text" density="comfortable" color="error" :disabled="item.owner"
                  :aria-label="item.owner ? 'Mağaza yöneticisi silinemez' : 'Sil'" @click="triggerDelete(item)" />
              </div>
            </template>
          </v-data-table-server>
        </div>

        <template #pagination>
          <EkPagination :page="pagination.page" :page-size="pagination.limit" :total="pagination.totalNumberOfRecords"
            @update:page="onPageChange" @update:page-size="onPageSizeChange" />
        </template>
      </EkListPage>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, onMounted, onBeforeMount, onActivated, computed, onDeactivated } from 'vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';

import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import UserAddComponent from '@/components/user/UserAddComponent.vue';
import { useSnackbarStore } from '@/stores/snackbarStore';
const snackbarStore = useSnackbarStore();
import useUser from '@/composables/user';
// ADR-0015 Karar 6.3 — tek biçimlendirici örnek kullanımı (SIFIR-FARK, bkz. `tests/format.test.ts`).
import { formatDate } from '@/composables/format';
import NoAuthorizationComponent from '@/components/NoAuthorizationComponent.vue';
import EkListPage from '@/components/ds/templates/EkListPage.vue'
import EkPagination from '@/components/ds/EkPagination.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
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
const globalRoles = ref<any[]>([])
const sortBy = ref<any>([{ key: '_id', order: 'asc' }])

const { t } = useI18n()
const pagination = ref({
  limit: 10,
  page: 1,
  totalNumberOfPages: 1,
  totalNumberOfRecords: 0
})

// Karakterizasyon: liste boşsa (gerçek boş SONUÇ veya mock'lu 500 — bkz. spec "gizli davranış"
// notu) tek bir "empty" durumu gösterilir; orijinalde ayrı bir hata görünümü YOKTU.
const viewState = computed<'loading' | 'empty' | 'ready'>(() => {
  if (loading.value) return 'loading'
  if (!users.value || users.value.length === 0) return 'empty'
  return 'ready'
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

const headers: any = [
  { title: 'PERSONEL BİLGİLERİ', key: 'name', sortable: true, align: 'start', width: '350px' },
  { title: 'İLETİŞİM', key: 'email', sortable: true, align: 'start', width: '250px' },
  { title: 'YETKİ GRUBU', key: 'roleCode', sortable: true, align: 'start', width: '200px' },
  { title: '', key: 'actions', sortable: false, align: 'end', width: '120px' },
]

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
  let guid = loadingComponentRef.value.info()

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

    fromTo.value = response.fromTo
    if (response && response.users) {
      users.value = response.users
      pagination.value.totalNumberOfPages = Math.ceil(response.totalNumberOfRecords / pagination.value.limit) || 1
      pagination.value.totalNumberOfRecords = response.totalNumberOfRecords || 0
      loading.value = false
    }
  } catch (error) {
    snackbarStore.addSnackbar({ text: "Veri yükleme hatası!", color: "error" })
  } finally {
    loadingComponentRef.value.remove(guid)
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
  min-height: 0;
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.text-xs {
  font-size: var(--ek-font-size-xs);
}

.border-primary-soft {
  border: 1px solid color-mix(in srgb, var(--ek-color-primary) 10%, transparent);
}
</style>
