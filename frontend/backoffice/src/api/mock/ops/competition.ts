/**
 * Sahte rekabet ayarı uçları (PRC-CFG): BackofficeBillingService/{getCompetitionSettings, getTenantCompetition, setCompetitionOverride}.
 * Plan varsayılanı/bütçe/gölge mod `_platform` yayınlanmış değerlerinden okunur (platform mock'u) — yayın sonrası ekran değişir.
 * Tenant istisnası bellekte tutulur. setCompetitionOverride adım-yükseltmesi istemez (backend REAUTH_RPCS'te yok) ama gerekçe ≥10.
 */
import type { CompetitionField, CompetitionOverride, EffectiveCompetition, SubscriptionRow } from '../../contract'
import { MockHttpError } from '../errors'
import { DAY, UNHANDLED, iso, strict, tenantName, validation, type MockCtx, type MockDomain } from './context'
import { BUDGET_KEY, COMPETITION_LIMITS, PLAN_CODES, PLAN_DEFAULTS, PRICING_RULES_FLAG, PRIORITIES, SHADOW_KEY, planKey } from './competitionCatalog'

const FIELDS: CompetitionField[] = ['skuCap', 'refreshMin', 'freshnessMin', 'priority']
interface Stored { override: CompetitionOverride; note: string | null; updatedAt: number }

