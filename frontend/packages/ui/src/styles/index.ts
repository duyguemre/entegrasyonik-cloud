// Ortak stil katmanı (iki uygulama aynı kademe sırasıyla alır):
// Vuetify çekirdek → Vuetify Roboto→Inter → token CSS değişkenleri → türev değişkenler → Vuetify override katmanı → Inter.
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import './vuetify-font-overrides.css'
import '../tokens/dist/tokens.app.css'
import './app.css'
import './vuetify-overrides.css'
import './touch.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
