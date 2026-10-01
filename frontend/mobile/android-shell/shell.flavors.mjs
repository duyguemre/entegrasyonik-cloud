// MOB-07 — Android kabuğu flavor tanımları (TEK kaynak): capacitor.config.ts, scripts/write-flavor-configs.mjs ve statik testler okur.
// Kabuk WebView'de UZAK HTTPS adresi yükler (aynı web derlemesi); yalnız izinli origin'lerde gezinir, diğer her bağlantı
// Capacitor tarafından sistem tarayıcısında açılır. Ortam değişkenleriyle (derleme anında) staging adresi verilebilir:
//   SHELL_APP_URL / SHELL_BACKOFFICE_URL  (https zorunlu; host otomatik izinli olur)
//   SHELL_MODE=bundled                   (ileride: uzak URL yerine paketli dist; API kökü ayrıca yapılandırılmalı)
export const FLAVORS = {
  app: {
    appId: 'com.entegrasyonik.app',
    appName: 'Entegrasyonik',
    url: 'https://app.entegrasyonik.com',
    urlEnv: 'SHELL_APP_URL',
    allowNavigation: ['app.entegrasyonik.com'],
    bundledWebDir: '../../dist',
  },
  backoffice: {
    appId: 'com.entegrasyonik.backoffice',
    appName: 'Entegrasyonik Yönetim',
    url: 'https://admin.entegrasyonik.com',
    urlEnv: 'SHELL_BACKOFFICE_URL',
    allowNavigation: ['admin.entegrasyonik.com'],
    bundledWebDir: '../../backoffice/dist',
  },
}

/** Yalnız bu eklentiler (native kod yok; yalnız yapılandırma). */
export const ALLOWED_PLUGINS = ['@capacitor/camera', '@capacitor/push-notifications', '@capacitor/share']

/** Uzak adres: https, kimlik bilgisi/sorgu/parça yok. Geçersizse derleme durur (sessiz http'ye düşmez). */
export function resolveUrl(flavor, env = process.env) {
  const f = FLAVORS[flavor]
  if (!f) throw new Error(`Bilinmeyen flavor: ${flavor} (app | backoffice)`)
  const raw = (env[f.urlEnv] || f.url).trim()
  let u
  try {
    u = new URL(raw)
  } catch {
    throw new Error(`${f.urlEnv} geçerli bir adres değil`)
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error(`${f.urlEnv} yalnız https://host[/yol] olabilir`)
  return u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, ''))
}

/** Bir flavor'ın Capacitor yapılandırması. `fcm`: google-services.json var mı (yalnız yerelde) — web kodu User-Agent'tan okur. */
export function flavorConfig(flavor, { env = process.env, fcm = false, version = '0.1.0' } = {}) {
  const f = FLAVORS[flavor]
  const bundled = env.SHELL_MODE === 'bundled'
  const url = resolveUrl(flavor, env)
  const host = new URL(url).hostname
  return {
    appId: f.appId,
    appName: f.appName,
    webDir: bundled ? f.bundledWebDir : 'www',
    server: {
      ...(bundled ? {} : { url }),
      androidScheme: 'https',
      cleartext: false,
      allowNavigation: [...new Set([...f.allowNavigation, ...(bundled ? [] : [host])])],
      errorPath: bundled ? undefined : 'offline.html',
    },
    android: {
      allowMixedContent: false,
      captureInput: true,
      webContentsDebuggingEnabled: false,
      // Web kodu kabuğu bununla tanır (native kod yazmadan): `EntegrasyonikShell/<sürüm> (<flavor>; fcm=0|1)`.
      appendUserAgent: `EntegrasyonikShell/${version} (${flavor}; fcm=${fcm ? 1 : 0})`,
    },
    plugins: {
      PushNotifications: { presentationOptions: ['alert', 'sound'] },
    },
  }
}
