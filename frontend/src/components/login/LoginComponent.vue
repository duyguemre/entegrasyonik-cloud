<!--
  frontend/src/components/login/LoginComponent.vue

  ADR-0015 Karar 4 — giriş/kayıt/şifremi-unuttum formu. `.premium-login-card`
  kök sınıfı bir spec kancasıdır (register-handoff.spec.ts `.include(...)`) —
  artık görsel bir "kart" değil (kart yok, Karar 4), yalnızca hook olarak
  KORUNUR. Alan etiketleri ve `data-testid`'ler ADR-0015 Karar 5.1 Ek A kapsamında DEĞİŞTİRİLMEDİ; sekme ve düğme
  metinleri kullanıcı kararıyla (K64, samimi ton) değişti: Hesabım var / Yeni hesap, Devam et / Hesabımı oluştur.

  ŞİFREMİ UNUTTUM sekmesi artık İŞLEVSELDİR (`docs/API_ACCOUNT_LIFECYCLE.md`
  — backend hazır): e-posta gönderilir, backend HER ZAMAN aynı genel başarı
  mesajını döner (kullanıcı numaralandırma yok). Gerçek sıfırlama bağlantısı
  `/reset-password?token=…` sayfasına gider (bkz. `ResetPasswordView.vue`).
-->
<template>
  <div class="premium-login-card">
    <p class="ek-login-eyebrow ek-login-rise" style="--i: 0">{{ eyebrowText }}</p>
    <h1 class="ek-login-heading ek-login-rise" style="--i: 1">{{ headingText }}</h1>
    <p class="ek-login-sub ek-login-rise" style="--i: 2">{{ subText }}</p>

    <!-- P13 (K49): parola sıfırlama sekme değil; tek giriş noktası parola alanının altındaki bağlantı. -->
    <!-- Yazı sekmeleri: kutusuz, form genişliğinde iki eşit yarı (alan ızgarasıyla hizalı); seçili yarının altında
         kayan çizgi (Vuetify slider), altta ince ayraç. -->
    <v-tabs v-if="tab !== 'forgot'" v-model="tab" grow class="ek-login-tabs ek-login-rise" style="--i: 3" height="48"
      slider-color="primary" :mobile-breakpoint="0">
      <v-tab value="login" :ripple="false" class="ek-login-tab">Hesabım var</v-tab>
      <v-tab value="register" :ripple="false" class="ek-login-tab">Yeni hesap</v-tab>
    </v-tabs>

    <div class="login-content-wrapper ek-login-rise" style="--i: 4" :class="{ 'login-content-wrapper--register': tab === 'register' }">
      <!-- Sekme geçişi: önce eski form kısa sürede söner, sonra yenisi hafifçe yükselerek belirir (out-in; üst üste binme ve
           kayma yok). Eski v-window yatay kaydırma + çakışan solma "kötü" görünüyordu. -->
      <div class="login-window">
      <Transition name="ek-auth-swap" mode="out-in">

          <div v-if="tab === 'login'" key="login" class="form-pane">
            <LoadingComponent attach=".LoginView" ref="loadingLogin" />
            <!-- Faz 3 / C2a: davet kabulü / sahiplik devri oturum açmaz → buraya bilgi notuyla gelinir. -->
            <EkAlert v-if="reasonNoticeKey && !errorMessage" tone="success" dense class="mb-3" :text="$t(reasonNoticeKey)" />
            <v-form class="ek-login-form" novalidate @submit.prevent="handleLogin">
              <AuthField id="login-email" v-model="authData.email" :label="$t('login.email')" type="email" autocomplete="username"
                icon="mdi-email-outline" placeholder="E-posta adresiniz" hide-label :error="fieldErrors.email" />

              <div class="ek-login-password">
                <AuthField id="login-password" v-model="authData.password" :label="$t('login.password')" type="password"
                  autocomplete="current-password" icon="mdi-lock-outline" placeholder="Parolanız" hide-label
                  :error="fieldErrors.password" />
                <button v-if="!isStoreSelectionPhase" type="button" class="ek-login-link ek-login-forgot" @click="tab = 'forgot'">
                  Parolanızı mı unuttunuz?
                </button>
              </div>

              <v-expand-transition>
                <EkAlert v-if="errorMessage" tone="error" dense live :title="errorTitle || undefined" :text="errorMessage" />
              </v-expand-transition>

              <div v-if="!isStoreSelectionPhase">
                <v-btn block color="primary" height="52" variant="flat" class="ek-login-submit" type="submit" :loading="loggingIn"
                  :disabled="loggingIn">
                  Devam et
                </v-btn>
              </div>

              <!-- GL-FE: Google ile giriş (clientId yoksa / gömülü tarayıcıda hiç görünmez). -->
              <div v-if="google.enabled.value && !isStoreSelectionPhase" class="ek-login-alt">
                <div class="ek-login-or" role="separator"><span>veya</span></div>
                <GoogleSignInButton label="Google ile devam et" :pending="google.pending.value" @start="startGoogle('login')" />
              </div>

              <!-- MAĞAZA SEÇİMİ (SÜPER YÖNETİCİ) -->
              <v-expand-transition>
                <div v-if="isStoreSelectionPhase" class="ek-login-store-panel">
                  <div class="ek-login-store-panel__title">
                    <v-icon start size="18">mdi-store-cog-outline</v-icon>
                    Yönetilecek Mağazayı Seçin
                  </div>

                  <v-text-field v-model="storeSearch" placeholder="Mağaza ara..." aria-label="Mağaza ara"
                    prepend-inner-icon="mdi-magnify" class="mb-2"></v-text-field>

                  <v-list class="ek-login-store-list" density="compact">
                    <v-list-item v-for="store in filteredStores" :key="store.clientId" :value="store.clientId"
                      @click="handleStoreSelect(store.clientId)" class="ek-login-store-item">
                      <template v-slot:prepend>
                        <v-avatar size="24" class="ek-login-store-avatar">
                          {{ store.clientId }}
                        </v-avatar>
                      </template>
                      <v-list-item-title class="ek-login-store-name">
                        {{ store.title || 'İsimsiz Mağaza' }}
                      </v-list-item-title>
                      <template v-slot:append>
                        <v-icon size="small" color="primary">mdi-chevron-right</v-icon>
                      </template>
                    </v-list-item>
                  </v-list>

                  <v-btn variant="text" block size="small" class="mt-2"
                    @click="isStoreSelectionPhase = false">
                    Geri Dön
                  </v-btn>
                </div>
              </v-expand-transition>
            </v-form>
          </div>

          <div v-else-if="tab === 'register'" key="register" class="form-pane">
            <v-form @submit.prevent="handleRegister">
              <!-- ADR-0014 S4b: tanıtım sitesinden gelen (doğrulanmış) plan seçimi. Yalnızca izinli plan kodu gösterilir. -->
              <div v-if="registerIntent.plan" class="plan-band" role="status" data-testid="register-plan-band">
                <v-icon size="18" class="plan-band__icon" aria-hidden="true">mdi-tag-outline</v-icon>
                <div class="plan-band__text">
                  <strong>Seçtiğiniz plan: {{ REGISTER_PLAN_NAMES[registerIntent.plan] }}</strong>
                  <span>Deneme sürümüyle başlarsınız; kart bilgisi istenmez. Planı, kayıttan sonra abonelik ekranında onaylarsınız.</span>
                </div>
              </div>
              <v-expand-transition>
                <EkAlert v-if="googleRegError" tone="error" dense live class="mb-3" :title="googleRegError.title" :text="googleRegError.text" />
              </v-expand-transition>
              <!-- GL-FE: Google ile kayıt. Belirteç varsa e-posta kilitli, parola alanları yok; yoksa Google düğmesi. -->
              <div v-if="googleSignup" class="ek-google-signup" role="status" data-testid="google-signup-band">
                <span class="ek-google-signup__icon" aria-hidden="true"><GoogleLogo /></span>
                <div class="ek-google-signup__text">
                  <span class="ek-google-signup__label">Google ile kayıt</span>
                  <strong>{{ googleSignup.email }}</strong>
                </div>
                <button type="button" class="ek-login-link ek-google-signup__switch" @click="cancelGoogleSignup">Farklı hesap</button>
              </div>
              <div v-else-if="google.enabled.value" class="ek-login-alt ek-login-alt--top">
                <GoogleSignInButton label="Google ile kaydol" :pending="google.pending.value" @start="startGoogle('register')" />
                <div class="ek-login-or" role="separator"><span>veya e-postayla</span></div>
              </div>
              <!-- Aşama 3: tek form ızgarası (EkFormGrid) — alanlar arası boşluk sabit, üst üste binme yok. -->
              <EkFormGrid :columns="2" class="ek-login-register-grid">
                <AuthField id="reg-name" v-model="regData.name" :label="$t('login.register.name')" autocomplete="given-name"
                  icon="mdi-account-outline" placeholder="Adınız" hide-label />
                <AuthField id="reg-surname" v-model="regData.surname" :label="$t('login.register.surname')" autocomplete="family-name"
                  icon="mdi-account-outline" placeholder="Soyadınız" hide-label />
                <AuthField id="reg-email" v-model="regData.email" :label="$t('login.email')" type="email" autocomplete="email"
                  icon="mdi-email-outline" placeholder="E-posta adresiniz" hide-label class="ek-span-full"
                  :readonly="!!googleSignup" />
                <template v-if="!googleSignup">
                  <AuthField id="reg-password" v-model="regData.password" :label="$t('login.password')" type="password"
                    autocomplete="new-password" icon="mdi-lock-outline" placeholder="Parola" hide-label />
                  <AuthField id="reg-password2" v-model="regData.password2" :label="$t('login.register.repassword')" type="password"
                    autocomplete="new-password" icon="mdi-lock-check-outline" placeholder="Parola (tekrar)" hide-label />
                </template>
              </EkFormGrid>
              <!-- ADR-0014 S4b: yasal onay. İşaretlenmeden kayıt GÖNDERİLMEZ (handleRegister). Metinler sitede (kanonik kaynak). -->
              <div class="ek-consent" data-testid="register-legal-links">
                <label class="ek-consent__row" :class="{ 'is-checked': consent, 'has-error': consentError }">
                  <input v-model="consent" type="checkbox" class="ek-consent__input" data-testid="register-consent"
                    :aria-invalid="consentError ? 'true' : undefined" :aria-describedby="consentError ? 'reg-consent-err' : undefined" />
                  <span class="ek-consent__box" aria-hidden="true">
                    <svg viewBox="0 0 16 16" focusable="false"><path d="M3.5 8.4 6.6 11.4 12.5 4.8" /></svg>
                  </span>
                  <span class="ek-consent__text">
                    <a :href="legalUrls.terms" target="_blank" rel="noopener" class="ek-consent__link">Kullanım Koşulları</a>,
                    <a :href="legalUrls.subscription" target="_blank" rel="noopener" class="ek-consent__link">Abonelik Sözleşmesi</a>
                    ve
                    <a :href="legalUrls.preInfo" target="_blank" rel="noopener" class="ek-consent__link">Ön Bilgilendirme Formu</a>'nu
                    okudum, kabul ediyorum.
                  </span>
                </label>
                <p v-if="consentError" id="reg-consent-err" class="ek-consent__error" role="alert">
                  <v-icon size="14" aria-hidden="true">mdi-alert-circle-outline</v-icon>{{ CONSENT_ERROR_TEXT }}
                </p>
                <p class="ek-consent__note">
                  Kişisel verilerinize ilişkin bilgilendirme:
                  <a :href="legalUrls.kvkk" target="_blank" rel="noopener" class="ek-consent__link">KVKK Aydınlatma Metni</a>
                </p>
              </div>

              <v-btn block color="primary" height="52" variant="flat" class="ek-login-submit" type="submit">
                Hesabımı oluştur
              </v-btn>
            </v-form>
          </div>

          <div v-else key="forgot" class="form-pane">
            <template v-if="forgotSubmitted">
              <div class="ek-login-forgot-success" role="status">
                <v-icon size="32" aria-hidden="true">mdi-email-check-outline</v-icon>
                <p>{{ forgotMessage }}</p>
              </div>
              <v-btn variant="text" block class="mt-2" @click="tab = 'login'">Girişe dön</v-btn>
            </template>
            <v-form v-else @submit.prevent="handleForgotPassword">
              <p class="ek-login-hint">
                Kayıtlı e-posta adresinizi girin; parola sıfırlama bağlantısını gönderelim.
              </p>
              <AuthField id="forgot-email" v-model="forgotEmail" :label="$t('login.email')" type="email" autocomplete="email"
                icon="mdi-email-outline" placeholder="E-posta adresiniz" hide-label class="mb-4" />

              <v-expand-transition>
                <EkAlert v-if="forgotError" tone="error" dense live class="mb-3" :text="forgotError" />
              </v-expand-transition>

              <v-btn block color="primary" height="52" variant="flat" class="ek-login-submit" type="submit"
                :loading="forgotLoading">
                {{ $t('login.forgottenpassword.reset') }}
              </v-btn>
              <v-btn variant="text" block size="small" class="mt-2" @click="tab = 'login'">Girişe dön</v-btn>
            </v-form>
          </div>

      </Transition>
      </div>
    </div>

    <!-- ADR-0015 Karar 4: paylaşılan yasal bağlantılar. KAYIT sekmesi kendi onay+bağlantı bloğuna
         sahip olduğundan (yukarıda) burada TEKRAR gösterilmez. -->
    <div v-if="tab !== 'register'" class="ek-login-footer ek-login-rise" style="--i: 6">
      <!-- APK-DL: Android uygulaması (sitedeki indirme sayfası; hesap menüsündekiyle aynı kaynak). Android kabuğunda gizli. -->
      <!-- GL-FE2: kompakt tek satır (kısa ekranlarda giriş formu kaydırmasız sığsın). -->
      <a v-if="!inNativeShell" :href="mobileAppUrl" target="_blank" rel="noopener" class="ek-login-app" data-testid="login-mobile-app">
        <span class="ek-login-app__icon" aria-hidden="true"><v-icon size="16">mdi-android</v-icon></span>
        <span class="ek-login-app__text"><strong>Android uygulaması</strong> · Telefonunuzdan yönetin</span>
        <span class="ek-login-app__cta">İndir<v-icon size="14" aria-hidden="true">mdi-arrow-right</v-icon></span>
      </a>
      <div class="ek-login-footer__links">
        <!-- Uygulama içi yasal sayfalar (LegalView); içerik sitenin kanonik yasal verisinden. -->
        <a href="/legal/gizlilik" target="_blank" class="ek-login-footer__link">Gizlilik Politikası</a>
        <a href="/legal/kullanim-kosullari" target="_blank" class="ek-login-footer__link">Kullanım Koşulları</a>
        <a href="/legal/kvkk-aydinlatma" target="_blank" class="ek-login-footer__link">KVKK Aydınlatma Metni</a>
        <a href="/legal/cerez" target="_blank" class="ek-login-footer__link">Çerez Politikası</a>
      </div>
      <p class="ek-login-footer__copyright">© 2026 Entegrasyonik</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EkAlert, EkFormGrid } from '@entegrasyonik/ui/components'
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import useUser from '@/composables/user'
import LoadingComponent from '../LoadingComponent.vue'
import AuthField from './AuthField.vue'
import { parseRegisterIntent, REGISTER_PLAN_NAMES } from '@/navigation/registerIntent'
import { SITE_LEGAL_PATHS, SITE_MOBILE_APP_PATH, siteUrl } from '@/config/siteLinks'
import { resetAllStores } from '@/stores/resetRegistry'
import { isNativeShell } from '@entegrasyonik/ui/native'
import GoogleSignInButton from './GoogleSignInButton.vue'
import GoogleLogo from './GoogleLogo.vue'
import { googleErrorMessage, useGoogleSignIn } from '@/composables/googleSignIn'

