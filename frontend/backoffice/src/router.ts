import { createRouter, createWebHistory } from 'vue-router'
import { watch } from 'vue'
import { session } from './auth/session'
import { SCREENS } from './navigation/screens'

const views: Record<string, () => Promise<unknown>> = {
  overview: () => import('./views/OverviewView.vue'),
  logs: () => import('./views/LogCenterView.vue'),
  audit: () => import('./views/AuditView.vue'),
  tenants: () => import('./views/TenantsView.vue'),
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/giris', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true, title: 'Giriş' } },
    {
      path: '/',
      component: () => import('./layouts/ShellLayout.vue'),
      children: [
        { path: '', redirect: '/genel-bakis' },
        ...SCREENS.filter((s) => s.status !== 'planned').map((s) => ({ path: s.path.slice(1), name: s.key, component: views[s.key], meta: { title: s.label } })),
        { path: 'musteriler/:tid(\\d+)', name: 'tenant', component: () => import('./views/TenantDetailView.vue'), meta: { title: 'Müşteri' } },
        { path: 'plan/:key', name: 'planned', component: () => import('./views/PlannedView.vue'), meta: { title: 'Planlanan ekran' } },
        { path: ':rest(.*)*', redirect: '/genel-bakis' },
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

router.afterEach((to) => {
  document.title = `${(to.meta.title as string) ?? 'Yönetim'} · Entegrasyonik Yönetim`
})

// Oturum düşerse (401 / MFA_REQUIRED) giriş ekranına dön; geri dönüş yolunu koru.
watch(
  () => session.state.status,
  (status, previous) => {
    const current = router.currentRoute.value
    if (status === 'signedOut' && previous && previous !== 'signedOut' && !current.meta.public) {
      router.replace({ name: 'login', query: { r: current.fullPath } })
    }
    if (status === 'signedIn' && current.name === 'login') {
      const r = current.query.r
      router.replace(typeof r === 'string' && r.startsWith('/') ? r : '/')
    }
  },
)
