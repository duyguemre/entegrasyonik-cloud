/**
 * ADR-0029 NB1: olay katalogu butunluk testleri (saf kod, DB yok).
 * Baseline mandali: kod silme/yeniden adlandirma kirilir (alias CODE_ALIASES ile). Yeniden uretim: UPDATE_NOTIFY_BASELINE=1.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
    CODE_ALIASES, LEGACY_CATALOG, NOTIFICATION_CATALOG, getCatalogDto, getDefinition,
} from '@operations/notifications/catalog';
import {
    CATEGORY_DEFAULT_PERMISSION, FORBIDDEN_PARAM_KEYS, NOTIFICATION_CATEGORIES, NOTIFICATION_LOCALES, NOTIFICATION_PERMISSIONS, RETENTION_DAYS,
} from '@operations/notifications/catalog.types';
import { renderNotification } from '@operations/notifications/templates/render';
import { TR } from '@operations/notifications/templates/tr';
import { EN } from '@operations/notifications/templates/en';

const ALL = [...NOTIFICATION_CATALOG, ...LEGACY_CATALOG];
const BASELINE = path.join(__dirname, 'notification-catalog-baseline.json');
const ACTION_PREFIXES = ['/integrations', '/orders', '/logs', '/catalog', '/finance', '/subscription', '/account', '/settings', '/notifications', '/approve', '/products'];
const SECRET_RE = /enc:v1:|token=|password=|secret|api[_-]?key|bearer\s/i;

describe('NB1 katalog: sayilar ve benzersizlik', () => {
    it('35 tenant (29 + WP-A4 iki guvenlik kodu + STOCK_LOW + MCP-2 SECURITY_MCP_CONNECTED + MCP-4 SYSTEM_MCP_APPROVAL_PENDING + PRC-R1 BUYBOX_LOST) + 5 platform kodu (LEGACY_* haric)', () => {
        expect(NOTIFICATION_CATALOG.filter((d) => d.surface === 'tenant')).toHaveLength(35);
        expect(NOTIFICATION_CATALOG.filter((d) => d.surface === 'platform')).toHaveLength(5);
    });
    it('kodlar benzersiz ve SCREAMING_SNAKE', () => {
        const codes = ALL.map((d) => d.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const c of codes) expect(c).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
    });
    it('LEGACY ailesi 7 eski tur icin var', () => {
        expect(LEGACY_CATALOG.map((d) => d.code).sort()).toEqual(
            ['BATCH_PROCESS', 'EXPORT_READY', 'IMPORT_READY', 'INFO', 'ORDER', 'STOCK_ALERT', 'SYSTEM'].map((t) => `LEGACY_${t}`).sort());
    });
});

describe('NB1 katalog: alan gecerliligi', () => {
    it.each(ALL.map((d) => [d.code, d] as const))('%s: kategori, izin, saklama, onem, kanal', (_c, d) => {
        expect(NOTIFICATION_CATEGORIES).toContain(d.category);
        expect(NOTIFICATION_PERMISSIONS).toContain(d.audience.permission);
        if (!d.legacy) expect(CATEGORY_DEFAULT_PERMISSION[d.category]).toContain(d.audience.permission);
        expect(Object.keys(RETENTION_DAYS)).toContain(d.retention);
        expect(d.severities.length).toBeGreaterThan(0);
        expect(d.defaultChannels.inApp).toBe(true);
        expect(['off', 'instant', 'digest']).toContain(d.defaultChannels.email);
        if (d.group) expect(d.group.windowMs).toBeGreaterThan(0);
    });
    it('zorunlu kume ADR-0029 Karar 5 ile birebir (security, billing ilk 5 kod, 3 stok, AUTH_FAILED)', () => {
        const mandatory = ALL.filter((d) => d.mandatory).map((d) => d.code).sort();
        const security = ALL.filter((d) => d.category === 'security').map((d) => d.code);
        const billing = ALL.filter((d) => d.category === 'billing').map((d) => d.code);
        expect(mandatory).toEqual([...security, ...billing, 'STOCK_OVERSOLD', 'STOCK_UNMAPPED_LINE', 'STOCK_COMPENSATION_MANUAL', 'STOCK_OVERSOLD_UNRESOLVED', 'INTEGRATION_AUTH_FAILED'].sort());
    });
    it('zorunlu kodlar e-postada "off" olamaz, security/billing anlik (support-access insan karari haric)', () => {
        for (const d of ALL.filter((x) => x.mandatory && x.code !== 'SECURITY_SUPPORT_ACCESS_STARTED')) {
            expect(d.defaultChannels.email).not.toBe('off');
        }
    });
    it('platform kodlari surface=platform, tenant kodlari degil', () => {
        for (const d of NOTIFICATION_CATALOG) expect(d.surface).toBe(d.code.startsWith('PLATFORM_') ? 'platform' : 'tenant');
    });
});

describe('NB1 katalog: params, sablon, rota', () => {
    const real = NOTIFICATION_CATALOG;
    it.each(real.map((d) => [d.code, d] as const))('%s: example zod gecer, yasak alan adi yok, sablon TR+EN render, sir yok', (_c, d) => {
        const parsed = d.params.safeParse(d.example);
        expect(parsed.success).toBe(true);
        const shape = (d.params as any).shape as Record<string, unknown>;
        for (const k of Object.keys(shape)) expect(FORBIDDEN_PARAM_KEYS).not.toContain(k.toLowerCase());
        for (const loc of NOTIFICATION_LOCALES) {
            const r = renderNotification(d.code, d.example as any, loc);
            expect(r.title.length).toBeGreaterThan(0);
            expect(r.message.length).toBeGreaterThan(0);
            expect(r.title + r.message).not.toMatch(SECRET_RE);
            expect(r.title + r.message).not.toMatch(/\{\w+\}/); // doldurulmamis yer tutucu yok
        }
    });
    it('strict sema: bilinmeyen alan reddedilir (PII sizdirma yolu kapali)', () => {
        for (const d of real) expect(d.params.safeParse({ ...(d.example as any), email: 'a@b.c' }).success).toBe(false);
    });
    it('sablon anahtar kumesi: TR = EN = katalog (LEGACY haric)', () => {
        const codes = real.map((d) => d.code).sort();
        expect(Object.keys(TR).sort()).toEqual(codes);
        expect(Object.keys(EN).sort()).toEqual(codes);
    });
    it('i18n anahtari notifications.events.<code>.{title,body}', () => {
        for (const d of ALL) expect(d.template).toEqual({ titleKey: `notifications.events.${d.code}.title`, bodyKey: `notifications.events.${d.code}.body` });
    });
    it('action ciktisi yalniz izinli uygulama ici yol (tek /, sema yok, izinli onek)', () => {
        for (const d of real.filter((x) => x.action)) {
            const a = d.action!(d.example as any);
            expect(a.startsWith('/')).toBe(true);
            expect(a.startsWith('//')).toBe(false);
            expect(a).not.toMatch(/^[a-z]+:/i);
            expect(a).not.toMatch(/\s|\\/);
            expect(ACTION_PREFIXES.some((p) => a === p || a.startsWith(p + '/') || a.startsWith(p + '?'))).toBe(true);
        }
    });
    it('dedupeKey/group.key ornek parametreyle string uretir', () => {
        for (const d of real) {
            if (d.dedupeKey) expect(typeof d.dedupeKey(d.example as any)).toBe('string');
            if (d.group) expect(d.group.key(d.example as any).length).toBeGreaterThan(0);
        }
    });
    it('severity fonksiyonu ornekte gecerli bir onem dondurur ve severities kumesinde', () => {
        for (const d of real) {
            const s = typeof d.severity === 'function' ? d.severity(d.example as any) : d.severity;
            expect(d.severities).toContain(s);
        }
    });
    it('LEGACY: duz title/message aynen render edilir', () => {
        expect(renderNotification('LEGACY_INFO', { title: 'T', message: 'M' })).toEqual({ title: 'T', message: 'M' });
    });
});

describe('NB1 katalog: baseline mandali ve DTO', () => {
    if (process.env.UPDATE_NOTIFY_BASELINE === '1') {
        it('baseline yeniden uretildi', () => {
            fs.writeFileSync(BASELINE, JSON.stringify({ _comment: 'Kod silme/yeniden adlandirma testte kirilir; kalici alias CODE_ALIASES ile (ADR-0029 NB1).', codes: ALL.map((d) => d.code).sort() }, null, 2) + '\n');
        });
        return;
    }
    it('baseline kodlarinin her biri katalogda var (ya da alias ile cozulur)', () => {
        const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as { codes: string[] };
        expect(base.codes.length).toBeGreaterThanOrEqual(41);
        for (const c of base.codes) expect(getDefinition(c)).toBeDefined();
        for (const [oldCode, newCode] of Object.entries(CODE_ALIASES)) {
            expect(getDefinition(newCode)).toBeDefined();
            expect(oldCode).not.toBe(newCode);
        }
    });
    it('getCatalogDto: fonksiyon/sema sizdirmaz, surface suzer', () => {
        const dto = getCatalogDto('tenant');
        expect(dto.every((x) => x.surface === 'tenant')).toBe(true);
        expect(JSON.stringify(dto)).not.toMatch(/function|_def|safeParse/);
        expect(getCatalogDto().length).toBe(ALL.length);
    });
});
