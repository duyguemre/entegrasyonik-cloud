/**
 * İki uygulamanın aynı Vuetify kurulumu (ADR-0026 Karar 2): tema, varsayılanlar, kırılma noktaları ve TR yerel ayar
 * TEK yerden gelir — müşteri uygulamasının `plugins/vuetify.ts`'i ve backoffice bunu çağırır.
 */
import { createVuetify } from 'vuetify'
import { tr } from 'vuetify/locale'
import { vuetifyDefaults } from './defaults'
import { darkTheme, lightTheme, THEME_NAMES, type ThemeMode } from './themes'

export interface CreateEkVuetifyOptions {
  mode?: ThemeMode
  /** Uygulamaya özgü ek Vuetify bileşenleri (ör. labs VTreeview). */
  components?: Record<string, unknown>
}

export function createEkVuetify(options: CreateEkVuetifyOptions = {}) {
  return createVuetify({
    components: options.components as never,
    locale: { locale: 'tr', fallback: 'en', messages: { tr } },
    icons: { defaultSet: 'mdi' },
    defaults: vuetifyDefaults,
    display: { thresholds: { xs: 0, sm: 600, md: 960, lg: 1600, xl: 1920 } },
    theme: {
      defaultTheme: THEME_NAMES[options.mode ?? 'light'],
      themes: { [THEME_NAMES.light]: lightTheme, [THEME_NAMES.dark]: darkTheme },
    },
  })
}
