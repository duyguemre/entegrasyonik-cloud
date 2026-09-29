<!--
  frontend/src/views/secure/user/AccountSecurityView.vue

  ADR-0015 B4-P0 — N1 "Hesabım ve güvenlik" (gap analizi N1; `ChangePasswordView`'ın ADR'deki
  yerine geçecek YENİ ekran). `EkSettingsTemplate` (Karar 3.9.2 / 6.1 "Form sayfası / ayar").
  Not (Karar 6.4 desen mandalı): `EkPageHeader` bu dosyada DOĞRUDAN kullanılmaz — `EkSettingsTemplate`
  onu İÇİNDE render eder (EngineSettingsView ile aynı emsal).

  Sözleşme: `docs/API_ACCOUNT_LIFECYCLE.md` — #1 `changePassword` (member; yanlış mevcut parola
  400 `INVALID_CURRENT_PASSWORD`, 401 DEĞİL), #5 `resendVerificationEmail` (member). Profil,
  `GET userContext` profil DTO'sundan (`emailVerified` her zaman boolean) okunur.
  Backend doğrulaması (salt-okunur, grep): `backend/src/api/ApiManager.ts:120` (changePassword özel
  rotası), `backend/src/api/services/account-service.ts:31,60`, `backend/src/api/profileDto.ts`.

  BİLİNÇLİ SINIRLAR ("sözleşme bekliyor", rapora yazıldı): oturum listesi / "diğer oturumları kapat"
  (`revokeMySessions` backend'de YOK), profil düzenleme (kendi profilini yazan uç YOK), 2FA (YOK).
  Bunlar için sahte düğme/form GÖSTERİLMEZ; parola değişiminin diğer oturumları kapattığı bilgisi
  sözleşmedeki gerçek davranıştır.

  Mevcut `ChangePasswordView` ve menü kodu `changePassword` DEĞİŞTİRİLMEDİ (B5-3 karakterizasyonu,
  `user-account-forms.spec.ts`); menüde bu ekrana geçiş orkestratör/menü kaydı işidir.
-->
<template>
  <div class="accountSecurityView">
    <EkSettingsTemplate
      :title="$t('accountSecurity.title')"
      :description="$t('accountSecurity.description')"
    >
      <EkSkeleton v-if="state === 'loading'" type="form" />
      <EkErrorState
        v-else-if="state === 'error'"
        :message="$t('accountSecurity.loadError')"
        @retry="loadProfile"
      />
      <template v-else>
        <EkSettingsSection :title="$t('accountSecurity.profile.title')" :description="$t('accountSecurity.profile.description')">
          <EkDescriptionList :items="profileItems" />
        </EkSettingsSection>

        <EkSettingsSection
          :title="$t('accountSecurity.verify.title')"
          :description="$t('accountSecurity.verify.description')"
        >
          <div class="accountSecurityView__verify">
            <EkStatusChip
              :tone="emailVerified ? 'success' : 'warning'"
              :label="emailVerified ? $t('accountSecurity.verify.verified') : $t('accountSecurity.verify.unverified')"
              dot
            />
            <p class="accountSecurityView__muted">
              {{ emailVerified ? $t('accountSecurity.verify.verifiedHint') : $t('accountSecurity.verify.unverifiedHint') }}
            </p>
          </div>
          <div v-if="!emailVerified" class="accountSecurityView__actions accountSecurityView__actions--start">
            <v-btn
              variant="outlined"
              prepend-icon="mdi-email-fast-outline"
              class="text-none"
              :loading="resendLoading"
              @click="resendVerification"
            >
              {{ $t('accountSecurity.verify.send') }}
            </v-btn>
          </div>
          <p
            v-if="resendNotice"
            class="accountSecurityView__notice"
            :class="`accountSecurityView__notice--${resendNotice.tone}`"
            :role="resendNotice.tone === 'error' ? 'alert' : 'status'"
          >
            <v-icon size="18" aria-hidden="true">{{ resendNotice.tone === 'error' ? 'mdi-alert-circle-outline' : 'mdi-check-circle-outline' }}</v-icon>
            <span>{{ resendNotice.text }}</span>
          </p>
        </EkSettingsSection>

        <EkSettingsSection
          :title="$t('accountSecurity.password.title')"
          :description="$t('accountSecurity.password.description')"
        >
          <v-form class="accountSecurityView__form" @submit.prevent="submitPasswordChange">
            <v-text-field
              v-model="currentPassword"
              :label="$t('accountSecurity.password.current')"
              type="password"
              autocomplete="current-password"
              density="comfortable"
              :error-messages="fieldErrors.current"
              @update:model-value="fieldErrors.current = ''"
            />
            <v-text-field
              v-model="newPassword"
              :label="$t('accountSecurity.password.new')"
              type="password"
              autocomplete="new-password"
              density="comfortable"
              aria-describedby="account-security-password-hints"
              :error-messages="fieldErrors.new"
              @update:model-value="fieldErrors.new = ''"
            />
            <ul id="account-security-password-hints" class="accountSecurityView__hints" :aria-label="$t('accountSecurity.password.hintsLabel')">
              <li
                v-for="hint in hints"
                :key="hint.id"
                class="accountSecurityView__hint"
                :class="{ 'accountSecurityView__hint--met': hint.met }"
              >
                <v-icon size="16" aria-hidden="true">{{ hint.met ? 'mdi-check-circle' : 'mdi-circle-outline' }}</v-icon>
                <span>{{ $t(hint.labelKey) }}</span>
                <span class="accountSecurityView__sr">{{ hint.met ? $t('accountSecurity.password.hintMet') : $t('accountSecurity.password.hintUnmet') }}</span>
              </li>
            </ul>
            <v-text-field
              v-model="confirmPassword"
              :label="$t('accountSecurity.password.confirm')"
              type="password"
              autocomplete="new-password"
              density="comfortable"
              :error-messages="fieldErrors.confirm"
              @update:model-value="fieldErrors.confirm = ''"
            />

            <p v-if="formError" class="accountSecurityView__notice accountSecurityView__notice--error" role="alert">
              <v-icon size="18" aria-hidden="true">mdi-alert-circle-outline</v-icon>
              <span>{{ formError }}</span>
            </p>
            <p v-if="passwordChanged" class="accountSecurityView__notice accountSecurityView__notice--success" role="status">
              <v-icon size="18" aria-hidden="true">mdi-check-circle-outline</v-icon>
              <span>{{ $t('accountSecurity.password.changed') }}</span>
            </p>

            <div class="accountSecurityView__actions">
              <v-btn color="primary" type="submit" class="text-none" prepend-icon="mdi-lock-reset" :loading="changing">
                {{ $t('accountSecurity.password.submit') }}
              </v-btn>
            </div>
          </v-form>
        </EkSettingsSection>
      </template>
    </EkSettingsTemplate>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import EkSettingsTemplate from '@/components/ds/templates/EkSettingsTemplate.vue'
import EkSettingsSection from '@/components/ds/templates/EkSettingsSection.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkDescriptionList, { type EkDescriptionListItem } from '@/components/ds/EkDescriptionList.vue'
import { useToast } from '@/composables/useToast'
import { apiCode, apiStatus, isApiError } from '@/composables/apiErrors'
import { passwordHints } from '@/composables/passwordPolicyHints'
import {
  useAccountSecurityApi, changePasswordError, resendVerificationErrorKey, type AccountProfile,
} from '@/composables/useAccountSecurityApi'

const api = useAccountSecurityApi()
const { showToast } = useToast()
const { t } = useI18n()

// ---- Profil ----
const state = ref<'loading' | 'ready' | 'error'>('loading')
const profile = ref<AccountProfile>({})

async function loadProfile() {
  state.value = 'loading'
  const res: any = await api.getProfile()
  if (res && !isApiError(res) && typeof res === 'object' && !Array.isArray(res)) {
    profile.value = res
    state.value = 'ready'
  } else {
    state.value = 'error'
  }
}

const emailVerified = ref(false)
const profileItems = computed<EkDescriptionListItem[]>(() => {
  const p = profile.value
  const fullName = [p.name, p.surname].filter((s) => typeof s === 'string' && s.trim()).join(' ')
  return [
    { label: t('accountSecurity.profile.fullName'), value: fullName || '—' },
    { label: t('accountSecurity.profile.email'), value: p.email || p.username || '—' },
    { label: t('accountSecurity.profile.accountType'), value: p.owner ? t('accountSecurity.profile.owner') : t('accountSecurity.profile.member') },
  ]
})

onMounted(async () => {
  await loadProfile()
  emailVerified.value = profile.value.emailVerified === true
})

// ---- E-posta doğrulama bağlantısı ----
const resendLoading = ref(false)
const resendNotice = ref<{ tone: 'success' | 'error'; text: string } | null>(null)

async function resendVerification() {
  resendLoading.value = true
  resendNotice.value = null
  const res: any = await api.resendVerificationEmail()
  resendLoading.value = false
  if (!isApiError(res) && res?.success === true) {
    if (res.alreadyVerified === true) {
      emailVerified.value = true
      resendNotice.value = { tone: 'success', text: t('accountSecurity.verify.alreadyVerified') }
    } else {
      resendNotice.value = { tone: 'success', text: t('accountSecurity.verify.sent') }
    }
    return
  }
  resendNotice.value = { tone: 'error', text: t(resendVerificationErrorKey(apiStatus(res), apiCode(res))) }
}

// ---- Parola değiştirme ----
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const changing = ref(false)
const passwordChanged = ref(false)
const formError = ref('')
const fieldErrors = reactive({ current: '', new: '', confirm: '' })

const hints = computed(() => passwordHints(newPassword.value))

function validateLocally(): boolean {
  let ok = true
  if (!currentPassword.value) { fieldErrors.current = t('accountSecurity.errors.currentRequired'); ok = false }
  if (!newPassword.value) { fieldErrors.new = t('accountSecurity.errors.newRequired'); ok = false }
  else if (hints.value.some((h) => !h.met)) { fieldErrors.new = t('accountSecurity.errors.hintsUnmet'); ok = false }
  if (newPassword.value && confirmPassword.value !== newPassword.value) { fieldErrors.confirm = t('accountSecurity.errors.mismatch'); ok = false }
  return ok
}

async function submitPasswordChange() {
  formError.value = ''
  passwordChanged.value = false
  if (!validateLocally()) return

  changing.value = true
  const res: any = await api.changePassword(currentPassword.value, newPassword.value)
  changing.value = false

  if (!isApiError(res) && res?.success === true) {
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    passwordChanged.value = true
    showToast({ tone: 'success', message: t('accountSecurity.password.changedToast') })
    return
  }
  const { field, key, raw } = changePasswordError(apiStatus(res), apiCode(res), res?.response?.data?.error)
  const message = raw ?? t(key)
  if (field === 'current') fieldErrors.current = message
  else if (field === 'new') fieldErrors.new = message
  else formError.value = message
}

defineExpose({
  initialize: () => {},
  activate: () => {},
})
</script>

<style scoped>
.accountSecurityView {
  padding: var(--ek-space-6);
}

.accountSecurityView__verify {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.accountSecurityView__muted {
  margin: 0;
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-muted);
}

.accountSecurityView__form {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  max-width: 480px;
}

.accountSecurityView__hints {
  list-style: none;
  margin: calc(-1 * var(--ek-space-2)) 0 var(--ek-space-2);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.accountSecurityView__hint {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-muted);
}

.accountSecurityView__hint .v-icon {
  margin-top: 1px;
  color: var(--ek-color-content-subtle);
}

.accountSecurityView__hint--met {
  color: var(--ek-color-content-default);
}

.accountSecurityView__hint--met .v-icon {
  color: var(--ek-color-success);
}

.accountSecurityView__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.accountSecurityView__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ek-space-2);
}

.accountSecurityView__actions--start {
  justify-content: flex-start;
}

.accountSecurityView__notice {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-3);
  border-radius: var(--ek-radius-md);
  font-size: var(--ek-font-size-sm);
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.accountSecurityView__notice .v-icon {
  flex-shrink: 0;
}

.accountSecurityView__notice--success .v-icon {
  color: var(--ek-color-success);
}

.accountSecurityView__notice--error {
  border-color: var(--ek-color-error);
}

.accountSecurityView__notice--error .v-icon {
  color: var(--ek-color-error);
}
</style>
