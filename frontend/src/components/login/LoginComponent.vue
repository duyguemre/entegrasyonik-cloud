<!--
  frontend/src/components/login/LoginComponent.vue

  ADR-0015 Karar 4 — giriş/kayıt/şifremi-unuttum formu. `.premium-login-card`
  kök sınıfı bir spec kancasıdır (register-handoff.spec.ts `.include(...)`) —
  artık görsel bir "kart" değil (kart yok, Karar 4), yalnızca hook olarak
  KORUNUR. Sekme rolleri/adları, alan etiketleri, düğme metinleri ve
  `data-testid`'ler ADR-0015 Karar 5.1 Ek A kapsamında DEĞİŞTİRİLMEDİ.

  ŞİFREMİ UNUTTUM sekmesi artık İŞLEVSELDİR (`docs/API_ACCOUNT_LIFECYCLE.md`
  — backend hazır): e-posta gönderilir, backend HER ZAMAN aynı genel başarı
  mesajını döner (kullanıcı numaralandırma yok). Gerçek sıfırlama bağlantısı
  `/reset-password?token=…` sayfasına gider (bkz. `ResetPasswordView.vue`).
-->
<template>
  <div class="premium-login-card">
    <h1 class="ek-login-heading">{{ headingText }}</h1>

    <v-tabs v-model="tab" grow hide-slider class="ek-login-tabs" height="44">
      <v-tab value="login" :ripple="false" class="ek-login-tab">
        <v-icon start size="16">mdi-login</v-icon>Giriş
      </v-tab>
      <v-tab value="register" :ripple="false" class="ek-login-tab">
        <v-icon start size="16">mdi-account-plus-outline</v-icon>Kayıt
      </v-tab>
      <v-tab value="forgot" :ripple="false" class="ek-login-tab">
        <v-icon start size="16">mdi-key-alert-outline</v-icon>Şifremi unuttum
      </v-tab>
    </v-tabs>

    <div class="login-content-wrapper" :class="{ 'login-content-wrapper--register': tab === 'register' }">
      <v-window v-model="tab" :touchless="true" class="login-window">

        <v-window-item value="login" transition="fade-transition" reverse-transition="fade-transition">
          <div class="form-pane">
            <LoadingComponent attach=".LoginView" ref="loadingLogin" />
            <v-form @submit.prevent="handleLogin">
              <v-text-field v-model="authData.email" :label="$t('login.email')" autocomplete="username"
                class="mb-3"></v-text-field>

              <v-text-field v-model="authData.password" :label="$t('login.password')" type="password"
                autocomplete="current-password" class="mb-2"></v-text-field>

              <div v-if="!isStoreSelectionPhase" class="ek-login-forgot-row">
                <button type="button" class="ek-login-link" @click="tab = 'forgot'">Şifrenizi mi unuttunuz?</button>
              </div>

              <v-expand-transition>
                <EkAlert v-if="errorMessage" tone="error" dense live class="mb-3" :text="errorMessage" />
              </v-expand-transition>

              <div v-if="!isStoreSelectionPhase">
                <v-btn block color="primary" height="40" class="ek-login-submit" type="submit">
                  {{ $t('login.title') }}
                </v-btn>
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
        </v-window-item>

        <v-window-item value="register" transition="fade-transition" reverse-transition="fade-transition">
          <div class="form-pane">
            <v-form @submit.prevent="handleRegister">
              <!-- ADR-0014 S4b: tanıtım sitesinden gelen (doğrulanmış) plan seçimi. Yalnızca izinli plan kodu gösterilir. -->
              <div v-if="registerIntent.plan" class="plan-band" role="status" data-testid="register-plan-band">
                <v-icon size="18" class="plan-band__icon" aria-hidden="true">mdi-tag-outline</v-icon>
                <div class="plan-band__text">
                  <strong>Seçtiğiniz plan: {{ REGISTER_PLAN_NAMES[registerIntent.plan] }}</strong>
                  <span>Deneme sürümüyle başlarsınız; kart bilgisi istenmez. Planı, kayıttan sonra abonelik ekranında onaylarsınız.</span>
                </div>
              </div>
              <!-- Aşama 3: tek form ızgarası (EkFormGrid) — alanlar arası boşluk sabit, üst üste binme yok. -->
              <EkFormGrid :columns="2" class="ek-login-register-grid">
                <v-text-field v-model="regData.name" :label="$t('login.register.name')" autocomplete="given-name" />
                <v-text-field v-model="regData.surname" :label="$t('login.register.surname')" autocomplete="family-name" />
                <v-text-field v-model="regData.email" :label="$t('login.email')" autocomplete="email" class="ek-span-full" />
                <v-text-field v-model="regData.password" :label="$t('login.password')" type="password" autocomplete="new-password" />
                <v-text-field v-model="regData.password2" :label="$t('login.register.repassword')" type="password"
                  autocomplete="new-password" />
              </EkFormGrid>
              <!-- ADR-0014 S4b: yasal onay. İşaretlenmeden kayıt GÖNDERİLMEZ (handleRegister). Metinler sitede (kanonik kaynak). -->
              <div class="consent-block">
                <v-checkbox v-model="consent" class="consent-checkbox" data-testid="register-consent"
                  :error-messages="consentError ? [CONSENT_ERROR_TEXT] : []"
                  label="Kullanım Koşulları, Abonelik Sözleşmesi ve Ön Bilgilendirme Formu'nu okudum, kabul ediyorum." />
                <p class="consent-links" data-testid="register-legal-links">
                  <span>Metinleri okuyun:</span>
                  <a :href="legalUrls.terms" target="_blank" rel="noopener" class="legal-link">Kullanım Koşulları</a>
                  <a :href="legalUrls.subscription" target="_blank" rel="noopener" class="legal-link">Abonelik Sözleşmesi</a>
                  <a :href="legalUrls.preInfo" target="_blank" rel="noopener" class="legal-link">Ön Bilgilendirme Formu</a>
                  <a :href="legalUrls.kvkk" target="_blank" rel="noopener" class="legal-link">KVKK Aydınlatma Metni</a>
                </p>
              </div>

              <v-btn block color="primary" height="40" class="ek-login-submit" type="submit">{{
                $t('login.register.title') }}</v-btn>
            </v-form>
          </div>
        </v-window-item>

        <v-window-item value="forgot" transition="fade-transition" reverse-transition="fade-transition">
          <div class="form-pane">
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
              <v-text-field v-model="forgotEmail" :label="$t('login.email')" type="email" autocomplete="email"
                class="mb-2"></v-text-field>

              <v-expand-transition>
                <EkAlert v-if="forgotError" tone="error" dense live class="mb-3" :text="forgotError" />
              </v-expand-transition>

              <v-btn block color="primary" height="40" class="ek-login-submit" type="submit"
                :loading="forgotLoading">
                {{ $t('login.forgottenpassword.reset') }}
              </v-btn>
              <v-btn variant="text" block size="small" class="mt-2" @click="tab = 'login'">Vazgeç</v-btn>
            </v-form>
          </div>
        </v-window-item>

      </v-window>
    </div>

    <!-- ADR-0015 Karar 4: paylaşılan yasal bağlantılar. KAYIT sekmesi kendi onay+bağlantı bloğuna
         sahip olduğundan (yukarıda) burada TEKRAR gösterilmez. -->
    <div v-if="tab !== 'register'" class="ek-login-footer">
      <div class="ek-login-footer__links">
        <a href="/legal/gizlilik-sozlesmesi.html" target="_blank" class="ek-login-footer__link">Gizlilik Sözleşmesi</a>
        <a href="/legal/kullanim-kosullari.html" target="_blank" class="ek-login-footer__link">Kullanım Koşulları</a>
        <a href="/legal/aydinlatma-metni.html" target="_blank" class="ek-login-footer__link">Aydınlatma Metni</a>
        <a href="/legal/cerez-politikasi.html" target="_blank" class="ek-login-footer__link">Çerez Politikası</a>
      </div>
      <p class="ek-login-footer__copyright">© 2026 Entegrasyonik</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import EkAlert from '@/components/ds/EkAlert.vue'
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import useUser from '@/composables/user'
import LoadingComponent from '../LoadingComponent.vue'
import { parseRegisterIntent, REGISTER_PLAN_NAMES } from '@/navigation/registerIntent'
import { SITE_LEGAL_PATHS, siteUrl } from '@/config/siteLinks'
import { resetAllStores } from '@/stores/resetRegistry'
import EkFormGrid from '@/components/ds/EkFormGrid.vue'

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
  if (tab.value === 'register') return 'Hesap oluşturun'
  if (tab.value === 'forgot') return 'Şifrenizi sıfırlayın'
  return 'Hesabınıza giriş yapın'
})

