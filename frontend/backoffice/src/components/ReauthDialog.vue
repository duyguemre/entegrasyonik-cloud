<template>
  <EkDialog
    :model-value="reauthState.open"
    title="Kimliğinizi yeniden doğrulayın"
    description="Bu işlem hassas. Devam etmek için parolanızı ve doğrulayıcı uygulamadaki güncel kodu girin. Doğrulama 5 dakika geçerlidir."
    icon="mdi-shield-lock-outline"
    width="sm"
    as-form
    persistent
    confirm-label="Doğrula ve devam et"
    confirm-icon="mdi-check"
    :confirm-loading="busy"
    :confirm-disabled="!canSubmit"
    @confirm="submit"
    @cancel="cancel"
    @close="cancel"
  >
    <div class="bo-reauth">
      <v-text-field
        v-model="password"
        label="Parola"
        type="password"
        autocomplete="current-password"
        :error-messages="error && errorField === 'password' ? error : undefined"
        autofocus
      />
      <v-text-field
        v-model="code"
        label="Doğrulama kodu"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        hint="Girişte kullandığınız koddan SONRAKİ 30 saniyelik kodu girin."
        persistent-hint
        :error-messages="error && errorField === 'code' ? error : undefined"
      />
      <p v-if="error && !errorField" class="bo-reauth__error" role="alert">{{ error }}</p>
    </div>
  </EkDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EkDialog } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { AdminApiError } from '@bo/api/client'
import { reauthState, settleReauth } from '@bo/auth/reauth'
import { session } from '@bo/auth/session'

const password = ref('')
const code = ref('')
const busy = ref(false)
const error = ref('')
const errorField = ref<'password' | 'code' | ''>('')
const canSubmit = computed(() => password.value.length > 0 && /^\d{6}$/.test(code.value))

watch(
  () => reauthState.open,
  (open) => {
    if (open) {
      password.value = ''
      code.value = ''
      error.value = ''
      errorField.value = ''
    }
  },
)

async function submit() {
  if (!canSubmit.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await api.call('BackofficeAuthService/reauth', { password: password.value, code: code.value })
    settleReauth(true)
    // Üst bardaki "Doğrulandı · 4:59" göstergesi yeni `reauthAt`'i okusun.
    void session.refresh()
  } catch (e) {
    const err = e instanceof AdminApiError ? e : null
    error.value = err?.message ?? 'Doğrulanamadı.'
    errorField.value = /parola/i.test(error.value) ? 'password' : /kod/i.test(error.value) ? 'code' : ''
  } finally {
    busy.value = false
  }
}

function cancel() {
  settleReauth(false)
}
</script>

<style scoped>
.bo-reauth {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.bo-reauth__error {
  margin: 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-label-size);
}
</style>
