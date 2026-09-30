<!--
  frontend/src/views/unsecure/InvitationAcceptView.vue

  Faz 3 / C2a — ekip daveti kabul sayfası (API_ACCOUNT_LIFECYCLE.md §6, ADR-0028 WP-A4). Açık rota `/invite`.
  E-postadaki bağlantı `${PUBLIC_APP_URL}/invite#t=<token>`: token YALNIZ parçadan okunur ve okunur okunmaz adresten
  silinir (`consumeFragmentToken`); router'a/sorguya/loga/depoya yazılmaz, yalnız bu bileşenin belleğinde durur
  (sayfa yenilenirse kaybolur → "bağlantıyı e-postadan yeniden açın").
  Akış: `AccountService/getInvitation` → özet (mağaza, rol, maskeli e-posta, süre) → ad/soyad/parola →
  `AccountService/acceptInvitation`. Kabul oturum AÇMAZ → girişe yönlendirir (`/login?reason=invitation-accepted`).
  `WEAK_PASSWORD` daveti yakmaz (aynı token'la düzeltip yeniden gönderilir). AuthShell iskeleti (reset/verify ile aynı desen).
-->
<template>
  <div class="InvitationAcceptView">
    <AuthShell>
      <div class="ek-invite">
        <!-- Bağlantı yok / geçersiz / süresi dolmuş / iptal / kullanılmış / okunamadı -->
        <template v-if="phase === 'problem'">
          <p class="ek-invite__eyebrow">{{ $t('invitation.pageTitle') }}</p>
          <EkEmptyState
            variant="error"
            :title="$t(problem.titleKey)"
            :message="problem.messageKey ? $t(problem.messageKey) : ''"
            show-action
            :action-text="problem.retry ? $t('team.invitations.retry') : $t('invitation.toLogin')"
            :action-icon="problem.retry ? 'mdi-refresh' : 'mdi-login'"
            @action="problem.retry ? load() : goToLogin()"
          />
        </template>

        <template v-else-if="phase === 'loading'">
          <p class="ek-invite__eyebrow">{{ $t('invitation.pageTitle') }}</p>
          <div class="ek-invite__loading" role="status" aria-live="polite">
            <span class="ek-sr-only">{{ $t('invitation.loading') }}</span>
            <EkSkeleton type="detail" :rows="4" />
          </div>
        </template>

        <template v-else-if="phase === 'success'">
          <div class="ek-invite__done" role="status">
            <EkIconTile icon="mdi-account-check-outline" tone="success" size="lg" />
            <h1 class="ek-invite__title">{{ $t('invitation.successTitle') }}</h1>
            <p class="ek-invite__lead">{{ $t('invitation.successText') }}</p>
            <EkButton block icon="mdi-login" data-testid="invite-to-login" @click="goToLogin('invitation-accepted')">
              {{ $t('invitation.toLogin') }}
            </EkButton>
          </div>
        </template>

        <template v-else>
          <p class="ek-invite__eyebrow">{{ $t('invitation.pageTitle') }}</p>
          <h1 class="ek-invite__title">{{ $t('invitation.heading', { store: summary.tenantTitle }) }}</h1>
          <p class="ek-invite__lead">{{ $t('invitation.summary') }}</p>

          <dl class="ek-invite__facts" data-testid="invite-summary">
            <div class="ek-invite__fact">
              <dt>{{ $t('invitation.store') }}</dt>
              <dd class="ek-invite__store">{{ summary.tenantTitle }}</dd>
            </div>
            <div class="ek-invite__fact">
              <dt>{{ $t('invitation.role') }}</dt>
              <dd>
                <EkStatusChip tone="info" :label="roleLabel" />
                <span v-if="roleHint" class="ek-invite__fact-note">{{ roleHint }}</span>
              </dd>
            </div>
            <div class="ek-invite__fact">
              <dt>{{ $t('invitation.email') }}</dt>
              <dd class="ek-invite__mono">{{ summary.email }}</dd>
            </div>
            <div v-if="summary.expiresAt" class="ek-invite__fact">
              <dt>{{ $t('invitation.validUntil') }}</dt>
              <dd>
                <span class="ek-num">{{ $t('invitation.validUntilValue', { date: formatDateTime(summary.expiresAt) }) }}</span>
                <span v-if="remaining !== null" class="ek-invite__fact-note">{{ remaining === 0 ? $t('team.invitations.lastDay') : $t('team.invitations.daysLeft', { n: remaining }) }}</span>
              </dd>
            </div>
          </dl>

          <h2 class="ek-invite__subtitle">{{ $t('invitation.formTitle') }}</h2>
          <v-form class="ek-invite__form" novalidate @submit.prevent="submit">
            <EkFormGrid :columns="2" class="ek-invite__grid">
              <v-text-field
                v-model="form.name"
                :label="$t('invitation.name')"
                autocomplete="given-name"
                :error-messages="fieldErrors.name ? [$t(fieldErrors.name)] : []"
                maxlength="80"
              />
              <v-text-field
                v-model="form.surname"
                :label="$t('invitation.surname')"
                autocomplete="family-name"
                :error-messages="fieldErrors.surname ? [$t(fieldErrors.surname)] : []"
                maxlength="80"
              />
              <v-text-field
                v-model="form.password"
                class="ek-span-full"
                :label="$t('invitation.password')"
                type="password"
                autocomplete="new-password"
                :error-messages="fieldErrors.password ? [$t(fieldErrors.password)] : []"
                :aria-describedby="policyId"
                maxlength="1024"
              />
              <v-text-field
                v-model="form.password2"
                class="ek-span-full"
                :label="$t('invitation.password2')"
                type="password"
                autocomplete="new-password"
                :error-messages="fieldErrors.password2 ? [$t(fieldErrors.password2)] : []"
                maxlength="1024"
              />
            </EkFormGrid>
            <p :id="policyId" class="ek-invite__policy">
              <v-icon size="14" aria-hidden="true">mdi-shield-key-outline</v-icon>
              <span>{{ $t('invitation.passwordHint') }}</span>
            </p>

            <EkAlert v-if="submitErrorKey" tone="error" dense live class="ek-invite__error" :text="$t(submitErrorKey)" />

            <EkButton type="submit" block :loading="submitting" icon="mdi-account-plus-outline" data-testid="invite-submit">
              {{ $t('invitation.submit') }}
            </EkButton>
          </v-form>
        </template>
      </div>
    </AuthShell>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, useId } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AuthShell from '@/components/login/AuthShell.vue'