const legalUrls = {
  kvkk: siteUrl(SITE_LEGAL_PATHS.kvkk),
  terms: siteUrl(SITE_LEGAL_PATHS.terms),
  subscription: siteUrl(SITE_LEGAL_PATHS.subscription),
  preInfo: siteUrl(SITE_LEGAL_PATHS.preInfo),
}
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

const handleLogin = async () => {
  errorMessage.value = ""
  const guid = loadingLogin.value.info("")

  // Faz 4 hesap sözleşmesi: backend artık `requireCaptcha` dönmez (captcha kaldırıldı) — ölü dal silindi.
  const loginResp: any = await userApi.login(authData.email, authData.password)

  if (loginResp?.requireStoreSelection) {
    isStoreSelectionPhase.value = true
    errorMessage.value = ""
  } else if (await userApi.isAuthenticated()) {
    router.replace(resolveRedirectTarget())
  } else {
    errorMessage.value = "Bilgiler hatalı, lütfen kontrol ediniz."
  }
  loadingLogin.value.remove(guid)
}

const handleRegister = async () => {
  // ADR-0014 S4b: yasal onay işaretlenmeden kayıt isteği GÖNDERİLMEZ.
  if (!consent.value) {
    consentError.value = true
    return
  }
  consentError.value = false
  const registered = await userApi.register(regData)
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

.ek-login-heading {
  margin: 0 0 var(--ek-space-6);
  font-size: var(--ek-font-size-2xl);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: -0.01em;
  color: var(--ek-color-content-strong);
}

/* Sekmeler: "segment kontrolü" görünümü (Karar 4 — klasör-sekme YOK). Erişilebilir
   adlar/roller AYNI (Ek A); yalnızca sunum değişti. */
.ek-login-tabs {
  background-color: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  padding: var(--ek-space-1);
  margin-bottom: var(--ek-space-6);
}

.ek-login-tab {
  font-weight: var(--ek-type-tab-weight) !important;
  font-size: var(--ek-type-tab-size) !important;
  letter-spacing: 0;
  color: var(--ek-color-content-muted) !important;
  border-radius: var(--ek-radius-md);
  transition: color var(--ek-duration-fast) var(--ek-easing-standard);
}

.ek-login-tabs :deep(.v-tab--selected) {
  background-color: var(--ek-color-surface);
  color: var(--ek-color-primary) !important;
  box-shadow: var(--ek-shadow-sm);
}

.login-content-wrapper {
  position: relative;
}

/* Aşama 3: sabit yükseklik (372px / 576px) kalktı — sekme içeriği kendi yüksekliğinde; alt bilgi
   düğmenin hemen altında durur, başlık sekmeler arasında yerinden oynamaz (form üste yaslı). */
.form-pane {
  width: 100%;
}

.ek-login-register-grid {
  margin-bottom: var(--ek-space-2);
}

.ek-login-submit {
  font-weight: var(--ek-font-weight-semibold);
}

.ek-login-forgot-row {
  display: flex;
  justify-content: flex-end;
  margin: calc(-1 * var(--ek-space-1)) 0 var(--ek-space-3);
}

.ek-login-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-primary);
}

.ek-login-link:hover,
.ek-login-link:focus-visible {
  text-decoration: underline;
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

.consent-block {
  margin: var(--ek-space-1) 0 var(--ek-space-4);
}

.consent-checkbox :deep(.v-label) {
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
  opacity: 1;
}

.consent-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-3);
  margin: var(--ek-space-1) 0 0;
  padding-inline-start: var(--ek-space-10);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.consent-links .legal-link {
  color: var(--ek-color-action);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.consent-links .legal-link:hover {
  color: var(--ek-color-action-hover);
}

.ek-login-footer {
  margin-top: var(--ek-space-6);
  padding-top: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-default);
}

.ek-login-footer__links {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--ek-space-4);
  margin-bottom: var(--ek-space-3);
}

.ek-login-footer__link {
  font-size: 10.5px;
  color: var(--ek-color-content-muted);
  text-decoration: none;
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
}

.ek-login-footer__link:hover,
.ek-login-footer__link:focus-visible {
  color: var(--ek-color-primary);
}

.ek-login-footer__copyright {
  margin: 0;
  text-align: center;
  font-size: 10px;
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
  letter-spacing: 0.03em;
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
    font-size: 10px !important;
  }
}
</style>
