// DESK-00 — Electron kabuğu (K36: aynı web derlemesi, ayrı önyüz yok). Güvenlik politikası: `electron/policy.js`.
// Kontrol listesi (https://www.electronjs.org/docs/latest/tutorial/security) ve statik testi:
// `tests/security/electron-hardening.test.ts`. Eski gömülü express sunucusu kaldırıldı (geliştirmede `npm run dev`, 3020).
const { app, BrowserWindow, session, shell } = require('electron/main')
const path = require('node:path')
const policy = require('./electron/policy')

const isDev = !app.isPackaged
const APP_ORIGIN = policy.appOrigin(isDev)

// Kontrol listesi 4: tüm renderer'lar sandbox'ta.
app.enableSandbox()

function openExternal(url) {
  if (policy.isExternalOpenable(url, isDev)) shell.openExternal(url)
}

/** Ana pencere ve açılır pencereler için ortak sertleştirme (gezinme, yeni pencere, webview). */
function hardenContents(contents) {
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler((details) => {
    const decision = policy.classifyWindowOpen(details, isDev)
    if (decision === 'popup' && contents.getType() === 'window' && !contents.opener) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: { ...policy.SECURE_WEB_PREFERENCES }, // preload YOK
        },
      }
    }
    if (decision !== 'deny') openExternal(details.url)
    return { action: 'deny' }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      ...policy.SECURE_WEB_PREFERENCES,
      preload: path.join(__dirname, 'electron', 'preload.js'),
    },
  })
  win.once('ready-to-show', () => win.show())

  // Kontrol listesi 13: ana pencere izinli origin dışına gidemez; dış bağlantı sistem tarayıcısında açılır.
  const guardNavigation = (event, url) => {
    if (policy.isAllowedOrigin(url, isDev)) return
    event.preventDefault()
    openExternal(url)
  }
  win.webContents.on('will-navigate', guardNavigation)
  win.webContents.on('will-redirect', guardNavigation)

  win.loadURL(APP_ORIGIN + '/')
}

app.on('web-contents-created', (_event, contents) => hardenContents(contents))

app.whenReady().then(async () => {
  const ses = session.defaultSession

  // MOB-01: service worker masaüstünde kapalı (aynı derleme; `registerServiceWorker.ts` de atlar). Eski kayıtlar temizlenir.
  await ses.clearStorageData({ storages: ['serviceworkers'] }).catch(() => {})

  // Kontrol listesi 5 + 6: izin istekleri varsayılan RED; yalnız izinli origin + küçük liste.
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(policy.isPermissionAllowed(permission, details.requestingUrl || wc.getURL(), isDev))
  })
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    policy.isPermissionAllowed(permission, requestingOrigin, isDev)
  )

  // Kontrol listesi 7: uygulama origin'inden gelen belgelere zorunlu CSP.
  const csp = policy.buildCsp(isDev)
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType === 'mainFrame' && policy.isAllowedOrigin(details.url, isDev)) {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
      return
    }
    callback({ responseHeaders: details.responseHeaders })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
