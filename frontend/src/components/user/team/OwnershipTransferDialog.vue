<!--
  frontend/src/components/user/team/OwnershipTransferDialog.vue

  Faz 3 / C2a — sahiplik devrinin 1. adımı (API_ACCOUNT_LIFECYCLE.md §9 `UserService/initiateOwnershipTransfer`,
  yalnız sahip, STEP-UP). İki adım görsel olarak anlatılır (başlat → hedef e-postadaki bağlantıyla kabul eder).
  Hedef listesi `transferTargetGate` ile süzülür (uygun olmayan üye nedeniyle devre dışı görünür); sunucu hatası da
  okunur iletiye çevrilir (TARGET_NOT_ACTIVE / TARGET_EMAIL_UNVERIFIED / ALREADY_OWNER). 401 REAUTH_REQUIRED merkezi
  diyalogda çözülür, istek AYNI Idempotency-Key ile yinelenir; kullanıcı vazgeçerse sessizce bu diyalogda kalınır.
  Sunucu bekleyen devri listelemediği için (bkz. rapor) "Bekleyen bir devri iptal et" gövdenin sonunda her zaman
  erişilebilir (eylem çubuğunda değil: 390px'te taşıyordu).
-->
<template>
  <EkDialog
    :model-value="modelValue"
    :title="$t('team.transfer.title')"
    :description="$t('team.transfer.description')"
    icon="mdi-crown-outline"
    icon-tone="warning"
    width="md"
    as-form
    :confirm-label="$t('team.transfer.confirm')"
    confirm-icon="mdi-send-outline"
    :confirm-loading="busy"
    :confirm-disabled="!targets.some((o) => !o.disabled)"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @confirm="submit"
  >
    <div class="ek-transfer">
      <ol class="ek-transfer__steps">
        <li class="ek-transfer__step is-current">
          <span class="ek-transfer__num" aria-hidden="true">1</span>
          <span class="ek-transfer__step-body">
            <span class="ek-transfer__step-title">{{ $t('team.transfer.step1') }}</span>
            <span class="ek-transfer__step-text">{{ $t('team.transfer.step1Text') }}</span>
          </span>
        </li>
        <li class="ek-transfer__step">
          <span class="ek-transfer__num" aria-hidden="true">2</span>
          <span class="ek-transfer__step-body">
            <span class="ek-transfer__step-title">{{ $t('team.transfer.step2') }}</span>
            <span class="ek-transfer__step-text">{{ $t('team.transfer.step2Text') }}</span>
          </span>
        </li>
      </ol>

      <EkAlert v-if="!targets.some((o) => !o.disabled)" tone="info" dense :text="$t('team.transfer.noTargets')" />
      <EkSelect
        v-else
        v-model="targetId"
        :items="targets"
        :label="$t('team.transfer.target')"
        :hint="$t('team.transfer.targetHint')"
        persistent-hint
        :error-messages="fieldErrorKey ? [$t(fieldErrorKey)] : []"
        data-testid="transfer-target"
      />

      <EkAlert tone="warning" dense :text="$t('team.transfer.consequence')" />
      <EkAlert v-if="errorKey" tone="error" dense live :text="$t(errorKey)" data-testid="transfer-error" />

      <p class="ek-transfer__pending">
        <span>{{ $t('team.transfer.pendingQuestion') }}</span>
        <button type="button" class="ek-transfer__link" :disabled="busy" data-testid="transfer-cancel-pending" @click="emit('cancel-pending')">
          {{ $t('team.transfer.cancelPrevious') }}
        </button>
      </p>
    </div>

  </EkDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EkDialog from '@/components/ds/EkDialog.vue'
import EkAlert from '@/components/ds/EkAlert.vue'
import EkSelect from '@/components/ds/EkSelect.vue'
import type { EkSelectOption } from '@/components/ds/selectOptions'
import { useToast } from '@/composables/useToast'
import { useTeamApi } from '@/composables/useTeamApi'
import { createIdempotentAction } from '@/composables/restapi'
import { apiCode, isApiError } from '@/composables/apiErrors'
import { errorMessageKey } from '@/composables/errorCodes'
import { displayName, transferTargetGate, type CurrentUser, type MemberRow } from './teamModel'

const props = defineProps<{ modelValue: boolean; members: MemberRow[]; me: CurrentUser | null; initialTarget?: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; started: []; 'cancel-pending': [] }>()

const { t } = useI18n()
const { showToast } = useToast()
const api = useTeamApi()
const action = createIdempotentAction()

const targetId = ref<string | null>(null)
const busy = ref(false)
const errorKey = ref('')
const fieldErrorKey = ref('')

const TARGET_FIELD_CODES = new Set(['TARGET_NOT_ACTIVE', 'TARGET_EMAIL_UNVERIFIED', 'ALREADY_OWNER'])

const targets = computed<EkSelectOption[]>(() =>
  props.members
    .filter((m) => m._id && transferTargetGate(m, props.me).reasonKey !== 'team.gates.self')
    .map((m) => {
      const gate = transferTargetGate(m, props.me)
      return {
        value: String(m._id),
        title: displayName(m),
        subtitle: gate.allowed ? String(m.email ?? '') : `${m.email ?? ''} · ${t(gate.reasonKey!)}`,
        icon: 'mdi-account-outline',
        disabled: !gate.allowed,
      }
    }),
)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const preset = props.initialTarget ? targets.value.find((o) => o.value === props.initialTarget && !o.disabled) : undefined
    targetId.value = preset ? String(preset.value) : null
    errorKey.value = ''
    fieldErrorKey.value = ''
    action.reset()
  },
)

