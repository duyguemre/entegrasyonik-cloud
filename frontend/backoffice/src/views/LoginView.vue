<template>
  <div class="bo-login">
    <aside class="bo-login__stage" aria-hidden="true">
      <div class="bo-login__stage-inner">
        <EkBrandLogo tone="inverse" :size="34" />
        <p class="bo-login__kicker">Yönetim</p>
        <h2 class="bo-login__claim">Platformun tamamı, tek güvenli masada.</h2>
        <ul class="bo-login__points">
          <li><v-icon icon="mdi-shield-key-outline" />Yalnız platform yöneticileri · iki adımlı doğrulama zorunlu</li>
          <li><v-icon icon="mdi-clipboard-text-clock-outline" />Her yönetim işlemi denetim kaydına yazılır</li>
          <li><v-icon icon="mdi-timer-sand" />Oturum 30 dk hareketsizlikte kapanır</li>
        </ul>
      </div>
    </aside>

    <main class="bo-login__panel">
      <div class="bo-login__card">
        <div class="bo-login__mobile-brand"><EkBrandLogo :size="28" /><span>Yönetim</span></div>

        <ol class="bo-login__steps" aria-label="Giriş adımları">
          <li v-for="(s, i) in stepList" :key="s" :class="{ 'is-done': i < stepIndex, 'is-current': i === stepIndex }" :aria-current="i === stepIndex ? 'step' : undefined">
            <span class="bo-login__step-dot">{{ i < stepIndex ? '✓' : i + 1 }}</span>{{ s }}
          </li>
        </ol>

        <EkAlert v-if="noticeText" :tone="notice === 'loggedOut' ? 'info' : 'warning'" :text="noticeText" dense class="mb-4" />

        <!-- 1) E-posta + parola -->
        <form v-if="status === 'signedOut' || status === 'booting'" class="bo-login__form" novalidate @submit.prevent="submitCredentials">
          <header>
            <h1 class="bo-login__title">Yönetim girişi</h1>
            <p class="bo-login__lede">admin.entegrasyonik.com · müşteri hesabınızla değil, yönetici hesabınızla girin.</p>
          </header>
          <v-text-field v-model="email" label="E-posta" type="email" autocomplete="username" :disabled="busy" autofocus />
          <v-text-field
            v-model="password"
            label="Parola"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            :disabled="busy"
          >
            <template #append-inner>
              <button type="button" class="bo-login__reveal" :aria-pressed="showPassword" :aria-label="showPassword ? 'Parolayı gizle' : 'Parolayı göster'" @click="showPassword = !showPassword">
                <v-icon :icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" aria-hidden="true" />
              </button>
            </template>
          </v-text-field>
          <p v-if="error" class="bo-login__error" role="alert">{{ error }}</p>
          <EkButton tone="primary" type="submit" block :loading="busy" :disabled="!email || !password">Devam et</EkButton>
          <EkAlert v-if="USE_MOCK" tone="info" dense title="Örnek ortam (sahte API)" class="bo-login__hint">
            <span>Kayıtlı: <code>yonetici@ornek.test</code> · İlk giriş: <code>yeni.yonetici@ornek.test</code> · parola <code>ornek-parola</code> · kod: herhangi 6 hane</span>
          </EkAlert>
        </form>

        <!-- 2a) TOTP doğrulama -->
        <form v-else-if="status === 'verify'" class="bo-login__form" novalidate @submit.prevent="submitVerify">
          <header>
            <h1 class="bo-login__title">İki adımlı doğrulama</h1>
            <p class="bo-login__lede">
              {{ useRecovery ? 'Kurtarma kodlarınızdan birini girin. Her kod yalnız bir kez kullanılabilir.' : 'Doğrulayıcı uygulamanızdaki 6 haneli kodu girin.' }}
            </p>
          </header>
          <v-text-field
            v-if="!useRecovery"
            v-model="code"
            label="Doğrulama kodu"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            class="bo-login__code"
            :disabled="busy"
            autofocus
          />
          <v-text-field v-else v-model="recoveryCode" label="Kurtarma kodu" placeholder="xxxx-xxxx" autocomplete="off" :disabled="busy" autofocus />
          <p v-if="error" class="bo-login__error" role="alert">{{ error }}</p>
          <EkButton tone="primary" type="submit" block :loading="busy" :disabled="useRecovery ? recoveryCode.length < 8 : !/^\d{6}$/.test(code)">Doğrula</EkButton>
          <div class="bo-login__links">
            <button type="button" class="bo-login__link" @click="toggleRecovery">{{ useRecovery ? 'Doğrulayıcı kodu kullan' : 'Kurtarma kodu kullan' }}</button>
            <button type="button" class="bo-login__link" @click="restart">Başa dön</button>
          </div>
        </form>

        <!-- 2b) İlk giriş: TOTP kurulumu -->
        <form v-else-if="status === 'enroll'" class="bo-login__form" novalidate @submit.prevent="submitEnroll">
          <header>
            <h1 class="bo-login__title">İki adımlı doğrulamayı kurun</h1>
            <p class="bo-login__lede">İlk girişiniz. Devam etmeden önce bir doğrulayıcı uygulama (Google Authenticator, 1Password, Authy…) bağlayın.</p>
          </header>
          <div v-if="otpauthUri" class="bo-enroll">
            <QrCode :value="otpauthUri" label="Doğrulayıcı uygulama için QR kodu" />
            <div class="bo-enroll__manual">
              <p class="bo-enroll__label">QR okutamıyor musunuz? Anahtarı elle girin:</p>
              <code class="bo-enroll__secret" data-testid="totp-secret">{{ groupedSecret }}</code>
              <EkButton size="sm" tone="secondary" icon="mdi-content-copy" @click="copy(secret, 'Anahtar kopyalandı.')">Anahtarı kopyala</EkButton>
            </div>
          </div>
          <EkSkeleton v-else type="form" :rows="2" />
          <v-text-field v-model="code" label="Uygulamadaki 6 haneli kod" inputmode="numeric" autocomplete="one-time-code" maxlength="6" :disabled="busy || !otpauthUri" />
          <p v-if="error" class="bo-login__error" role="alert">{{ error }}</p>
          <EkButton tone="primary" type="submit" block :loading="busy" :disabled="!/^\d{6}$/.test(code)">Kurulumu tamamla</EkButton>
          <div class="bo-login__links"><button type="button" class="bo-login__link" @click="restart">Başa dön</button></div>
        </form>

        <!-- 3) Kurtarma kodları (yalnız bir kez) -->
        <section v-else-if="status === 'recovery'" class="bo-login__form" aria-labelledby="bo-recovery-title">
          <header>
            <h1 id="bo-recovery-title" class="bo-login__title">Kurtarma kodlarınızı saklayın</h1>
            <p class="bo-login__lede">Telefonunuza erişemezseniz bu kodlarla girersiniz. Her kod bir kez geçerlidir ve <strong>bir daha gösterilmez</strong>.</p>
          </header>
          <ol class="bo-codes" data-testid="recovery-codes">
            <li v-for="c in session.state.recoveryCodes ?? []" :key="c"><code>{{ c }}</code></li>
          </ol>
          <div class="bo-codes__actions">
            <EkButton size="sm" tone="secondary" icon="mdi-content-copy" @click="copy(codesText, 'Kodlar kopyalandı.')">Kopyala</EkButton>
            <EkButton size="sm" tone="secondary" icon="mdi-download" @click="download">İndir (.txt)</EkButton>
          </div>
          <v-checkbox v-model="savedCodes" label="Kodları güvenli bir yere kaydettim" hide-details />
          <EkButton tone="primary" block :disabled="!savedCodes" @click="session.acknowledgeRecovery()">Yönetim paneline geç</EkButton>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EkAlert, EkBrandLogo, EkButton, EkSkeleton } from '@entegrasyonik/ui/components'
