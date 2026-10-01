// MOB-07 — TEK Capacitor yapılandırması. `cap sync` varsayılan flavor (`SHELL_FLAVOR`, yoksa app) ile main/assets'e yazar;
// `npm run sync` ardından scripts/write-flavor-configs.mjs her flavor'ın kendi assets/capacitor.config.json'unu yazar
// (Gradle productFlavors: app + backoffice; flavor kaynağı main'i ezer). Flavor tanımları: shell.flavors.mjs.
import type { CapacitorConfig } from '@capacitor/cli'
import { existsSync } from 'node:fs'
import { flavorConfig } from './shell.flavors.mjs'

const flavor = process.env.SHELL_FLAVOR || 'app'
const config = flavorConfig(flavor, { version: process.env.npm_package_version, fcm: existsSync('android/app/google-services.json') }) as CapacitorConfig

export default config