watch(targetId, () => {
  fieldErrorKey.value = ''
  errorKey.value = ''
})

async function submit() {
  if (busy.value) return
  errorKey.value = ''
  if (!targetId.value) {
    fieldErrorKey.value = 'team.transfer.targetRequired'
    return
  }
  const target = props.members.find((m) => String(m._id) === targetId.value)
  const name = target ? displayName(target) : ''
  busy.value = true
  const body = { targetUserId: targetId.value }
  const resp: any = await api.initiateOwnershipTransfer(targetId.value, name, action.keyFor(body))
  busy.value = false
  if (!isApiError(resp) && resp?.success !== false) {
    action.reset()
    showToast({ tone: 'success', message: t('team.transfer.started', { name }) })
    emit('started')
    emit('update:modelValue', false)
    return
  }
  const code = apiCode(resp)
  const key = errorMessageKey(resp, { FORBIDDEN: 'team.gates.ownerOnly', HTTP_403: 'team.gates.ownerOnly' })
  if (!key) return // yeniden doğrulamadan vazgeçildi: işlem yapılmadı, sessiz
  if (code && TARGET_FIELD_CODES.has(code)) fieldErrorKey.value = key
  else errorKey.value = key
}
</script>

<style scoped>
.ek-transfer {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding-top: var(--ek-space-2);
}

.ek-transfer__steps {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-transfer__step {
  display: flex;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  background: var(--ek-color-surface-sunken);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
}

.ek-transfer__step.is-current {
  background: var(--ek-color-action-subtle);
  border-color: var(--ek-color-action-border);
}

.ek-transfer__num {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-strong);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-default);
}

.ek-transfer__step.is-current .ek-transfer__num {
  background: var(--ek-color-action);
  border-color: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}

.ek-transfer__step-body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.ek-transfer__step-title {
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
  color: var(--ek-color-content-strong);
}

.ek-transfer__step-text {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-transfer__pending {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-2);
  margin: 0;
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-transfer__link {
  padding: 0 var(--ek-space-1);
  border-radius: var(--ek-radius-control);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-action);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: var(--ek-transition-colors);
}

.ek-transfer__link:hover {
  color: var(--ek-color-action-hover);
}

.ek-transfer__link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-transfer__link:disabled {
  color: var(--ek-color-content-subtle);
  cursor: default;
}

@media (max-width: 520px) {
  .ek-transfer__steps {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
