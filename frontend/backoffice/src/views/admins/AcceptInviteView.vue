<template>
  <div class="bo-invite">
    <main class="bo-invite__card" aria-labelledby="bo-invite-title">
      <div class="bo-invite__brand"><EkBrandLogo :size="28" /><span>Yönetim</span></div>

      <!-- Başarı -->
      <section v-if="phase === 'done'" class="bo-invite__state" data-testid="invite-done">
        <v-icon class="bo-invite__icon is-ok" icon="mdi-check-circle-outline" aria-hidden="true" />
        <h1 id="bo-invite-title" class="bo-invite__title" tabindex="-1" ref="titleEl">Hesabınız hazır</h1>
        <p class="bo-invite__lede">Hesabınız hazır — ilk girişte iki adımlı doğrulama kurulacak. Doğrulayıcı uygulamanızı yanınızda bulundurun.</p>
        <EkButton tone="primary" block icon="mdi-login" @click="router.push('/giris')">Girişe git</EkButton>
      </section>

      <!-- Geçersiz bağlantı -->
      <section v-else-if="phase === 'invalid' || phase === 'missing'" class="bo-invite__state" data-testid="invite-invalid">
        <v-icon class="bo-invite__icon is-bad" icon="mdi-link-variant-off" aria-hidden="true" />
        <h1 id="bo-invite-title" class="bo-invite__title" tabindex="-1" ref="titleEl">Bağlantı geçersiz</h1>
        <p class="bo-invite__lede">
          {{ phase === 'invalid' ? 'Davet bağlantısı geçersiz, süresi dolmuş ya da daha önce kullanılmış' : 'Bu sayfa bir davet bağlantısıyla açılmalıdır' }} — yöneticinizden yeni bir davet isteyin.
        </p>
        <EkButton tone="secondary" block @click="router.push('/giris')">Girişe git</EkButton>
      </section>

      <!-- Form -->
      <form v-else class="bo-invite__form" novalidate @submit.prevent="submit">
        <header>
          <h1 id="bo-invite-title" class="bo-invite__title">Yönetici hesabınızı oluşturun</h1>
          <p class="bo-invite__lede">Adınızı ve parolanızı belirleyin. İlk girişte iki adımlı doğrulama kurulumu zorunludur.</p>
        </header>
        <v-text-field v-model="name" label="Ad" autocomplete="given-name" maxlength="60" :disabled="busy" :error-messages="errors.name" hide-details="auto" autofocus />
        <v-text-field v-model="surname" label="Soyad" autocomplete="family-name" maxlength="60" :disabled="busy" :error-messages="errors.surname" hide-details="auto" />
        <v-text-field
          v-model="password"
          label="Parola"
          :type="show ? 'text' : 'password'"
          autocomplete="new-password"
          :disabled="busy"
          :error-messages="errors.password"
          hint="En az 12 karakter; harf ve rakam içermeli."
          persistent-hint
        >
          <template #append-inner>
            <button type="button" class="bo-invite__reveal" :aria-pressed="show" :aria-label="show ? 'Parolayı gizle' : 'Parolayı göster'" @click="show = !show">
              <v-icon :icon="show ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" aria-hidden="true" />
            </button>
          </template>
        </v-text-field>
        <v-text-field v-model="confirm" label="Parola (tekrar)" :type="show ? 'text' : 'password'" autocomplete="new-password" :disabled="busy" :error-messages="errors.confirm" hide-details="auto" />
        <p v-if="formError" class="bo-invite__error" role="alert">{{ formError }}</p>
        <EkButton tone="primary" type="submit" block :loading="busy">Hesabı oluştur</EkButton>
      </form>
    </main>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { EkBrandLogo, EkButton } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { describeError } from '@bo/utils/errors'

type Phase = 'form' | 'done' | 'invalid' | 'missing'
const router = useRouter()
const phase = ref<Phase>('form')
const name = ref('')
const surname = ref('')
const password = ref('')
const confirm = ref('')
const show = ref(false)
const busy = ref(false)
const formError = ref('')
const errors = reactive<Record<string, string>>({})
const titleEl = ref<HTMLElement | null>(null)
// Bilet yalnız bellekte: hiçbir depoya, günlüğe ya da iletiye yazılmaz.
let token = ''

onMounted(() => {
  token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('t') ?? ''
  // Bilet adres çubuğunda/geçmişte kalmasın: okur okumaz sil.
  window.history.replaceState(null, '', '/accept-invite')
  if (!token) phase.value = 'missing'
})

const POLICY = /^(?=.*\p{L})(?=.*\d).{12,128}$/u

function validate(): boolean {
  for (const k of Object.keys(errors)) delete errors[k]
  if (!name.value.trim()) errors.name = 'Adınızı girin.'
  if (!surname.value.trim()) errors.surname = 'Soyadınızı girin.'
  if (!POLICY.test(password.value)) errors.password = 'Parola en az 12 karakter olmalı ve harf ile rakam içermeli.'
  else if (password.value !== confirm.value) errors.confirm = 'Parolalar eşleşmiyor.'
  return !Object.keys(errors).length
}

async function submit() {
  if (busy.value) return
  formError.value = ''
  if (!validate()) return
  busy.value = true
  try {
    await api.call('BackofficeAuthService/acceptInvite', { token, name: name.value.trim(), surname: surname.value.trim(), password: password.value })
    token = ''
    password.value = ''
    confirm.value = ''
    phase.value = 'done'
    await nextTick()
    titleEl.value?.focus()
  } catch (e) {
    const d = describeError(e)
    if (d.code === 'ADMIN_INVITE_INVALID') {
      token = ''
      phase.value = 'invalid'
      await nextTick()
      titleEl.value?.focus()
    } else if (d.code === 'WEAK_PASSWORD') {
      errors.password = 'Parola politikayı karşılamıyor — en az 12 karakter, harf ve rakam içeren başka bir parola seçin. Bağlantınız hâlâ geçerli.'
    } else if (d.kind === 'validation' && d.fields?.length) {
      for (const f of d.fields) if (f.path in { name: 1, surname: 1, password: 1 }) errors[f.path] = f.message
      formError.value = 'Bazı alanlar geçersiz — işaretli alanları düzeltip yeniden deneyin.'
    } else {
      formError.value = d.message
    }
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.bo-invite {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--ek-space-6) var(--ek-space-4);
  background: var(--ek-color-app-bg);
}
.bo-invite__card {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  width: 100%;
  max-width: 440px;
  padding: var(--ek-space-8);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-raised);
}
.bo-invite__brand {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-invite__form,
.bo-invite__state {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}
.bo-invite__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: var(--ek-type-title-tracking);
}
.bo-invite__title:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}
.bo-invite__lede {
  margin: var(--ek-space-1) 0 var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}
.bo-invite__icon {
  align-self: flex-start;
  font-size: var(--ek-icon-xl);
}
.bo-invite__icon.is-ok {
  color: var(--ek-color-success-emphasis);
}
.bo-invite__icon.is-bad {
  color: var(--ek-color-warning-emphasis);
}
.bo-invite__error {
  margin: 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-label-size);
}
.bo-invite__reveal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-muted);
  cursor: pointer;
}
.bo-invite__reveal:hover {
  color: var(--ek-color-content-strong);
}
.bo-invite__reveal:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
}
@media (max-width: 480px) {
  .bo-invite__card {
    padding: var(--ek-space-5);
  }
}
</style>
