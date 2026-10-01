// MOB-07 — `cap sync` sonrası: her flavor için android/app/src/<flavor>/assets/capacitor.config.json yazar (Gradle flavor kaynağı
// main'i ezer; böylece `./gradlew assembleRelease` iki APK'yı doğru adres/kimlikle birlikte üretir). Yalnız dosya yazar; ağ yok.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FLAVORS, flavorConfig } from '../shell.flavors.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const fcm = existsSync(join(root, 'android/app/google-services.json'))

for (const flavor of Object.keys(FLAVORS)) {
  const dir = join(root, 'android/app/src', flavor, 'assets')
  mkdirSync(dir, { recursive: true })
  const cfg = flavorConfig(flavor, { fcm, version })
  writeFileSync(join(dir, 'capacitor.config.json'), JSON.stringify(cfg, null, 2) + '\n')
  console.log(`[flavor] ${flavor}: ${cfg.appId} -> ${cfg.server.url ?? `paketli (${cfg.webDir})`}${fcm ? ' (FCM)' : ' (FCM yok: web push yedeği)'}`)
}
