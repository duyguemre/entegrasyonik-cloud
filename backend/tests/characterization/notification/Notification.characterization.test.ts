/**
 * CHARACTERIZATION: Notification şeması + NotificationService (ADR-0021 D2, GV-09) — Protokol 13.
 * DB/Redis/ağ YOK: şema doğrulaması `validateSync` ile (bağlantı açılmaz), clientOperations mock'tur.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { NotificationSchema } from '@database/client/models/Notification';
import { NotificationService } from '@services/notification/NotificationService';
import { notificationEventBus } from '@services/notification/NotificationEventBus';
import { NOTIFICATION_EVENTS } from '@interfaces/index';

const NotificationModel = mongoose.model('zz_char_notification', NotificationSchema.clone());

const base = { severity: 'warning', title: 't', message: 'm' };
const validate = (over: any) => new NotificationModel({ ...base, ...over }).validateSync();

describe('Notification şeması: `mode` doğrulaması', () => {
  it('[ADR-0021 2026-09-28 / D2] STOCK_ALERT / ORDER / INFO / SYSTEM `mode` OLMADAN geçerlidir (eskiden mode zorunluydu -> ValidationError, aşırı satış uyarısı sessizce kayboluyordu)', () => {
    for (const type of ['STOCK_ALERT', 'ORDER', 'INFO', 'SYSTEM']) {
      expect(validate({ type })).toBeUndefined();
    }
  });

  it('BATCH_PROCESS / EXPORT_READY / IMPORT_READY için `mode` hâlâ zorunlu', () => {
    for (const type of ['BATCH_PROCESS', 'EXPORT_READY', 'IMPORT_READY']) {
      const err = validate({ type });
      expect(err?.errors.mode).toBeDefined();
      expect(validate({ type, mode: 'TRANSFER' })).toBeUndefined();
    }
  });

  it('mode verilirse enum (PLATFORM_PROCESS) doğrulaması sürer; TrialExpiryJob SYSTEM+BILLING geçerli', () => {
    expect(validate({ type: 'SYSTEM', mode: 'BILLING' })).toBeUndefined();
    expect(validate({ type: 'STOCK_ALERT', mode: 'NOT_A_MODE' })?.errors.mode).toBeDefined();
  });

  it('eksik başlık/mesaj/tip hâlâ reddedilir', () => {
    expect(validate({ type: 'STOCK_ALERT', title: undefined })?.errors.title).toBeDefined();
    expect(validate({ type: undefined })?.errors.type).toBeDefined();
  });
});

describe('NotificationService.init: saveNotification hata yönetimi (GV-09)', () => {
  const event: any = { clientId: '42', notificationData: { type: 'STOCK_ALERT', severity: 'warning', title: 't', message: 'm' } };
  let errSpy: any;

  beforeEach(() => {
    notificationEventBus.removeAllListeners(NOTIFICATION_EVENTS.SEND_CLIENT_NOTIFICATION);
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    notificationEventBus.removeAllListeners(NOTIFICATION_EVENTS.SEND_CLIENT_NOTIFICATION);
    jest.restoreAllMocks();
  });

  const flush = () => new Promise((r) => setImmediate(r));

  it('[ADR-0021 2026-09-28 / GV-09] kayıt reddedilirse hata yakalanıp loglanır (eskiden await edilmediği için try/catch işlevsizdi -> unhandledRejection, sessiz kayıp)', async () => {
    const saveNotification = jest.fn(async () => { throw new Error('validation failed'); });
    NotificationService.init({ saveNotification } as any);
    await NotificationService.sendClientNotification(event);
    await flush();
    expect(saveNotification).toHaveBeenCalledWith('42', event.notificationData);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0][0])).toContain('NotificationService');
    expect(errSpy.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('senkron fırlatma da yakalanıp loglanır', async () => {
    const saveNotification = jest.fn(() => { throw new Error('sync boom'); });
    NotificationService.init({ saveNotification } as any);
    await NotificationService.sendClientNotification(event);
    await flush();
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it('başarılı kayıt: hata loglanmaz', async () => {
    const saveNotification = jest.fn(async () => undefined);
    NotificationService.init({ saveNotification } as any);
    await NotificationService.sendClientNotification(event);
    await flush();
    expect(saveNotification).toHaveBeenCalledTimes(1);
    expect(errSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// Çağıran taraması (statik): mode zorunlu tiplerde (BATCH_PROCESS/EXPORT_READY/IMPORT_READY) her
// `sendClientNotification` çağrısı `mode:` göndermeli; aksi halde şema doğrulaması kaydı düşürür.
// ---------------------------------------------------------------------------------------------
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('sendClientNotification çağıranları: mode zorunlu tiplerde mode gönderir', () => {
  const srcDir = path.resolve(__dirname, '../../../src');
  const sites: { file: string; type: string; hasMode: boolean }[] = [];
  for (const f of walk(srcDir)) {
    if (f.endsWith(path.join('notification', 'NotificationService.ts'))) continue;
    const text = fs.readFileSync(f, 'utf8');
    // NB3: cagrilar `NotificationService.notify(..., { legacy: { event } })` altina goc etti (bayrak kapali eski olay); iki bicim de taranir.
    const re = /sendClientNotification\(|legacy:\s*\{/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(text)) !== null) {
      const idx = mm.index;
      const block = text.slice(idx, idx + 700);
      const m = block.match(/type:\s*'([A-Z_]+)'/);
      if (m) sites.push({ file: path.relative(srcDir, f).replace(/\\/g, '/'), type: m[1], hasMode: /\bmode:/.test(block) });
    }
  }

  it('7 çağrı yeri bulunur (integration-service x2, ImportOrchestrator, TrialExpiryJob, PostOrderOperations, OversellCompensationJob, OrderWorker ORDER_WINDOW_OVERFLOW)', () => {
    expect(sites.length).toBe(7);
  });

  it('BATCH_PROCESS/EXPORT_READY/IMPORT_READY gönderen her yer mode içerir', () => {
    const required = ['BATCH_PROCESS', 'EXPORT_READY', 'IMPORT_READY'];
    expect(sites.filter((s) => required.includes(s.type) && !s.hasMode)).toEqual([]);
  });

  it('STOCK_ALERT gönderen iki yol (PostOrderOperations, OversellCompensationJob) mode göndermez ve artık gerekmez', () => {
    const stock = sites.filter((s) => s.type === 'STOCK_ALERT');
    expect(stock.map((s) => s.file).sort()).toEqual(['operations/orders/postOrder.ts', 'operations/stock/OversellCompensationJob.ts']);
    expect(stock.every((s) => !s.hasMode)).toBe(true);
  });
});
