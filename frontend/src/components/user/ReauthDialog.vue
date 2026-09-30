<!--
  frontend/src/components/user/ReauthDialog.vue

  Faz 3 / C2a — adım-yükseltme parola diyaloğu (API_ACCOUNT_LIFECYCLE.md §8). Uygulama genelinde TEK örnek
  (App.vue; sekme dışında → tam ekran, DESIGN_SYSTEM §17.1 "uygulama geneli örtüler"). Durum `composables/reauth.ts`;
  açan `restapi.ts` merkezi yakalayıcısıdır (401 REAUTH_REQUIRED). Doğrulanınca asıl istek AYNI Idempotency-Key ile
  yinelenir; Vazgeç / Esc / × işlemi vazgeçer (istek yapılmaz, hata toast'ı çıkmaz). Parola alanı her açılışta
  boşalır ve bileşen dışına çıkmaz.
-->
<template>
  <EkDialog
    :model-value="state.open"
    :title="$t('reauth.title')"
    :description="$t('reauth.description')"
    icon="mdi-shield-lock-outline"
    width="sm"
    as-form
    :confirm-label="$t('reauth.confirm')"
    confirm-icon="mdi-lock-check-outline"
    :cancel-label="$t('reauth.cancel')"
    :confirm-loading="state.busy"
    class="ek-reauth-dialog"
    @update:model-value="(open: boolean) => !open && cancelReauth()"
    @confirm="submit"
  >
    <div class="ek-reauth">
      <v-text-field
        ref="passwordRef"
        v-model="password"
        :label="$t('reauth.password')"
        :type="reveal ? 'text' : 'password'"
        autocomplete="current-password"
        :error="!!state.errorKey"
        :aria-describedby="state.errorKey ? errorId : hintId"
        :disabled="state.busy"
        data-testid="reauth-password"
      >
        <template #append-inner>
          <button
            type="button"
            class="ek-reauth__reveal"
            :aria-label="reveal ? 'Parolayı gizle' : 'Parolayı göster'"
            :aria-pressed="reveal"
            @click="reveal = !reveal"
          >
            <v-icon size="18" aria-hidden="true">{{ reveal ? 'mdi-eye-off-outline' : 'mdi-eye-outline' }}</v-icon>
          </button>
        </template>
      </v-text-field>
      <EkAlert v-if="state.errorKey" :id="errorId" tone="error" dense live :text="$t(state.errorKey)" />
      <p v-else :id="hintId" class="ek-reauth__hint">{{ $t('reauth.hint') }}</p>
    </div>
  </EkDialog>
</template>

<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'
import { EkDialog, EkAlert } from '@entegrasyonik/ui/components'
import { useReauth } from '@/composables/reauth'

const { state, submitReauth, cancelReauth } = useReauth()
const password = ref('')
const reveal = ref(false)
const passwordRef = ref<{ focus: () => void } | null>(null)
const uid = useId()
const errorId = `ek-reauth-error-${uid}`
const hintId = `ek-reauth-hint-${uid}`

watch(
  () => state.open,
  async (open) => {
    password.value = ''
    reveal.value = false
    if (!open) return
    await nextTick()
    setTimeout(() => passwordRef.value?.focus(), 60)
  },
)

// Yanlış parolada alan temizlenmez (kullanıcı düzeltebilsin) ama odak alana döner.
watch(
  () => state.errorKey,
  async (key) => {
    if (!key) return
    await nextTick()
    passwordRef.value?.focus()
  },
)

async function submit() {
  const ok = await submitReauth(password.value)
  if (ok) password.value = ''
}
</script>

<style scoped>
.ek-reauth {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding-top: var(--ek-space-2);
}

.ek-reauth__hint {
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-reauth__reveal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-content-muted);
  transition: var(--ek-transition-colors);
}

.ek-reauth__reveal:hover {
  color: var(--ek-color-content-strong);
  background: var(--ek-color-surface-muted);
}

.ek-reauth__reveal:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}
</style>
