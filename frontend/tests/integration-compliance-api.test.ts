// ADR-0018 Karar 2 "Konsol" — `useIntegrationComplianceApi.ts` saf yardımcıları + status-map ek haritaları.
// Backend sözleşmesi (`backend/src/api/services/integration-compliance-service.ts`, `FindingService.ts`,
// `models/IntegrationFinding.ts`) SALT OKUNUR kanıt olarak okunur: FE sabitleri onunla birebir kalmalı.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FINDING_KINDS, FINDING_SEVERITIES, FINDING_SOURCES, FINDING_STATUSES, INTEGRATION_CATEGORIES,
  STATUS_BY_ACTION, TRANSITION_ACTIONS, TRANSITION_LIMITS,
  availableActions, buildListBody, buildTransitionBody, validateTransition,
} from '../src/components/adminPanel/integrations/useIntegrationComplianceApi'
import { FINDING_SEVERITY_TONE, FINDING_STATUS_TONE, JOB_RUN_OUTCOME_TONE } from '../src/design/status-map'

const backendRoot = resolve(__dirname, '../../backend/src')
const read = (rel: string) => readFileSync(resolve(backendRoot, rel), 'utf8')

/** `export const NAME = [ 'a', 'b' ] as const` → ['a','b'] (backend kaynağından, derlemeden). */
function backendConstList(source: string, name: string): string[] {
  const m = source.match(new RegExp(`${name}[^=]*=\\s*\\[([^\\]]*)\\]`))
  if (!m) throw new Error(`${name} bulunamadı`)
  return Array.from(m[1].matchAll(/'([^']+)'/g), (x) => x[1])
}

function readTr(dotted: string): unknown {
  const tr = JSON.parse(readFileSync(resolve(__dirname, '../src/plugins/locales/tr.json'), 'utf8'))
  return dotted.split('.').reduce((acc: any, k) => (acc == null ? undefined : acc[k]), tr)
}

describe('backend sözleşmesiyle birebir sabitler', () => {
  const model = read('database/application/models/IntegrationFinding.ts')
  const service = read('api/services/integration-compliance-service.ts')
  const catalog = read('integration/catalog/types.ts')

  it('kind/source/severity/status enumları IntegrationFinding.ts ile aynı', () => {
    expect([...FINDING_KINDS]).toEqual(backendConstList(model, 'INTEGRATION_FINDING_KINDS'))
    expect([...FINDING_SOURCES]).toEqual(backendConstList(model, 'INTEGRATION_FINDING_SOURCES'))
    expect([...FINDING_SEVERITIES]).toEqual(backendConstList(model, 'INTEGRATION_FINDING_SEVERITIES'))
    expect([...FINDING_STATUSES]).toEqual(backendConstList(model, 'INTEGRATION_FINDING_STATUSES'))
  })

  it('transition eylemleri servis TRANSITION_ACTIONS ile aynı', () => {
    expect([...TRANSITION_ACTIONS]).toEqual(backendConstList(service, 'TRANSITION_ACTIONS'))
  })

  it('kategoriler catalog INTEGRATION_CATEGORIES ile aynı', () => {
    expect([...INTEGRATION_CATEGORIES]).toEqual(backendConstList(catalog, 'INTEGRATION_CATEGORIES'))
  })
})

describe('buildListBody', () => {
  it('boş/null filtreleri gövdeye yazmaz', () => {
    expect(buildListBody({})).toEqual({})
    expect(buildListBody({ integrationCode: '', kind: undefined })).toEqual({})
  })
  it('beş filtrenin beşini de sunucuya taşır', () => {
    expect(buildListBody({ integrationCode: 'trendyol', category: 'marketplace', kind: 'schema', severity: 'high', status: 'new' }))
      .toEqual({ integrationCode: 'trendyol', category: 'marketplace', kind: 'schema', severity: 'high', status: 'new' })
  })
})

