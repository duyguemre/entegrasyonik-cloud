<template>
  <div class="bo-login">
    <!-- BO-LOGIN: müşteri uygulaması girişinin (AuthShell + LoginComponent) diliyle — solda lacivert marka paneli,
         sağda kartsız form sütunu. Akış/veri/testid'ler önceki sürümle AYNI; yalnız görünüm yeniden kuruldu. -->
    <aside class="bo-login__stage" aria-hidden="true">
      <div class="bo-login__stage-inner">
        <div class="bo-login__brandrow">
          <EkBrandLogo tone="inverse" :size="28" />
          <span class="bo-login__badge"><v-icon icon="mdi-shield-crown-outline" />Yönetim</span>
        </div>

        <div class="bo-login__pitch">
          <p class="bo-login__kicker">Entegrasyonik yönetim</p>
          <p class="bo-login__claim">Platformun tamamı,<span class="bo-login__claim-soft">tek ekranda.</span></p>
          <p class="bo-login__claim-lede">Mağazalar, abonelikler, entegrasyon sağlığı ve denetim kaydı — yalnız platform yöneticileri için.</p>
          <!-- Müşteri uygulaması girişindeki Otopilot satırıyla aynı görünüm (AuthShell `__autopilot`); metin yönetim tarafına göre. -->
          <p class="bo-login__autopilot">
            <span class="bo-login__autopilot-icon"><v-icon size="16" aria-hidden="true">{{ CHAT_ICON }}</v-icon></span>
            <span>
              <strong>{{ CHAT_PRODUCT.name }} ile güçlendirildi.</strong>
              Platformu sizin için izler, sapmaları öne çıkarır, kararı size bırakır.
            </span>
          </p>

          <!-- Canlı sahne: yönetimin izlediği şeyler (mağaza durumu, entegrasyon sağlığı, denetim kaydı) kalkana akar. -->
          <BoLoginScene class="bo-login__scene" />
        </div>

        <ul class="bo-login__points bo-login-rise" style="--i: 6">
          <li><span class="bo-login__point-icon"><v-icon icon="mdi-shield-key-outline" /></span>Yalnız platform yöneticileri · iki adımlı doğrulama zorunlu</li>
          <li><span class="bo-login__point-icon"><v-icon icon="mdi-clipboard-text-clock-outline" /></span>Her yönetim işlemi denetim kaydına yazılır</li>
          <li><span class="bo-login__point-icon"><v-icon icon="mdi-timer-sand" /></span>Oturum 30 dk hareketsizlikte kapanır</li>
        </ul>
      </div>
    </aside>

    <main class="bo-login__panel">
      <p class="bo-login__env" :class="`is-${env.key}`" data-testid="login-env">
        <v-icon :icon="env.icon" aria-hidden="true" /><span>{{ env.label }}</span><span class="bo-login__env-hint">{{ env.hint }}</span>
      </p>

      <div class="bo-login__card">
        <div class="bo-login__mobile-brand">
          <EkBrandLogo :size="26" />
          <span class="bo-login__badge bo-login__badge--light"><v-icon icon="mdi-shield-crown-outline" />Yönetim</span>
        </div>

        <p class="bo-login__eyebrow bo-login-rise" style="--i: 0">{{ eyebrow }}</p>

        <EkAlert v-if="noticeText" :tone="notice === 'loggedOut' ? 'info' : 'warning'" :text="noticeText" dense class="bo-login__notice" />

        <!-- Adım geçişi (parola → doğrulama kodu → kurulum → kurtarma): müşteri uygulaması girişindeki sekme geçişiyle aynı —
             eski adım kısa sürede söner, yenisi hafifçe yükselerek belirir (out-in). -->
        <Transition name="bo-auth-swap" mode="out-in" appear>
        <!-- 1) E-posta + parola -->
        <form v-if="status === 'signedOut' || status === 'booting'" key="creds" class="bo-login__form" novalidate @submit.prevent="submitCredentials">
          <header>
            <h1 class="bo-login__title">Yönetim girişi</h1>
            <p class="bo-login__lede">Müşteri hesabınızla değil, yönetici hesabınızla girin.</p>
          </header>
          <ol class="bo-login__steps" aria-label="Giriş adımları">
            <li v-for="(s, i) in stepList" :key="s" :class="{ 'is-done': i < stepIndex, 'is-current': i === stepIndex }" :aria-current="i === stepIndex ? 'step' : undefined">
              <span class="bo-login__step-dot">{{ i < stepIndex ? '✓' : i + 1 }}</span>{{ s }}
            </li>
          </ol>
          <BoAuthField
            id="bo-login-email"
            ref="emailEl"
            v-model="email"
            label="E-posta"
            type="email"
            autocomplete="username"
            placeholder="E-posta adresiniz"
            icon="mdi-email-outline"
            :disabled="busy"
            :error="fieldError('email')"
            autofocus
          />
          <BoAuthField
            id="bo-login-password"
            ref="passwordEl"
            v-model="password"
            label="Parola"
            type="password"
            autocomplete="current-password"
            placeholder="Parolanız"
            icon="mdi-lock-outline"
            :disabled="busy"
            :error="fieldError('password')"
          />
          <EkAlert v-if="error" tone="error" dense live :text="error" />
          <EkButton tone="primary" type="submit" block class="bo-login__submit" :loading="busy" :disabled="!email || !password">Devam et</EkButton>
          <MockHint v-if="MockHint && USE_MOCK" class="bo-login__hint" />
        </form>

        <!-- 2a) TOTP doğrulama -->
        <form v-else-if="status === 'verify'" key="verify" class="bo-login__form" novalidate @submit.prevent="submitVerify">
          <header>
            <h1 class="bo-login__title">İki adımlı doğrulama</h1>
            <p class="bo-login__lede">
              {{ useRecovery ? 'Kurtarma kodlarınızdan birini girin. Her kod yalnız bir kez kullanılabilir.' : 'Doğrulayıcı uygulamanızdaki 6 haneli kodu girin.' }}
            </p>
          </header>
          <ol class="bo-login__steps" aria-label="Giriş adımları">
            <li v-for="(s, i) in stepList" :key="s" :class="{ 'is-done': i < stepIndex, 'is-current': i === stepIndex }" :aria-current="i === stepIndex ? 'step' : undefined">
              <span class="bo-login__step-dot">{{ i < stepIndex ? '✓' : i + 1 }}</span>{{ s }}
            </li>
          </ol>
          <template v-if="!useRecovery">
            <BoAuthField
              id="bo-login-code"
              ref="codeEl"
              v-model="code"
              label="Doğrulama kodu"
              inputmode="numeric"
              autocomplete="one-time-code"
              :maxlength="6"
              placeholder="6 haneli kod"
              icon="mdi-shield-key-outline"
              mono
              :disabled="busy"
              :error="fieldError('code')"
              autofocus
            />
            <div class="bo-totp-timer" aria-hidden="true">
              <span class="bo-totp-timer__track"><span class="bo-totp-timer__bar" :style="{ transform: `scaleX(${totpLeft / 30})` }"></span></span>
              <span class="bo-totp-timer__text">Kod <span class="ek-num">{{ totpLeft }}</span> sn sonra yenilenir</span>
            </div>
          </template>
          <BoAuthField
            v-else
            id="bo-login-recovery"
            ref="recoveryEl"
            v-model="recoveryCode"
            label="Kurtarma kodu"
            placeholder="xxxx-xxxx"
            icon="mdi-lifebuoy"
            :disabled="busy"
            :error="fieldError('recovery')"
            autofocus
          />
          <EkAlert v-if="error" tone="error" dense live :text="error" />
          <EkButton tone="primary" type="submit" block class="bo-login__submit" :loading="busy" :disabled="useRecovery ? recoveryCode.length < 8 : !/^\d{6}$/.test(code)">Doğrula</EkButton>
          <div class="bo-login__links">
            <button type="button" class="bo-login__link" @click="toggleRecovery">{{ useRecovery ? 'Doğrulayıcı kodu kullan' : 'Kurtarma kodu kullan' }}</button>
            <button type="button" class="bo-login__link" @click="restart">Başa dön</button>
          </div>
        </form>

        <!-- 2b) İlk giriş: TOTP kurulumu -->
        <form v-else-if="status === 'enroll'" key="enroll" class="bo-login__form" novalidate @submit.prevent="submitEnroll">
          <header>
            <h1 class="bo-login__title">İki adımlı doğrulamayı kurun</h1>
            <p class="bo-login__lede">İlk girişiniz. Devam etmeden önce bir doğrulayıcı uygulama (Google Authenticator, 1Password, Authy…) bağlayın.</p>
          </header>
          <ol class="bo-login__steps" aria-label="Giriş adımları">
            <li v-for="(s, i) in stepList" :key="s" :class="{ 'is-done': i < stepIndex, 'is-current': i === stepIndex }" :aria-current="i === stepIndex ? 'step' : undefined">
              <span class="bo-login__step-dot">{{ i < stepIndex ? '✓' : i + 1 }}</span>{{ s }}
            </li>
          </ol>
          <div v-if="otpauthUri" class="bo-enroll">
            <QrCode :value="otpauthUri" label="Doğrulayıcı uygulama için QR kodu" />
            <div class="bo-enroll__manual">
              <p class="bo-enroll__label">QR okutamıyor musunuz? Anahtarı elle girin:</p>
              <code class="bo-enroll__secret" data-testid="totp-secret">{{ groupedSecret }}</code>
              <EkButton size="sm" tone="secondary" icon="mdi-content-copy" @click="copy(secret, 'Anahtar kopyalandı.')">Anahtarı kopyala</EkButton>
            </div>
          </div>
          <EkSkeleton v-else type="form" :rows="2" />
          <BoAuthField
            id="bo-login-enroll-code"
            ref="codeEl"
            v-model="code"
            label="Uygulamadaki 6 haneli kod"
            inputmode="numeric"
            autocomplete="one-time-code"
            :maxlength="6"
            placeholder="Uygulamadaki 6 haneli kod"
            icon="mdi-shield-key-outline"
            mono
            :disabled="busy || !otpauthUri"
            :error="fieldError('code')"
          />
          <EkAlert v-if="error" tone="error" dense live :text="error" />
          <EkButton tone="primary" type="submit" block class="bo-login__submit" :loading="busy" :disabled="!/^\d{6}$/.test(code)">Kurulumu tamamla</EkButton>
          <div class="bo-login__links"><button type="button" class="bo-login__link" @click="restart">Başa dön</button></div>
        </form>

        <!-- 3) Kurtarma kodları (yalnız bir kez) -->
        <section v-else-if="status === 'recovery'" key="recovery" class="bo-login__form" aria-labelledby="bo-recovery-title">
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
          <EkButton tone="primary" block class="bo-login__submit" :disabled="!savedCodes" @click="session.acknowledgeRecovery()">Yönetim paneline geç</EkButton>
        </section>
        </Transition>

        <!-- Alt şerit: yönetim uygulamasının Android APK'sı (backoffice'in kendi statik dosyası; herkese açık sitede YOK). -->
        <footer class="bo-login__footer bo-login-rise" style="--i: 3">
          <a v-if="!inNativeShell" :href="MOBILE_APK_HREF" download class="bo-login__app" data-testid="bo-login-mobile-app">
            <span class="bo-login__app-icon" aria-hidden="true"><v-icon size="16">mdi-android</v-icon></span>
            <span class="bo-login__app-text"><strong>Android uygulaması</strong> · Telefonunuzdan izleyin</span>
            <span class="bo-login__app-cta">İndir<v-icon size="14" aria-hidden="true">mdi-arrow-right</v-icon></span>
          </a>
          <p class="bo-login__copyright">© 2026 Entegrasyonik · Yönetim</p>
        </footer>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EkAlert, EkBrandLogo, EkButton, EkSkeleton } from '@entegrasyonik/ui/components'
