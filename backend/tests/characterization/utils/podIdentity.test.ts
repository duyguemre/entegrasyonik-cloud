/**
 * YENİ DAVRANIŞ (ADR-0006 Karar 4): tek pod kimliği yardımcısı.
 * Kaynak: backend/src/utils/podIdentity.ts
 * Amaç: `process.env.POD_NAME || os.hostname()` desenlerinin dağınık kopyalarını tek yerde birleştirmek;
 * `undefined`/boş sonucu ASLA üretmemek (mevcut Dispatcher/Sync/ExportOrchestrator'daki
 * `process.env.POD_NAME || os.hostname()` deseninde POD_NAME='' ise boş string kullanılırdı — burada düzeltilir).
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import os from 'os';
import { getPodIdentity } from '@utils/podIdentity';

describe('getPodIdentity', () => {
  const saved = process.env.POD_NAME;
  afterEach(() => {
    if (saved === undefined) delete process.env.POD_NAME; else process.env.POD_NAME = saved;
  });

  it('POD_NAME tanımlıysa onu döner', () => {
    process.env.POD_NAME = 'pod-42';
    expect(getPodIdentity()).toBe('pod-42');
  });

  it('POD_NAME yoksa hostname:pid döner (ASLA undefined/boş değil)', () => {
    delete process.env.POD_NAME;
    const id = getPodIdentity();
    expect(id).toBe(`${os.hostname()}:${process.pid}`);
    expect(id).not.toContain('undefined');
  });

  it('POD_NAME boş string ise (env yanlış ayarlanmış) yine hostname:pid kullanılır', () => {
    process.env.POD_NAME = '   ';
    const id = getPodIdentity();
    expect(id).toBe(`${os.hostname()}:${process.pid}`);
  });
});
