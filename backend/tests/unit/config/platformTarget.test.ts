/**
 * ADR-0031 BE-CFG-2: `_platform` hedefi katalog tutarlılığı (9 anahtar, hepsi public+platform kapsamı, varsayılan şemayı geçer,
 * consumers dosyası var, sabit iki yerde tutarlı). DB/ağ YOK.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from '@jest/globals';
import { SETTINGS_CATALOG } from '@integration/config/catalog';
import { PLATFORM_SETTINGS } from '@integration/config/catalog/platform';
import { PLATFORM_TARGET, ENGINE_TARGET } from '@integration/config/targets';
import { listPublicPlatformSettings } from '@integration/config/platformSettings';

describe('_platform kataloğu', () => {
  it('ADR-0031 Karar 2: tam 9 anahtar, hepsi scope=platform + exposure=public, katalogda', () => {
    expect(PLATFORM_SETTINGS.map(s => s.key).sort()).toEqual([
      'announcement.enabled', 'announcement.level', 'announcement.text', 'maintenance.enabled', 'maintenance.message',
      'support.email', 'support.phone', 'ui.listPageSize', 'ui.reportPollMs',
    ]);
    for (const s of PLATFORM_SETTINGS) {
      expect(s.scope).toBe('platform');
      expect(s.exposure).toBe('public');
      expect(s.overridable).toBe(true);
      expect(SETTINGS_CATALOG).toContain(s);
    }
    expect(listPublicPlatformSettings()).toHaveLength(9);
  });

  it('varsayılanlar ADR tablosuyla aynı ve kendi zod şemasını geçer', () => {
    const d = Object.fromEntries(PLATFORM_SETTINGS.map(s => [s.key, s.default]));
    expect(d).toEqual({
      'support.email': 'bilgi@entegrasyonik.com.tr', 'support.phone': '', 'announcement.enabled': false, 'announcement.level': 'info',
      'announcement.text': '', 'maintenance.enabled': false, 'maintenance.message': '', 'ui.listPageSize': 25, 'ui.reportPollMs': 5000,
    });
    for (const s of PLATFORM_SETTINGS) expect(s.schema.safeParse(s.default).success).toBe(true);
  });

  it('danger: yalnız maintenance.enabled caution', () => {
    expect(PLATFORM_SETTINGS.filter(s => s.danger !== 'safe').map(s => [s.key, s.danger])).toEqual([['maintenance.enabled', 'caution']]);
  });

  it('şema: geçersiz değerler reddedilir, sınır değerleri kabul edilir', () => {
    const def = (k: string) => PLATFORM_SETTINGS.find(s => s.key === k)!;
    expect(def('support.email').schema.safeParse('x').success).toBe(false);
    expect(def('support.email').schema.safeParse('a@b.co').success).toBe(true);
    expect(def('ui.listPageSize').schema.safeParse(30).success).toBe(false);
    for (const n of [10, 25, 50, 100]) expect(def('ui.listPageSize').schema.safeParse(n).success).toBe(true);
    expect(def('ui.reportPollMs').schema.safeParse(2999).success).toBe(false);
    expect(def('ui.reportPollMs').schema.safeParse(60001).success).toBe(false);
    expect(def('support.phone').schema.safeParse('+90 (850) 111-22').success).toBe(true);
    expect(def('announcement.text').schema.safeParse('a<b').success).toBe(false);
    expect(def('announcement.text').schema.safeParse('a'.repeat(280)).success).toBe(true);
  });

  it('consumers dosyası var (src/integration altında)', () => {
    for (const s of PLATFORM_SETTINGS) for (const c of s.consumers) expect(fs.existsSync(path.resolve(__dirname, '../../../src/integration', c))).toBe(true);
  });

  it('hedef sabiti: targets.ts değeri "_platform"; model başlık yorumu aynı adı belgeler (iki yerde tutarlı)', () => {
    expect(PLATFORM_TARGET).toBe('_platform');
    expect(ENGINE_TARGET).toBe('_engine');
    const model = fs.readFileSync(path.resolve(__dirname, '../../../src/database/application/models/IntegrationConfig.ts'), 'utf8');
    expect(model).toContain(PLATFORM_TARGET);
    expect(model).toContain(ENGINE_TARGET);
  });
});
