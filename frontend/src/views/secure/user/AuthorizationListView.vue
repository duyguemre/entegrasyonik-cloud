<template>
  <div class="authorizationListView d-flex flex-column pt-4">
    <template v-if="userApi.checkAuthorization('navigation.authorization')" class="pa-12 text-center h-100">
      <NoAuthorizationComponent />
    </template>

    <template v-else>
      <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef" />

      <ConfirmationDialogComponent v-model="actionDialog.show" :title="actionDialog.title"
        attach=".authorizationListView" :subtitle="actionDialog.subtitle" :message="actionDialog.message"
        :icon="actionDialog.icon" :color="actionDialog.color" :confirm-text="actionDialog.confirmText"
        :confirm-icon="actionDialog.confirmIcon" @confirm="actionDialog.onConfirm" @cancel="actionDialog.show = false"
        maxWidth="450px" />

      <UserAddComponent v-if="addUserFormMenu" :editUser="selectedUser" @close="addUserFormMenu = false"
        @refreshUsers="getUsers(true)" @onSave="createOrUpdateUser" />

      <!-- ÜST BAR (SEARCH & ACTIONS) -->
      <div class="d-flex pa-2 pt-2 pb-0 mt-0 mb-1 align-start flex-wrap search-section"
        style="max-width:1200px; gap: 8px;">

        <!-- ARAMA ALANI (InvoiceListView Stili) -->
        <v-text-field clearable density="compact" label="İsim, e-posta veya yetki ara..." variant="outlined"
          v-model="searchUserForm.search" bg-color="white" class="customTextField flex-grow-1" hide-details
          @keyup.enter.stop="getUsers(true)" @click:clear="searchUserForm.search = ''; getUsers(true)">
          <template #append-inner>
            <v-btn flat size="35" elevation="0" color="white" @click.stop="getUsers(true)"
              style="border:1px solid white">
              <v-icon size="x-large" color="processButtonColor">mdi-magnify</v-icon>
            </v-btn>
          </template>
        </v-text-field>

        <div class="d-flex align-center flex-wrap gap-2">
          <v-btn @click="searchUserForm.menu = true" size="40" elevation="0" color="white" class="premium-cube-btn">
            <v-icon size="22" color="passiveColor">mdi-filter-variant</v-icon>
            <v-tooltip activator="parent" location="top">Filtrele</v-tooltip>
          </v-btn>

          <v-btn @click="getUsers(true)" size="40" elevation="0" color="white" class="premium-cube-btn">
            <v-icon size="22" color="passiveColor">mdi-refresh</v-icon>
            <v-tooltip activator="parent" location="top">Yenile</v-tooltip>
          </v-btn>

        </div>
      </div>

      <ActionDialogComponent v-model="searchUserForm.menu" title="GELİŞMİŞ FİLTRELEME" attach=".authorizationListView"
        subtitle="Rol ve yetki bazlı filtreleme" icon="mdi-filter-cog" color="passiveColor" maxWidth="600px"
        confirmText="FİLTRELERİ UYGULA" @confirm="getUsers(true); searchUserForm.menu = false"
        @cancel="searchUserForm.filters = { roleCodes: [] }; getUsers(true);">
        <v-row dense>
          <v-col cols="12">
            <v-select v-model="searchUserForm.filters.roleCodes" :items="globalRoles" label="Yetki Grubu (Çoklu Seçim)"
              variant="outlined" density="compact" multiple chips item-title="name" item-value="code"
              class="customTextField mt-2" />
          </v-col>
        </v-row>
      </ActionDialogComponent>

      <!-- İÇERİK ALANI (PERSONEL YÖNETİMİ) -->
      <div class="table-wrapper mt-2">
        <v-data-table-server v-model:sort-by="sortBy" item-value="_id" :loading="loading"
          :itemsLength="pagination.totalNumberOfRecords" :items="users" :headers="headers" fixed-header
          density="comfortable" class="pa-0 ma-0 desktop-table" hover @update:sortBy="getUsers(true)">


          <template v-slot:header.actions>
            <v-btn color="success" size="40" class="premium-cube-btn px-4 my-1" elevation="0" @click="openAddUser()">
              <v-icon start size="20">mdi-plus</v-icon>
            </v-btn>
          </template>


          <template v-slot:item.name="{ item }: any">
            <div class="d-flex align-center py-2">
              <v-avatar size="40" color="primary-lighten-5" class="mr-4 border-primary-soft">
                <span class="text-primary font-weight-black text-caption">
                  {{ item.name?.charAt(0) }}{{ item.surname?.charAt(0) }}
                </span>
              </v-avatar>
              <div class="d-flex flex-column">
                <span class="font-weight-black text-body-2 color-slate-900 leading-tight">
                  {{ item.name }} {{ item.surname }}
                </span>
                <div class="d-flex align-center ga-1 mt-1">
                  <v-icon size="12" color="grey">mdi-clock-outline</v-icon>
                  <span class="text-micro font-weight-bold color-slate-500">
                    Eklenme: {{ formatDate(item.createdAt) }}
                  </span>
                </div>
              </div>
            </div>
          </template>

          <template v-slot:item.email="{ item }: any">
            <div class="d-flex align-center">
              <v-icon size="16" color="grey-lighten-1" class="mr-2">mdi-email-outline</v-icon>
              <span class="text-caption font-weight-medium color-slate-700">{{ item.email }}</span>
            </div>
          </template>

          <template v-slot:item.roleCode="{ item }: any">
            <div class="d-flex align-center">
              <v-chip v-if="item.isGlobalAdmin" size="x-small" color="red-darken-4" variant="flat"
                class="font-weight-black px-3 elevation-1">
                SÜPER YÖNETİCİ
              </v-chip>
              <v-chip v-else-if="item.owner" size="x-small" color="amber-darken-3" variant="flat"
                class="font-weight-black px-3 elevation-1">
                MAĞAZA YÖNETİCİSİ
              </v-chip>
              <v-chip v-else size="x-small" color="indigo-lighten-1" variant="flat"
                class="font-weight-black px-3 elevation-1">
                {{ item.roleCode || 'PERSONEL' }}
              </v-chip>
            </div>
          </template>

          <template v-slot:item.actions="{ item }: any">
            <div class="d-flex justify-end ga-2 pr-1">
              <v-btn flat size="35" variant="flat" color="white" class="premium-cube-btn" @click="openAddUser(item)">
                <v-icon size="20" color="passiveColor">mdi-pencil</v-icon>
                <v-tooltip activator="parent" location="top">Düzenle</v-tooltip>
              </v-btn>
              <v-btn flat size="35" variant="flat" class="bg-danger premium-cube-btn" :disabled="item.owner"
                @click="triggerDelete(item)">
                <v-icon size="20" color="white">mdi-delete</v-icon>
                <v-tooltip activator="parent" location="top">Sil</v-tooltip>
              </v-btn>
            </div>
          </template>

          <template v-slot:bottom>
            <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
              @setPage="getUsers" v-model="pagination.page" style="position:relative;border-top:1px solid #ddd" />
          </template>

          <template v-slot:no-data>
            <div class="pa-12 text-center bg-white h-100 d-flex flex-column align-center justify-center">
              <v-icon size="80" color="grey-lighten-3" class="mb-4">mdi-account-search-outline</v-icon>
              <div class="text-h6 font-weight-bold text-grey-darken-1">Personel Bulunamadı</div>
              <p class="text-caption text-grey-lighten-1 mb-6">Arama kriterlerinizi değiştirmeyi veya filtreleri
                temizlemeyi deneyin.</p>
              <v-btn color="primary" variant="tonal" class="rounded-lg"
                @click="searchUserForm.search = ''; getUsers(true)">
                TÜMÜNÜ GÖSTER
              </v-btn>
            </div>
          </template>
        </v-data-table-server>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, onMounted, onBeforeMount, onActivated, watch, computed, nextTick, getCurrentInstance, inject, onDeactivated, onUnmounted } from 'vue'