const router = useRouter()
const route = useRoute()
const userApi = useUser()

// R9b / H-01: giriş ekranı görününce (açık çıkış VEYA oturum süresi dolması) önceki oturumdan kalan menü, sekme,
// katalog önbelleği ve bildirim durumu sıfırlanır — bir sonraki giriş (başka hesap olabilir) temiz başlar.
onMounted(() => { resetAllStores() })

// ADR-0014 Karar 2: tanıtım sitesinden `/login?mode=register&plan=<kod>&interval=` — kayıt sekmesi açılır,
// `plan`/`interval` YALNIZCA izinli değer kümesine eşleşirse kabul edilir (aksi sessizce yok sayılır).
const registerIntent = parseRegisterIntent(route.query as Record<string, unknown>)

// ADR-0012 Karar 1 / ADR-0014 Karar 2 ile AYNI kapalı-izinli-küme deseni: `?tab=forgot` yalnızca
// `ResetPasswordView`'ın "yeni bağlantı iste" bağlantısı gibi dahili yönlendirmeler için — serbest
// metin/URL yok, yalnızca 3 sabit değerden biri kabul edilir, aksi sessizce yok sayılır.
const ALLOWED_TABS = ['login', 'register', 'forgot'] as const
type LoginTabValue = (typeof ALLOWED_TABS)[number]
const tabFromQuery = (): LoginTabValue | undefined => {
  const raw = route.query.tab
  const value = Array.isArray(raw) ? raw[0] : raw
  return (ALLOWED_TABS as readonly string[]).includes(value ?? '') ? (value as LoginTabValue) : undefined
}
const tab = ref<LoginTabValue>(registerIntent.register ? 'register' : (tabFromQuery() ?? 'login'))

