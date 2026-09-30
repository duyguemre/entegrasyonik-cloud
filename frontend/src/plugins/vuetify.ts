/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 *
 * ADR-0026 (Aşama 0): Vuetify kurulumu (tema light+dark, bileşen varsayılanları, kırılma noktaları, TR yerel ayar,
 * MDI ikon seti) `@entegrasyonik/ui/theme` paketinden gelir — backoffice ile TEK kaynak. Uygulama yalnız kendi
 * ek bileşenini (labs VTreeview) ekler. Stil katmanı (`vuetify/styles`, Roboto→Inter, token CSS) `main.ts`'te
 * `@entegrasyonik/ui/styles` ile yüklenir. FR2-DARK: başlangıç teması `theme-boot.js` ile aynı çözümden gelir
 * (`appTheme.initialMode()`), kullanıcı tercihi kabukta bağlanır (`stores/theme.ts`).
 *
 * `label` prop'u ve `getByLabel(...)` spec çapaları DEĞİŞMEDİ (ADR-0015 Karar 5.1 Ek A).
 */
import { VTreeview } from 'vuetify/labs/VTreeview'
import { createEkVuetify } from '@entegrasyonik/ui/theme'
import { appTheme } from '@/stores/theme'

export default createEkVuetify({ components: { VTreeview }, mode: appTheme.initialMode() })