import EkAlert from '@/components/ds/EkAlert.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkFormGrid from '@/components/ds/EkFormGrid.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import { consumeFragmentToken } from '@/composables/fragmentToken'
import { useTeamApi } from '@/composables/useTeamApi'
import { isApiError } from '@/composables/apiErrors'
import { describeFailure, errorMessageKey } from '@/composables/errorCodes'
import { formatDateTime } from '@/composables/format'
import { daysLeft } from '@/components/user/team/teamModel'

const router = useRouter()
const { t, te } = useI18n()
const api = useTeamApi()
const policyId = `ek-invite-policy-${useId()}`

// Kurulumda BİR kez: token parçadan alınır, adres temizlenir. Yalnız bu kapanışta yaşar.
const token = consumeFragmentToken()

type Phase = 'loading' | 'ready' | 'problem' | 'success'
const phase = ref<Phase>(token ? 'loading' : 'problem')
const problem = reactive<{ titleKey: string; messageKey: string; retry: boolean }>({
  titleKey: 'invitation.noTokenTitle',
  messageKey: 'invitation.noTokenText',
  retry: false,
})
const summary = reactive<{ tenantTitle: string; role: string; email: string; expiresAt: string }>({ tenantTitle: '', role: '', email: '', expiresAt: '' })

const roleLabel = computed(() => (te(`team.roles.${summary.role}`) ? t(`team.roles.${summary.role}`) : summary.role))
const roleHint = computed(() => (te(`team.roleHints.${summary.role}`) ? t(`team.roleHints.${summary.role}`) : ''))
const remaining = computed(() => daysLeft(summary.expiresAt))

const form = reactive({ name: '', surname: '', password: '', password2: '' })
const fieldErrors = reactive<Record<'name' | 'surname' | 'password' | 'password2', string>>({ name: '', surname: '', password: '', password2: '' })
const submitErrorKey = ref('')
const submitting = ref(false)

const TOKEN_STATE_TITLES: Record<string, string> = {
  INVITATION_EXPIRED: 'invitation.expiredTitle',
  INVITATION_REVOKED: 'invitation.revokedTitle',
  INVITATION_ACCEPTED: 'invitation.acceptedTitle',
  INVITATION_INVALID: 'invitation.invalidTitle',
}