import { isNativeShell } from '@entegrasyonik/ui/native'
import QrCode from '@bo/components/QrCode.vue'
import BoAuthField from '@bo/components/auth/BoAuthField.vue'
import BoLoginScene from '@bo/components/auth/BoLoginScene.vue'
import { CHAT_ICON, CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
// Örnek hesap ipucu yalnız dev paketinde (üretim derlemesinde import.meta.env.DEV=false → kod atılır).
const MockHint = import.meta.env.DEV ? defineAsyncComponent(() => import('@bo/components/MockHint.vue')) : null
import { USE_MOCK } from '@bo/api'
import { AdminApiError } from '@bo/api/client'
import { NOTICE_TEXT } from '@bo/auth/machine'
import { session } from '@bo/auth/session'
import { notify } from '@bo/utils/toast'
import { currentEnv as env } from '@bo/utils/env'
import { formatDateTime } from '@bo/utils/format'

// Android kabuğunun içinde zaten uygulamadasınız → indirme satırı gizli.
const inNativeShell = isNativeShell()
/** Yönetim uygulamasının APK'sı (herkese açık siteye KONMAZ; backoffice'in kendi statik dosyası). */
const MOBILE_APK_HREF = '/indir/entegrasyonik-yonetim.apk'

const status = computed(() => session.state.status)
const notice = computed(() => session.state.notice)
const noticeText = computed(() => (notice.value ? NOTICE_TEXT[notice.value] : ''))

/** Sağ sütun üst etiketi: adıma göre. */
const eyebrow = computed(
  () => ({ signedOut: 'Yönetim girişi', booting: 'Yönetim girişi', verify: 'Güvenlik adımı', enroll: 'İlk giriş', recovery: 'Son adım', signedIn: 'Yönetim girişi' })[status.value],
)

const email = ref('')
const password = ref('')
const code = ref('')
const recoveryCode = ref('')
const useRecovery = ref(false)
const busy = ref(false)
// Form düzeyi hata (alana bağlanamayan: ağ, kilit, sunucu) → uyarı kutusu (role=alert). Alana ait hata `fieldErr`'de;
// alanın altında + `aria-invalid` olarak çizilir ve odak o alana taşınır.
const error = ref('')
type Field = 'email' | 'password' | 'code' | 'recovery'
const fieldErr = ref<{ field: Field; text: string } | null>(null)
const fieldError = (f: Field) => (fieldErr.value?.field === f ? fieldErr.value.text : undefined)
type Focusable = { focus: () => void } | null
const emailEl = ref<Focusable>(null)
const passwordEl = ref<Focusable>(null)
const codeEl = ref<Focusable>(null)
const recoveryEl = ref<Focusable>(null)
const FIELD_EL: Record<Field, typeof emailEl> = { email: emailEl, password: passwordEl, code: codeEl, recovery: recoveryEl }
const otpauthUri = ref('')
const savedCodes = ref(false)

// TOTP 30 sn penceresi: kalan süre göstergesi (kod süresi dolmak üzereyse kullanıcı bir sonrakini bekler).
const totpLeft = ref(30 - (Math.floor(Date.now() / 1000) % 30))
const totpTimer = setInterval(() => (totpLeft.value = 30 - (Math.floor(Date.now() / 1000) % 30)), 1000)
onBeforeUnmount(() => clearInterval(totpTimer))

// Vuetify `html { overflow-y: scroll }` boş bir kaydırma çubuğu izi bırakıyor; giriş ekranı tek ekrana sığdığı için
// bu sayfada çubuk yalnız gerçekten gerekirse çıkar (sınıf sayfadan çıkınca kaldırılır).
onMounted(() => document.documentElement.classList.add('bo-login-page'))
onBeforeUnmount(() => document.documentElement.classList.remove('bo-login-page'))

const stepList = computed(() => (status.value === 'enroll' || status.value === 'recovery' ? ['Parola', 'Doğrulayıcı kurulumu', 'Kurtarma kodları'] : ['Parola', 'Doğrulama kodu']))
const stepIndex = computed(() => ({ signedOut: 0, booting: 0, verify: 1, enroll: 1, recovery: 2, signedIn: 2 })[status.value])

const secret = computed(() => new URL(otpauthUri.value || 'otpauth://x').searchParams.get('secret') ?? '')
const groupedSecret = computed(() => secret.value.replace(/(.{4})/g, '$1 ').trim())
const codesText = computed(() => (session.state.recoveryCodes ?? []).join('\n'))

// Sunucu alan yolu → giriş alanı.
const FIELD_PATH: Record<string, Field> = { email: 'email', password: 'password', code: 'code', recoveryCode: 'recovery' }

/** Hatanın ait olduğu alan: doğrulama hatası alan yolundan; 401 o adımdaki gizli alandan (parola/kod). */
function fieldFor(e: AdminApiError): Field | null {
  const path = e.fields?.map((f) => FIELD_PATH[f.path]).find(Boolean)
  if (path) return path
  if (e.status !== 401) return null
  if (status.value === 'signedOut' || status.value === 'booting') return 'password'
  if (status.value === 'verify') return useRecovery.value ? 'recovery' : 'code'
  if (status.value === 'enroll') return 'code'
  return null
}

function fail(e: unknown) {
  if (!(e instanceof AdminApiError)) {
    error.value = 'Beklenmeyen bir hata oluştu. Sayfayı yenileyip yeniden deneyin; sürerse platform ekibine yazın.'
    return
  }
  const field = fieldFor(e)
  if (field) fieldErr.value = { field, text: e.message }
  else error.value = e.message
}

async function focusFieldError() {
  if (!fieldErr.value) return
  await nextTick()
  FIELD_EL[fieldErr.value.field].value?.focus()
}

async function run(action: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  clearErrors()
  try {
    await action()
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
  // Alan `busy` bitince yeniden etkinleşir; odak ancak o zaman hatalı alana taşınabilir.
  await focusFieldError()
}

function clearErrors() {
  error.value = ''
  fieldErr.value = null
}

// Kullanıcı hatalı alanı düzeltmeye başlayınca alan hatası kalkar.
watch([email, password, code, recoveryCode], () => (fieldErr.value = null))

const submitCredentials = () => run(() => session.login({ email: email.value.trim(), password: password.value }))
const submitVerify = () => run(() => session.verify(useRecovery.value ? { recoveryCode: recoveryCode.value.trim() } : { code: code.value }))
const submitEnroll = () => run(() => session.enrollConfirm(code.value))

watch(status, async (s) => {
  code.value = ''
  clearErrors()
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
  clearErrors()
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
  const blob = new Blob([`Entegrasyonik Yönetim — kurtarma kodları\n${formatDateTime(new Date())}\n\n${codesText.value}\n`], { type: 'text/plain' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'entegrasyonik-yonetim-kurtarma-kodlari.txt'
  // Bağlantı DOM'a eklenmeden tıklanırsa ya da URL hemen bırakılırsa Safari/Firefox indirmeyi iptal edebilir.
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 0)
}
</script>

<style scoped>
/* ================= BO-LOGIN — yönetim girişi, müşteri uygulaması girişinin diliyle (DESIGN_SYSTEM §35, E9) =================
   Sol: düz lacivert marka paneli (degrade/ışıma yok) — logo + "Yönetim" rozeti, kısa çizgili mikro etiket, iri başlık,
   sade şema, alt güvence kartı. Sağ: kartsız, ortalanmış 400px form sütunu; ikonlu 52px alanlar, gölge yok.
   Kısa ekranlar (≤ 820px yükseklik) için aralıklar sıkılaşır: hata uyarısı görünürken bile kaydırma olmaz. */
.bo-login {
  display: grid;
  grid-template-columns: minmax(420px, 5fr) 7fr;
  height: 100vh;
  min-height: 100vh;
  background: var(--ek-color-surface-muted);
}

/* ---------- Sol marka paneli ---------- */
.bo-login__stage {
  display: flex;
  overflow: hidden;
  /* Müşteri uygulaması girişiyle (AuthShell) aynı iç boşluk: logo ve içerik aynı kenar mesafesinde. */
  padding: var(--ek-space-10) clamp(var(--ek-space-8), 4.5vw, var(--ek-space-16));
  background: var(--ek-color-chrome);
  color: var(--ek-color-chrome-text);
}

.bo-login__stage-inner {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ek-space-6);
  max-width: 560px;
  /* Müşteri uygulaması girişindeki gibi sola yaslı (kullanıcı kararı). */
}

.bo-login__brandrow {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}

.bo-login__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px var(--ek-space-2);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-chrome-text);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-login__badge :deep(.v-icon) {
  /* Sol panel yalnız lacivert + beyaz (kullanıcı kararı): rozet kalkanı beyaz. */
  color: var(--ek-color-chrome-text);
  font-size: var(--ek-icon-sm);
}

.bo-login__pitch {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: var(--ek-space-3);
}

/* Sol panel yazıları müşteri uygulaması girişiyle (AuthShell) BİREBİR aynı: üst etiket, iki tonlu başlık, açıklama. */
.bo-login__kicker {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  margin: 0;
  color: color-mix(in srgb, var(--ek-app-login-ink, var(--ek-color-chrome-text)) 66%, transparent);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.bo-login__kicker::before {
  content: '';
  width: 28px;
  height: 1px;
  background: currentColor;
}

.bo-login__claim {
  margin: 0;
  color: var(--ek-app-login-ink, var(--ek-color-chrome-text));
  font-size: clamp(2rem, 2.9vw, 2.875rem);
  font-weight: var(--ek-font-weight-semibold);
  line-height: 1.08;
  letter-spacing: -0.03em;
  text-wrap: balance;
}

.bo-login__claim-soft {
  display: block;
  color: color-mix(in srgb, var(--ek-app-login-ink, var(--ek-color-chrome-text)) 52%, transparent);
}

.bo-login__claim-lede {
  max-width: 42ch;
  margin: 0;
  color: color-mix(in srgb, var(--ek-app-login-ink, var(--ek-color-chrome-text)) 74%, transparent);
  font-size: var(--ek-font-size-md, 1rem);
  line-height: 1.65;
}

.bo-login__autopilot {
  --bo-auth-autopilot: color-mix(in srgb, var(--ek-color-secondary) 85%, var(--ek-app-login-ink, var(--ek-color-chrome-text)));
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  max-width: 46ch;
  margin: var(--ek-space-1) 0 0;
  font-size: var(--ek-font-size-sm);
  line-height: 1.5;
  color: color-mix(in srgb, var(--ek-app-login-ink, var(--ek-color-chrome-text)) 72%, transparent);
}

.bo-login__autopilot strong {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-app-login-ink, var(--ek-color-chrome-text));
}

.bo-login__autopilot-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-md);
  background: var(--bo-auth-autopilot);
  color: var(--ek-app-login-surface, var(--ek-color-chrome));
}

