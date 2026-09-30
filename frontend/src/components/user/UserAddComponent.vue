<template>
  <ActionDialogComponent :model-value="true" :title="user._id ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı Ekle'"
    :subtitle="user._id ? `${user.name} ${user.surname} kullanıcısını güncelliyorsunuz.` : 'Sisteme yeni bir kullanıcı tanımlayın.'"
    icon="mdi-account-plus-outline" color="primary" confirmButtomColor="primary"
    :confirmText="user._id ? 'Güncelle' : 'Kaydet'" cancelText="İptal" maxWidth="800px" @confirm="createOrUpdateUser"
    @cancel="emits('close')" @close="emits('close')" attach="authorizationListView">
    <div class="user-form-container">
      <EkFormSection title="Hesap bilgileri" icon="mdi-account-details-outline">
        <v-text-field v-model="user.name" label="İsim" />
        <v-text-field v-model="user.surname" label="Soyisim" />
        <v-text-field class="ek-span-full" v-model="user.email" label="E-posta Adresi" prepend-inner-icon="mdi-email-outline" />
      </EkFormSection>

      <EkFormSection title="Güvenlik bilgileri" icon="mdi-lock-outline"
        :description="user._id ? 'Şifreyi değiştirmek istemiyorsanız boş bırakın.' : undefined">
        <v-text-field v-model="user.password" label="Şifre" type="password" prepend-inner-icon="mdi-lock-outline"
          :placeholder="user._id ? 'Değiştirmek istemiyorsanız boş bırakın' : ''" />
        <v-text-field v-if="!user._id" v-model="user.password2" label="Şifre Tekrar" type="password" />
      </EkFormSection>

      <EkFormSection title="Rol ve yetkiler" icon="mdi-shield-account-outline" :columns="1">
        <v-select v-model="user.roleCode" :items="globalRoles" item-title="name" item-value="code"
          label="Kullanıcı Rolü Seçiniz" :readonly="user.owner" />
        <div v-if="selectedRoleInfo" class="uac-note uac-note--info">
          <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
          <div>
            <strong>{{ selectedRoleInfo?.name }} Rolü Hakkında</strong>
            <p>{{ selectedRoleInfo?.description || 'Bu rol için bir açıklama tanımlanmamış.' }}</p>
          </div>
        </div>
        <p v-if="user.owner" class="uac-note uac-note--warning" role="status">
          <v-icon icon="mdi-alert-decagram-outline" size="16" aria-hidden="true" />
          <span>Bu kullanıcı Mağaza Yöneticisi olduğu için rolü değiştirilemez.</span>
        </p>
      </EkFormSection>
    </div>
  </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref, onMounted, onActivated, computed } from 'vue'
import { EkFormSection } from '@entegrasyonik/ui/components'
import { useI18n } from 'vue-i18n'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore'
import useUser from '@/composables/user'

const emits = defineEmits(['close', 'refreshUsers', 'onSave'])
const { t } = useI18n()
const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const userApi = useUser()

const loadingComponentRef: any = ref(null)
const user: any = ref({})
const globalRoles = ref<any[]>([])

const props = defineProps<{
  editUser: any
}>()

const selectedRoleInfo = computed(() => {
  return globalRoles.value.find((r: any) => r.code === user.value.roleCode)
})

const fetchGlobalRoles = async () => {
  try {
    const roles = await userApi.getRoles()
    globalRoles.value = roles || []
  } catch (error) {
    console.error("Roller yüklenemedi", error)
  }
}

const createOrUpdateUser = () => {
  emits("onSave", user)
  resetForm()
  emits('close')
}

const resetForm = () => { user.value = {} }
const clone = (obj: any) => JSON.parse(JSON.stringify(obj))
const assignUser = (userData: any) => { user.value = clone(userData) }

onMounted(async () => {
  assignUser(props.editUser)
  await fetchGlobalRoles()
})

onActivated(async () => {
  assignUser(props.editUser)
  await fetchGlobalRoles()
})
</script>

<style scoped>
.uac-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3);
  border: 1px solid;
  border-radius: var(--ek-radius-control);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.uac-note p {
  margin: var(--ek-space-1) 0 0;
}

.uac-note--info {
  border-color: var(--ek-color-info-border);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
}

.uac-note--warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}
</style>