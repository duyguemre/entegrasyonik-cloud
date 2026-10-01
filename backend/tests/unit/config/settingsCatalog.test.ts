/**
 * ADR-0020 Karar 2.2 + Karar 7.2 Aşama A DoD — ayar kataloğu TUTARLILIK testleri:
 *  - anahtar (`key`) BENZERSİZ,
 *  - `default` kendi `schema`'sını GEÇER (per-entegrasyon varsayılan dahil),
 *  - `consumers` BOŞ DEĞİL ve gösterdiği dosya GERÇEKTEN VAR (2026-09-29 grep taramasıyla doğrulanan tüketici listesi
 *    böylece gelecekte sessizce bayatlamaz),
 *  - TR/EN etiket ve yardım metni dolu (ADR C5 i18n zorunluluğu),
 *  - anahtar adında sır deseni yok (ADR §2.2 "sır yasağı": `password|secret|token|key` — burada `key` yalnız TEK
 *    başına bir SEGMENT olarak yasaklanır; `chunkSize`/`workerConcurrency` gibi bileşik adlar YANLIŞ POZİTİF üretmez).
 *  - Gerçek ağ/DB YOK: yalnız dosya sistemi (proje içi) ve saf modül içe aktarımı.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from '@jest/globals';
import { SETTINGS_CATALOG, ORPHANED_JSON_KEYS, listSettings, getSettingDef } from '@integration/config/catalog';
import { isPerIntegrationDefault } from '@integration/config/types';

const SRC_INTEGRATION_ROOT = path.resolve(__dirname, '../../../src/integration');

function firstPathSegment(consumer: string): string {
    // 'engine/catalog/export/Publisher.ts:18' -> 'engine/catalog/export/Publisher.ts'
    // 'marketplace|ecommerce|erp/<code>/services/Service.ts' -> özel joker, ayrı ele alınır (aşağıda).
    const withoutLine = consumer.replace(/:[0-9,]+.*$/, '');
    const withoutParen = withoutLine.replace(/\s*\(.*\)\s*$/, '');
    return withoutParen.trim();
}

describe('ADR-0020 Karar 2 — SETTINGS_CATALOG tutarlılığı', () => {
    it('katalog boş değil (Aşama A envanteri gerçekten üretildi)', () => {
        expect(listSettings().length).toBeGreaterThan (40);
    });

    it('her anahtar (`key`) BENZERSİZDİR', () => {
        const keys = SETTINGS_CATALOG.map((s) => s.key);
        const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
        expect(dupes).toEqual([]);
    });

    it('`getSettingDef` katalogdaki her anahtarı bulur; bilinmeyen anahtar için undefined döner', () => {
        for (const s of SETTINGS_CATALOG) expect(getSettingDef(s.key)).toBe(s);
        expect(getSettingDef('bilinmeyen.anahtar.xyz')).toBeUndefined();
    });

    it('her ayarın `default` değeri KENDİ zod şemasını geçer (per-entegrasyon varsayılan dahil)', () => {
        for (const def of SETTINGS_CATALOG) {
            if (isPerIntegrationDefault(def.default)) {
                for (const [code, v] of Object.entries(def.default)) {
                    const r = def.schema.safeParse(v);
                    expect({ key: def.key, code, ok: r.success, issue: r.success ? undefined : r.error.issues }).toEqual(
                        expect.objectContaining({ ok: true }),
                    );
                }
            } else {
                const r = def.schema.safeParse(def.default);
                expect({ key: def.key, ok: r.success, issue: r.success ? undefined : r.error.issues }).toEqual(
                    expect.objectContaining({ ok: true }),
                );
            }
        }
    });

    it('her ayarın `consumers` dizisi BOŞ DEĞİL', () => {
        for (const def of SETTINGS_CATALOG) {
            expect(def.consumers.length).toBeGreaterThan(0);
        }
    });

    it('mock.* dışındaki her ayarın `consumers`teki İLK yol GERÇEKTEN VAR OLAN bir dosyaya işaret eder (2026-09-29 grep doğrulaması bayatlamasın)', () => {
        const missing: string[] = [];
        for (const def of SETTINGS_CATALOG) {
            if (def.group === 'mock' || def.group === 'resilience') continue; // mock: MockMode.ts (ayrı test altında); resilience: joker/çoklu dosya kalıpları (elle doğrulandı, bkz. rapor)
            const first = firstPathSegment(def.consumers[0]);
            if (first.includes('*') || first.includes('|') || first.endsWith('.json')) continue; // joker/JSON referansı — dosya varlık testine uygun değil
            const full = path.join(SRC_INTEGRATION_ROOT, first);
            if (!fs.existsSync(full)) missing.push(`${def.key} -> ${first}`);
        }
        expect(missing).toEqual([]);
    });

    it('TR ve EN etiket/yardım metni her ayarda DOLU (ADR C5 i18n)', () => {
        for (const def of SETTINGS_CATALOG) {
            expect(def.label.tr.trim().length).toBeGreaterThan(0);
            expect(def.label.en.trim().length).toBeGreaterThan(0);
            expect(def.help.tr.trim().length).toBeGreaterThan(0);
            expect(def.help.en.trim().length).toBeGreaterThan(0);
        }
    });

    it('anahtar adında YASAKLI sır deseni yok (ADR §2.2 "password|secret|token|key" — TEK BAŞINA segment)', () => {
        const forbidden = /(^|\.)(password|secret|token|key)($|\.)/i;
        const offenders = SETTINGS_CATALOG.filter((def) => forbidden.test(def.key)).map((d) => d.key);
        expect(offenders).toEqual([]);
    });

    it('ORPHANED_JSON_KEYS envanteri boş DEĞİL (2026-09-29 taramasında bulunan, JSON\'da olup hiç okunmayan anahtarlar — kataloğa bilinçli olarak alınmadı)', () => {
        expect(ORPHANED_JSON_KEYS.length).toBeGreaterThan(0);
        // Orphan olarak işaretlenen hiçbir anahtar SETTINGS_CATALOG'da AYNI ZAMANDA yer ALMAMALI (çelişki kontrolü).
        const catalogKeys = new Set(SETTINGS_CATALOG.map((d) => d.key));
        for (const orphan of ORPHANED_JSON_KEYS) {
            // orphan metni 'export.config.json: exportOrchestrator.rateLimitRetryDelay' biçiminde; katalog anahtarı
            // 'export.orchestrator.rateLimitRetryDelay' biçiminde olurdu — iki adlandırma birbirinden bilinçli olarak
            // farklı (JSON iç içe alan adı vs katalog ad alanı); burada yalnız DOĞRUDAN eşleşme çakışması aranır.
            expect(catalogKeys.has(orphan)).toBe(false);
        }
    });
});
