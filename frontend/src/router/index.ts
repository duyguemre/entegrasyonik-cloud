// ADR-0012 Karar 1 — Router entegrasyonu (tek kabuk rotası).
// Güvenli alan artık TEK bir çocuk rotaya (`:screen(.*)*`) sahip; `SecureLayout` bu rotayı
// `<router-view>` ile RENDER ETMEZ (route değişimi yalnızca parametre değişimidir — bileşen
// yeniden monte edilmez, `WrapperComponent`'in canlı-tutma mekanizması korunur). Ekran ↔ URL
// eşlemesinin gerçek çözümü `stores/workspace.ts` + `navigation/screens.ts`'tedir.
import useUser from '@/composables/user';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
// ADR-0017 Karar 1.8 — global hata sınırı: router hataları (dinamik import/chunk dahil).
import { reportUnexpectedError } from '@/composables/errorReporting'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'mainpage',
    meta: {
      requiresAuth: true,
    },
    component: () => import('@/layouts/SecureLayout.vue'),
    children: [
      // Boş yol (`/`) her zaman panoya düşer (ADR-0012 Karar 1: "/ → /dashboard'a replace yönlendirme").
      // Bu çocuğa AÇIKÇA bir `name` verilir — aksi halde vue-router, adı olan üst rota (`mainpage`)
      // ile adsız+boş-yollu çocuk arasında "Using that name won't render the empty path child"
      // uyarısı verip bu yönlendirmeyi hiç TETİKLEMEZ (doğrulandı).
      { path: '', name: 'workspace-root', redirect: '/dashboard' },
      // Kalan HER yol (`/orders`, `/integrations/marketplace`, `/products/<id>` ...) buraya düşer;
      // gerçek çözüm `stores/workspace.ts` `resolveActiveFromRoute`'tadır. `SecureLayout` kendi
      // içeriğini `WrapperComponent` ile yönetir, `<router-view>` KULLANMAZ — bu yüzden `component`
      // burada asla render EDİLMEZ; yalnızca `RouteRecordRaw` tipinin bir bileşen İSTEMESİ için
      // hiçbir şey render etmeyen boş bir bileşen veriliyor.
      { path: ':screen(.*)*', name: 'workspace', component: { render: () => null } },
    ],
  },
  // `/login` (ADR-0012 Karar 1 "Ayrılmış ilk segmentler"): vue-router 4 rota EŞLEŞTİRMESİ
  // (yukarıdaki gibi `array` sırası DEĞİL) skor tabanlıdır — statik `login` alt-yolu, üstteki
  // güvenli-alan jokerinin (`:screen(.*)*`) her zaman ÖNÜNE geçer (doğrulandı, `router.resolve`
  // ile). Bu route'un KENDİ `path:'/'` üst kaydı bare `/`'i de eşleştirebileceğinden (kendi
  // `component`'i olduğu için) — iki üst-düzey `path:'/'` kaydı arasında `/` için KAZANAN
  // yalnızca DİZİDEKİ İLK'tir (skor eşit); bu yüzden bu kayıt İKİNCİ sırada kalmalı, aksi halde
  // bare `/` yanlışlıkla bu (login) kaydına düşer ve kabuk hiç render EDİLMEZ (doğrulandı, kırılan
  // davranış — bkz. commit geçmişi).
  {
    path: '/',
    component: () => import('@/layouts/UnsecureLayout.vue'),
    children: [
      {
        path: 'login',
        name: 'UnsecureHome',
        component: () => import('@/views/unsecure/LoginView.vue'),
        meta: {
          requiresAuth: false
        }
      },
      // ADR-0015 Karar 2/Karar 4 — `docs/API_ACCOUNT_LIFECYCLE.md` #3: e-postadaki sıfırlama
      // bağlantısının hedefi. Kimliksiz (oturum gerektirmez); `?token=` sorgu parametresini okur.
      {
        path: 'reset-password',
        name: 'ResetPassword',
        component: () => import('@/views/unsecure/ResetPasswordView.vue'),
        meta: {
          requiresAuth: false
        }
      },
      // ADR-0015 B4-P0 — `docs/API_ACCOUNT_LIFECYCLE.md` #4: e-posta doğrulama bağlantısının hedefi
      // (yalnızca EKLEME). Kimliksiz; `?token=` okur, açılışta `AccountService/verifyEmail` çağırır.
      {
        path: 'verify-email',
        name: 'VerifyEmail',
        component: () => import('@/views/unsecure/VerifyEmailView.vue'),
        meta: {
          requiresAuth: false
        }
      },
      // Faz 3 / C2a — API_ACCOUNT_LIFECYCLE.md §6: davet bağlantısı `${PUBLIC_APP_URL}/invite#t=<token>`. Kimliksiz;
      // token yalnız parçadan (`#t=`) okunur ve hemen silinir (`composables/fragmentToken.ts`). Kabul oturum AÇMAZ.
      {
        path: 'invite',
        name: 'InvitationAccept',
        component: () => import('@/views/unsecure/InvitationAcceptView.vue'),
        meta: {
          requiresAuth: false
        }
      },
      // §9: sahiplik devri bağlantısı `${PUBLIC_APP_URL}/accept-ownership#t=<token>`. Kabul OTURUM ister (hedef kullanıcı);
      // sayfa kimliksiz açılır, oturum yoksa token bellekte bekletilip girişe gidilir ve SPA içinde geri dönülür.
      {
        path: 'accept-ownership',
        name: 'OwnershipAccept',
        component: () => import('@/views/unsecure/OwnershipAcceptView.vue'),
        meta: {
          requiresAuth: false
        }
      },
      // MCP-6 (ADR-0035, MCP_UI_CONTRACT §1 S1/S2): sade kabuk (menü yok) ama OTURUM ister — oturum yoksa guard
      // `/login?redirect=<tam adres>` ile girişe gönderir, giriş sonrası buraya döner. Menüde görünmezler.
      // S1: dış yapay zekâ uygulamasının OAuth yetkilendirmesinden gelen onay ekranı (`?req={id}`).
      {
        path: 'oauth/consent',
        name: 'OAuthConsent',
        component: () => import('@/views/unsecure/OAuthConsentView.vue'),
        meta: {
          requiresAuth: true
        }
      },
      // Yasal belgeler (kimliksiz): içerik sitenin kanonik verisinden (site/src/data/legal). Eski elle yazılmış
      // public/legal/*.html kopyaları kaldırıldı; dışarıda kalmış eski bağlantılar karşılığına yönlenir.
      {
        path: 'legal/:slug',
        name: 'Legal',
        component: () => import('@/views/unsecure/LegalView.vue'),
        meta: {
          requiresAuth: false
        }
      },
      { path: 'legal/gizlilik-sozlesmesi.html', redirect: '/legal/gizlilik' },
      { path: 'legal/kullanim-kosullari.html', redirect: '/legal/kullanim-kosullari' },
      { path: 'legal/aydinlatma-metni.html', redirect: '/legal/kvkk-aydinlatma' },
      { path: 'legal/cerez-politikasi.html', redirect: '/legal/cerez' },
      // S2: bant dışı yazma onayı; URL'de kimlik dışında parametre YOK.
      {
        path: 'approve/:id',
        name: 'McpApproval',
        component: () => import('@/views/unsecure/McpApprovalView.vue'),
        meta: {
          requiresAuth: true
        }
      },
    ],
  },
]