// ADR-0015 Karar 4 — sağ form alanı üst başlığı, aktif sekmeye göre değişir (yalnızca sunum, spec çapası DEĞİL).
const headingText = computed(() => {
  if (tab.value === 'register') return 'Mağazanızı birlikte büyütelim'
  if (tab.value === 'forgot') return 'Parolanızı sıfırlayın'
  return 'Kaldığınız yerden devam edin'
})
const eyebrowText = computed(() => {
  if (tab.value === 'register') return 'Hemen başlayın'
  if (tab.value === 'forgot') return 'Hesap kurtarma'
  return 'Hoş geldiniz'
})
const subText = computed(() => {
  if (tab.value === 'register') return 'Kurulum birkaç dakika; kart bilgisi istemiyoruz.'
  if (tab.value === 'forgot') return 'Sıfırlama bağlantısını e-posta adresinize gönderelim.'
  return 'E-posta ve parolanızla hemen içeridesiniz.'
})

const legalUrls = {
  kvkk: siteUrl(SITE_LEGAL_PATHS.kvkk),
  terms: siteUrl(SITE_LEGAL_PATHS.terms),
  subscription: siteUrl(SITE_LEGAL_PATHS.subscription),
  preInfo: siteUrl(SITE_LEGAL_PATHS.preInfo),
}
const inNativeShell = isNativeShell()
const mobileAppUrl = siteUrl(SITE_MOBILE_APP_PATH)
const CONSENT_ERROR_TEXT = 'Kayıt olmak için sözleşme metinlerini onaylamanız gerekir.'
const consent = ref(false)
const consentError = ref(false)
watch(consent, (checked) => { if (checked) consentError.value = false })

