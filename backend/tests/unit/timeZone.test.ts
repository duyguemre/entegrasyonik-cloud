import { describe, it, expect } from '@jest/globals';
import { startOfDayInZone, endOfDayInZone, addDaysInZone, dayKeyInZone, PLATFORM_TIME_ZONE } from '@utils/timeZone';

describe('timeZone yardımcıları (Europe/Istanbul, UTC+3 sabit)', () => {
  it('startOfDayInZone: UTC 22:30 (İstanbul ertesi gün 01:30) -> ertesi gün İstanbul gece yarısı', () => {
    expect(startOfDayInZone(new Date('2026-06-14T22:30:00Z')).toISOString()).toBe('2026-06-14T21:00:00.000Z');
    expect(startOfDayInZone(new Date('2026-06-14T20:59:59Z')).toISOString()).toBe('2026-06-13T21:00:00.000Z');
  });
  it('endOfDayInZone: gün sonu 23:59:59.999 İstanbul', () => {
    expect(endOfDayInZone(new Date('2026-03-10T05:00:00Z')).toISOString()).toBe('2026-03-10T20:59:59.999Z');
  });
  it('addDaysInZone: takvim günü ekler/çıkarır (ay/yıl sınırı dahil)', () => {
    const d = startOfDayInZone(new Date('2026-03-01T10:00:00Z'));
    expect(addDaysInZone(d, -1).toISOString()).toBe('2026-02-27T21:00:00.000Z');
    expect(addDaysInZone(startOfDayInZone(new Date('2026-12-31T10:00:00Z')), 1).toISOString()).toBe('2026-12-31T21:00:00.000Z');
  });
  it('dayKeyInZone: İstanbul takvim günü', () => {
    expect(dayKeyInZone(new Date('2026-06-14T22:30:00Z'))).toBe('2026-06-15');
    expect(dayKeyInZone(new Date('2026-06-14T20:59:00Z'))).toBe('2026-06-14');
  });
  it('başka saat diliminde DST doğru (America/New_York, yaz UTC-4 / kış UTC-5)', () => {
    expect(startOfDayInZone(new Date('2026-07-01T12:00:00Z'), 'America/New_York').toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(startOfDayInZone(new Date('2026-01-15T12:00:00Z'), 'America/New_York').toISOString()).toBe('2026-01-15T05:00:00.000Z');
    // DST geçiş günü (8 Mart 2026): gün 23 saat
    const day = new Date('2026-03-08T12:00:00Z');
    const start = startOfDayInZone(day, 'America/New_York');
    expect(endOfDayInZone(day, 'America/New_York').getTime() - start.getTime() + 1).toBe(23 * 3600 * 1000);
  });
  it('varsayılan saat dilimi Europe/Istanbul', () => {
    expect(PLATFORM_TIME_ZONE).toBe('Europe/Istanbul');
  });
});
