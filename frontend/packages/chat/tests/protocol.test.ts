// §9 protocol/v1.ts: her mock olayı şemadan geçer; .strict() fazla alanı reddeder; bilinmeyen parça → PartUnknown; sınır uzunlukları.
import { describe, expect, it } from 'vitest'
import {
  AgentInfoSchema,
  ConfirmPartSchema,
  isKnownPart,
  PartSchema,
  ProviderSaveRequestSchema,
  ProviderStatusSchema,
  ServerEventSchema,
  TablePartSchema,
  TurnRequestSchema,
  FormFieldSchema,
  type ServerEvent,
} from '../src/protocol/v1'
import { createMockTransport } from '../src/transport/mock'
import { SCENARIOS } from '../src/transport/mock/scenarios'
import { collect } from './helpers'

const uuid = '11111111-1111-4111-8111-111111111111'

describe('mock olayları şemadan geçer', () => {
  it.each([...SCENARIOS.map((s) => s.id), 'fallback'])('%s', async (id) => {
    const mock = createMockTransport({ speed: 0 })
    const events = await collect(mock.run(id))
    expect(events.length).toBeGreaterThan(0)
    for (const e of events) expect(ServerEventSchema.safeParse(e).success, JSON.stringify(e).slice(0, 200)).toBe(true)
  })
})

describe('strict ve ileri uyum', () => {
  it('fazla alan reddedilir (olay, parça, istek)', () => {
    expect(ServerEventSchema.safeParse({ type: 'turn.end', turnId: 't', status: 'completed', extra: 1 }).success).toBe(false)
    expect(PartSchema.safeParse({ id: 'p', type: 'text', format: 'plain', text: 'a', html: '<b>' }).success).toBe(false)
    expect(TurnRequestSchema.safeParse({ v: 1, conversationId: null, clientTurnId: uuid, locale: 'tr', input: { kind: 'text', text: 'a' }, tenantId: 'x' }).success).toBe(false)
  })
  it('bilinmeyen tür → UnknownPart (içerik serbest), bilinen türün bozuğu REDDEDİLİR', () => {
    const chart = PartSchema.safeParse({ id: 'c', type: 'chart', series: [1] })
    expect(chart.success).toBe(true)
    expect(isKnownPart(chart.data as never)).toBe(false)
    expect(PartSchema.safeParse({ id: 'c', type: 'table' }).success).toBe(false)
    expect(PartSchema.safeParse({ type: 'chart' }).success).toBe(false)
  })
  it('sürüm: v yalnız 1', () => {
    expect(TurnRequestSchema.safeParse({ v: 2, conversationId: null, clientTurnId: uuid, locale: 'tr', input: { kind: 'text', text: 'a' } }).success).toBe(false)
  })
  it("form alanında 'password' türü yoktur", () => {
    expect(FormFieldSchema.safeParse({ name: 'k', label: 'Anahtar', required: true, kind: 'password' }).success).toBe(false)
  })
})

describe('sınır uzunlukları', () => {
  const turn = (text: string) => TurnRequestSchema.safeParse({ v: 1, conversationId: null, clientTurnId: uuid, locale: 'tr', input: { kind: 'text', text } })
  it('girdi 1..4000', () => {
    expect(turn('').success).toBe(false)
    expect(turn('a'.repeat(4000)).success).toBe(true)
    expect(turn('a'.repeat(4001)).success).toBe(false)
  })
  it('text parçası ≤ 20000, delta ≤ 2000', () => {
    expect(PartSchema.safeParse({ id: 'p', type: 'text', format: 'plain', text: 'a'.repeat(20000) }).success).toBe(true)
    expect(PartSchema.safeParse({ id: 'p', type: 'text', format: 'plain', text: 'a'.repeat(20001) }).success).toBe(false)
    expect(ServerEventSchema.safeParse({ type: 'delta', messageId: 'm', partId: 'p', text: 'a'.repeat(2001) }).success).toBe(false)
  })
  it('tablo: 1..12 kolon, ≤ 50 satır, rowKey kolonlarda olmalı', () => {
    const base = { id: 't', type: 'table', capabilityId: 'x', columns: [{ key: 'a', label: 'A', type: 'text' }], rowKey: 'a', rows: [], total: null, more: null }
    expect(TablePartSchema.safeParse(base).success).toBe(true)
    expect(TablePartSchema.safeParse({ ...base, rowKey: 'yok' }).success).toBe(false)
    expect(TablePartSchema.safeParse({ ...base, columns: [] }).success).toBe(false)
    expect(TablePartSchema.safeParse({ ...base, columns: Array.from({ length: 13 }, (_, i) => ({ key: `k${i}`, label: 'L', type: 'text' })), rowKey: 'k0' }).success).toBe(false)
    expect(TablePartSchema.safeParse({ ...base, rows: Array.from({ length: 51 }, () => ({ a: 'x' })) }).success).toBe(false)
  })
  it('onay kartı: typed kipte typedPhrase zorunlu; sample ≤ 10; özet ≤ 500', () => {
    const card = {
      id: 'c', type: 'confirm', pendingActionId: 'p', capabilityId: 'x', title: 'T', summary: 'S', effect: 'write', risk: 'low', external: false,
      affected: { count: 0, sample: [] }, confirmMode: 'confirm', expiresAt: '2026-10-01T10:00:00.000Z', state: 'pending',
    }
    expect(ConfirmPartSchema.safeParse(card).success).toBe(true)
    expect(ConfirmPartSchema.safeParse({ ...card, confirmMode: 'typed' }).success).toBe(false)
    expect(ConfirmPartSchema.safeParse({ ...card, summary: 's'.repeat(501) }).success).toBe(false)
    expect(ConfirmPartSchema.safeParse({ ...card, affected: { count: 11, sample: Array.from({ length: 11 }, (_, i) => ({ type: 'order', id: `o${i}`, label: 'x' })) } }).success).toBe(false)
  })
  it('AppLink params ≤ 8 anahtar; öneriler ≤ 6', () => {
    const params = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${i}`, 'v']))
    expect(PartSchema.safeParse({ id: 'e', type: 'entity-link', entity: { type: 'order', id: '1', label: 'x' }, link: { screen: 's', params } }).success).toBe(false)
    const info = { v: 1, enabled: true, setup: { configured: true, canConfigure: true, consentRequired: false, canConsent: true }, readOnly: false, limits: { maxInputChars: 4000, turnsPerMinute: 10 }, suggestions: Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, text: 't' })) }
    expect(AgentInfoSchema.safeParse(info).success).toBe(false)
  })
  it('BYOK: durum yanıtında anahtar değeri taşınamaz (yalnız "sensitive"); anahtar ≤ 512', () => {
    const status = { v: 1, configured: true, canConfigure: true, consentRequired: false, canConsent: true, catalog: [], consentText: { version: '1', body: 'x' } }
    expect(ProviderStatusSchema.safeParse({ ...status, apiKey: 'sensitive' }).success).toBe(true)
    expect(ProviderStatusSchema.safeParse({ ...status, apiKey: 'sk-gercek-anahtar' }).success).toBe(false)
    expect(ProviderSaveRequestSchema.safeParse({ v: 1, provider: 'openai', model: 'm', apiKey: 'k'.repeat(513) }).success).toBe(false)
  })
})

describe('olay tipleri', () => {
  it('ServerEvent birleşimi 5 tür', () => {
    const types: ServerEvent['type'][] = ['turn.start', 'part', 'delta', 'turn.end', 'error']
    expect(types).toHaveLength(5)
  })
})
