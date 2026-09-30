/**
 * Ortam kimliği (BO_UI_PATTERNS §1.2): üst bar ve giriş ekranı aynı kaynaktan. Üretim ve staging dolu renkle ve üst
 * kenar şeridiyle belirgin — yanlış ortamda işlem yapma riski. Yalnız geliştirmede `?env=staging|production` önizler.
 */
import { USE_MOCK } from '@bo/api'

export type EnvKey = 'mock' | 'local' | 'staging' | 'production'
export interface EnvInfo {
  key: EnvKey
  label: string
  icon: string
  hint: string
}

const ENV: Record<EnvKey, EnvInfo> = {
  mock: { key: 'mock', label: 'Örnek veri', icon: 'mdi-flask-outline', hint: 'Sahte /admin-api — gerçek müşteri verisi yok' },
  local: { key: 'local', label: 'Yerel', icon: 'mdi-laptop', hint: 'Yerel backend' },
  staging: { key: 'staging', label: 'Staging', icon: 'mdi-test-tube', hint: 'Test ortamı — gerçek müşteri yok, veriler sıfırlanabilir' },
  production: { key: 'production', label: 'Üretim', icon: 'mdi-alert-octagon-outline', hint: 'Canlı ortam — işlemler gerçek müşterileri etkiler' },
}

const devOverride = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('env') : null
const key = (devOverride ?? (USE_MOCK ? 'mock' : (import.meta.env.VITE_ADMIN_ENV ?? 'local'))) as EnvKey

export const currentEnv: EnvInfo = ENV[key] ?? ENV.local
