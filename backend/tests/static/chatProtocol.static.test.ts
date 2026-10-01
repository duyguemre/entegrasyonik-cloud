/**
 * ADR-0034 Karar 3 / AGENT_BROKER_PLAN BR-1: chat/v1 protokol esitligi. Kanonik dosya frontend/packages/chat/src/protocol/v1.ts
 * (bulut CHAT-FE-1 yazar); backend kopyasi ilk yorum blogu haric BIREBIR esit olmali.
 *  - Frontend dosyasi YOKSA: atlanir (neden acik) -- kanonik dosya olmadan esitlik sinanamaz.
 *  - VARSA: iki yonlu esitlik (govde birebir; ayrica ikisinde de ayni export adlari).
 * Backend kopyasinin KENDISI ise her zaman sinanir: yalniz 'zod' ice aktarir, ilk yorum blogu vardir.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const BE = path.resolve(__dirname, '../../src/operations/agent/protocol/v1.ts');
const FE = path.resolve(__dirname, '../../../frontend/packages/chat/src/protocol/v1.ts');

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const BOM = 0xfeff;
const LEADING_COMMENT = /^\s*\/\*[\s\S]*?\*\/\s*/;
const norm = (s: string) => (s.charCodeAt(0) === BOM ? s.slice(1) : s).split(CR + LF).join(LF).replace(LEADING_COMMENT, '').trimEnd();
const exportsOf = (s: string) => [...s.matchAll(/^export (?:const|type|interface|function) (\w+)/gm)].map((m) => m[1]).sort();

describe('chat/v1 protokol dosyasi (backend kopyasi)', () => {
    const be = fs.readFileSync(BE, 'utf8');
    it('yalniz zod ice aktarir ve ilk yorum blogu ile baslar', () => {
        const imports = [...be.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
        expect(imports).toEqual(['zod']);
        expect(be.trimStart().startsWith('/**')).toBe(true);
    });
    it('protokol surumu 1 ve temel semalar disa aciktir', () => {
        for (const name of ['CHAT_PROTOCOL_VERSION', 'TurnRequestSchema', 'ServerEventSchema', 'AgentInfoSchema', 'PartSchema', 'ConfirmRequestSchema', 'ProviderStatusSchema']) {
            expect(exportsOf(be)).toContain(name);
        }
    });
});

const feExists = fs.existsSync(FE);
(feExists ? describe : describe.skip)('protocol-sync: frontend kanonik dosyasi ile backend kopyasi esit' + (feExists ? '' : ' [ATLANDI: frontend/packages/chat/src/protocol/v1.ts yok -- CHAT-FE-1 once]'), () => {
    it('ilk yorum blogu haric govde birebir ayni (degisiklik onyuzde yapilir, scripts/sync-chat-protocol.cjs ile kopyalanir)', () => {
        expect(norm(fs.readFileSync(BE, 'utf8'))).toBe(norm(fs.readFileSync(FE, 'utf8')));
    });
    it('iki dosya ayni export adlarini tasir (iki yonlu)', () => {
        const a = exportsOf(fs.readFileSync(BE, 'utf8'));
        const b = exportsOf(fs.readFileSync(FE, 'utf8'));
        expect(a.filter((x) => !b.includes(x))).toEqual([]);
        expect(b.filter((x) => !a.includes(x))).toEqual([]);
    });
});