/* Açılış: bölümler sırayla belirerek yükselir (uygulama girişiyle aynı süre/eğri). Sol panelde başlık bloğunun
   çocukları da sırayla gelir. */
.bo-login-rise,
.bo-login__pitch > * {
  animation: bo-login-rise var(--ek-app-login-rise, 600ms) var(--ek-app-login-ease-out, cubic-bezier(0.2, 0.7, 0.2, 1)) both;
  animation-delay: calc((var(--i, 0) + 1) * var(--ek-app-login-step, 80ms));
}
.bo-login__pitch > :nth-child(1) { --i: 0; }
.bo-login__pitch > :nth-child(2) { --i: 1; }
.bo-login__pitch > :nth-child(3) { --i: 2; }
.bo-login__pitch > :nth-child(4) { --i: 3; }
.bo-login__pitch > :nth-child(5) { --i: 4; }
@keyframes bo-login-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .bo-login-rise,
  .bo-login__pitch > * {
    animation: none;
  }
}

/* Adım geçişi (uygulama girişi `ek-auth-swap` ile aynı) */
.bo-auth-swap-enter-active {
  transition: opacity var(--ek-duration-base, 200ms) var(--ek-easing-decelerate, ease-out),
    transform var(--ek-duration-base, 200ms) var(--ek-easing-decelerate, ease-out);
}
.bo-auth-swap-leave-active {
  transition: opacity 120ms var(--ek-easing-accelerate, ease-in);
}
.bo-auth-swap-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.bo-auth-swap-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .bo-auth-swap-enter-active,
  .bo-auth-swap-leave-active {
    transition: none;
  }
}

