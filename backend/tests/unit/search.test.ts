import { describe, it, expect } from '@jest/globals';
import { escapeRegex, toSearchString, containsRegex, clampLimit, clampPage, MAX_SEARCH_LENGTH, MAX_PAGE_LIMIT } from '@utils/search';

describe('escapeRegex', () => {
  it('tüm regex meta karakterlerini kaçırır; kaçışlı desen girdiyi birebir (sabit metin) eşler', () => {
    const nasty = '.*+?^${}()|[]\\';
    const re = new RegExp(escapeRegex(nasty));
    expect(re.test(`önek${nasty}sonek`)).toBe(true);
    expect(re.test('herhangi bir şey')).toBe(false);
  });

  it('ReDoS deseni "(a+)+$" sabit metin olur: "aaaa…b" üzerinde felaket geri izleme yok, eşleşmez', () => {
    const re = new RegExp(escapeRegex('(a+)+$'), 'i');
    const t0 = Date.now();
    expect(re.test('a'.repeat(50) + 'b')).toBe(false);
    expect(Date.now() - t0).toBeLessThan(200);
  });

  it('meta karakter içermeyen arama metni değişmez ("içerir" davranışı aynı)', () => {
    expect(escapeRegex('ali veli 123 ÇŞĞ')).toBe('ali veli 123 ÇŞĞ');
    expect(new RegExp(escapeRegex('ali'), 'i').test('Mehmet ALİ ali')).toBe(true);
  });

  it('geçersiz regex üretebilecek girdiler ("(", "[", "*") artık hata vermez', () => {
    for (const s of ['(', '[', '*', '\\', 'a{2']) expect(() => new RegExp(escapeRegex(s))).not.toThrow();
  });
});

describe('toSearchString / containsRegex', () => {
  it('string/number kabul edilir; nesne, dizi, null, undefined, boolean → boş', () => {
    expect(toSearchString('abc')).toBe('abc');
    expect(toSearchString(12345)).toBe('12345');
    for (const v of [{ $ne: 'x' }, ['a'], null, undefined, true, NaN]) expect(toSearchString(v)).toBe('');
  });

  it(`uzunluk ${MAX_SEARCH_LENGTH} karaktere kırpılır`, () => {
    expect(toSearchString('a'.repeat(500)).length).toBe(MAX_SEARCH_LENGTH);
    expect(toSearchString('a'.repeat(500), 10).length).toBe(10);
  });

  it('containsRegex: kaçışlı + case-insensitive; nesne girdisi operatör taşıyamaz', () => {
    expect(containsRegex('a.b')).toEqual({ $regex: 'a\\.b', $options: 'i' });
    expect(containsRegex({ $gt: '' })).toEqual({ $regex: '', $options: 'i' });
  });
});

describe('clampLimit / clampPage', () => {
  it(`üst sınır ${MAX_PAGE_LIMIT}; geçerli değerler değişmez (FE: 10/13/15/20/25/50/100)`, () => {
    for (const v of [10, 13, 15, 20, 25, 50, 100, 200]) expect(clampLimit(v, 15)).toBe(v);
    expect(clampLimit(201, 15)).toBe(200);
    expect(clampLimit(1e9, 15)).toBe(200);
  });
  it('özel üst sınır (admin müşteri seçimi 1000)', () => {
    expect(clampLimit(1000, 50, 1000)).toBe(1000);
    expect(clampLimit(5000, 50, 1000)).toBe(1000);
  });
  it('geçersiz (0, negatif, -1 "tümü", NaN, string, nesne) → varsayılan; string sayı kabul edilir; ondalık aşağı', () => {
    for (const v of [0, -1, -50, NaN, 'abc', {}, null, undefined, Infinity]) expect(clampLimit(v, 15)).toBe(15);
    expect(clampLimit('25', 15)).toBe(25);
    expect(clampLimit(12.9, 15)).toBe(12);
  });
  it('clampPage: ≥1 tamsayı, geçersiz → 1', () => {
    expect(clampPage(3)).toBe(3);
    for (const v of [0, -2, NaN, 'x', null, undefined]) expect(clampPage(v)).toBe(1);
  });
});
