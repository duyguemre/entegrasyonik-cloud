import '@entegrasyonik/ui/styles'
import './styles/backoffice.css'
import { createApp } from 'vue'
import { createEkVuetify } from '@entegrasyonik/ui/theme'
import App from './App.vue'
import { initApi, api } from './api'
import { session } from './auth/session'
import { requestReauth } from './auth/reauth'
import { initialThemeMode } from './theme'

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
  void session.boot()
  app.mount('#app')
}

void bootstrap()
