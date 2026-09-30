<!--
  frontend/src/views/unsecure/VerifyEmailView.vue

  ADR-0015 B4-P0 — `docs/API_ACCOUNT_LIFECYCLE.md` #4 `verifyEmail` (AÇIK, kimliksiz özel rota;
  backend `ApiManager.ts:110`). E-postadaki bağlantının hedefi: `${PUBLIC_APP_URL}/verify-email?token=`.
  N1 "Hesabım ve güvenlik" ekranındaki "Doğrulama bağlantısını gönder" ve kayıt sonrası e-posta bu
  sayfaya gelir; sayfa olmadan bağlantı ölü kalırdı.

  Sözleşmeye göre: sayfa açılışta `verifyEmail({ token })` çağırır (GET'in yan etkisi yoktur); token
  okunur okunmaz `history.replaceState` ile URL'den silinir; geçersiz/süresi dolmuş/kullanılmış/biçimsiz
  token'ların HEPSİ aynı `TOKEN_INVALID` yanıtıdır — FE bu ayrımı UYDURMAZ. Oturum açmaz/çerez basmaz.
  `ResetPasswordView` ile aynı `AuthShell` iskeleti (Karar 6 "tek iş = tek desen").
-->
<template>
  <div class="VerifyEmailView">
    <AuthShell>
      <div class="ek-verify-card">
        <h1 class="ek-verify-heading">{{ $t('verifyEmail.title') }}</h1>

        <EkEmptyState
          v-if="!token"
          variant="error"
          :title="$t('verifyEmail.noToken.title')"
          :message="$t('verifyEmail.noToken.message')"
          show-action
          :action-text="$t('verifyEmail.toLogin')"
          action-icon="mdi-arrow-left"
          @action="goToLogin"
        />

        <p v-else-if="status === 'verifying'" class="ek-verify-status" role="status">
          <v-icon size="20" aria-hidden="true">mdi-email-search-outline</v-icon>
          <span>{{ $t('verifyEmail.verifying') }}</span>
        </p>

        <template v-else>
          <div class="ek-verify-result" :class="`ek-verify-result--${status}`" :role="status === 'success' ? 'status' : 'alert'">
            <v-icon size="32" aria-hidden="true">{{ status === 'success' ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline' }}</v-icon>
            <p>{{ $t(resultKey) }}</p>
            <p v-if="status === 'error'" class="ek-verify-hint">{{ $t('verifyEmail.resendHint') }}</p>
          </div>
          <v-btn block color="primary" height="40" class="mt-4 text-none" @click="goToApp">
            {{ $t('verifyEmail.toApp') }}
          </v-btn>
        </template>
      </div>
    </AuthShell>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthShell from '@/components/login/AuthShell.vue'
import { EkEmptyState } from '@entegrasyonik/ui/components'
import { apiCode, apiStatus, isApiError } from '@/composables/apiErrors'
import { useAccountSecurityApi, verifyEmailResultKey } from '@/composables/useAccountSecurityApi'

const route = useRoute()
const router = useRouter()
const api = useAccountSecurityApi()

const rawToken = route.query.token
const token = (Array.isArray(rawToken) ? rawToken[0] : rawToken) || ''

// API sözleşmesi önerisi: token'ı okuduktan hemen sonra URL'den sil (loglama/geçmiş sızıntısını önler).
if (token && typeof window !== 'undefined') {
  const url = new URL(window.location.href)
  url.searchParams.delete('token')
  window.history.replaceState({}, '', url.pathname + url.search)
}

const status = ref<'verifying' | 'success' | 'error'>('verifying')
const resultKey = ref('verifyEmail.errors.generic')

onMounted(async () => {
  if (!token) return
  const res: any = await api.verifyEmail(String(token))
  const ok = !isApiError(res) && res?.success === true
  resultKey.value = verifyEmailResultKey({ ok, status: apiStatus(res), code: apiCode(res) })
  status.value = ok ? 'success' : 'error'
})

const goToLogin = () => router.replace('/login')
// Oturum varsa kabuğa, yoksa router guard'ı üzerinden girişe gider.
const goToApp = () => router.replace('/')
</script>

<style scoped>
.VerifyEmailView {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.ek-verify-card {
  width: 100%;
}

.ek-verify-heading {
  margin: 0 0 var(--ek-space-6);
  font-size: var(--ek-font-size-2xl);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: -0.01em;
  color: var(--ek-color-content-strong);
}

.ek-verify-status {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-font-size-md);
  color: var(--ek-color-content-default);
}

.ek-verify-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-6) 0 var(--ek-space-2);
  text-align: center;
  color: var(--ek-color-content-strong);
}

.ek-verify-result p {
  margin: 0;
}

.ek-verify-result--success .v-icon {
  color: var(--ek-color-success);
}

.ek-verify-result--error .v-icon {
  color: var(--ek-color-error);
}

.ek-verify-hint {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
}
</style>
