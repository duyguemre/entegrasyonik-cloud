<!--
  frontend/src/components/user/team/InviteUserDialog.vue

  Faz 3 / C2a — ekibe davet (API_ACCOUNT_LIFECYCLE.md §6 `UserService/inviteUser`). E-posta + rol (admin | operator).
  Rol tavanı UI'da da: yalnız `invitableRoles(me)` gösterilir (owner davetle verilemez; operatör davet edemez); sunucunun
  403'ü de okunur iletiye çevrilir. Idempotency: "Davet gönder" = bir kullanıcı eylemi; aynı gövdeyle yeniden deneme
  (ağ hatası sonrası tekrar basış) AYNI anahtarı kullanır, gövde değişirse yeni anahtar (`createIdempotentAction`).
  502 MAIL_FAILED: davet kayıtlı kalır → diyalog kapanır, uyarı toast'ı + liste yenilenir (yeniden gönderim listeden).
  PLAN_LIMIT_REACHED yetki hatası değildir → uyarı tonu + "Aboneliği görüntüle".
-->
<template>
  <EkDialog
    :model-value="modelValue"
    :title="$t('team.invite.title')"
    :description="$t('team.invite.description')"
    icon="mdi-account-plus-outline"
    width="md"
    as-form
    :confirm-label="$t('team.invite.submit')"
    confirm-icon="mdi-send-outline"
    :confirm-loading="busy"
    :confirm-disabled="!roles.length"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @confirm="submit"
  >
    <div class="ek-invite-dialog">
      <v-text-field
        ref="emailRef"
        v-model="email"
        :label="$t('team.invite.email')"
        type="email"
        inputmode="email"
        autocomplete="off"
        :hint="$t('team.invite.emailHint')"
        persistent-hint
        :error-messages="emailErrorKey ? [$t(emailErrorKey)] : []"
        maxlength="254"
        data-testid="invite-email"
      />

      <fieldset class="ek-invite-dialog__roles">
        <legend class="ek-invite-dialog__legend">{{ $t('team.invite.role') }}</legend>
        <div class="ek-invite-dialog__options" role="radiogroup" :aria-label="$t('team.invite.role')">
          <label
            v-for="r in roles"
            :key="r"
            class="ek-role-option"
            :class="{ 'is-selected': role === r }"
            :data-testid="`invite-role-${r}`"
          >
            <input v-model="role" class="ek-role-option__input" type="radio" name="ek-invite-role" :value="r" />
            <span class="ek-role-option__mark" aria-hidden="true" />
            <span class="ek-role-option__body">
              <span class="ek-role-option__title">
                <v-icon size="16" aria-hidden="true">{{ r === 'admin' ? 'mdi-shield-account-outline' : 'mdi-account-cog-outline' }}</v-icon>
                {{ $t(`team.roles.${r}`) }}
              </span>
              <span class="ek-role-option__hint">{{ $t(`team.roleHints.${r}`) }}</span>
            </span>
          </label>
        </div>
        <p class="ek-invite-dialog__ceiling">
          <v-icon size="14" aria-hidden="true">mdi-information-outline</v-icon>
          <span>{{ $t('team.invite.roleCeiling') }}</span>
        </p>
      </fieldset>

      <EkAlert v-if="errorKey" ref="errorRef" :tone="planLimit ? 'warning' : 'error'" live :text="$t(errorKey)" data-testid="invite-error">
        <template v-if="planLimit" #actions>
          <EkButton tone="secondary" size="sm" icon="mdi-arrow-right" @click="openSubscription">{{ $t('team.invite.upgrade') }}</EkButton>
        </template>
      </EkAlert>
    </div>
  </EkDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import EkDialog from '@/components/ds/EkDialog.vue'
import EkAlert from '@/components/ds/EkAlert.vue'
import EkButton from '@/components/ds/EkButton.vue'
import { useToast } from '@/composables/useToast'
import { useTeamApi } from '@/composables/useTeamApi'
import { createIdempotentAction } from '@/composables/restapi'
import { apiCode, isApiError } from '@/composables/apiErrors'
import { errorMessageKey, isPlanLimit } from '@/composables/errorCodes'
import { EMAIL_PATTERN, normalizeEmail, type InvitableRole } from './teamModel'