import QrCode from '@bo/components/QrCode.vue'
import { USE_MOCK } from '@bo/api'
import { AdminApiError } from '@bo/api/client'
import { NOTICE_TEXT } from '@bo/auth/machine'
import { session } from '@bo/auth/session'
import { notify } from '@bo/utils/toast'

const status = computed(() => session.state.status)
const notice = computed(() => session.state.notice)
const noticeText = computed(() => (notice.value ? NOTICE_TEXT[notice.value] : ''))

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const code = ref('')
const recoveryCode = ref('')
const useRecovery = ref(false)
const busy = ref(false)
const error = ref('')
const otpauthUri = ref('')
const savedCodes = ref(false)

const stepList = computed(() => (status.value === 'enroll' || status.value === 'recovery' ? ['Parola', 'Doğrulayıcı kurulumu', 'Kurtarma kodları'] : ['Parola', 'Doğrulama kodu']))
const stepIndex = computed(() => ({ signedOut: 0, booting: 0, verify: 1, enroll: 1, recovery: 2, signedIn: 2 })[status.value])

const secret = computed(() => new URL(otpauthUri.value || 'otpauth://x').searchParams.get('secret') ?? '')
const groupedSecret = computed(() => secret.value.replace(/(.{4})/g, '$1 ').trim())
const codesText = computed(() => (session.state.recoveryCodes ?? []).join('\n'))

function fail(e: unknown) {
  error.value = e instanceof AdminApiError ? e.message : 'Beklenmeyen bir hata oluştu.'
}

async function run(action: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

const submitCredentials = () => run(() => session.login({ email: email.value.trim(), password: password.value }))
const submitVerify = () => run(() => session.verify(useRecovery.value ? { recoveryCode: recoveryCode.value.trim() } : { code: code.value }))
const submitEnroll = () => run(() => session.enrollConfirm(code.value))

watch(status, async (s) => {
  code.value = ''
  error.value = ''
  if (s !== 'signedOut') password.value = ''
  if (s === 'enroll') {
    // `run` KULLANILMAZ: geçiş, parola isteği hâlâ `busy` iken gelir (koruma bu çağrıyı atlardı).
    otpauthUri.value = ''
    try {
      otpauthUri.value = (await session.enrollStart()).otpauthUri
    } catch (e) {
      fail(e)
    }
  }
})

function toggleRecovery() {
  useRecovery.value = !useRecovery.value
  error.value = ''
}

function restart() {
  session.restart()
}

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify('success', message)
  } catch {
    notify('warning', 'Panoya erişilemedi; metni elle seçip kopyalayın.')
  }
}

