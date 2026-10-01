/**
 * GV-01 statik mandal: `src/` altında kullanıcı girdisini HAM olarak `$regex`'e veren kod kalmamalı.
 * İzinli: `utils/search.ts` (yardımcının kendisi) ve `escapeRegex(...)` ile kaçırılmış değer içeren satırlar.
 * Yeni `$regex` kullanımı `containsRegex()`/`escapeRegex()` kullanmak zorundadır.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const srcDir = path.resolve(__dirname, '../../../src');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('GV-01: ham $regex yasağı', () => {
  it('her `$regex` kullanımı escapeRegex ile kaçırılmıştır (utils/search.ts hariç)', () => {
    const offenders: string[] = [];
    for (const f of walk(srcDir)) {
      const rel = path.relative(srcDir, f).replace(/\\/g, '/');
      if (rel === 'utils/search.ts') continue;
      fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (/\$regex|['"]\$regex['"]/.test(code) && !/escapeRegex\(/.test(code)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('kullanıcı girdisiyle `new RegExp(` kurulmaz (src/api/Security.ts çerez adı sabiti hariç)', () => {
    const offenders: string[] = [];
    for (const f of walk(srcDir)) {
      const rel = path.relative(srcDir, f).replace(/\\/g, '/');
      // urlSafetyNet.ts: `new RegExp` SABİT kalıplarla (SEG sabiti) kurulur ve girdiye UYGULANIR; girdiden kalıp üretilmez (C22, 2026-09-28).
      // integration/config/urlGuard.ts::matchesRetiredPattern: AYNI desen -- regex yalnız manifesto `config.retiredEndpoints`
      // (KOD-kontrollü, versiyonlu, ADR-0018 descriptor.ts) desenlerinden kurulur; girdi (yazılan DEĞER) yalnız regex'e
      // UYGULANIR, girdiden regex ÜRETİLMEZ (ADR-0020 Karar 1.5, 2026-09-29).
      if (rel === 'api/Security.ts' || rel === 'platform/core/security/Security.ts' || rel === 'utils/search.ts' || rel === 'integration/modules/marketplace/trendyol/urlSafetyNet.ts' || rel === 'integration/config/urlGuard.ts') continue;
      if (/new RegExp\(/.test(fs.readFileSync(f, 'utf8'))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
