// KÖPRÜ: iki uygulamanın ortak stil katmanı, uygulamadakiyle AYNI kademe sırası (frontend/src/main.ts):
// Vuetify çekirdek → token CSS değişkenleri → türev değişkenler → Vuetify override katmanı → Inter.
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import '../../../../src/design/vuetify-font-overrides.css'
import '../../../../src/design/tokens/dist/tokens.app.css'
import '../../../../src/design/app.css'
import '../../../../src/design/vuetify-overrides.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
