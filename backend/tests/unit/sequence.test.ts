/**
 * ADR-0021 D5: atomik sayaç yardımcısı + TicketService.openTicket numara üretimi. Mock'lu (DB yok).
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('@database/DatabaseManager', () => ({
  DatabaseManagerInstance: { getApplicationDB: jest.fn(), getClientDB: jest.fn() },
}));

import { nextSequence } from '@utils/sequence';
import TicketService from '@api/rpc/handlers/ticket-service';

/** Tek belge üzerinde atomik $inc davranışını taklit eden sahte Counters modeli (her çağrı farklı değer alır). */
function fakeCounterModel(start = 0) {
  let v = start;
  return {
    findOneAndUpdate: jest.fn(async (_f: any, _u: any, _o: any) => {
      await new Promise((r) => setImmediate(r)); // araya girme (interleave) sağla
      v += 1;
      return { _id: 'x', sequence_value: v };
    }),
  };
}

describe('nextSequence', () => {
  it('$inc + upsert + new ile çağırır ve sayıyı döndürür', async () => {
    const m = fakeCounterModel(41);
    await expect(nextSequence(m, 'ticket_number')).resolves.toBe(42);
    expect(m.findOneAndUpdate).toHaveBeenCalledWith({ _id: 'ticket_number' }, { $inc: { sequence_value: 1 } }, { new: true, upsert: true });
  });

  it('eşzamanlı 50 çağrı 50 farklı ardışık değer alır (çakışma yok)', async () => {
    const m = fakeCounterModel();
    const values = await Promise.all(Array.from({ length: 50 }, () => nextSequence(m, 'ticket_number')));
    expect(new Set(values).size).toBe(50);
    expect(Math.min(...values)).toBe(1);
    expect(Math.max(...values)).toBe(50);
  });

  it.each([[null], [{}], [{ sequence_value: 0 }], [{ sequence_value: 'abc' }], [{ sequence_value: 1.5 }]])('geçersiz sayaç yanıtı %p hata verir', async (doc) => {
    await expect(nextSequence({ findOneAndUpdate: async () => doc }, 'n')).rejects.toThrow('Sayaç geçersiz değer döndürdü: n');
  });
});

describe('TicketService.openTicket (tenant): TKT-<1000+seq> biçimi korunur', () => {
  it('ortak yardımcı üzerinden sıralı numara üretir', async () => {
    const counter = fakeCounterModel();
    const create = jest.fn(async (p: any) => p);
    const svc: any = new TicketService(7, { ticket: { subject: 's', message: 'mesaj' } });
    svc.applicationDB = { getCounterModel: () => counter, getTicketModel: () => ({ create }) };
    const t1 = await svc.openTicket();
    expect(t1.ticketNumber).toBe('TKT-1001');
    const t2 = await svc.openTicket();
    expect(t2.ticketNumber).toBe('TKT-1002');
    expect(t1.clientId).toBe(7);
  });

  it('getNextSequenceValue ortak yardımcıya delege eder', async () => {
    const svc: any = new TicketService(7, {});
    svc.applicationDB = { getCounterModel: () => fakeCounterModel(9) };
    await expect(svc.getNextSequenceValue('ticket_number')).resolves.toBe(10);
  });
});