function download() {
  const blob = new Blob([`Entegrasyonik Yönetim — kurtarma kodları\n${new Date().toISOString()}\n\n${codesText.value}\n`], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'entegrasyonik-yonetim-kurtarma-kodlari.txt'
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<style scoped>
.bo-login {
  display: grid;
  grid-template-columns: minmax(360px, 5fr) 7fr;
  min-height: 100vh;
  background: var(--ek-color-app-bg);
}

.bo-login__stage {
  display: flex;
  align-items: flex-end;
  padding: var(--ek-space-8);
  /* Kabuk (chrome) tonları: iki temada da koyu zemin + açık metin. `--ek-app-login-gradient` `brand`'den türer ve
     dark'ta açık bir tona döner (beyaz metin kontrastı düşer) — uygulamanın dark-1a işine not düşüldü. */
  background: linear-gradient(160deg, var(--ek-color-chrome) 0%, var(--ek-color-chrome-end) 100%);
  color: var(--ek-color-chrome-text);
}

.bo-login__stage-inner {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  max-width: 440px;
}

.bo-login__kicker {
  margin: var(--ek-space-6) 0 0;
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-login__claim {
  margin: 0;
  font-size: var(--ek-type-metric-size);
  line-height: 1.3;
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: -0.01em;
}

.bo-login__points {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin: var(--ek-space-4) 0 0;
  padding: var(--ek-space-4) 0 0;
  border-top: 1px solid var(--ek-color-chrome-border);
  list-style: none;
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-type-label-size);
}

.bo-login__points li {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}

.bo-login__points :deep(.v-icon) {
  color: var(--ek-color-chrome-text);
  font-size: var(--ek-icon-lg);
}

.bo-login__panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ek-space-8) var(--ek-space-6);
}

.bo-login__card {
  width: 100%;
  max-width: 440px;
  padding: var(--ek-space-8);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-raised);
}

.bo-login__mobile-brand {
  display: none;
}

.bo-login__steps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2) var(--ek-space-4);
  margin: 0 0 var(--ek-space-6);
  padding: 0;
  list-style: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-login__steps li {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.bo-login__step-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-full);
  font-size: var(--ek-type-micro-size);
}

.bo-login__steps li.is-current {
  color: var(--ek-color-content-strong);
}

.bo-login__steps li.is-current .bo-login__step-dot {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}

.bo-login__steps li.is-done .bo-login__step-dot {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.bo-login__form {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.bo-login__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: var(--ek-type-title-tracking);
}

.bo-login__lede {
  margin: var(--ek-space-1) 0 var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.bo-login__code :deep(input) {
  font-family: var(--ek-font-mono);
  font-size: 20px;
  letter-spacing: 0.4em;
}

.bo-login__reveal {
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

.bo-login__reveal:hover {
  color: var(--ek-color-content-strong);
}

.bo-login__reveal:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
}

.bo-login__error {
  margin: 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-label-size);
}

.bo-login__links {
  display: flex;
  justify-content: space-between;
  gap: var(--ek-space-3);
}

.bo-login__link {
  padding: var(--ek-space-1) 0;
  border: 0;
  background: none;
  color: var(--ek-color-action-emphasis);
  font: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
}

.bo-login__link:hover {
  text-decoration: underline;
}

.bo-login__link:focus-visible {
  border-radius: var(--ek-radius-sm);
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

.bo-login__hint {
  margin-top: var(--ek-space-3);
}

.bo-login__hint code,
.bo-codes code,
.bo-enroll__secret {
  font-family: var(--ek-font-mono);
}

.bo-enroll {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-5);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface-muted);
}

.bo-enroll__manual {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-2);
  min-width: 160px;
}

.bo-enroll__label {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-enroll__secret {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  letter-spacing: 0.06em;
  word-break: break-all;
}

.bo-codes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ek-space-2) var(--ek-space-5);
  margin: 0;
  padding: var(--ek-space-4) var(--ek-space-4) var(--ek-space-4) var(--ek-space-8);
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

.bo-codes code {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  letter-spacing: 0.04em;
}

.bo-codes__actions {
  display: flex;
  gap: var(--ek-space-2);
}

@media (max-width: 959px) {
  .bo-login {
    grid-template-columns: 1fr;
  }

  .bo-login__stage {
    display: none;
  }

  .bo-login__panel {
    align-items: flex-start;
    padding: var(--ek-space-6) var(--ek-space-4);
  }

  .bo-login__card {
    padding: var(--ek-space-6) var(--ek-space-5);
  }

  .bo-login__mobile-brand {
    display: flex;
    align-items: center;
    gap: var(--ek-space-2);
    margin-bottom: var(--ek-space-5);
    color: var(--ek-color-content-strong);
    font-size: var(--ek-type-label-size);
    font-weight: var(--ek-font-weight-semibold);
  }
}
</style>
