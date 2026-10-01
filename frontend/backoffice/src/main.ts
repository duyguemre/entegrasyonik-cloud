import '@entegrasyonik/ui/styles'
import './styles/backoffice.css'
import './styles/mobile.css'
import { createApp } from 'vue'
import { createEkVuetify } from '@entegrasyonik/ui/theme'
import App from './App.vue'
import { initApi, api } from './api'
import { session } from './auth/session'
import { requestReauth } from './auth/reauth'
import { initialThemeMode } from './theme'
import { onNativePushOpen } from '@entegrasyonik/ui/native'

async function bootstrap() {
  await initApi()
  api.setHooks({
    onUnauthenticated: () => session.dispatch({ type: 'SESSION_EXPIRED' }),
    onMfaRequired: () => session.dispatch({ type: 'MFA_REQUIRED' }),
    requestReauth,
  })
  const { router } = await import('./router')
  const app = createApp(App)
  app.use(createEkVuetify({ mode: initialThemeMode() }))
  app.use(router)
  // MOB-07 — Android kabuğu: bildirime dokunulunca yalnız panel içi yola gidilir (kabuk dışında no-op).
  onNativePushOpen((path) => void router.push(path))
  void session.boot()
  app.mount('#app')
}

void bootstrap()