export function createCompetitionMock(t0: number, upstream: MockDomain, platform: MockDomain): MockDomain {
  const stored = new Map<number, Stored>([
    [101, { override: { skuCap: 2500, priority: 'stocked_only' }, note: 'Pilot müşteri: katalog büyük, yalnız stoklu ürünler izlensin', updatedAt: t0 - 3 * DAY }],
    [104, { override: { refreshMin: 60 }, note: null, updatedAt: t0 - 11 * DAY }],
  ])

  const published = (ctx: MockCtx) => {
    const eff = platform.handle('IntegrationConfigService/getEffectiveConfig', { target: '_platform' }, ctx) as { values: Array<{ key: string; value: unknown }> }
    const map = new Map(eff.values.map((v) => [v.key, v.value]))
    return (key: string) => map.get(key)
  }
  const sub = (tid: unknown, ctx: MockCtx): SubscriptionRow => {
    const n = Number(tid)
    if (!Number.isInteger(n) || n < 1) throw validation('tid', 'pozitif tam sayı')
    // Abonelik aramasını faturalama mock'una bırak (yok → 404 SUBSCRIPTION_NOT_FOUND).
    const res = upstream.handle('BackofficeBillingService/getSubscription', { tid: n }, ctx) as { subscription: SubscriptionRow }
    return res.subscription
  }
  const planFor = (code: string | null, exempt: boolean) => ((PLAN_CODES as readonly string[]).includes(code ?? '') ? (code as (typeof PLAN_CODES)[number]) : exempt ? 'growth' : 'starter')

  function planRow(plan: (typeof PLAN_CODES)[number], read: (k: string) => unknown) {
    const d = PLAN_DEFAULTS[plan]
    const num = (f: 'skuCap' | 'refreshMin' | 'freshnessMin') => (typeof read(planKey(plan, f)) === 'number' ? (read(planKey(plan, f)) as number) : d[f])
    const pr = read(planKey(plan, 'priority'))
    return {
      plan,
      skuCap: num('skuCap'),
      refreshMin: num('refreshMin'),
      freshnessMin: num('freshnessMin'),
      priority: (PRIORITIES as readonly string[]).includes(pr as string) ? (pr as (typeof PRIORITIES)[number]) : d.priority,
      keys: { skuCap: planKey(plan, 'skuCap'), refreshMin: planKey(plan, 'refreshMin'), freshnessMin: planKey(plan, 'freshnessMin'), priority: planKey(plan, 'priority') },
    }
  }
  function effective(s: SubscriptionRow, ov: CompetitionOverride, read: (k: string) => unknown): EffectiveCompetition {
    const plan = planFor(s.planCode, s.billingExempt)
    const base = planRow(plan, read)
    const out: EffectiveCompetition = {
      plan, planCode: s.planCode, skuCap: base.skuCap, refreshMin: base.refreshMin, freshnessMin: base.freshnessMin, priority: base.priority,
      sources: { skuCap: 'plan', refreshMin: 'plan', freshnessMin: 'plan', priority: 'plan' },
    }
    for (const f of FIELDS) {
      if (ov[f] === undefined) continue
      ;(out as unknown as Record<string, unknown>)[f] = ov[f]
      out.sources[f] = 'tenant'
    }
    return out
  }

  function parseOverride(raw: unknown): CompetitionOverride | null {
    if (raw === null) return null
    if (typeof raw !== 'object' || Array.isArray(raw)) throw validation('override', 'nesne ya da null')
    const o = raw as Record<string, unknown>
    // zod gibi TÜM alan hatalarını birlikte döndürür (ekran hepsini alanın yanında gösterir).
    const fields: Array<{ path: string; message: string }> = []
    const out: CompetitionOverride = {}
    for (const k of Object.keys(o)) if (!FIELDS.includes(k as CompetitionField)) fields.push({ path: `override.${k}`, message: 'bilinmeyen alan' })
    for (const f of ['skuCap', 'refreshMin', 'freshnessMin'] as const) {
      if (o[f] === undefined) continue
      const r = COMPETITION_LIMITS[f]
      if (!Number.isInteger(o[f]) || (o[f] as number) < r.min || (o[f] as number) > r.max) fields.push({ path: `override.${f}`, message: `${r.min}–${r.max} arası tam sayı olmalı` })
      else out[f] = o[f] as number
    }
    if (o.priority !== undefined) {
      if (!(PRIORITIES as readonly string[]).includes(o.priority as string)) fields.push({ path: 'override.priority', message: 'changed_first | stocked_only | oldest_first' })
      else out.priority = o.priority as CompetitionOverride['priority']
    }
    if (fields.length) throw new MockHttpError(400, 'VALIDATION', 'Geçersiz istek.', fields)
    return out
  }

  return {
    handle(op, body, ctx) {
      switch (op) {
        // PRC-R2: fiyat kuralları — yalnız TOPLAM sayaç (tenant verisi yok); kill-switch yayınlanmış `features.pricingRules`'tan.
        case 'BackofficeBillingService/getPricingRulesOverview': {
          strict(body, [])
          const read = published(ctx)
          return {
            killSwitch: { key: PRICING_RULES_FLAG, enabled: read(PRICING_RULES_FLAG) === true, label: { tr: 'Fiyat kuralları (onaylı öneri)', en: 'Pricing rules (approved suggestions)' }, help: null },
            autoApply: { available: false, reason: 'PRC-R3' },
            at: iso(t0),
            scannedTenants: 6, tenantsEnabled: 2, tenantsWithRules: 2,
            rules: { total: 5, enabled: 4, pausedExternal: 1, pausedOscillation: 0 },
            suggestions: { open: 37, blocked: 9, applied7d: 64, dismissed7d: 12 },
            failedTenants: 0, truncated: false,
          }
        }
        case 'BackofficeBillingService/getCompetitionSettings': {
          strict(body, [])
          const read = published(ctx)
          return {
            plans: PLAN_CODES.map((p) => planRow(p, read)),
            budgets: [{ channel: 'trendyol', perMin: typeof read(BUDGET_KEY) === 'number' ? (read(BUDGET_KEY) as number) : 60, key: BUDGET_KEY }],
            notify: { shadow: read(SHADOW_KEY) !== false, cooldownHours: 24 },
            overrides: [...stored.entries()].sort((a, b) => a[0] - b[0]).map(([tid, st]) => {
              const s = sub(tid, ctx)
              return { tid, tenantName: tenantName(ctx, tid), planCode: s.planCode, override: st.override, effective: effective(s, st.override, read), updatedAt: iso(st.updatedAt), note: st.note }
            }),
            limits: COMPETITION_LIMITS,
            priorities: [...PRIORITIES],
          }
        }
        case 'BackofficeBillingService/getTenantCompetition': {
          strict(body, ['tid'])
          const s = sub(body.tid, ctx)
          const st = stored.get(s.tid)
          return { tid: s.tid, planCode: s.planCode, billingExempt: s.billingExempt, override: st?.override ?? {}, effective: effective(s, st?.override ?? {}, published(ctx)) }
        }
        case 'BackofficeBillingService/setCompetitionOverride': {
          strict(body, ['tid', 'override', 'note', 'reason'])
          if (typeof body.reason !== 'string' || body.reason.trim().length < 10) throw validation('reason', 'en az 10 karakter')
          if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 280)) throw validation('note', 'en çok 280 karakter')
          const parsed = parseOverride(body.override)
          const s = sub(body.tid, ctx)
          const read = published(ctx)
          const before = stored.get(s.tid)?.override ?? {}
          const clear = parsed === null || Object.keys(parsed).length === 0
          if (clear) stored.delete(s.tid)
          else stored.set(s.tid, { override: parsed!, note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null, updatedAt: ctx.now })
          const after = stored.get(s.tid)?.override ?? {}
          return { tid: s.tid, cleared: clear, before, after, effective: effective(s, after, read) }
        }
      }
      return UNHANDLED
    },
  }
}