// DS-v2 Aşama 1 — tasarım sistemi vitrini: YALNIZCA geliştirmede (`vite` dev sunucusu).
// `import.meta.env.DEV` derleme zamanında sabitlenir; üretim derlemesinde bu dal ve
// `DesignSystemView` chunk'ı tamamen elenir (statik test: tests/design-system-route.test.ts).
// Menüde/komut paletinde YOKTUR. Kimlik gerektirmez (API çağrısı yapmaz).
if (import.meta.env.DEV) {
  routes.unshift({
    path: '/design-system',
    name: 'DesignSystem',
    component: () => import('@/views/dev/DesignSystemView.vue'),
    meta: { requiresAuth: false },
  })
  // ADR-0034 — Otopilot inceleme tezgâhı (mock taşıyıcı, açık/koyu tema; packages/chat/docs/review görselleri + axe).
  routes.unshift({
    path: '/dev/otopilot',
    name: 'OtopilotHarness',
    component: () => import('@/views/dev/OtopilotHarnessView.vue'),
    meta: { requiresAuth: false },
  })
}

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
})

router.beforeEach(async (to, from, next) => {
  const userApi = useUser();

  // 1. Auth gereken bir sayfadaysak veya login sayfasındaysak kontrol yapalım
  if (to.meta.requiresAuth || to.path === '/login') {
    const isAuth = await userApi.isAuthenticated(false);

    // 2. Login sayfasındaysak
    if (to.path === '/login') {
      if (isAuth) return next('/'); // Zaten giriş yapmışsa ana sayfaya yolla
      return next(); // Giriş yapmamışsa login sayfasını aç
    }

    // 3. Auth gereken bir sayfadaysak
    if (to.meta.requiresAuth) {
      if (!isAuth) {
        // ADR-0012 Karar 1 "Auth dönüşü": hedef adres `redirect` query'sine yazılır; login sonrası
        // buraya `router.replace` ile dönülür (LoginComponent.vue). Doğrulama LoginComponent'te
        // TEKRAR yapılır (yalnızca `/` ile başlayan, `//` ile BAŞLAMAYAN göreli yol kabul edilir —
        // açık yönlendirme/`//evil.com` önlemi).
        return next({ path: '/login', query: { redirect: to.fullPath } });
      }
      return next(); // Giriş varsa devam et
    }
  }

  // 4. Diğer her şey için (Public sayfalar vb.)
  next();
});

