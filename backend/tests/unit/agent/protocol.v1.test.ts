import { describe, it, expect } from '@jest/globals';
import {
    AgentInfoSchema, ConfirmPartSchema, ConfirmRequestSchema, ErrorPartSchema, PartSchema, ProviderSaveRequestSchema, ProviderStatusSchema,
    ServerEventSchema, TablePartSchema, TurnRequestSchema,
} from '../../../src/operations/agent/protocol/v1';

const uuid = '3f2b1c9e-8a4d-4e7b-9c11-2d5a6b7c8d9e';
const turn = { v: 1, conversationId: null, clientTurnId: uuid, locale: 'tr', input: { kind: 'text', text: 'merhaba' } };

describe('chat/v1 istemci istekleri', () => {
    it('gecerli tur istegi kabul edilir; fazla alan (strict) reddedilir', () => {
        expect(TurnRequestSchema.safeParse(turn).success).toBe(true);
        expect(TurnRequestSchema.safeParse({ ...turn, tenant: 5 }).success).toBe(false);
        expect(TurnRequestSchema.safeParse({ ...turn, input: { kind: 'text', text: 'a', extra: 1 } }).success).toBe(false);
    });
    it('surum 1 zorunlu; metin 1..4000; clientTurnId UUID', () => {
        expect(TurnRequestSchema.safeParse({ ...turn, v: 2 }).success).toBe(false);
        expect(TurnRequestSchema.safeParse({ ...turn, input: { kind: 'text', text: '' } }).success).toBe(false);
        expect(TurnRequestSchema.safeParse({ ...turn, input: { kind: 'text', text: 'a'.repeat(4001) } }).success).toBe(false);
        expect(TurnRequestSchema.safeParse({ ...turn, input: { kind: 'text', text: 'a'.repeat(4000) } }).success).toBe(true);
        expect(TurnRequestSchema.safeParse({ ...turn, clientTurnId: 'x' }).success).toBe(false);
    });
    it('sayfa baglami sinirlari: secim <= 100 kimlik, filtre <= 10 anahtar, localTools <= 10', () => {
        const ctx = (selection: string[]) => ({ ...turn, context: { screen: 'orders', selection: { type: 'order', ids: selection } } });
        expect(TurnRequestSchema.safeParse(ctx(Array.from({ length: 100 }, (_, i) => `o${i}`))).success).toBe(true);
        expect(TurnRequestSchema.safeParse(ctx(Array.from({ length: 101 }, (_, i) => `o${i}`))).success).toBe(false);
        const filters = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, 'v']));
        expect(TurnRequestSchema.safeParse({ ...turn, context: { screen: 's', filters } }).success).toBe(false);
        expect(TurnRequestSchema.safeParse({ ...turn, client: { shell: 'electron', localTools: Array.from({ length: 11 }, (_, i) => `l${i}`) } }).success).toBe(false);
    });
    it('onay istegi ve BYOK kaydi semalari', () => {
        expect(ConfirmRequestSchema.safeParse({ v: 1, conversationId: 'c', pendingActionId: 'p', decision: 'approve', idempotencyKey: uuid }).success).toBe(true);
        expect(ConfirmRequestSchema.safeParse({ v: 1, conversationId: 'c', pendingActionId: 'p', decision: 'maybe', idempotencyKey: uuid }).success).toBe(false);
        expect(ProviderSaveRequestSchema.safeParse({ v: 1, provider: 'anthropic', model: 'm', apiKey: 'k', consent: { textVersion: '1', accepted: true } }).success).toBe(true);
        expect(ProviderSaveRequestSchema.safeParse({ v: 1, provider: 'scripted', model: 'm' }).success).toBe(false);
    });
});

