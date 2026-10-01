// DESK-00 — Electron güvenlik kontrol listesi (statik + politika birim testi).
// Kaynak: https://www.electronjs.org/docs/latest/tutorial/security (madde numaraları yorumlarda).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// Windows'ta autocrlf çalışma kopyası CRLF olur; içerik iddiaları LF üzerinden.
const read = (p: string) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n')
const require = createRequire(import.meta.url)
const policy = require(resolve(root, 'electron/policy.js'))
const pkg = JSON.parse(read('package.json'))
const main = read('main.js')
const stripComments = (src: string) => src.replace(/^\s*\/\/.*$/gm, '')
const preload = stripComments(read('electron/preload.js'))
const forge = read('forge.config.js')

describe('Electron sürümü', () => {
  it('güncel ana sürüm (>= 44) — 29.x onlarca güvenlik danışmasına açıktı', () => {
    const major = Number(String(pkg.devDependencies.electron).replace(/^[^\d]*/, '').split('.')[0])
    expect(major).toBeGreaterThanOrEqual(44)
  })
  it('gömülü express sunucusu kaldırıldı (bağımlılık + main.js)', () => {
    expect(pkg.dependencies.express).toBeUndefined()
    expect(main).not.toMatch(/require\(['"]express['"]\)|\.listen\(/)
  })
})

describe('webPreferences (madde 2-4, 8-9)', () => {
  it('contextIsolation, sandbox açık; nodeIntegration, webview, güvensiz içerik kapalı', () => {
    expect(policy.SECURE_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
    })
    expect(Object.isFrozen(policy.SECURE_WEB_PREFERENCES)).toBe(true)
  })
  it('main.js tüm pencereleri ortak tercihle kurar ve sandbox\'ı genel açar', () => {
    expect(main).toContain('app.enableSandbox()')
    expect(main).toMatch(/\.\.\.policy\.SECURE_WEB_PREFERENCES/)
    expect(main).not.toMatch(/nodeIntegration\s*:\s*true|contextIsolation\s*:\s*false|sandbox\s*:\s*false|webSecurity\s*:\s*false/)
  })
  it('<webview> eklenemez', () => {
    expect(main).toMatch(/will-attach-webview[\s\S]{0,60}preventDefault/)
  })
})

describe('preload — dar yüzey', () => {
  it('yalnız salt-okunur bayrak; ipcRenderer/Node API açılmaz', () => {
    expect(preload).toContain("exposeInMainWorld(\n  'entegrasyonikDesktop'")
    expect(preload).toContain('Object.freeze')
    expect(preload).not.toMatch(/ipcRenderer|require\(['"](fs|node:fs|child_process|node:child_process|path)['"]\)|shell/)
  })
})

describe('origin ve gezinme (madde 13-15)', () => {
  it('üretimde yalnız app.entegrasyonik.com, geliştirmede yalnız localhost:3020', () => {
    expect(policy.appOrigin(false)).toBe('https://app.entegrasyonik.com')
    expect(policy.appOrigin(true)).toBe('http://localhost:3020')
    expect(policy.isAllowedOrigin('https://app.entegrasyonik.com/orders', false)).toBe(true)
    expect(policy.isAllowedOrigin('https://app.entegrasyonik.com.evil.com/', false)).toBe(false)
    expect(policy.isAllowedOrigin('http://app.entegrasyonik.com/', false)).toBe(false)
    expect(policy.isAllowedOrigin('http://localhost:3020/', false)).toBe(false)
    expect(policy.isAllowedOrigin('http://localhost:3000/', true)).toBe(false)
    expect(policy.isAllowedOrigin('file:///etc/passwd', true)).toBe(false)
    expect(policy.isAllowedOrigin('not a url', true)).toBe(false)
  })
  it('main.js gezinmeyi ve yönlendirmeyi korur, uzak içerik yalnız izinli origin', () => {
    expect(main).toMatch(/'will-navigate', guardNavigation/)
    expect(main).toMatch(/'will-redirect', guardNavigation/)
    expect(main).toMatch(/win\.loadURL\(APP_ORIGIN/)
    expect(main).not.toMatch(/loadFile|file:\/\//)
  })
  it('yeni pencere: düz bağlantı sistem tarayıcısına, OAuth/yazdırma açılır pencere, diğerleri red', () => {
    const c = (url: string, disposition = 'foreground-tab', dev = false) => policy.classifyWindowOpen({ url, disposition }, dev)
    expect(c('https://kargo.example/takip/1')).toBe('external')
    expect(c('https://auth.ideasoft.example/oauth', 'new-window')).toBe('popup')
    expect(c('about:blank', 'new-window')).toBe('popup')
    expect(c('http://insecure.example/')).toBe('deny')
    expect(c('http://localhost:5001/x', 'foreground-tab', true)).toBe('external')
    expect(c('file:///C:/Windows/system32/calc.exe')).toBe('deny')
    expect(c('javascript:alert(1)')).toBe('deny')
    expect(c('ms-msdt:/id')).toBe('deny')
    expect(c('mailto:destek@entegrasyonik.com')).toBe('external')
  })
  it('shell.openExternal yalnız doğrulanmış adresle çağrılır (madde 15)', () => {
    expect(main).toMatch(/if \(policy\.isExternalOpenable\(url, isDev\)\) shell\.openExternal\(url\)/)
    expect(main.match(/shell\.openExternal\(/g)).toHaveLength(1)
    expect(policy.isExternalOpenable('file:///etc/passwd', false)).toBe(false)
    expect(policy.isExternalOpenable('smb://host/share', false)).toBe(false)
  })
  it('açılır pencereler preload almaz ve kendi açılır penceresini açamaz', () => {
    expect(main).toMatch(/overrideBrowserWindowOptions[\s\S]{0,160}webPreferences: \{ \.\.\.policy\.SECURE_WEB_PREFERENCES \}/)
    expect(main).toMatch(/!contents\.opener/)
  })
})

describe('izinler (madde 5-6)', () => {
  it('varsayılan red; yalnız izinli origin + küçük liste', () => {
    expect(main).toContain('setPermissionRequestHandler')
    expect(main).toContain('setPermissionCheckHandler')
    expect(policy.isPermissionAllowed('clipboard-sanitized-write', 'https://app.entegrasyonik.com/', false)).toBe(true)
    for (const p of ['media', 'geolocation', 'notifications', 'openExternal', 'usb', 'hid', 'serial']) {
      expect(policy.isPermissionAllowed(p, 'https://app.entegrasyonik.com/', false)).toBe(false)
    }
    expect(policy.isPermissionAllowed('fullscreen', 'https://evil.example/', false)).toBe(false)
  })
})

describe('CSP (madde 7)', () => {
  it('main.js ana belgeye zorunlu CSP ekler', () => {
    expect(main).toMatch(/'Content-Security-Policy': \[csp\]/)
    expect(main).toMatch(/resourceType === 'mainFrame' && policy\.isAllowedOrigin/)
  })
  it('üretim CSP: eval ve satır içi betik yok, nesne yok, çerçevelenemez', () => {
    const csp = policy.buildCsp(false)
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/)
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain('connect-src \'self\' https://*.entegrasyonik.com')
    expect(csp).not.toMatch(/localhost|127\.0\.0\.1/)
  })
  it('vue-i18n JIT derleme açık (CSP\'de unsafe-eval gerekmez)', () => {
    expect(read('vite.config.mts')).toMatch(/__INTLIFY_JIT_COMPILATION__: true/)
  })
})

describe('paketleme sigortaları (madde 19-20 / fuses)', () => {
  it('RunAsNode kapalı, asar bütünlüğü + yalnız asar', () => {
    expect(forge).toMatch(/RunAsNode\]: false/)
    expect(forge).toMatch(/EnableNodeOptionsEnvironmentVariable\]: false/)
    expect(forge).toMatch(/EnableNodeCliInspectArguments\]: false/)
    expect(forge).toMatch(/EnableEmbeddedAsarIntegrityValidation\]: true/)
    expect(forge).toMatch(/OnlyLoadAppFromAsar\]: true/)
    expect(forge).toMatch(/asar: true/)
  })
})

describe('service worker masaüstünde kapalı (MOB-01)', () => {
  it('main.js eski SW kayıtlarını temizler, kayıt modülü masaüstünü atlar', () => {
    expect(main).toMatch(/clearStorageData\(\{ storages: \['serviceworkers'\] \}\)/)
    expect(read('src/registerServiceWorker.ts')).toMatch(/!isDesktopShell\(\)/)
    expect(read('src/pwa/pwaState.ts')).toMatch(/entegrasyonikDesktop\?\.isDesktop/)
  })
})
