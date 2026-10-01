/**
 * ADR-0031 BE-CFG-1 (c): `images.entegrasyonik.com` ve `admin.entegrasyonik.com` alan adları backend/src içinde
 * yalnız `config/env.ts` içinde geçebilir (admin. hiç geçmemeli — hata metinlerinde ortam alan adı gömülmez).
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../src');
const ALLOWED = path.join(SRC, 'config', 'env.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(ts|js|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('görsel alan adı tek kaynak (ADR-0031)', () => {
  const files = walk(SRC);
  it('images.entegrasyonik.com yalnız config/env.ts içinde', () => {
    const offenders = files.filter(f => f !== ALLOWED && fs.readFileSync(f, 'utf8').includes('images.entegrasyonik.com'));
    expect(offenders).toEqual([]);
    expect(fs.readFileSync(ALLOWED, 'utf8')).toContain('images.entegrasyonik.com');
  });
  it('admin.entegrasyonik.com backend/src içinde geçmez', () => {
    expect(files.filter(f => fs.readFileSync(f, 'utf8').includes('admin.entegrasyonik.com'))).toEqual([]);
  });
});