// ADR-0012 Karar 1 "Auth dönüşü": `redirect` yalnızca `/` ile başlayan ve `//` ile BAŞLAMAYAN
// göreli bir yolsa kabul edilir (açık yönlendirme/`//evil.com` önlemi); aksi halde `/dashboard`.
const resolveRedirectTarget = (): string => {
  const redirect = route.query.redirect
  const value = Array.isArray(redirect) ? redirect[0] : redirect
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
    return value
  }
  return '/dashboard'
}
const LOGIN_REASON_NOTICES: Record<string, string> = {
  'invitation-accepted': 'loginNotice.invitationAccepted',
  'ownership-transferred': 'loginNotice.ownershipTransferred',
}
const reasonNoticeKey = computed(() => {
  const reason = Array.isArray(route.query.reason) ? route.query.reason[0] : route.query.reason
  return typeof reason === 'string' ? LOGIN_REASON_NOTICES[reason] ?? '' : ''
})
const loadingLogin = ref()
const errorMessage = ref('')
const isStoreSelectionPhase = ref(false)
const storeSearch = ref('')

const authData = reactive({ email: '', password: '' })
const regData = reactive({ name: '', surname: '', email: '', password: '', password2: '' })

const filteredStores = computed(() => {
  if (!storeSearch.value) return userApi.stores.value
  return userApi.stores.value.filter((s: any) =>
    (s.name || '').toLowerCase().includes(storeSearch.value.toLowerCase()) ||
    s.clientId.toString().includes(storeSearch.value)
  )
})

const handleStoreSelect = async (clientId: number) => {
  const guid = loadingLogin.value.info("Mağaza bağlamı hazırlanıyor...")
  const success = await userApi.selectStore(clientId)
  loadingLogin.value.remove(guid)
  if (success) {
    router.replace(resolveRedirectTarget())
  }
}

const errorTitle = ref('')
const loggingIn = ref(false)
const fieldErrors = reactive({ email: '', password: '' })
watch(() => authData.email, () => { fieldErrors.email = '' })
watch(() => authData.password, () => { fieldErrors.password = '' })

/**
 * Giriş başarısızlığının nedeni: `restApi.post` hatada axios hata nesnesini DÖNER. Yanıt yoksa sunucuya ulaşılamamıştır
 * (eskiden bu da "Bilgiler hatalı" görünüyordu ve kullanıcı parolasını yanlış sanıyordu).
 */
function loginFailure(resp: any): { title: string; text: string } {
  const status = resp?.response?.status
  const network = !!resp && (resp.isAxiosError || resp instanceof Error) && !resp.response
  if (network || resp === undefined || resp === null) {
    return { title: 'Sunucuya ulaşılamadı', text: 'İnternet bağlantınızı kontrol edin; sorun sürerse birkaç dakika sonra tekrar deneyin.' }
  }
  if (status === 429) return { title: 'Çok fazla deneme', text: 'Güvenliğiniz için girişler kısa süre durduruldu. Birkaç dakika sonra tekrar deneyin.' }
  if (typeof status === 'number' && status >= 500) return { title: 'Sunucu şu an yanıt vermiyor', text: 'Bir süre sonra tekrar deneyin.' }
  return { title: '', text: 'Bilgiler hatalı, lütfen kontrol ediniz.' }
}

