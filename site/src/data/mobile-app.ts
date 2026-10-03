/**
 * APK-DL — Android uygulaması (müşteri uygulaması kabuğu, `frontend/mobile/android-shell`, flavor `app`) indirme bilgisi.
 *
 * APK derlemesi `public/indir/entegrasyonik.apk` olarak kopyalanır (ikili dosya git-ignored) ve yanına
 * `public/indir/entegrasyonik.json` ({ versionName, versionCode, sizeBytes, builtAt }) yazılır. Bu modül yalnız derleme
 * anında (sayfa frontmatter'ı) çalışır; dosya yoksa `available: false` döner ve sayfa "hazırlanıyor" durumunu gösterir.
 * Yalnız müşteri uygulaması dağıtılır — backoffice APK'sı siteye ASLA konmaz.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const APK_HREF = '/indir/entegrasyonik.apk'
export const APK_FILE_NAME = 'entegrasyonik.apk'
/** `frontend/mobile/android-shell/android/variables.gradle` → minSdkVersion 24 = Android 7.0. */
export const MIN_ANDROID = '7.0'

export interface MobileAppRelease {
  available: boolean
  versionName?: string
  sizeLabel?: string
  builtAt?: string
}

const dir = () => path.join(process.cwd(), 'public', 'indir')

function sizeLabel(bytes: number): string {
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`
}

export function getMobileAppRelease(): MobileAppRelease {
  const apk = path.join(dir(), APK_FILE_NAME)
  if (!existsSync(apk)) return { available: false }
  let meta: { versionName?: string; sizeBytes?: number; builtAt?: string } = {}
  const metaFile = path.join(dir(), 'entegrasyonik.json')
  if (existsSync(metaFile)) {
    try {
      meta = JSON.parse(readFileSync(metaFile, 'utf8'))
    } catch {
      meta = {}
    }
  }
  const bytes = statSync(apk).size
  const builtAt = meta.builtAt ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long' }).format(new Date(meta.builtAt)) : undefined
  return { available: true, versionName: meta.versionName, sizeLabel: sizeLabel(bytes), builtAt }
}
