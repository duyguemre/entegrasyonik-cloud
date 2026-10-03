<!--
  frontend/src/views/secure/user/AuthorizationListView.vue

  DS-v2 Aşama 2 — liste standardı (EkListScreen). API sözleşmesi DEĞİŞMEDİ: `UserService/getUsers|
  getRoles|createUser|updateUser|deleteUser`, sayfalama alanları, `checkAuthorization` kapısı,
  mağaza yöneticisi (`item.owner`) silme kısıtı AYNEN korundu. Sıralama SUNUCUDA (name, email, roleCode).
  Karakterizasyon (DÜZELTİLMEDİ): rol rozeti ham `roleCode` değerini gösterir (rol adına çevrilmez).

  Faz 3 / C2a — ekip yönetimi (docs/cloud-contracts/API_ACCOUNT_LIFECYCLE.md §6-9) bu ekrana EKLENDİ:
  davet (e-posta + rol, rol tavanı UI'da da) · bekleyen davetler (#summary; yeniden gönder / iptal) · Durum kolonu
  (Aktif/Askıda) · askıya al / yeniden etkinleştir (onay diyaloğu; kendine ve son sahibe kapalı, sunucu hatası da okunur
  iletiye döner) · sahiplik devri (yalnız sahip; başlat → hedef e-postadaki bağlantıyla kabul eder; iptal). Kurallar
  `components/user/team/teamModel.ts`, RPC'ler `composables/useTeamApi.ts`, iletiler `composables/errorCodes.ts`.
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

      <!-- C2a — ekip yönetimi diyalogları (sekme kabına bağlı; EkDialog varsayılanı). -->
      <InviteUserDialog v-model="inviteOpen" :roles="myInvitableRoles" @invited="loadInvitations" />
      <OwnershipTransferDialog v-model="transferOpen" :members="users" :me="me" :initial-target="transferTarget"
        @started="transferOpen = false" @cancel-pending="askCancelTransfer" />

      <EkDialog
        v-model="memberDialog.open"
        :title="memberDialog.title"
        :description="memberDialog.text"
        :tone="memberDialog.mode === 'suspend' ? 'danger' : 'default'"
        :icon="memberDialog.mode === 'suspend' ? 'mdi-account-cancel-outline' : 'mdi-account-check-outline'"
        :icon-tone="memberDialog.mode === 'suspend' ? 'error' : 'success'"
        width="sm"
        :as-form="memberDialog.mode === 'suspend'"
        :confirm-label="memberDialog.mode === 'suspend' ? $t('team.suspend.confirm') : $t('team.reactivate.confirm')"
        :confirm-icon="memberDialog.mode === 'suspend' ? 'mdi-account-cancel-outline' : 'mdi-account-check-outline'"
        :confirm-loading="memberDialog.busy"
        data-testid="member-status-dialog"
        @confirm="confirmMemberStatus"
      >
        <div class="ek-member-dialog">
          <v-textarea v-if="memberDialog.mode === 'suspend'" v-model="memberDialog.reason" :label="$t('team.suspend.reason')"
            :hint="$t('team.suspend.reasonHint')" persistent-hint rows="2" auto-grow maxlength="200" counter="200" />
          <EkAlert v-if="memberDialog.errorKey" tone="error" dense live :text="$t(memberDialog.errorKey)" />
        </div>
      </EkDialog>

      <EkConfirmDialog
        v-model="confirmState.open"
        :title="confirmState.title"
        :description="confirmState.text"
        :confirm-label="confirmState.confirmLabel"
        danger
        :loading="confirmState.busy"
        @confirm="confirmState.onConfirm"
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
        @refresh="refreshAll"
      >
        <!-- FE-LOCAL-1047 — standart: "oluştur" eylemleri filtre şeridinin SAĞ ucunda (EkListScreen `#create`);
             yenileme sayfa adında (ayrı düğme yok). -->
        <template #create>
          <EkButton :tone="myInvitableRoles.length ? 'secondary' : 'primary'" icon="mdi-plus" @click="openAddUser()">Yeni personel</EkButton>
          <EkButton v-if="myInvitableRoles.length" tone="primary" icon="mdi-account-plus-outline" data-testid="invite-open" @click="inviteOpen = true">
            {{ $t('team.invite.open') }}
          </EkButton>
        </template>

        <template v-if="teamManager && (transferState.pending || invitationsLoading || invitationsError || invitations.length)" #summary>
          <div class="ek-team-summary">
            <EkAlert v-if="transferState.pending" tone="warning" :title="$t('team.transfer.pendingTitle')" data-testid="transfer-pending"
              :text="`${$t('team.transfer.pendingText', { name: transferState.pending.targetName })}${transferState.pending.expiresAt ? ' ' + $t('team.transfer.pendingUntil', { date: formatDateTime(transferState.pending.expiresAt) }) : ''}`">
              <template #actions>
                <EkButton tone="secondary" size="sm" icon="mdi-cancel" @click="askCancelTransfer">{{ $t('team.transfer.cancel') }}</EkButton>
              </template>
            </EkAlert>
            <PendingInvitationsCard :invitations="invitations" :loading="invitationsLoading" :error="invitationsError"
              :busy-id="invitationBusyId" @resend="resendInvitation" @revoke="askRevokeInvitation" @retry="loadInvitations" />
          </div>
        </template>

        <template #filters>
          <EkSelect v-model="searchUserForm.filters.roleCodes" :items="roleSelectOptions" label="Yetki grubu"
            multiple clearable class="ek-span-2" />
        </template>

        <template #cell-name="{ row }">
          <span class="ek-auth-person">
            <span class="ek-auth-person__avatar" :class="{ 'is-owner': row.owner, 'is-suspended': memberStatus(row) !== 'active' }" aria-hidden="true">{{ personInitials(row) }}</span>
            <span class="ek-auth-person__text">
              <span class="ek-auth-person__name">{{ row.name }} {{ row.surname }}
                <EkBadge v-if="isSelf(row, me)" variant="label" tone="action" :text="$t('team.you')" class="ek-auth-person__you" />
              </span>
              <span class="ek-auth-person__meta ek-num">Eklenme: {{ formatDate(row.createdAt) }}</span>
            </span>
          </span>
        </template>
        <template #cell-roleCode="{ row }">
          <EkStatusChip :tone="roleTone(row)" :label="roleLabel(row)" />
        </template>
        <template #cell-status="{ row }">
          <EkStatusChip :tone="memberStatus(row) === 'active' ? 'success' : 'warning'" :label="$t(`team.status.${memberStatus(row)}`)"
            :icon="memberStatus(row) === 'active' ? 'mdi-check-circle-outline' : 'mdi-pause-circle-outline'" />
        </template>
        <template #cell-actions="{ row }">
          <EkRowActions :label="`${row.name ?? row.email} işlemleri`" :items="rowActions(row)" />
        </template>
      </EkListScreen>
    </template>
  </div>
</template>

<script setup lang="ts">
import { EkRowActions, EkButton, EkStatusChip, EkConfirmDialog, EkDialog, EkAlert, EkBadge, EkSelect } from '@entegrasyonik/ui/components'
import type { EkGridColumn, EkGridSort, EkActiveFilterChip, EkRowAction } from '@entegrasyonik/ui/components'
import { useI18n } from 'vue-i18n';
import { ref, onMounted, onBeforeMount, onActivated, computed, onDeactivated } from 'vue'
import LoadingComponent from '@/components/LoadingComponent.vue'
import useRestApi from '@/composables/restapi'
import UserAddComponent from '@/components/user/UserAddComponent.vue';
import { useSnackbarStore } from '@/stores/snackbarStore';
const snackbarStore = useSnackbarStore();
import useUser from '@/composables/user';
// ADR-0015 Karar 6.3 — tek biçimlendirici örnek kullanımı (SIFIR-FARK, bkz. `tests/format.test.ts`).
import { formatDate } from '@entegrasyonik/ui/format';
import NoAuthorizationComponent from '@/components/NoAuthorizationComponent.vue';
import EkListScreen from '@/components/page/templates/EkListScreen.vue'
import { isRequestError } from '@entegrasyonik/ui/components/listStandard'
import type { StatusTone } from '@/design/status-map'
import InviteUserDialog from '@/components/user/team/InviteUserDialog.vue'
import OwnershipTransferDialog from '@/components/user/team/OwnershipTransferDialog.vue'
import PendingInvitationsCard from '@/components/user/team/PendingInvitationsCard.vue'
import {
  activeOwnerCount, displayName, invitableRoles, isSelf, memberRole, memberStatus, normalizeInvitations, reactivateGate,
  suspendGate, transferTargetGate, type CurrentUser, type Invitation, type MemberRow,
} from '@/components/user/team/teamModel'
import { useTeamApi } from '@/composables/useTeamApi'
import { createIdempotentAction } from '@/composables/restapi'
import { isApiError } from '@/composables/apiErrors'
import { errorMessageKey } from '@/composables/errorCodes'
import { useToast } from '@entegrasyonik/ui/composables/useToast'
import { formatDateTime } from '@entegrasyonik/ui/format'
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

// FR2-SCREENS 36 (fe-r2d) — BİLİNÇLİ DEĞİŞİKLİK: rozet ham `roleCode` yerine UserService/getRoles'taki rol adını gösterir
// (listede yoksa kod); tüm çiplerle aynı cümle düzeni.
function roleLabel(item: any): string {
  if (item.isGlobalAdmin) return 'Süper yönetici'
  if (item.owner) return 'Mağaza sahibi'
  if (!item.roleCode) return 'Personel'
  return globalRoles.value.find((r: any) => r.code === item.roleCode)?.name || item.roleCode
}
/** Filtre seçimi: rol adı + açıklaması alt satırda (diğer filtrelerle aynı seçim listesi standardı). */
const roleSelectOptions = computed(() => (globalRoles.value ?? []).map((r: any) => ({ value: r.code, title: r.name || r.code, subtitle: r.description, icon: 'mdi-account-key-outline' })))
/** Personel baş harfleri (ikon kapsülü; ad her zaman yanında metin olarak yazılır). */
function personInitials(item: any): string {
  const pick = (v: unknown) => String(v ?? '').trim().charAt(0)
  return (pick(item.name) + pick(item.surname)).toLocaleUpperCase('tr-TR') || pick(item.email).toLocaleUpperCase('tr-TR') || '?'
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
  { key: 'status', label: 'Durum' },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
]

// ── C2a — ekip yönetimi ────────────────────────────────────────────────────────────────────────────────────────
const teamApi = useTeamApi()
const { transferState } = teamApi
const { showToast } = useToast()

// Oturumdaki kullanıcı (profil DTO'sunun görünür alanları; liste `_id`'si tenant kopyası olabilir → e-posta da kullanılır).
const me = computed<CurrentUser>(() => ({
  _id: userApi.getSessionScope.value.userId,
  username: userApi.getUsername.value,
  owner: userApi.isOwner?.() === true,
  isGlobalAdmin: userApi.isPlatformAdmin(),
  roleCode: userApi.isTenantAdmin() && userApi.isOwner?.() !== true ? 'ROLE_ADMIN' : undefined,
}))
const teamManager = computed(() => userApi.isTenantAdmin())
const myInvitableRoles = computed(() => (teamManager.value ? invitableRoles(me.value) : []))

const inviteOpen = ref(false)
const transferOpen = ref(false)
const transferTarget = ref<string | null>(null)

const invitations = ref<Invitation[]>([])
const invitationsLoading = ref(false)
const invitationsError = ref(false)
const invitationBusyId = ref<string | null>(null)
const resendActions = new Map<string, ReturnType<typeof createIdempotentAction>>()

async function loadInvitations() {
  if (!teamManager.value) return
  invitationsLoading.value = true
  invitationsError.value = false
  const resp: any = await teamApi.listInvitations('pending')
  invitationsLoading.value = false
  if (isApiError(resp)) {
    invitationsError.value = true
    return
  }
  invitations.value = normalizeInvitations(resp)
}

function refreshAll() {
  getUsers(true)
  loadInvitations()
}

function toastError(resp: unknown, overrides: Parameters<typeof errorMessageKey>[1] = {}) {
  const key = errorMessageKey(resp, overrides)
  if (key) showToast({ tone: 'error', message: t(key) })
}

async function resendInvitation(inv: Invitation) {
  if (invitationBusyId.value) return
  const action = resendActions.get(inv.id) ?? createIdempotentAction()
  resendActions.set(inv.id, action)
  invitationBusyId.value = inv.id
  const resp: any = await teamApi.resendInvitation(inv.id, action.keyFor({ invitationId: inv.id }))
  invitationBusyId.value = null
  if (!isApiError(resp)) {
    resendActions.delete(inv.id)
    showToast({ tone: 'success', message: t('team.invitations.resent', { email: inv.email }) })
    loadInvitations()
    return
  }
  toastError(resp, { HTTP_404: 'team.invitations.notPending', NOT_FOUND: 'team.invitations.notPending' })
  if ((resp as any)?.response?.status === 404) loadInvitations()
}

const confirmState = ref<{ open: boolean; busy: boolean; title: string; text: string; confirmLabel: string; onConfirm: () => void }>({
  open: false, busy: false, title: '', text: '', confirmLabel: '', onConfirm: () => {},
})

function askRevokeInvitation(inv: Invitation) {
  confirmState.value = {
    open: true,
    busy: false,
    title: t('team.invitations.revokeTitle'),
    text: t('team.invitations.revokeText', { email: inv.email }),
    confirmLabel: t('team.invitations.revoke'),
    onConfirm: async () => {
      confirmState.value.busy = true
      const resp: any = await teamApi.revokeInvitation(inv.id)
      confirmState.value.busy = false
      confirmState.value.open = false
      if (!isApiError(resp)) showToast({ tone: 'success', message: t('team.invitations.revoked') })
      else toastError(resp, { HTTP_404: 'team.invitations.notPending', NOT_FOUND: 'team.invitations.notPending' })
      loadInvitations()
    },
  }
}

function askCancelTransfer() {
  confirmState.value = {
    open: true,
    busy: false,
    title: t('team.transfer.cancelTitle'),
    text: t('team.transfer.cancelText'),
    confirmLabel: t('team.transfer.cancel'),
    onConfirm: async () => {
      confirmState.value.busy = true
      const resp: any = await teamApi.cancelOwnershipTransfer()
      confirmState.value.busy = false
      confirmState.value.open = false
      if (!isApiError(resp)) {
        transferOpen.value = false
        showToast({ tone: 'success', message: t('team.transfer.cancelled') })
      } else toastError(resp, { HTTP_404: 'team.transfer.noPending', NOT_FOUND: 'team.transfer.noPending' })
    },
  }
}

const memberDialog = ref<{ open: boolean; busy: boolean; mode: 'suspend' | 'reactivate'; row: MemberRow | null; title: string; text: string; reason: string; errorKey: string }>({
  open: false, busy: false, mode: 'suspend', row: null, title: '', text: '', reason: '', errorKey: '',
})

function openMemberStatus(row: MemberRow, mode: 'suspend' | 'reactivate') {
  const name = displayName(row)
  memberDialog.value = {
    open: true,
    busy: false,
    mode,
    row,
    title: t(`team.${mode}.title`, { name }),
    text: t(`team.${mode}.text`),
    reason: '',
    errorKey: '',
  }
}

async function confirmMemberStatus() {
  const d = memberDialog.value
  if (!d.row?._id || d.busy) return
  d.busy = true
  d.errorKey = ''
  const resp: any = d.mode === 'suspend'
    ? await teamApi.suspendUser(String(d.row._id), d.reason.trim() || undefined)
    : await teamApi.reactivateUser(String(d.row._id))
  d.busy = false
  if (!isApiError(resp)) {
    d.open = false
    showToast({ tone: 'success', message: t(`team.${d.mode}.done`, { name: displayName(d.row) }) })
    getUsers()
    return
  }
  const key = errorMessageKey(resp, { FORBIDDEN: 'team.suspend.forbidden', HTTP_403: 'team.suspend.forbidden' })
  if (key) d.errorKey = key
}

function openTransfer(row?: MemberRow) {
  transferTarget.value = row?._id ? String(row._id) : null
  transferOpen.value = true
}

function rowActions(row: MemberRow): EkRowAction[] {
  const items: EkRowAction[] = [{ key: 'edit', action: 'edit', label: 'Düzenle', onClick: () => openAddUser(row) }]
  if (teamManager.value) {
    const owners = activeOwnerCount(users.value)
    if (memberStatus(row) === 'active') {
      const gate = suspendGate(row, me.value, owners)
      items.push({ key: 'suspend', action: 'cancel', icon: 'mdi-account-cancel-outline', label: gate.allowed ? t('team.suspend.action') : `${t('team.suspend.action')} — ${t(gate.reasonKey!)}`, disabled: !gate.allowed, group: 'Üyelik', onClick: () => openMemberStatus(row, 'suspend') })
    } else {
      const gate = reactivateGate(row, me.value)
      items.push({ key: 'reactivate', action: 'approve', icon: 'mdi-account-check-outline', label: gate.allowed ? t('team.reactivate.action') : `${t('team.reactivate.action')} — ${t(gate.reasonKey!)}`, disabled: !gate.allowed, group: 'Üyelik', onClick: () => openMemberStatus(row, 'reactivate') })
    }
    if (memberRole(me.value) === 'owner' && !isSelf(row, me.value) && memberRole(row) !== 'owner') {
      const gate = transferTargetGate(row, me.value)
      items.push({ key: 'transfer', action: 'send', icon: 'mdi-crown-outline', label: gate.allowed ? t('team.transfer.action') : `${t('team.transfer.action')} — ${t(gate.reasonKey!)}`, disabled: !gate.allowed, group: 'Üyelik', onClick: () => openTransfer(row) })
    }
  }
  items.push({ key: 'delete', action: 'delete', label: row.owner ? 'Mağaza yöneticisi silinemez' : 'Sil', disabled: !!row.owner, onClick: () => triggerDelete(row) })
  return items
}

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
  loadInvitations()

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

/* FE-LOCAL-1047: personel hücresi — baş harfli çerçeveli kapsül (müşteri listesiyle aynı aile) + ad / tarih. */
.ek-auth-person {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
}

.ek-auth-person__avatar {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.02em;
  user-select: none;
}

.ek-auth-person__avatar.is-owner {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.ek-auth-person__avatar.is-suspended {
  border-color: var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
}

.ek-auth-person__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
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

.ek-auth-person__you {
  margin-left: var(--ek-space-1);
  vertical-align: middle;
}

.ek-team-summary {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.ek-member-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.ek-member-dialog:empty {
  display: none;
}
</style>