const handleLogin = async () => {
  errorMessage.value = ''
  errorTitle.value = ''
  fieldErrors.email = authData.email.trim() ? '' : 'E-posta adresinizi girin.'
  fieldErrors.password = authData.password ? '' : 'Parolanızı girin.'
  if (fieldErrors.email || fieldErrors.password || loggingIn.value) return

  loggingIn.value = true
  try {
    // Faz 4 hesap sözleşmesi: backend artık `requireCaptcha` dönmez (captcha kaldırıldı) — ölü dal silindi.
    const loginResp: any = await userApi.login(authData.email.trim(), authData.password)
    if (loginResp?.requireStoreSelection) {
      isStoreSelectionPhase.value = true
    } else if (loginResp && !loginResp.response && !(loginResp instanceof Error) && await userApi.isAuthenticated()) {
      router.replace(resolveRedirectTarget())
    } else {
      const f = loginFailure(loginResp)
      errorTitle.value = f.title
      errorMessage.value = f.text
    }
  } finally {
    loggingIn.value = false
  }
}

// GL-FE — Google ile giriş/kayıt. Belirteç YALNIZ bu bileşenin belleğinde (URL/depolama yok).
const googleSignup = ref<{ token: string; email: string } | null>(null)
const googleRegError = ref<{ title: string; text: string } | null>(null)

const handleGoogleCode = async (code: string) => {
  errorMessage.value = ''
  errorTitle.value = ''
  googleRegError.value = null
  if (loggingIn.value) return
  loggingIn.value = true
  try {
    const resp: any = await userApi.googleSignIn({ code })
    if (resp?.status === 'signup_required' && typeof resp.signupToken === 'string') {
      // Kayıtlı değil → kayıt ekranı: e-posta kilitli, ad/soyad profilden önerilir (düzenlenebilir), parola yok.
      const email = String(resp.profile?.email ?? '')
      googleSignup.value = { token: resp.signupToken, email }
      const [first = '', ...rest] = String(resp.profile?.name ?? '').trim().split(/\s+/)
      regData.name = regData.name || first
      regData.surname = regData.surname || rest.join(' ')
      regData.email = email
      regData.password = ''
      regData.password2 = ''
      tab.value = 'register'
      return
    }
    if (resp?.requireStoreSelection) {
      tab.value = 'login'
      isStoreSelectionPhase.value = true
      return
    }
    if (resp?.status === 'ok' && await userApi.isAuthenticated()) {
      router.replace(resolveRedirectTarget())
      return
    }
    const f = googleErrorMessage(resp)
    if (tab.value === 'register') googleRegError.value = f
    else {
      errorTitle.value = f.title
      errorMessage.value = f.text
    }
  } finally {
    loggingIn.value = false
  }
}
// Google penceresi tarafı hatası (açılır pencere engeli vb.) bulunulan sekmenin uyarı alanında; vazgeçme sessiz.
const showGoogleError = (msg: { title: string; text: string }) => {
  if (tab.value === 'register') googleRegError.value = msg
  else {
    errorTitle.value = msg.title
    errorMessage.value = msg.text
  }
}
const google = useGoogleSignIn(handleGoogleCode, showGoogleError)
const startGoogle = (from: 'login' | 'register') => {
  googleRegError.value = null
  if (from === 'login') {
    errorMessage.value = ''
    errorTitle.value = ''
  }
  google.start()
}

const cancelGoogleSignup = () => {
  googleSignup.value = null
  regData.email = ''
}

const handleRegister = async () => {
  // ADR-0014 S4b: yasal onay işaretlenmeden kayıt isteği GÖNDERİLMEZ.
  if (!consent.value) {
    consentError.value = true
    return
  }
  consentError.value = false
  const registered = googleSignup.value
    ? await userApi.register({ name: regData.name, surname: regData.surname, email: googleSignup.value.email }, googleSignup.value.token)
    : await userApi.register(regData)
  // Başarılı kayıt (mock'lu testte de) -> seçili plan varsa abonelik ekranına (`/subscription?plan=<kod>`; plan kodu
  // izinli kümeden, PII yok), yoksa ADR-0012 `redirect`/pano hedefine. Başarısızlıkta eski hata-yutma davranışı korunur.
  if (registered === true) {
    router.replace(registerIntent.plan ? { path: '/subscription', query: { plan: registerIntent.plan } } : resolveRedirectTarget())
  }
}

// ADR-0015 Karar 2 ("Giriş ekranındaki 'Şifremi unuttum' sekmesi... işlevsiz bırakmaz") + `docs/API_ACCOUNT_LIFECYCLE.md`
// #2 `requestPasswordReset`: backend HER ZAMAN aynı genel başarı yanıtını döner (kullanıcı numaralandırma yok);
// FE bu yanıtı OLDUĞU GİBİ gösterir, kendi başarı/başarısızlık ayrımı UYDURMAZ.
const forgotEmail = ref('')
const forgotError = ref('')
const forgotLoading = ref(false)
const forgotSubmitted = ref(false)
const forgotMessage = ref('')
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const handleForgotPassword = async () => {
  forgotError.value = ''
  const email = forgotEmail.value.trim()
  if (!EMAIL_PATTERN.test(email)) {
    forgotError.value = 'Geçerli bir e-posta adresi girin.'
    return
  }

  forgotLoading.value = true
  const resp: any = await userApi.requestPasswordReset(email)
  forgotLoading.value = false

  if (resp?.success === true) {
    forgotSubmitted.value = true
    forgotMessage.value = resp.message || 'Bu e-posta adresi kayıtlıysa parola sıfırlama bağlantısı gönderildi.'
    return
  }

  const status = resp?.response?.status
  forgotError.value = status === 429
    ? 'Çok fazla deneme yaptınız. Lütfen bir süre sonra tekrar deneyin.'
    : 'Bir şeyler ters gitti, lütfen daha sonra tekrar deneyin.'
}
</script>