function showProblem(resp: unknown) {
  const { code } = describeFailure(resp)
  const known = code ? TOKEN_STATE_TITLES[code] : undefined
  problem.titleKey = known ?? 'invitation.errorTitle'
  problem.messageKey = errorMessageKey(resp) ?? 'apiErrors.GENERIC'
  // Belirteç durumu kesinse yeniden deneme anlamsız; ağ/sunucu hatasında "Tekrar dene".
  problem.retry = !known && code !== 'TOKEN_INVALID'
  phase.value = 'problem'
}

async function load() {
  if (!token) return
  phase.value = 'loading'
  const resp: any = await api.getInvitation(token)
  if (isApiError(resp) || !resp || typeof resp !== 'object') return showProblem(resp)
  summary.tenantTitle = String(resp.tenantTitle ?? '')
  summary.role = String(resp.role ?? '')
  summary.email = String(resp.email ?? '')
  summary.expiresAt = typeof resp.expiresAt === 'string' ? resp.expiresAt : ''
  phase.value = 'ready'
}

function validate(): boolean {
  fieldErrors.name = form.name.trim() ? '' : 'invitation.errors.nameRequired'
  fieldErrors.surname = form.surname.trim() ? '' : 'invitation.errors.surnameRequired'
  fieldErrors.password = form.password.length >= 10 ? '' : 'invitation.errors.passwordShort'
  fieldErrors.password2 = !fieldErrors.password && form.password !== form.password2 ? 'invitation.errors.passwordMismatch' : ''
  return !fieldErrors.name && !fieldErrors.surname && !fieldErrors.password && !fieldErrors.password2
}

async function submit() {
  submitErrorKey.value = ''
  if (submitting.value || !validate()) return
  submitting.value = true
  const resp: any = await api.acceptInvitation({ token, name: form.name.trim(), surname: form.surname.trim(), password: form.password })
  submitting.value = false
  if (!isApiError(resp) && resp?.success === true) {
    form.password = ''
    form.password2 = ''
    phase.value = 'success'
    return
  }
  const { code } = describeFailure(resp)
  if (code && TOKEN_STATE_TITLES[code]) return showProblem(resp)
  if (code === 'WEAK_PASSWORD') {
    fieldErrors.password = 'apiErrors.WEAK_PASSWORD'
    return
  }
  submitErrorKey.value = errorMessageKey(resp) ?? 'apiErrors.GENERIC'
}

function goToLogin(reason?: string) {
  router.replace(reason ? { path: '/login', query: { reason } } : '/login')
}

onMounted(load)
</script>

<style scoped>
.InvitationAcceptView {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.ek-invite {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.ek-invite__eyebrow {
  margin: 0 0 var(--ek-space-2);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-sidebar-section);
}

.ek-invite__title {
  margin: 0 0 var(--ek-space-2);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: -0.01em;
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}

.ek-invite__lead {
  margin: 0 0 var(--ek-space-5);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-default);
}

.ek-invite__facts {
  display: flex;
  flex-direction: column;
  margin: 0 0 var(--ek-space-6);
  padding: var(--ek-space-1) var(--ek-space-4);
  background: var(--ek-color-surface-sunken);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
}

.ek-invite__fact {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: var(--ek-space-3);
  align-items: baseline;
  padding: var(--ek-space-3) 0;
}

.ek-invite__fact + .ek-invite__fact {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-invite__fact dt {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-invite__fact dd {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-1);
  margin: 0;
  min-width: 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-strong);
}

.ek-invite__store {
  font-weight: var(--ek-font-weight-semibold);
  overflow-wrap: anywhere;
}

.ek-invite__mono {
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-table-size);
  overflow-wrap: anywhere;
}

.ek-invite__fact-note {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-invite__subtitle {
  margin: 0 0 var(--ek-space-4);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
  color: var(--ek-color-content-strong);
}

.ek-invite__form {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.ek-invite__policy {
  display: flex;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-invite__policy .v-icon {
  flex: none;
  margin-top: 1px;
}

.ek-invite__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-3);
  text-align: center;
}

.ek-invite__done .ek-invite__lead {
  margin-bottom: var(--ek-space-3);
}

.ek-invite__loading {
  padding-top: var(--ek-space-2);
}

@media (max-width: 420px) {
  .ek-invite__fact {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-1);
  }
}
</style>
