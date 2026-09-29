// ADR-0014 S4b — kayıt niyeti (`/login?mode=register&plan=&interval=`) doğrulaması, site bağlantı yapılandırması
// ve seed/site ile drift koruması.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REGISTER_PLAN_CODES,
  REGISTER_PLAN_NAMES,
  parseRegisterIntent,
  isRegisterPlanCode,
} from '../src/navigation/registerIntent'
import { DEFAULT_SITE_URL, SITE_LEGAL_PATHS, resolveSiteBase, siteUrl } from '../src/config/siteLinks'
import { SCREENS } from '../src/navigation/screens'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(frontendRoot, '..')

describe('parseRegisterIntent', () => {
  it('geçerli site bağlantısı: kayıt modu + plan + aralık', () => {
    expect(parseRegisterIntent({ mode: 'register', plan: 'starter', interval: 'month' })).toEqual({
      register: true,
      plan: 'starter',
      interval: 'month',
    })
    expect(parseRegisterIntent({ mode: 'register', plan: 'growth', interval: 'year' }).plan).toBe('growth')
  })

  it('plan/interval yoksa yalnızca kayıt modu', () => {
    expect(parseRegisterIntent({ mode: 'register' })).toEqual({ register: true, plan: undefined, interval: undefined })
    expect(parseRegisterIntent({})).toEqual({ register: false, plan: undefined, interval: undefined })
    expect(parseRegisterIntent(undefined).register).toBe(false)
  })

  it('bilinmeyen/biçimsiz plan ve aralık SESSİZCE yok sayılır (enjeksiyon, kurumsal, serbest metin)', () => {
    const bad = ['enterprise', 'STARTER', 'starter ', '<script>alert(1)</script>', 'javascript:alert(1)', '//evil.com', '../x', '', 'starter,growth', '__proto__']
    for (const plan of bad) expect(parseRegisterIntent({ mode: 'register', plan }).plan, plan).toBeUndefined()
    for (const interval of ['week', 'MONTH', '', 'month;drop']) expect(parseRegisterIntent({ mode: 'register', interval }).interval, interval).toBeUndefined()
  })

  it('mode yalnızca tam "register" ise kayıt sekmesi açar', () => {
    for (const mode of ['Register', 'login', 'reg', '']) expect(parseRegisterIntent({ mode }).register, mode).toBe(false)
  })

  it('dizi değerli sorgu (tekrarlanan anahtar) ilk değerle çözülür; dizi olmayan/nesne değerler yok sayılır', () => {
    expect(parseRegisterIntent({ mode: 'register', plan: ['growth', 'evil'] }).plan).toBe('growth')
    expect(parseRegisterIntent({ mode: 'register', plan: { $ne: null } }).plan).toBeUndefined()
    expect(parseRegisterIntent({ mode: 'register', plan: 1 }).plan).toBeUndefined()
  })

  it('isRegisterPlanCode yalnızca izinli kümeyi kabul eder', () => {
    expect(REGISTER_PLAN_CODES.every((c) => isRegisterPlanCode(c))).toBe(true)
    expect(isRegisterPlanCode('enterprise')).toBe(false)
    expect(isRegisterPlanCode(undefined)).toBe(false)
  })
})

describe('drift koruması: izinli plan kümesi === plans.seed.json fiyatlı planları', () => {
  const seed = JSON.parse(readFileSync(path.join(repoRoot, 'backend/src/database/application/seed/plans.seed.json'), 'utf8'))
  const priced = (seed.plans as any[]).filter((p) => p.active && p.public && p.priceMinor > 0)

  it('kodlar eşit', () => {
    expect([...REGISTER_PLAN_CODES].sort()).toEqual(priced.map((p) => p.code).sort())
  })

  it('görünen adlar seed adlarıyla eşit', () => {
    for (const p of priced) expect(REGISTER_PLAN_NAMES[p.code as keyof typeof REGISTER_PLAN_NAMES]).toBe(p.name)
  })

  it('kayıt sonrası abonelik ekranı derin bağlantısı: izinli plan kümesiyle aynı, PII parametresi yok', () => {
    const screen = SCREENS.find((s) => s.key === 'user/SubscriptionView')!
    expect(screen.slug).toBe('subscription')
    expect(screen.urlParams).toHaveLength(1)
    expect(screen.urlParams![0]).toMatchObject({ name: 'plan', kind: 'enum' })
    expect([...(screen.urlParams![0].allowed ?? [])].sort()).toEqual([...REGISTER_PLAN_CODES].sort())
  })
})

describe('site bağlantıları (VITE_SITE_URL)', () => {
  it('geçersiz/güvensiz taban adres varsayılana düşer', () => {
    for (const raw of [undefined, null, '', '   ', 'javascript:alert(1)', 'not a url', 'ftp://x.test', 'data:text/html,x']) {
      expect(resolveSiteBase(raw as any), String(raw)).toBe(DEFAULT_SITE_URL)
    }
  })

  it('geçerli http(s) adres normalize edilir (sondaki eğik çizgi atılır)', () => {
    expect(resolveSiteBase('https://www.example.test/')).toBe('https://www.example.test')
    expect(resolveSiteBase(' http://localhost:4321 ')).toBe('http://localhost:4321')
  })

  it('yasal bağlantılar site yasal sayfalarına işaret eder ve o sayfalar repoda var', () => {
    for (const p of Object.values(SITE_LEGAL_PATHS)) {
      expect(p.startsWith('/yasal/')).toBe(true)
      expect(existsSync(path.join(repoRoot, 'site/src/pages', `${p}.astro`)), p).toBe(true)
    }
    expect(siteUrl(SITE_LEGAL_PATHS.terms, 'https://www.example.test')).toBe('https://www.example.test/yasal/kullanim-kosullari')
  })

  it('kaynakta sabit üretim alan adı gömülü değil', () => {
    const src = readFileSync(path.join(frontendRoot, 'src/config/siteLinks.ts'), 'utf8')
    expect(src).not.toMatch(/entegrasyonik\.com/)
  })
})