<style scoped>
.premium-login-card {
  width: 100%;
}

/* Başlık bloğu: küçük üst satır (birincil renk) + editoryal başlık + sakin alt metin. */
.ek-login-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-3);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ek-color-primary);
}

.ek-login-eyebrow::before {
  content: '';
  width: 18px;
  height: 1.5px;
  border-radius: 1px;
  background: currentColor;
}

.ek-login-heading {
  margin: 0 0 var(--ek-space-3);
  font-size: clamp(1.75rem, 2.2vw, 2.125rem);
  font-weight: var(--ek-font-weight-semibold);
  line-height: 1.15;
  letter-spacing: -0.025em;
  color: var(--ek-color-content-strong);
}

.ek-login-sub {
  margin: 0 0 var(--ek-space-8);
  max-width: 36ch;
  color: var(--ek-color-content-default);
  font-size: 0.9375rem;
  line-height: 1.6;
}

.ek-login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Sekmeler: kutusuz yazı sekmeleri (Karar 4 — klasör-sekme YOK). Erişilebilir adlar/roller AYNI (Ek A).
   Seçili sekme koyu, diğeri kısık; altında birincil renkte 2px kayan çizgi; sekme şeridinin altında ince ayraç. */
.ek-login-tabs {
  margin-bottom: var(--ek-space-8);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ek-login-tab {
  min-width: 0 !important;
  font-size: 0.9375rem !important;
  font-weight: var(--ek-font-weight-semibold) !important;
  letter-spacing: 0;
  text-transform: none;
  color: var(--ek-color-content-muted) !important;
  transition: color var(--ek-motion-reveal);
}

.ek-login-tab:hover {
  color: var(--ek-color-content-strong) !important;
}

.ek-login-tabs :deep(.v-tab--selected) {
  color: var(--ek-color-content-strong) !important;
}

.ek-login-tabs :deep(.v-tab__slider) {
  height: 2px;
  background: var(--ek-color-primary);
  border-radius: 2px 2px 0 0;
}

.ek-login-tabs :deep(.v-tab .v-btn__overlay),
.ek-login-tabs :deep(.v-tab .v-btn__underlay) {
  display: none;
}

.ek-login-tab:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
  border-radius: var(--ek-radius-sm, 4px);
}

.login-content-wrapper {
  position: relative;
  /* `.form-pane` odak halkası için 4px iç boşluk taşır; alanlar başlık/sekme hizasında kalsın. */
  margin: 0 calc(-1 * var(--ek-space-1));
}

/* Aşama 3: sabit yükseklik (372px / 576px) kalktı — sekme içeriği kendi yüksekliğinde; alt bilgi
   düğmenin hemen altında durur, başlık sekmeler arasında yerinden oynamaz (form üste yaslı). */
.form-pane {
  width: 100%;
  /* v-window içeriği kırpar: odak halkası/gölge kenarda kesilmesin (sarmalayıcının negatif boşluğu hizayı korur). */
  padding: var(--ek-space-1);
}

.ek-login-register-grid {
  margin-bottom: var(--ek-space-2);
}

/* Birincil düğme: düz renk, gölgesiz; yalnız üst kenarda çok ince iç ışık (derinlik), üzerine gelince bir ton koyulaşır. */
.ek-login-submit {
  margin-top: var(--ek-space-2);
  font-size: 0.9375rem;
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0;
  text-transform: none;
  border-radius: var(--ek-radius-lg);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 18%, transparent) !important;
  transition: background-color var(--ek-motion-feedback);
}

.ek-login-submit:hover {
  background-color: color-mix(in srgb, var(--ek-color-primary) 88%, black) !important;
}

.ek-login-submit :deep(.v-btn__overlay) {
  display: none;
}

.ek-login-submit:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

/* "Parolanızı mı unuttunuz?": parola alanının altında, sağa yaslı. */
.ek-login-password {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.ek-login-forgot {
  align-self: flex-end;
}

/* İkincil bağlantı (Parolanızı mı unuttunuz?): sakin ton, üzerine gelince yalnız birincil renk (alt çizgi yok). */
.ek-login-link {
  background: none;
  border: none;
  padding: 2px 0;
  cursor: pointer;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-default);
  text-decoration: none;
  transition: color var(--ek-motion-feedback);
}

.ek-login-link:hover,
.ek-login-link:focus-visible {
  color: var(--ek-color-primary);
}

.ek-login-link:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
  border-radius: 4px;
}

.ek-login-hint {
  margin: 0 0 var(--ek-space-4);
  font-size: var(--ek-font-size-sm);
  /* `content-default` (content-muted DEĞİL): content-muted/background oranı (~4.76:1) AA eşiğine
     (4,5:1) çok yakın — axe-core'un antialiasing örneklemesi sınır değerlerde kararsız olabiliyor
     (bkz. bu görevin doğrulama koşusu). Daha güvenli marjlı token, aynı "ikincil metin" niyeti. */
  color: var(--ek-color-content-default);
}

.ek-login-forgot-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-6) 0 var(--ek-space-2);
  text-align: center;
  color: var(--ek-color-content-strong);
}

.ek-login-forgot-success .v-icon {
  color: var(--ek-color-success);
}

.ek-login-store-panel {
  margin-top: var(--ek-space-4);
  padding: var(--ek-space-4);
  background-color: var(--ek-color-info-subtle);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.ek-login-store-panel__title {
  display: flex;
  align-items: center;
  margin-bottom: var(--ek-space-3);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-primary);
}