// ADR-0017 Karar 1.8 — router seviyesinde yakalanan hatalar (guard içinde fırlatılan hata,
// veya lazy-load edilen ekran bileşeninin dinamik `import()`ı başarısız olduğunda). Dinamik
// import/chunk hatası tipik olarak yeni bir dağıtımdan sonra tarayıcıda hâlâ açık kalan eski
// bir sekmede oluşur (eski chunk dosyaları artık sunucuda yok, 404); kullanıcıya nazik bir
// ileti + TEK seferlik otomatik yeniden yükleme ile kendiliğinden iyileşir (döngü koruması:
// `sessionStorage` bayrağı — reload sonrası hâlâ hata alınırsa ikinci kez otomatik denenmez).
const CHUNK_ERROR_RELOAD_FLAG = 'ek-chunk-reload-once'
router.onError((error: any, to, from) => {
  const message: string = error?.message || String(error)
  const isChunkError = /Failed to fetch dynamically imported module|Importing a module script failed|dynamically imported module|ChunkLoadError|error loading dynamically imported module/i.test(message)

  reportUnexpectedError('Router hata yakaladı', {
    module: 'router',
    isChunkError,
    to: to?.fullPath,
    from: from?.fullPath,
    message,
    stack: error?.stack,
  }, {
    userMessage: isChunkError ? 'Uygulama güncellendi, sayfa yenileniyor…' : undefined,
    color: isChunkError ? 'info' : 'error',
  })

  if (isChunkError && typeof window !== 'undefined' && !window.sessionStorage.getItem(CHUNK_ERROR_RELOAD_FLAG)) {
    window.sessionStorage.setItem(CHUNK_ERROR_RELOAD_FLAG, '1')
    window.location.reload()
  }
})

export default router