describe('chat/v1 sunucu olaylari ve parcalar', () => {
    const text = { id: 't1', type: 'text', format: 'markdown', text: 'x', streaming: true };
    it('temel olay dizisi gecerlidir', () => {
        const evs = [
            { type: 'turn.start', turnId: 't', conversationId: 'c', messageId: 'm' },
            { type: 'part', messageId: 'm', part: text },
            { type: 'delta', messageId: 'm', partId: 't1', text: 'abc' },
            { type: 'turn.end', turnId: 't', status: 'completed' },
            { type: 'error', error: { code: 'LLM_RATE_LIMITED', message: 'yavas', retryable: true, action: { kind: 'retry' } } },
        ];
        for (const e of evs) expect(ServerEventSchema.safeParse(e).success).toBe(true);
    });
    it('delta <= 2000, fazla alan reddedilir', () => {
        expect(ServerEventSchema.safeParse({ type: 'delta', messageId: 'm', partId: 'p', text: 'a'.repeat(2001) }).success).toBe(false);
        expect(ServerEventSchema.safeParse({ type: 'turn.end', turnId: 't', status: 'completed', x: 1 }).success).toBe(false);
        expect(ServerEventSchema.safeParse({ type: 'error', error: { id: 'e', code: 'INTERNAL', message: 'x', retryable: false } }).success).toBe(false);
    });
    it('bilinmeyen parca turu (chart) gecer; bozuk BILINEN parca gecmez', () => {
        expect(PartSchema.safeParse({ id: 'c1', type: 'chart', series: [1, 2] }).success).toBe(true);
        expect(PartSchema.safeParse({ id: 't1', type: 'text', format: 'html', text: 'x' }).success).toBe(false);
        expect(PartSchema.safeParse({ id: 'k', type: 'kpi', items: [] }).success).toBe(false);
    });
    it('tablo: 1..12 kolon, <= 50 satir', () => {
        const col = (i: number) => ({ key: `c${i}`, label: 'L', type: 'text' });
        const table = (cols: number, rows: number) => ({
            id: 'tb', type: 'table', capabilityId: 'orders.list', columns: Array.from({ length: cols }, (_, i) => col(i)), rowKey: 'c0',
            rows: Array.from({ length: rows }, (_, i) => ({ c0: `r${i}` })), total: rows, more: null,
        });
        expect(TablePartSchema.safeParse(table(1, 50)).success).toBe(true);
        expect(TablePartSchema.safeParse(table(0, 1)).success).toBe(false);
        expect(TablePartSchema.safeParse(table(13, 1)).success).toBe(false);
        expect(TablePartSchema.safeParse(table(2, 51)).success).toBe(false);
    });
    it('onay karti ve hata parcasi', () => {
        const confirm = {
            id: 'cf', type: 'confirm', pendingActionId: 'pa', capabilityId: 'orders.approve', title: 'T', summary: 'S', effect: 'write', risk: 'medium', external: true,
            affected: { count: 3, sample: [{ type: 'order', id: '1', label: 'A' }] }, confirmMode: 'confirm', expiresAt: '2026-10-01T10:00:00Z', state: 'pending',
        };
        expect(ConfirmPartSchema.safeParse(confirm).success).toBe(true);
        expect(ConfirmPartSchema.safeParse({ ...confirm, effect: 'read' }).success).toBe(false);
        expect(ErrorPartSchema.safeParse({ id: 'e', type: 'error', code: 'SETUP_REQUIRED', message: 'x', retryable: false, action: { kind: 'setup' } }).success).toBe(true);
        expect(ErrorPartSchema.safeParse({ id: 'e', type: 'error', code: 'NOPE', message: 'x', retryable: false }).success).toBe(false);
    });
    it('AgentInfo ve ProviderStatus sekilleri', () => {
        const info = {
            v: 1, enabled: true, setup: { configured: true, canConfigure: false, consentRequired: false, canConsent: false },
            readOnly: false, limits: { maxInputChars: 4000, turnsPerMinute: 10 }, suggestions: [{ id: 's', text: 'x' }],
        };
        expect(AgentInfoSchema.safeParse(info).success).toBe(true);
        expect(AgentInfoSchema.safeParse({ ...info, suggestions: Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, text: 'x' })) }).success).toBe(false);
        // apiKey degeri ASLA doner: yalniz 'sensitive' isareti
        const status = { v: 1, configured: true, canConfigure: true, consentRequired: false, canConsent: false, catalog: [], consentText: { version: '1', body: 'b' } };
        expect(ProviderStatusSchema.safeParse({ ...status, apiKey: 'sensitive' }).success).toBe(true);
        expect(ProviderStatusSchema.safeParse({ ...status, apiKey: 'sk-live-123' }).success).toBe(false);
    });
});