/* Canlı sahne */
.bo-login__scene {
  /* Denetim kaydı kutusu kalktı; sahne başlık bloğundan biraz daha aşağıda (kullanıcı kararı). */
  margin-top: var(--ek-space-12);
}

/* Güvence kartı */
.bo-login__points {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-chrome-raised);
  list-style: none;
  color: var(--ek-color-chrome-text-muted);
  font-size: var(--ek-type-label-size);
}

.bo-login__points li {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}

.bo-login__point-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-chrome-text);
}

.bo-login__point-icon :deep(.v-icon) {
  font-size: 16px;
}

/* ---------- Sağ form sütunu ---------- */
.bo-login__panel {
  position: relative;
  display: flex;
  overflow-y: auto;
  align-items: center;
  justify-content: center;
  padding: var(--ek-space-12) var(--ek-space-6) var(--ek-space-6);
  background: var(--ek-color-surface-muted);
}

.bo-login__env {
  position: absolute;
  top: var(--ek-space-5);
  right: var(--ek-space-6);
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-1) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-login__env .v-icon {
  font-size: var(--ek-icon-sm);
}

.bo-login__env-hint {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.bo-login__env.is-staging {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.bo-login__env.is-production {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.bo-login__env.is-staging .bo-login__env-hint,
.bo-login__env.is-production .bo-login__env-hint {
  color: inherit;
}

.bo-login__card {
  width: 100%;
  max-width: 460px;
  margin: auto 0;
}

.bo-login__mobile-brand {
  display: none;
}

.bo-login__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-3);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-login__eyebrow::before {
  content: '';
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.bo-login__notice {
  margin-bottom: var(--ek-space-4);
}

.bo-login__form {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.bo-login__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: clamp(1.625rem, 2vw, 2rem);
  font-weight: var(--ek-font-weight-semibold);
  line-height: 1.15;
  letter-spacing: -0.025em;
}

.bo-login__lede {
  margin: var(--ek-space-2) 0 0;
  color: var(--ek-color-content-default);
  font-size: 0.9375rem;
  line-height: 1.55;
}

/* Adımlar: yazı sekmesi gibi ince çizgili şerit; etkin adım eylem tonu, köşeli numara kutusu. */
.bo-login__steps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0 0 var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  list-style: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.bo-login__steps li {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: 2px var(--ek-space-2) 2px 2px;
  border: 1px solid transparent;
  border-radius: var(--ek-radius-tile);
}

.bo-login__steps li.is-current {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.bo-login__step-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-semibold);
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

.bo-login__submit {
  min-height: 52px;
  margin-top: var(--ek-space-1);
  border-radius: var(--ek-radius-card) !important;
  font-size: 0.9375rem;
}

.bo-totp-timer {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-top: calc(-1 * var(--ek-space-2));
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-totp-timer__track {
  position: relative;
  overflow: hidden;
  width: 64px;
  height: 4px;
  border-radius: 2px;
  background: var(--ek-color-border-subtle);
}

.bo-totp-timer__bar {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--ek-color-action);
  transform-origin: left center;
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
  color: var(--ek-color-action);
}

.bo-login__link:focus-visible {
  border-radius: var(--ek-radius-sm);
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

.bo-login__hint {
  margin-top: var(--ek-space-1);
}

/* Kurulum ve kurtarma kodları */
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
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
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
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
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

/* Alt şerit: Android satırı (kompakt, tek satır) + telif; ince çizgiyle formdan ayrılır. */
.bo-login__footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-6);
  padding-top: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-login__app {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  max-width: 100%;
  padding: var(--ek-space-1) var(--ek-space-2);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  text-decoration: none;
  transition: background-color var(--ek-motion-feedback), color var(--ek-motion-feedback);
}

.bo-login__app:hover {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-content-strong);
}

.bo-login__app:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

.bo-login__app-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  color: var(--ek-color-action);
}

.bo-login__app-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bo-login__app-text strong {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-login__app-cta {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-login__copyright {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

@media (pointer: coarse) {
  .bo-login__link {
    min-width: 44px;
    min-height: 44px;
  }
}

/* Kısa ekranlar: aralıklar sıkılaşır (1366×768, 1280×720 — hata uyarısı görünürken bile kaydırma yok). */
@media (max-height: 880px) {
  .bo-login__claim {
    font-size: clamp(1.75rem, 2.5vw, 2.5rem);
  }

  .bo-login__stage {
    padding-block: var(--ek-space-6);
  }

  .bo-login__stage-inner {
    gap: var(--ek-space-4);
  }

  .bo-login__scene {
    margin-top: var(--ek-space-8);
  }

  .bo-login__panel {
    padding-top: var(--ek-space-10);
    padding-bottom: var(--ek-space-4);
  }

  .bo-login__form {
    gap: var(--ek-space-3);
  }

  .bo-login__title {
    font-size: 1.625rem;
  }

  .bo-login__lede {
    margin-top: var(--ek-space-1);
    font-size: var(--ek-type-label-size);
  }

  .bo-login__footer {
    margin-top: var(--ek-space-4);
    padding-top: var(--ek-space-3);
  }
}

@media (max-height: 740px) {
  .bo-login__scene {
    display: none;
  }

  .bo-login__eyebrow {
    margin-bottom: var(--ek-space-2);
  }
}

@media (max-width: 959px) {
  .bo-login {
    grid-template-columns: 1fr;
    height: auto;
  }

  .bo-login__stage {
    display: none;
  }

  .bo-login__panel {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: var(--ek-space-4);
    min-height: 100vh;
    padding: var(--ek-space-4);
  }

  .bo-login__env {
    position: static;
    align-self: flex-start;
  }

  .bo-login__env-hint {
    display: none;
  }

  .bo-login__card {
    max-width: 440px;
    margin: 0 auto;
  }

  .bo-login__mobile-brand {
    display: flex;
    align-items: center;
    gap: var(--ek-space-2);
    margin-bottom: var(--ek-space-5);
  }

  .bo-login__badge--light {
    border-color: var(--ek-color-border-default);
    color: var(--ek-color-content-strong);
  }

  .bo-login__badge--light :deep(.v-icon) {
    color: var(--ek-color-content-strong);
  }
}
</style>

<style>
html.bo-login-page {
  overflow-y: auto;
}
</style>