import PaginationComponent from '@/components/PaginationComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';

import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import { useBrandsStore } from '@/stores/brandsStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useTabStore } from '@/composables/opentab'
import UserAddComponent from '@/components/user/UserAddComponent.vue';
import { useSnackbarStore } from '@/stores/snackbarStore';
const snackbarStore = useSnackbarStore();
import useUser from '@/composables/user';
// ADR-0015 Karar 6.3 — tek biçimlendirici örnek kullanımı (SIFIR-FARK:
// `formatDate(x)` ile `new Date(x).toLocaleDateString('tr-TR')` aynı çıktıyı
// üretir, bkz. `tests/format.test.ts`). Tam yayılım kapsam dışı (BACKLOG TODO).
import { formatDate } from '@/composables/format';
import NoAuthorizationComponent from '@/components/NoAuthorizationComponent.vue';
const userApi = useUser()

const productIdForVariantList = ref(0)
const selectedUser = ref()
const dialogAttach: any = ref("")
const selectedUsers: any = ref([])
const sortBy = ref<any>([{ key: '_id', order: 'asc' }])
const isSkeletonVisible: any = ref(false)

const actionDialog = ref<any>({
  show: false,
  title: '',
  subtitle: '',
  message: '',
  icon: 'mdi-alert',
  color: 'info',
  confirmText: '',
  confirmIcon: '',
  onConfirm: () => { }
})

const eventBus: any = inject('eventBus');

