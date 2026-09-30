<!--
  frontend/src/views/unsecure/OwnershipAcceptView.vue

  Faz 3 / C2a — sahiplik devrinin 2. adımı (API_ACCOUNT_LIFECYCLE.md §9). E-postadaki bağlantı
  `${PUBLIC_APP_URL}/accept-ownership#t=<token>`. Token parçadan okunur ve hemen silinir (`consumeFragmentToken`).
  Kabul (`UserService/acceptOwnershipTransfer`) HEDEF kullanıcının oturumunu ister: oturum yoksa token yalnız bellekte
  bekletilir (`holdToken`) → `/login?redirect=/accept-ownership` → giriş sonrası SPA içinde buraya dönülür
  (`takeHeldToken`). Başarıda iki tarafın `tokenVersion`'ı artar → oturum kapanmıştır; yerel durum temizlenir ve
  girişe yönlendirilir. Geçersiz/başkasına ait/süresi dolmuş/kullanılmış belirteç: hep `400 TOKEN_INVALID` (ayrım uydurulmaz).
-->
<template>
  <div class="OwnershipAcceptView">
    <AuthShell>
      <div class="ek-own">
        <p v-if="phase !== 'success'" class="ek-own__eyebrow">{{ $t('ownership.pageTitle') }}</p>

        <template v-if="phase === 'problem'">
          <EkEmptyState
            variant="error"
            :title="$t(problem.titleKey)"
            :message="$t(problem.messageKey)"
            show-action
            :action-text="problem.retry ? $t('team.invitations.retry') : $t('invitation.toLogin')"
            :action-icon="problem.retry ? 'mdi-refresh' : 'mdi-login'"
            @action="problem.retry ? accept() : goToLogin()"
          />
        </template>

        <div v-else-if="phase === 'checking'" role="status" aria-live="polite">
          <span class="ek-sr-only">{{ $t('invitation.loading') }}</span>
          <EkSkeleton type="detail" :rows="3" />
        </div>

        <template v-else-if="phase === 'login'">
          <h1 class="ek-own__title">{{ $t('ownership.loginTitle') }}</h1>
          <p class="ek-own__lead">{{ $t('ownership.loginText') }}</p>
          <EkButton block icon="mdi-login" data-testid="ownership-login" @click="goToLoginAndReturn">{{ $t('ownership.login') }}</EkButton>
        </template>

        <template v-else-if="phase === 'confirm'">
          <h1 class="ek-own__title">{{ $t('ownership.heading') }}</h1>
          <p class="ek-own__lead">{{ $t('ownership.text') }}</p>
          <p v-if="username" class="ek-own__who">
            <v-icon size="16" aria-hidden="true">mdi-account-circle-outline</v-icon>
            <span>{{ $t('ownership.signedInAs', { user: username }) }}</span>
          </p>
          <EkAlert tone="warning" class="ek-own__alert" :text="$t('ownership.consequence')" />
          <EkAlert v-if="errorKey" tone="error" dense live class="ek-own__alert" :text="$t(errorKey)" />
          <div class="ek-own__actions">
            <EkButton tone="secondary" :disabled="busy" @click="decline">{{ $t('ownership.decline') }}</EkButton>
            <EkButton icon="mdi-crown-outline" :loading="busy" data-testid="ownership-accept" @click="accept">{{ $t('ownership.accept') }}</EkButton>
          </div>
        </template>

        <div v-else class="ek-own__done" role="status">
          <EkIconTile icon="mdi-crown-outline" tone="success" size="lg" />
          <h1 class="ek-own__title">{{ $t('ownership.successTitle') }}</h1>
          <p class="ek-own__lead">{{ $t('ownership.successText') }}</p>
          <EkButton block icon="mdi-login" @click="goToLogin('ownership-transferred')">{{ $t('invitation.toLogin') }}</EkButton>
        </div>
      </div>
    </AuthShell>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthShell from '@/components/login/AuthShell.vue'
import EkAlert from '@/components/ds/EkAlert.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import useUser from '@/composables/user'
import { consumeFragmentToken, holdToken, takeHeldToken } from '@/composables/fragmentToken'
import { useTeamApi } from '@/composables/useTeamApi'
import { isApiError } from '@/composables/apiErrors'
import { describeFailure, errorMessageKey } from '@/composables/errorCodes'

const router = useRouter()
const userApi = useUser()
const api = useTeamApi()

// Parçadaki yeni bağlantı öncelikli; yoksa girişten dönüşte bellekte bekletilen belirteç.
const fresh = consumeFragmentToken()
const held = takeHeldToken()
const token = fresh || held

type Phase = 'checking' | 'login' | 'confirm' | 'problem' | 'success'
const phase = ref<Phase>(token ? 'checking' : 'problem')
const problem = reactive({ titleKey: 'ownership.noTokenTitle', messageKey: 'ownership.noTokenText', retry: false })
const busy = ref(false)
const errorKey = ref('')
const username = computed(() => userApi.getUsername.value as string | undefined)

async function checkSession() {
  if (!token) return
  phase.value = (await userApi.isAuthenticated(false)) ? 'confirm' : 'login'
}

function goToLoginAndReturn() {
  holdToken(token)
  router.push({ path: '/login', query: { redirect: '/accept-ownership' } })
}

async function accept() {
  if (busy.value || !token) return
  busy.value = true
  errorKey.value = ''
  const resp: any = await api.acceptOwnershipTransfer(token)
  busy.value = false
  if (!isApiError(resp) && resp?.success !== false) {
    // tokenVersion arttı: çerez artık geçersiz; yerel oturum durumunu temizle.
    await userApi.logout()
    phase.value = 'success'
    return
  }
  const { code, status } = describeFailure(resp)
  if (code === 'TOKEN_INVALID') {
    Object.assign(problem, { titleKey: 'ownership.invalidTitle', messageKey: 'ownership.invalidText', retry: false })
    phase.value = 'problem'
  } else if (status === 401 && code !== 'REAUTH_REQUIRED') {
    phase.value = 'login'
  } else {
    const key = errorMessageKey(resp)
    if (key) errorKey.value = key
    if (phase.value === 'problem') phase.value = 'confirm'
  }
}

function decline() {
  router.replace('/')
}

function goToLogin(reason?: string) {
  router.replace(reason ? { path: '/login', query: { reason } } : '/login')
}

onMounted(checkSession)
</script>

<style scoped>
.OwnershipAcceptView {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.ek-own {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.ek-own__eyebrow {
  margin: 0 0 var(--ek-space-2);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-sidebar-section);
}

.ek-own__title {
  margin: 0 0 var(--ek-space-2);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: -0.01em;
  color: var(--ek-color-content-strong);
}

.ek-own__lead {
  margin: 0 0 var(--ek-space-4);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-default);
}

.ek-own__who {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-4);
  font-size: var(--ek-type-label-size);
  color: var(--ek-color-content-muted);
}

.ek-own__alert {
  margin-bottom: var(--ek-space-4);
}

.ek-own__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ek-space-2);
}

.ek-own__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-3);
  text-align: center;
}

@media (max-width: 420px) {
  .ek-own__actions {
    flex-direction: column-reverse;
  }
  .ek-own__actions > * {
    width: 100%;
  }
}
</style>