.ek-login-store-list {
  max-height: 200px;
  overflow-y: auto;
  background-color: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.ek-login-store-avatar {
  background-color: var(--ek-color-primary-lighten);
  color: var(--ek-color-primary);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-bold);
}

.ek-login-store-name {
  color: var(--ek-color-primary);
  font-weight: var(--ek-font-weight-semibold);
}

.plan-band {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  margin-bottom: var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-info-subtle);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  color: var(--ek-color-content-strong);
}

.plan-band__icon {
  margin-top: var(--ek-space-1);
  color: var(--ek-color-info);
}

.plan-band__text {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  font-size: var(--ek-font-size-sm);
}

.plan-band__text span {
  color: var(--ek-color-content-default);
}

/* Onay: özel onay kutusu (yerel <input type=checkbox> görünmez ama odaklanabilir; rol/ad aynı), belgeler metnin
   içinde bağlantı. İşaretlenince kutu birincil renge dolar, onay işareti kendini çizer. */
.ek-consent {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: var(--ek-space-2) 0 var(--ek-space-5, 20px);
}

.ek-consent__row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  cursor: pointer;
}

.ek-consent__input {
  position: absolute;
  top: 0;
  left: 0;
  width: 20px;
  height: 20px;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.ek-consent__box {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  border: 1.5px solid var(--ek-color-content-subtle);
  border-radius: 6px;
  background: var(--ek-color-surface);
  transition: background-color var(--ek-motion-feedback), border-color var(--ek-motion-feedback);
}

.ek-consent__box svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--ek-color-on-primary, #fff);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 14;
  stroke-dashoffset: 14;
  transition: stroke-dashoffset var(--ek-motion-reveal) var(--ek-motion-stagger);
}

.ek-consent__row:hover .ek-consent__box {
  border-color: var(--ek-color-content-muted);
}

.ek-consent__row.is-checked .ek-consent__box {
  border-color: var(--ek-color-primary);
  background: var(--ek-color-primary);
}

.ek-consent__row.is-checked .ek-consent__box svg {
  stroke-dashoffset: 0;
}

.ek-consent__row.has-error .ek-consent__box {
  border-color: var(--ek-color-error);
}

.ek-consent__input:focus-visible + .ek-consent__box {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.ek-consent__text {
  font-size: var(--ek-font-size-sm);
  line-height: 1.55;
  color: var(--ek-color-content-default);
}

.ek-consent__link {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--ek-color-content-strong) 30%, transparent);
  text-underline-offset: 3px;
  transition: text-decoration-color var(--ek-motion-feedback), color var(--ek-motion-feedback);
}

.ek-consent__link:hover,
.ek-consent__link:focus-visible {
  color: var(--ek-color-primary);
  text-decoration-color: currentColor;
}

.ek-consent__error {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0;
  padding-left: 32px;
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-error-emphasis);
}

.ek-consent__note {
  margin: 0;
  padding-left: 32px;
  font-size: var(--ek-font-size-xs);
  line-height: 1.5;
  color: var(--ek-color-content-default);
}

@media (prefers-reduced-motion: reduce) {
  .ek-consent__box,
  .ek-consent__box svg {
    transition: none;
  }
}

/* GL-FE: "veya" ayıracı + Google düğmesi. */
.ek-login-alt {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-login-alt--top {
  margin-bottom: var(--ek-space-5, 20px);
}

.ek-login-or {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
}

.ek-login-or::before,
.ek-login-or::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ek-color-border-default);
}

/* Google ile kayıt bandı (GL-FE2): düz yüzey + ince çerçeve; resmi G logosu kare kutuda; üstte mikro etiket, altta
   e-posta yarı kalın; sağda sade metin bağlantısı. */
.ek-google-signup {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  margin-bottom: var(--ek-space-4);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-google-signup__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
}

.ek-google-signup__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ek-google-signup__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-2xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ek-google-signup__text strong {
  overflow: hidden;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-google-signup__switch {
  flex: none;
  align-self: center;
}

/* APK-DL / GL-FE2: mobil uygulama — alt şeritte tek satırlık sade bağlantı (kart değil); kare ikon kutusu. */
.ek-login-app {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-2);
  margin: 0 auto var(--ek-space-3);
  width: fit-content;
  max-width: 100%;
  padding: var(--ek-space-1) var(--ek-space-2);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-default);
  font-size: var(--ek-font-size-xs);
  text-decoration: none;
  transition: background-color var(--ek-motion-feedback), color var(--ek-motion-feedback);
}

.ek-login-app:hover {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-content-strong);
}

.ek-login-app:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 2px;
}

.ek-login-app__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  color: var(--ek-color-action);
}