const props = defineProps<{ modelValue: boolean; roles: InvitableRole[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; invited: [] }>()

const { t } = useI18n()
const router = useRouter()
const { showToast } = useToast()
const api = useTeamApi()
const action = createIdempotentAction()

const email = ref('')
const role = ref<InvitableRole | ''>('')
const busy = ref(false)
const emailErrorKey = ref('')
const errorKey = ref('')
const planLimit = ref(false)
const emailRef = ref<{ focus: () => void } | null>(null)
const errorRef = ref<{ $el?: Element } | null>(null)

// Dar ekranda diyalog gövdesi kayar: hata altta kalıp görünmezdi → görünür alana getir.
watch(errorKey, async (key) => {
  if (!key) return
  await nextTick()
  errorRef.value?.$el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
})

// Varsayılan rol en düşük yetki (operatör): en az yetki ilkesi.
const defaultRole = computed<InvitableRole | ''>(() => (props.roles.includes('operator') ? 'operator' : props.roles[0] ?? ''))

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    email.value = ''
    role.value = defaultRole.value
    emailErrorKey.value = ''
    errorKey.value = ''
    planLimit.value = false
    action.reset()
    await nextTick()
    setTimeout(() => emailRef.value?.focus(), 60)
  },
)

watch(email, () => {
  if (emailErrorKey.value) emailErrorKey.value = ''
})

async function submit() {
  if (busy.value) return
  errorKey.value = ''
  planLimit.value = false
  const value = normalizeEmail(email.value)
  emailErrorKey.value = !value ? 'team.invite.errors.emailRequired' : EMAIL_PATTERN.test(value) ? '' : 'team.invite.errors.emailInvalid'
  if (emailErrorKey.value) {
    emailRef.value?.focus()
    return
  }
  if (!role.value || !props.roles.includes(role.value)) {
    errorKey.value = 'team.invite.errors.roleRequired'
    return
  }

  const body = { email: value, role: role.value }
  busy.value = true
  const resp: any = await api.inviteUser(body, action.keyFor(body))
  busy.value = false

  if (!isApiError(resp)) {
    action.reset()
    showToast({ tone: 'success', message: t('team.invite.sent', { email: value }) })
    emit('invited')
    emit('update:modelValue', false)
    return
  }
  const code = apiCode(resp)
  if (code === 'MAIL_FAILED') {
    // Davet kaydedildi, yalnız e-posta gitmedi: aynı daveti ikinci kez oluşturmaya zorlamayız.
    action.reset()
    showToast({ tone: 'warning', message: t('team.invite.mailFailed') })
    emit('invited')
    emit('update:modelValue', false)
    return
  }
  if (code === 'ALREADY_MEMBER' || code === 'EMAIL_TAKEN') emailErrorKey.value = `apiErrors.${code}`
  planLimit.value = isPlanLimit(resp)
  const key = errorMessageKey(resp, { FORBIDDEN: 'team.invite.errors.forbidden', HTTP_403: 'team.invite.errors.forbidden' })
  if (key && !emailErrorKey.value) errorKey.value = key
}

function openSubscription() {
  emit('update:modelValue', false)
  router.push('/subscription')
}
</script>

<style scoped>
.ek-invite-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  padding-top: var(--ek-space-2);
}

.ek-invite-dialog__roles {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.ek-invite-dialog__legend {
  margin-bottom: var(--ek-space-2);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-type-label-weight);
  color: var(--ek-color-content-strong);
}

.ek-invite-dialog__options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-3);
}

.ek-role-option {
  position: relative;
  display: flex;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-role-option:hover {
  border-color: var(--ek-color-border-strong);
}

.ek-role-option.is-selected {
  background: var(--ek-color-action-subtle);
  border-color: var(--ek-color-action);
}

.ek-role-option__input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.ek-role-option:has(.ek-role-option__input:focus-visible) {
  box-shadow: var(--ek-focus-ring);
}

.ek-role-option__mark {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  border: 1.5px solid var(--ek-color-border-input);
  border-radius: 50%;
  background: var(--ek-color-surface);
  transition: var(--ek-transition-colors);
}

.ek-role-option.is-selected .ek-role-option__mark {
  border-color: var(--ek-color-action);
  box-shadow: inset 0 0 0 3px var(--ek-color-surface), inset 0 0 0 8px var(--ek-color-action);
}

.ek-role-option__body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.ek-role-option__title {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
  color: var(--ek-color-content-strong);
}

.ek-role-option.is-selected .ek-role-option__title {
  color: var(--ek-color-action-emphasis);
}

.ek-role-option__hint {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-invite-dialog__ceiling {
  display: flex;
  gap: var(--ek-space-2);
  margin: var(--ek-space-2) 0 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-invite-dialog__ceiling .v-icon {
  flex: none;
  margin-top: 1px;
}

@media (max-width: 520px) {
  .ek-invite-dialog__options {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