const menuStore: any = inject('useMenuStore')
const isMounted = ref(false)
const restApi = useRestApi()
const brandsStore = useBrandsStore()
const categoriesStore = useCategoriesStore()
const loadingComponentRef: any = ref(null)
const searchUserForm = ref<any>({
  search: '',
  menu: false,
  filters: {
    roleCodes: []
  }
})
const transferProductForm: any = ref({ transferProductFormMenu: false, transferProduct: undefined })

const addUserFormMenu = ref(false)

const isFiltered = ref(false)
const users: any = ref<any>([])
const fromTo: any = ref({})
const verticalTableRef: any = ref(null)
const tableRecordCount: any = ref(0)
const productSearchText: any = ref()
const loading = ref(false)
const show = ref(true)
const globalRoles = ref<any[]>([])

const { t } = useI18n()
const pagination = ref({
  limit: 10,
  page: 1,
  totalNumberOfPages: 1,
  totalNumberOfRecords: 0
})
const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
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


// Sıralama işlemleri v-data-table-server tarafından otomatik yönetilmektedir.


// Arama ve filtreleme işlemleri getUsers(true) üzerinden yürütülmektedir.

const getUsers = async (reset: boolean = false) => {
  if (reset) pagination.value.page = 1
  loading.value = true
  selectedUsers.value.length = 0
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
    subtitle: `${item.name} ${item.surname} personeli sistemden kaldırılacak.`,
    message: "Bu işlem geri alınamaz. Kullanıcı sisteme artık giriş yapamayacaktır.",
    icon: "mdi-account-remove-outline",
    color: "danger",
    confirmText: "Personeli Sil",
    confirmIcon: "mdi-delete",
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

const destroy = async () => {/* 
  console.log("ProductListView Destroyed") */
  reset()
}


onActivated(() => {
  /*   console.log("onactivated productlist") */

});
onDeactivated(() => {/* 
  console.log("ondeactivated test productlist", props.isRendered) */
  /*   if (props.isRendered == false) */
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

const headers: any = [
  { title: 'PERSONEL BİLGİLERİ', key: 'name', sortable: true, align: 'start', width: '350px' },
  { title: 'İLETİŞİM', key: 'email', sortable: true, align: 'start', width: '250px' },
  { title: 'YETKİ GRUBU', key: 'roleCode', sortable: true, align: 'start', width: '200px' },
  { title: '', key: 'actions', sortable: false, align: 'end', width: '120px' },
]

</script>

<style scoped lang="scss">
.desktop-table {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: white !important;
}

.authorizationListView {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}



.search-section {
  z-index: 5;
}

.table-wrapper {
  flex-grow: 1;
  position: relative;
  min-height: 0;
}

.custom-table {
  background: transparent !important;
}

.stylish-tabs {
  z-index: 2;
  margin-bottom: -1px;
}

.stylish-tab-item {
  font-weight: 800 !important;
  font-size: 12px !important;
  letter-spacing: 0.5px;
  color: #64748b !important;
  min-width: 180px !important;
  height: 48px !important;
  opacity: 0.7;
  transition: all 0.3s ease;
  border-bottom: 2px solid transparent !important;
}

.v-tab--selected.stylish-tab-item {
  opacity: 1 !important;
  color: rgb(var(--v-theme-primary)) !important;
  border-bottom: 2px solid rgb(var(--v-theme-primary)) !important;
}

.role-info-card {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
    border-color: rgba(var(--v-theme-primary), 0.3) !important;
  }
}

.role-icon-box {
  transition: all 0.3s ease;
}

.border-primary-soft {
  border: 1px solid rgba(var(--v-theme-primary), 0.1) !important;
}

.bg-primary-lighten-5 {
  background-color: rgba(var(--v-theme-primary), 0.05) !important;
}

.bg-danger-soft {
  background-color: #fef2f2 !important;
}

.border-error-soft {
  border: 1px solid #fee2e2 !important;
}

.bg-white {
  background-color: white !important;
}

.color-slate-900 {
  color: #0f172a;
}

.color-slate-700 {
  color: #334155;
}

.color-slate-500 {
  color: #64748b;
}

.text-micro {
  font-size: 11px;
  line-height: 1.2;
}

.letter-spacing-1 {
  letter-spacing: 1px;
}

:deep(.v-data-table-header__content) {
  span {
    font-size: 11px !important;
    font-weight: 800 !important;
    color: #64748b !important;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }
}

:deep(.v-pagination__item--active) {
  box-shadow: 0 4px 6px -1px rgba(var(--v-theme-primary), 0.2) !important;
}

.lh-lg {
  line-height: 1.7;
}




.table-wrapper {
  width: 100%;
  overflow-x: hidden;
}
</style>