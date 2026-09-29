<template>
  <ActionDialogComponent :model-value="true" :title="user._id ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı Ekle'"
    :subtitle="user._id ? `${user.name} ${user.surname} kullanıcısını güncelliyorsunuz.` : 'Sisteme yeni bir kullanıcı tanımlayın.'"
    icon="mdi-account-plus-outline" color="primary" confirmButtomColor="processButtonColor"
    :confirmText="user._id ? 'Güncelle' : 'Kaydet'" cancelText="İptal" maxWidth="800px" @confirm="createOrUpdateUser"
    @cancel="emits('close')" @close="emits('close')" attach="authorizationListView">
    <div class="user-form-container">

      <v-row>
        <v-col cols="12" md="7" class="pr-md-6">
          <div class="text-subtitle-1 font-weight-bold mb-4 text-primary d-flex align-center">
            <v-icon start color="primary">mdi-account-details-outline</v-icon>
            Hesap Bilgileri
          </div>

          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field v-model="user.name" density="compact" label="İsim" variant="outlined"
                class="customTextField mb-2" bg-color="white" />
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field v-model="user.surname" density="compact" label="Soyisim" variant="outlined"
                class="customTextField mb-2" bg-color="white" />
            </v-col>
          </v-row>

          <v-text-field v-model="user.email" density="compact" label="E-posta Adresi" variant="outlined"
            class="customTextField mb-2" bg-color="white" prepend-inner-icon="mdi-email-outline" />

          <v-divider class="my-4" opacity="0.1" />

          <div class="text-caption font-weight-bold mb-2 text-grey-darken-1">Güvenlik Bilgileri</div>
          <v-row dense>
            <v-col cols="12" sm="6">
              <v-text-field v-model="user.password" density="compact" label="Şifre" type="password" variant="outlined"
                class="customTextField mb-2" bg-color="white" prepend-inner-icon="mdi-lock-outline"
                :placeholder="user._id ? 'Değiştirmek istemiyorsanız boş bırakın' : ''" />
            </v-col>
            <v-col cols="12" sm="6" v-if="!user._id">
              <v-text-field v-model="user.password2" density="compact" label="Şifre Tekrar" type="password"
                variant="outlined" class="customTextField mb-2" bg-color="white" />
            </v-col>
          </v-row>
        </v-col>

        <v-col cols="12" md="5" class="border-left-md">
          <div class="text-subtitle-1 font-weight-bold mb-4 text-primary d-flex align-center">
            <v-icon start color="primary">mdi-shield-account-outline</v-icon>
            Rol ve Yetkiler
          </div>

          <v-select v-model="user.roleCode" :items="globalRoles" item-title="name" item-value="code"
            label="Kullanıcı Rolü Seçiniz" variant="outlined" density="compact" class="customTextField mb-4"
            bg-color="white" :readonly="user.owner">
            <template #append-inner>
              <v-icon color="primary">mdi-chevron-down</v-icon>
            </template>
          </v-select>

          <div v-if="selectedRoleInfo" class="role-preview-card pa-4 rounded-xl shadow-sm">
            <div class="d-flex align-center mb-2">
              <v-icon color="primary" size="20" class="mr-2">mdi-information-outline</v-icon>
              <span class="text-caption font-weight-bold text-primary">
                {{ selectedRoleInfo?.name }} Rolü Hakkında
              </span>
            </div>
            <p class="text-caption text-grey-darken-2 lh-sm mb-0">
              {{ selectedRoleInfo?.description || 'Bu rol için bir açıklama tanımlanmamış.' }}
            </p>
          </div>

          <v-alert v-if="user.owner" type="warning" variant="tonal" density="compact"
            class="mt-4 rounded-xl text-caption" icon="mdi-alert-decagram">
            Bu kullanıcı Mağaza Yöneticisi olduğu için rolü değiştirilemez.
          </v-alert>
        </v-col>
      </v-row>
    </div>
  </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref, onMounted, onActivated, computed } from 'vue'
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
.user-form-container {
  min-height: 400px;
}

.role-preview-card {
  background-color: rgba(var(--v-theme-primary), 0.04);
  border: 1px dashed rgba(var(--v-theme-primary), 0.2);
  transition: all 0.3s ease;
}

.lh-sm {
  line-height: 1.5;
}

@media (min-width: 960px) {
  .border-left-md {
    border-left: 1px solid rgba(0, 0, 0, 0.05);
    padding-left: 24px;
  }
}

/* Form elemanlarını ActionDialog'un modern yapısına uyduralım */
:deep(.v-field--variant-outlined) {
  border-radius: 12px !important;
}
</style>