.ek-login-app__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-login-app__text strong {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-login-app__cta {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

/* Alt bilgi: sakin bağlantı satırı; ince çizgiyle formdan ayrılır. */
.ek-login-footer {
  margin-top: var(--ek-space-10);
  padding-top: 20px;
  border-top: 1px solid var(--ek-color-border-default);
}

.ek-login-footer__links {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-4);
  margin-bottom: var(--ek-space-3);
}

.ek-login-footer__link {
  font-size: var(--ek-font-size-2xs);
  /* content-default: content-muted küçük yazıda AA sınırında (axe kararsız) — bkz. .ek-login-hint notu. */
  color: var(--ek-color-content-default);
  text-decoration: none;
  font-weight: var(--ek-font-weight-medium);
  white-space: nowrap;
  transition: color var(--ek-motion-feedback);
}

.ek-login-footer__link:hover,
.ek-login-footer__link:focus-visible {
  color: var(--ek-color-content-strong);
}

.ek-login-footer__copyright {
  margin: 0;
  text-align: center;
  font-size: var(--ek-font-size-2xs);
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
  letter-spacing: 0.02em;
}

/* Açılış: üst satır → başlık → alt metin → sekmeler kısa aralıkla yükselir (sol panelle aynı dil). Form alanları ve
   alt bilgi animasyonsuz: saydamlık geçişi sırasında kontrast ölçümü (axe) kararsızlaşıyordu. */
.ek-login-rise {
  animation: ek-login-rise var(--ek-app-login-rise) var(--ek-app-login-ease-out) both;
  animation-delay: calc((var(--i, 0) + 1) * var(--ek-app-login-step));
}

/* Açılış: bölümler sırayla (üst etiket → başlık → açıklama → sekmeler → form → alt şerit) hafif yükselip belirir; sol
   marka paneliyle (AuthShell `__rise`) aynı süre/eğri. Hareket azaltma tercihinde kapalı. (Erişilebilirlik testleri
   `reducedMotion: 'reduce'` ile koşmalı — animasyon anında saydamlık kontrast ölçümünü etkiler.) */
.ek-auth-swap-enter-active {
  transition: opacity var(--ek-duration-base, 200ms) var(--ek-easing-decelerate, ease-out),
    transform var(--ek-duration-base, 200ms) var(--ek-easing-decelerate, ease-out);
}
.ek-auth-swap-leave-active {
  transition: opacity 120ms var(--ek-easing-accelerate, ease-in);
}
.ek-auth-swap-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.ek-auth-swap-leave-to {
  opacity: 0;
}

@keyframes ek-login-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .ek-login-rise { animation: none; }
  .ek-auth-swap-enter-active, .ek-auth-swap-leave-active { transition: none; }
  .ek-login-tabs::before { transition: none; }
}

@media (max-width: 600px) {
  .login-content-wrapper,
  .login-window {
    min-height: 460px;
  }

  .login-content-wrapper--register {
    height: calc(var(--ek-space-16) * 11);
  }

  .ek-login-tab {
    font-size: var(--ek-font-size-sm) !important;
  }
}

/* ================= GL-FE2 — kısa ekranlarda kaydırmasız giriş =================
   1366×768 / 1280×720 dizüstü ekranlarda giriş sekmesi (hata uyarısı, Google düğmesi, Android satırı ve yasal
   bağlantılar dahil) kaydırmasız sığar: dikey aralıklar, denetim yüksekliği (52 → 46) ve başlık sıkılaşır; alt şerit
   tek satırlık bağlantılara iner. Yüksek ekranlarda (≥ 900px) ferah ölçüler aynen. Kayıt sekmesi daha uzun: orada
   kaydırma kabul, ama aynı sıkılaştırmadan yararlanır. */
.premium-login-card {
  --ek-login-control-h: 52px;
}

@media (min-width: 768px) and (max-height: 900px) {
  .premium-login-card {
    --ek-login-control-h: 46px;
  }

  .ek-login-eyebrow {
    margin-bottom: var(--ek-space-2);
  }

  .ek-login-heading {
    margin-bottom: var(--ek-space-2);
    font-size: 1.5rem;
  }

  .ek-login-sub {
    margin-bottom: var(--ek-space-5, 20px);
    font-size: var(--ek-font-size-sm);
  }

  .ek-login-tabs {
    margin-bottom: var(--ek-space-5, 20px);
  }

  .ek-login-tabs :deep(.v-slide-group),
  .ek-login-tabs :deep(.v-tab) {
    height: 42px !important;
  }

  .ek-login-form {
    gap: var(--ek-space-3);
  }

  .ek-login-password {
    gap: var(--ek-space-1);
  }

  .premium-login-card :deep(.auf__input .v-field),
  .premium-login-card :deep(.auf__input .v-field__input) {
    min-height: var(--ek-login-control-h);
  }

  .ek-login-submit {
    height: var(--ek-login-control-h) !important;
    margin-top: 0;
  }

  .ek-login-alt {
    gap: var(--ek-space-3);
  }

  .ek-login-alt--top {
    margin-bottom: var(--ek-space-4);
  }

  .ek-login-footer {
    margin-top: var(--ek-space-5, 20px);
    padding-top: var(--ek-space-3);
  }

  .ek-login-app {
    margin-bottom: var(--ek-space-2);
  }

  .ek-login-footer__links {
    gap: 2px var(--ek-space-3);
    margin-bottom: var(--ek-space-1);
  }

  .ek-consent {
    margin-bottom: var(--ek-space-4);
  }
}

/* Çok kısa ekran (≤ 720px yükseklik): alt metin ve telif satırı gizlenir — form ve bağlantılar kalır. */
@media (min-width: 768px) and (max-height: 740px) {
  .ek-login-sub,
  .ek-login-footer__copyright {
    display: none;
  }

  .ek-login-heading {
    margin-bottom: var(--ek-space-4);
  }
}

/* GL-FE2: koyu temada birincil düğme. Vuetify `primary` koyu temada açık pastel maviye dönüyor ve üstünde beyaz yazı
   okunmuyordu (~3:1). Koyu temada da tasarım dilinin birincil eylem rengi (`--ek-color-action`) + onun karşıt metni
   (`--ek-color-action-contrast`, koyu) kullanılır → okunur (≥ 4.5:1). Hover bir ton açılır. (Tüm seçici :global içinde: `:global(x) .y` biçiminde Vue yalnız x'i tutar.) */
:global(html[data-theme='dark'] .ek-login-submit) {
  background-color: var(--ek-color-action) !important;
  color: var(--ek-color-action-contrast) !important;
  box-shadow: none !important;
}

:global(html[data-theme='dark'] .ek-login-submit:hover) {
  background-color: var(--ek-color-action-hover) !important;
}

</style>
