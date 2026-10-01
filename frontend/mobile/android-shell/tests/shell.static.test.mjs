// MOB-07 — Android kabuğu statik testleri (Android SDK gerektirmez): izinli origin'ler, eklenti listesi, sırların git dışında
// kalması, flavor kimlikleri, native kodun yalnız Capacitor iskeleti olması. Çalıştır: `npm test` (node --test).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALLOWED_PLUGINS, FLAVORS, flavorConfig, resolveUrl } from '../shell.flavors.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })

test('iki flavor, iki ayrı paket kimliği; Gradle flavorları aynı kimlikleri taşır', () => {
  assert.deepEqual(Object.keys(FLAVORS).sort(), ['app', 'backoffice'])
  const ids = Object.values(FLAVORS).map((f) => f.appId)
  assert.equal(new Set(ids).size, 2)
  const gradle = read('android/app/build.gradle')
  for (const [name, f] of Object.entries(FLAVORS)) {
    assert.match(gradle, new RegExp(`${name} \\{[^}]*applicationId '${f.appId.replace(/\./g, '\\.')}'`), `${name} flavor`)
  }
})

test('izinli origin: yalnız https, uzak adresin host\'u izinli listede, joker yok; düz metin/karma içerik/hata ayıklama kapalı', () => {
  for (const flavor of Object.keys(FLAVORS)) {
    const c = flavorConfig(flavor, { env: {} })
    const u = new URL(c.server.url)
    assert.equal(u.protocol, 'https:')
    assert.ok(c.server.allowNavigation.includes(u.hostname), `${flavor}: ${u.hostname} izinli değil`)
    for (const h of c.server.allowNavigation) {
      assert.match(h, /^[a-z0-9.-]+\.entegrasyonik\.com$/, `${flavor}: izinli host yalnız entegrasyonik.com alt alanı (${h})`)
      assert.ok(!h.includes('*'), 'joker yok')
    }
    assert.equal(c.server.cleartext, false)
    assert.equal(c.server.androidScheme, 'https')
    assert.equal(c.android.allowMixedContent, false)
    assert.equal(c.android.webContentsDebuggingEnabled, false)
  }
  // Uygulama kabuğu backoffice'e (ve tersi) gezinemez
  assert.ok(!flavorConfig('app', { env: {} }).server.allowNavigation.includes('admin.entegrasyonik.com'))
  assert.ok(!flavorConfig('backoffice', { env: {} }).server.allowNavigation.includes('app.entegrasyonik.com'))
})

test('env ile staging adresi: yalnız https; http/kimlik bilgisi/sorgu reddedilir; host izinli listeye eklenir', () => {
  const c = flavorConfig('app', { env: { SHELL_APP_URL: 'https://staging.entegrasyonik.com' } })
  assert.equal(c.server.url, 'https://staging.entegrasyonik.com')
  assert.ok(c.server.allowNavigation.includes('staging.entegrasyonik.com'))
  for (const bad of ['http://app.entegrasyonik.com', 'https://u:p@app.entegrasyonik.com', 'https://app.entegrasyonik.com/?x=1', 'javascript:alert(1)', 'bozuk']) {
    assert.throws(() => resolveUrl('app', { SHELL_APP_URL: bad }), undefined, bad)
  }
})

test('paketli dist seçeneği (ileride): uzak adres yok, webDir flavor derlemesi', () => {
  const c = flavorConfig('backoffice', { env: { SHELL_MODE: 'bundled' } })
  assert.equal(c.server.url, undefined)
  assert.equal(c.webDir, '../../backoffice/dist')
})

test('kabuk User-Agent işareti: flavor + FCM durumu (web köprüsü bunu okur)', () => {
  assert.equal(flavorConfig('app', { env: {}, fcm: false, version: '1.2.3' }).android.appendUserAgent, 'EntegrasyonikShell/1.2.3 (app; fcm=0)')
  assert.equal(flavorConfig('backoffice', { env: {}, fcm: true, version: '1.2.3' }).android.appendUserAgent, 'EntegrasyonikShell/1.2.3 (backoffice; fcm=1)')
})

test('eklentiler YALNIZ Camera, Push, Share (package.json)', () => {
  const pkg = JSON.parse(read('package.json'))
  const plugins = Object.keys(pkg.dependencies).filter((d) => d.startsWith('@capacitor/') && !['@capacitor/core', '@capacitor/android'].includes(d))
  assert.deepEqual(plugins.sort(), [...ALLOWED_PLUGINS].sort())
  assert.deepEqual(Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@capacitor/')), [], 'Capacitor dışı çalışma zamanı bağımlılığı yok')
})

test('native kod yalnız Capacitor iskeleti: tek boş MainActivity; izinler INTERNET + CAMERA; yedekleme kapalı', () => {
  const javaDir = join(root, 'android/app/src')
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]))
  const sources = walk(javaDir).filter((f) => /\.(java|kt)$/.test(f)).map((f) => relative(root, f))
  assert.deepEqual(sources, ['android/app/src/main/java/com/entegrasyonik/app/MainActivity.java'])
  assert.match(read(sources[0]), /public class MainActivity extends BridgeActivity \{\s*\}/)
  const manifest = read('android/app/src/main/AndroidManifest.xml')
  const perms = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort()
  assert.deepEqual(perms, ['android.permission.CAMERA', 'android.permission.INTERNET'])
  assert.match(manifest, /android:allowBackup="false"/)
  assert.match(manifest, /android:usesCleartextTraffic="false"/)
})

test('sırlar git dışında: google-services.json, keystore, imzalama özellikleri ignore; örnek dosya izlenir', () => {
  const secrets = ['android/app/google-services.json', 'android/keystore.properties', 'android/entegrasyonik-release.jks', 'android/app/x.keystore', 'google-services.json', 'android/app/build/outputs/apk/app/release/app-app-release.apk']
  for (const p of secrets) assert.doesNotThrow(() => git('check-ignore', '-q', p), `${p} ignore edilmeli`)
  assert.throws(() => git('check-ignore', '-q', 'android/keystore.properties.example'), undefined, 'örnek dosya izlenmeli')
  const tracked = git('ls-files', '.').split('\n')
  assert.deepEqual(tracked.filter((f) => /google-services\.json$|\.jks$|\.keystore$|(^|\/)keystore\.properties$/.test(f)), [])
  assert.ok(existsSync(join(root, 'android/keystore.properties.example')))
})

test('sabit sır/anahtar yok: yapılandırma ve Gradle dosyalarında parola/özel anahtar değeri bulunmaz', () => {
  for (const p of ['shell.flavors.mjs', 'capacitor.config.ts', 'android/app/build.gradle', 'android/gradle.properties']) {
    assert.doesNotMatch(read(p), /(storePassword|keyPassword)\s*[=:]\s*['"][^'"$]/, p)
    assert.doesNotMatch(read(p), /BEGIN (RSA |EC )?PRIVATE KEY|AIza[0-9A-Za-z_-]{20,}/, p)
  }
})
