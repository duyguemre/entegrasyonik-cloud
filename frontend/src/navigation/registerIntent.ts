/**
 * frontend/src/navigation/registerIntent.ts
 *
 * ADR-0014 Karar 2 — tanıtım sitesinden gelen kayıt niyeti: `/login?mode=register&plan=<kod>&interval=<month|year>`.
 * SAF TS (vue/vuetify/router import'u YOK). Parametre sözleşmesi ve doğrulama disiplini ADR-0012'nin
 * `redirect` kuralıyla aynıdır: URL'den gelen değer ASLA olduğu gibi kullanılmaz; yalnızca KAPALI
 * bir izinli değer kümesine eşleşirse kabul edilir, aksi halde SESSİZCE yok sayılır (enjeksiyon,
 * açık yönlendirme ve serbest metin yok; PII URL'ye yazılmaz).
 *
 * İzinli plan kümesi `backend/src/database/application/seed/plans.seed.json` içindeki FİYATLI
 * (`priceMinor > 0`) plan kodlarıyla birebir eşit tutulur — `tests/register-intent.test.ts` seed'i
 * okuyup drift'i yakalar. Kurumsal (özel teklif) planı kayıt akışıyla seçilemez (site -> /iletisim).
 */

export const REGISTER_PLAN_CODES = ['starter', 'growth'] as const
export type RegisterPlanCode = (typeof REGISTER_PLAN_CODES)[number]

/** Kullanıcıya gösterilen adlar (seed `name` alanlarıyla eşit — testle korunur). */
export const REGISTER_PLAN_NAMES: Record<RegisterPlanCode, string> = {
  starter: 'Başlangıç',
  growth: 'Büyüme',
}

export const REGISTER_INTERVALS = ['month', 'year'] as const
export type RegisterInterval = (typeof REGISTER_INTERVALS)[number]

export interface RegisterIntent {
  /** `mode=register` verildi mi (kayıt sekmesi açılır). */
  register: boolean
  /** Yalnızca izinli plan kodu; aksi halde `undefined`. */
  plan?: RegisterPlanCode
  /** Yalnızca `month|year`; aksi halde `undefined`. */
  interval?: RegisterInterval
}

const first = (value: unknown): string | undefined => {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' ? v : undefined
}

export function isRegisterPlanCode(value: unknown): value is RegisterPlanCode {
  return typeof value === 'string' && (REGISTER_PLAN_CODES as readonly string[]).includes(value)
}

/** `route.query`'den kayıt niyetini çıkarır; bilinmeyen/biçimsiz her değer yok sayılır. */
export function parseRegisterIntent(query: Record<string, unknown> | undefined): RegisterIntent {
  const q = query ?? {}
  const plan = first(q.plan)
  const interval = first(q.interval)
  return {
    register: first(q.mode) === 'register',
    plan: isRegisterPlanCode(plan) ? plan : undefined,
    interval: (REGISTER_INTERVALS as readonly string[]).includes(interval ?? '') ? (interval as RegisterInterval) : undefined,
  }
}
