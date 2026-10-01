import { START_LOCATION, createRouter, createWebHistory } from 'vue-router'
import { nextTick, watch } from 'vue'
import { session } from './auth/session'
import { DEFAULT_PATH, DETAIL_ROUTES, SCREENS } from './navigation/screens'

const PlannedView = () => import('./views/PlannedView.vue')

// Rotalar YALNIZ ekran kaydından üretilir (navigation/screens.ts): planlı ekran kalıcı yolunda "yakında" durumuyla açılır.
export const router = createRouter({
  history: createWebHistory(),
  // K51 hüküm bağlantıları sayfa içi bölüme (`#bo-cache-families`, `#bakim`) gidebilir. Davet bileti `#t=` biçimindedir —
  // yalnız düz kimlik biçimli parçaya kaydırılır. Geri/ileride eski konum korunur.
  scrollBehavior(to, _from, saved) {
    if (saved) return saved
    if (to.hash && /^#[A-Za-z][\w-]*$/.test(to.hash) && document.querySelector(to.hash)) return { el: to.hash, top: 72 }
    return undefined
  },
  routes: [
    { path: '/giris', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true, title: 'Giriş' } },
    // Davet kabulü (B12): kimliksiz, kabuksuz; bilet `#t=` parçasında (sunucu günlüğü/Referer görmez).
    { path: '/accept-invite', name: 'accept-invite', component: () => import('./views/admins/AcceptInviteView.vue'), meta: { public: true, title: 'Daveti kabul et' } },
    {
      path: '/',
      component: () => import('./layouts/ShellLayout.vue'),
      children: [
        { path: '', redirect: DEFAULT_PATH },
        ...DETAIL_ROUTES.map((d) => ({ path: d.path.slice(1), name: d.name, component: d.view, meta: { title: d.title, screen: d.parent } })),
        ...SCREENS.map((s) => ({ path: s.path.slice(1), name: s.key, component: s.view ?? PlannedView, meta: { title: s.label, screen: s.key } })),
        // Eski yer tutucu yolları (/plan/<anahtar>) kalıcı yola yönlenir.
        { path: 'plan/:key', redirect: (to: { params: Record<string, unknown> }) => SCREENS.find((s) => s.key === to.params.key)?.path ?? DEFAULT_PATH },
        { path: ':rest(.*)*', redirect: DEFAULT_PATH },
      ],
    },
  ],
})

/** Açılışta me yanıtını bekle (booting), sonra karar ver. */
function settled() {
  return new Promise<void>((resolve) => {
    if (session.state.status !== 'booting') return resolve()
    const stop = watch(
      () => session.state.status,
      (s) => {
        if (s !== 'booting') {
          stop()
          resolve()
        }
      },
    )
  })
}

router.beforeEach(async (to) => {
  await settled()
  const signedIn = session.state.status === 'signedIn'
  if (!to.meta.public && !signedIn) return { name: 'login', query: to.fullPath !== '/' ? { r: to.fullPath } : {} }
  if (to.name === 'login' && signedIn) return typeof to.query.r === 'string' && to.query.r.startsWith('/') ? to.query.r : '/'
  return true
})

router.afterEach((to, from, failure) => {
  document.title = `${(to.meta.title as string) ?? 'Yönetim'} · Entegrasyonik Yönetim`
  // bo-wdg: ekran değişince odak içerik bölgesine (`#bo-main`, tabindex=-1) taşınır — klavye/ekran okuyucu yeni sayfanın
  // başından devam eder, mobilde kapanan çekmecede kalmaz. İlk açılış, yalnız sorgu/çapa değişimi (süzgeç, sekme,
  // `#bölüm`) ve iptal edilen gezinme hariç; kaydırma `scrollBehavior`'da kalır (`preventScroll`).
  if (failure || from === START_LOCATION || to.path === from.path) return
  void nextTick(() => {
    const main = document.getElementById('bo-main')
    main?.focus({ preventScroll: true })
  })
})

// Oturum düşerse (401 / MFA_REQUIRED) giriş ekranına dön; geri dönüş yolunu koru.
watch(
  () => session.state.status,
  (status, previous) => {
    const current = router.currentRoute.value
    // Açılış (booting → signedOut) ilk gezinme bitmeden gelir: o an `current` henüz hedef rota değildir; korumayı beforeEach yapar.
    if (status === 'signedOut' && previous && previous !== 'signedOut' && previous !== 'booting' && !current.meta.public) {
      router.replace({ name: 'login', query: { r: current.fullPath } })
    }
    if (status === 'signedIn' && current.name === 'login') {
      const r = current.query.r
      router.replace(typeof r === 'string' && r.startsWith('/') ? r : '/')
    }
  },
)
