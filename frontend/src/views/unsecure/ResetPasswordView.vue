<!--
  frontend/src/views/unsecure/ResetPasswordView.vue

  ADR-0015 Karar 2/Karar 4 — `docs/API_ACCOUNT_LIFECYCLE.md` #3
  `confirmPasswordReset`. E-postadaki bağlantı buraya gelir:
  `${PUBLIC_APP_URL}/reset-password?token=<token>`. Kimliksiz (oturum
  gerektirmez); backend `token` biçimsiz/süresi dolmuş/kullanılmış
  durumlarının HEPSİNİ AYNI `TOKEN_INVALID` yanıtıyla döner (ayırt edilemez,
  kullanıcı numaralandırma yok) — FE bu ayrımı UYDURMAZ.

  Güvenlik notu (API sözleşmesi "FE önerileri"): token okunur okunmaz
  `history.replaceState` ile URL'den silinir (loglama/yönlendirme geçmişine
  sızmasın diye).
-->
<template>
  <div class="ResetPasswordView">
    <AuthShell>
      <div class="premium-login-card">
        <h1 class="ek-reset-heading">Yeni parola belirleyin</h1>

        <template v-if="!token">
          <EkEmptyState
            variant="error"
            title="Bağlantı geçersiz"
            message="Bu sayfaya doğrudan erişilemez. Parola sıfırlama e-postasındaki bağlantıyı kullanın."
            show-action
            action-text="Şifremi unuttum ekranına dön"
            action-icon="mdi-arrow-left"
            @action="goToForgotPassword"
          />
        </template>

        <template v-else-if="success">
          <div class="ek-reset-success" role="status">
            <v-icon size="32" aria-hidden="true">mdi-check-circle-outline</v-icon>
            <p>Parolanız güncellendi. Yeni parolanızla giriş yapabilirsiniz.</p>
          </div>
          <v-btn block color="primary" height="40" class="mt-2" @click="goToLogin">Girişe dön</v-btn>
        </template>

        <template v-else>
          <p class="ek-reset-hint">Hesabınız için yeni bir parola belirleyin.</p>
          <v-form @submit.prevent="handleSubmit">
            <v-text-field
              v-model="newPassword"
              label="Yeni parola"
              type="password"
              autocomplete="new-password"
              class="mb-2"
            ></v-text-field>
            <v-text-field
              v-model="newPassword2"
              label="Yeni parola (tekrar)"
              type="password"
              autocomplete="new-password"
              class="mb-2"
            ></v-text-field>

            <v-expand-transition>
              <v-alert
                v-if="errorMessage"
                type="error"
                variant="tonal"
                density="compact"
                role="alert"
                aria-live="assertive"
                class="mb-3 text-caption"
              >
                {{ errorMessage }}
              </v-alert>
            </v-expand-transition>

            <v-btn block color="primary" height="40" type="submit" :loading="loading">
              Parolamı güncelle
            </v-btn>
          </v-form>

          <div v-if="tokenInvalid" class="ek-reset-retry">
            <v-btn variant="text" block class="mt-2" @click="goToForgotPassword">
              Yeni bir sıfırlama bağlantısı iste
            </v-btn>
          </div>
        </template>
      </div>
    </AuthShell>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AuthShell from '@/components/login/AuthShell.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import useUser from '@/composables/user'

const route = useRoute()
const router = useRouter()
const userApi = useUser()

const rawToken = route.query.token
const token = (Array.isArray(rawToken) ? rawToken[0] : rawToken) || ''

// API sözleşmesi önerisi: token'ı okuduktan hemen sonra URL'den sil (loglama/geçmiş sızıntısını önler).
if (token && typeof window !== 'undefined') {
  const url = new URL(window.location.href)
  url.searchParams.delete('token')
  window.history.replaceState({}, '', url.pathname + url.search)
}

const newPassword = ref('')
const newPassword2 = ref('')
const errorMessage = ref('')
const loading = ref(false)
const success = ref(false)
const tokenInvalid = ref(false)

const goToLogin = () => router.replace('/login')
const goToForgotPassword = () => router.replace({ path: '/login', query: { tab: 'forgot' } })

const handleSubmit = async () => {
  errorMessage.value = ''
  tokenInvalid.value = false

  if (newPassword.value.length < 10) {
    errorMessage.value = 'Parolanız en az 10 karakter olmalı.'
    return
  }
  if (newPassword.value !== newPassword2.value) {
    errorMessage.value = 'Girdiğiniz parolalar birbiriyle uyuşmuyor.'
    return
  }

  loading.value = true
  const resp: any = await userApi.confirmPasswordReset(token, newPassword.value)
  loading.value = false

  if (resp?.success === true) {
    success.value = true
    return
  }

  const status = resp?.response?.status
  const code = resp?.response?.data?.code
  const serverMessage: string | undefined = resp?.response?.data?.error

  if (code === 'TOKEN_INVALID') {
    errorMessage.value = 'Bu bağlantının süresi dolmuş veya daha önce kullanılmış.'
    tokenInvalid.value = true
  } else if (status === 429) {
    errorMessage.value = 'Çok fazla deneme yaptınız. Lütfen bir süre sonra tekrar deneyin.'
  } else if (serverMessage) {
    // WEAK_PASSWORD / INVALID_REQUEST: backend zaten insan-okunur Türkçe mesaj döner (Karar 3.7).
    errorMessage.value = serverMessage
  } else {
    errorMessage.value = 'Bir şeyler ters gitti, lütfen daha sonra tekrar deneyin.'
  }
}
</script>

<style scoped>
.ResetPasswordView {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.premium-login-card {
  width: 100%;
}

.ek-reset-heading {
  margin: 0 0 var(--ek-space-6);
  font-size: var(--ek-font-size-2xl);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: -0.01em;
  color: var(--ek-color-content-strong);
}

.ek-reset-hint {
  margin: 0 0 var(--ek-space-4);
  font-size: var(--ek-font-size-sm);
  /* bkz. LoginComponent.vue `.ek-login-hint` yorumu — content-muted/background sınır değeri. */
  color: var(--ek-color-content-default);
}

.ek-reset-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-6) 0 var(--ek-space-2);
  text-align: center;
  color: var(--ek-color-content-strong);
}

.ek-reset-success .v-icon {
  color: var(--ek-color-success);
}
</style>
