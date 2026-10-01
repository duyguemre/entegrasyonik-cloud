import { describe, it, expect } from '@jest/globals';
// Alias çözümlemesinin kanıtı: @utils/* -> src/utils/* (saf fonksiyon, DB/Redis/ağ yok)
import generateBarcode from '@utils/BarcodeGenerator';

describe('test altyapısı duman testi', () => {
  it('@utils alias çözümlenir ve saf fonksiyon çalışır', () => {
    const barcode = generateBarcode(1);
    // 294 (ülke) + 2000 (üretici) + 00001 (ürün) + 1 kontrol hanesi = 13 hane
    expect(barcode).toMatch(/^\d{13}$/);
    expect(barcode.startsWith('294200000001')).toBe(true);
  });

  it('aralık dışı ürün kodunda hata fırlatır (mevcut davranış)', () => {
    expect(() => generateBarcode(0)).toThrow();
    expect(() => generateBarcode(100000)).toThrow();
  });
});