describe('validateTransition — fixed için fixRef zorunlu, diğerlerinde gerekçe opsiyonel', () => {
  it('eylem yoksa hata', () => {
    expect(validateTransition({})?.action).toBe('integrationCompliance.decision.errors.actionRequired')
  })
  it.each(['triage', 'accept', 'wontfix', 'false_positive'] as const)('%s: gerekçesiz geçerli', (action) => {
    expect(validateTransition({ action })).toBeNull()
  })
  it('fixed: fixRef boş/boşluk → hata', () => {
    expect(validateTransition({ action: 'fixed' })?.fixRef).toBe('integrationCompliance.decision.errors.fixRefRequired')
    expect(validateTransition({ action: 'fixed', fixRef: '   ' })?.fixRef).toBe('integrationCompliance.decision.errors.fixRefRequired')
  })
  it('fixed: fixRef dolu → geçerli', () => {
    expect(validateTransition({ action: 'fixed', fixRef: 'PR-128' })).toBeNull()
  })
  it('uzunluk sınırları backend kırpma sınırlarıyla aynı', () => {
    expect(TRANSITION_LIMITS).toEqual({ reason: 500, fixRef: 200, fixedInAdapterVersion: 32 })
    expect(validateTransition({ action: 'accept', reason: 'x'.repeat(501) })?.reason).toBeTruthy()
    expect(validateTransition({ action: 'fixed', fixRef: 'x'.repeat(201) })?.fixRef).toBeTruthy()
    expect(validateTransition({ action: 'fixed', fixRef: 'a', fixedInAdapterVersion: '1'.repeat(33) })?.fixedInAdapterVersion).toBeTruthy()
  })
  it('her i18n hata anahtarı tr.json\'da mevcut', () => {
    for (const key of ['actionRequired', 'reasonTooLong', 'fixRefRequired', 'fixRefTooLong', 'versionTooLong', 'failed']) {
      expect(typeof readTr(`integrationCompliance.decision.errors.${key}`)).toBe('string')
    }
  })
})

describe('buildTransitionBody', () => {
  it('yalnız dolu opsiyonel alanlar; kırpılmış', () => {
    expect(buildTransitionBody('k1', { action: 'triage' })).toEqual({ id: 'k1', action: 'triage' })
    expect(buildTransitionBody('k1', { action: 'accept', reason: '  incelendi  ' })).toEqual({ id: 'k1', action: 'accept', reason: 'incelendi' })
  })
  it('fixRef/fixedInAdapterVersion yalnız fixed eyleminde gönderilir', () => {
    expect(buildTransitionBody('k1', { action: 'wontfix', fixRef: 'PR-1', fixedInAdapterVersion: '1.0.1' })).toEqual({ id: 'k1', action: 'wontfix' })
    expect(buildTransitionBody('k1', { action: 'fixed', fixRef: 'PR-1', fixedInAdapterVersion: '1.0.1' }))
      .toEqual({ id: 'k1', action: 'fixed', fixRef: 'PR-1', fixedInAdapterVersion: '1.0.1' })
  })
})

describe('availableActions', () => {
  it('yalnız mevcut duruma eşit hedefi eler (backend başka kısıt koymaz)', () => {
    expect(availableActions('new')).toEqual([...TRANSITION_ACTIONS])
    expect(availableActions('triaged')).not.toContain('triage')
    expect(availableActions('fixed')).toEqual(['triage', 'accept', 'wontfix', 'false_positive'])
    for (const action of TRANSITION_ACTIONS) expect(STATUS_BY_ACTION[action]).not.toBe('new')
  })
})

describe('status-map — uyum bulgusu ve iş koşu sonucu', () => {
  const VALID = ['success', 'warning', 'danger', 'info', 'neutral']
  const maps = { findingSeverity: FINDING_SEVERITY_TONE, findingStatus: FINDING_STATUS_TONE, jobRunOutcome: JOB_RUN_OUTCOME_TONE }
  for (const [name, map] of Object.entries(maps)) {
    for (const [code, entry] of Object.entries(map)) {
      it(`${name}.${code} → geçerli ton + tr.json etiketi`, () => {
        expect(VALID).toContain(entry.tone)
        expect(typeof readTr(entry.labelKey)).toBe('string')
      })
    }
  }
  it('her şiddet ve durum eşlenmiş', () => {
    expect(Object.keys(FINDING_SEVERITY_TONE).sort()).toEqual([...FINDING_SEVERITIES].sort())
    expect(Object.keys(FINDING_STATUS_TONE).sort()).toEqual([...FINDING_STATUSES].sort())
  })
})
