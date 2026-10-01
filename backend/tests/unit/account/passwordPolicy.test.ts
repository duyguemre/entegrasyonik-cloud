import { describe, it, expect } from '@jest/globals';
import { assertPasswordStrength, checkPasswordStrength, PASSWORD_POLICY_MAX_BYTES } from '../../../src/operations/account/passwordPolicy';

// Parola politikası TEK YERDE (changePassword + confirmPasswordReset bunu kullanır). Aşağıdaki parolalar sahte test değerleridir.

describe('checkPasswordStrength', () => {
  it('güçlü parolalar kabul: 10+ karakter ve 3 sınıf; 16+ karakterlik parola cümlesi (sınıf şartı yok); Türkçe karakterler', () => {
    for (const p of ['Kx9!mQ2#vL', 'Abcdef123x', 'kucuk-harf-ve-uzun-cumle', 'Şifre-Çok-Güçlü-9', 'a1B2c3D4e5']) {
      expect([p, checkPasswordStrength(p)]).toEqual([p, []]);
    }
  });

  it('kısa parola (<10 karakter) reddedilir; sayı olmayan girdi de too_short sayılır', () => {
    expect(checkPasswordStrength('Ab1!xyz')).toContain('too_short');
    expect(checkPasswordStrength('')).toContain('too_short');
    expect(checkPasswordStrength(undefined)).toEqual(['too_short']);
    expect(checkPasswordStrength({ $ne: null })).toEqual(['too_short']);
  });

  it('10-15 karakter arası parola en az 3 karakter sınıfı ister (yalnızca küçük harf / küçük+rakam reddedilir)', () => {
    expect(checkPasswordStrength('zxcvbnmasd')).toContain('weak_composition');
    expect(checkPasswordStrength('zxcvbnmas1')).toContain('weak_composition');
    expect(checkPasswordStrength('Zxcvbnmas1')).not.toContain('weak_composition');
  });

  it('72 bayttan uzun parola reddedilir (bcrypt sessizce keserdi); çok baytlı karakterler bayt olarak sayılır', () => {
    expect(checkPasswordStrength('Aa1!' + 'x'.repeat(PASSWORD_POLICY_MAX_BYTES))).toContain('too_long');
    expect(checkPasswordStrength('Aa1!' + 'ç'.repeat(35))).toContain('too_long'); // 4 + 70 bayt = 74
    expect(checkPasswordStrength('Aa1!' + 'x'.repeat(PASSWORD_POLICY_MAX_BYTES - 4))).not.toContain('too_long');
  });

  it('yaygın parolalar (ayırıcılar/büyük-küçük harf yok sayılarak) reddedilir', () => {
    for (const p of ['Password123', 'PASSWORD-123', 'qwerty.uiop', '1234567890', 'Entegrasyonik123', 'hepsi_burada']) {
      const issues = checkPasswordStrength(p);
      expect([p, issues.includes('common') || issues.includes('too_short') || issues.includes('repetitive')]).toEqual([p, true]);
    }
    expect(checkPasswordStrength('Password123')).toContain('common');
    expect(checkPasswordStrength('Entegrasyonik123')).toContain('common');
  });

  it('tekrarlayan / ardışık parolalar reddedilir', () => {
    expect(checkPasswordStrength('aaaaaaaaaaaaaaaaaaaa')).toContain('repetitive');
    expect(checkPasswordStrength('abababababababab')).toContain('repetitive');
    expect(checkPasswordStrength('0123456789012')).toContain('repetitive');
    expect(checkPasswordStrength('9876543210987')).toContain('repetitive');
    expect(checkPasswordStrength('passwordpassword')).toContain('repetitive'); // aynı birimin tekrarı
    expect(checkPasswordStrength('Aa1!Aa1!Aa1!')).toContain('repetitive');
    expect(checkPasswordStrength('Kx9!mQ2#vL')).not.toContain('repetitive');
  });

  it('kullanıcı bağlamı: e-posta yerel kısmı, ad veya soyad (>=4 karakter) parolada geçemez; kısa parçalar serbest', () => {
    const ctx = { email: 'ahmet.yilmaz@example.test', name: 'Mehmet', surname: 'Kaya' };
    expect(checkPasswordStrength('Xx-ahmet.yilmaz-9', ctx)).toContain('contains_identity');
    expect(checkPasswordStrength('Sifre-MEHMET-2026!', ctx)).toContain('contains_identity');
    expect(checkPasswordStrength('kaya-Zq9!Wp2#Lm', ctx)).toContain('contains_identity');
    expect(checkPasswordStrength('Zq9!Wp2#Lm-ok', { email: 'ab@x.test', name: 'Al', surname: 'Bo' })).toEqual([]);
  });
});

describe('assertPasswordStrength', () => {
  it('güçlü parolayı aynen döner', () => {
    expect(assertPasswordStrength('Kx9!mQ2#vL')).toBe('Kx9!mQ2#vL');
  });

  it('zayıfsa 400 + WEAK_PASSWORD kodu; mesaj kuralları söyler ama parolanın kendisini İÇERMEZ', () => {
    const weak = 'Sifre-ahmet-1';
    try {
      assertPasswordStrength(weak, { email: 'ahmet@example.test' });
      throw new Error('fırlatmalıydı');
    } catch (e: any) {
      expect(e.statusCode).toBe(400);
      expect(e.code).toBe('WEAK_PASSWORD');
      expect(e.message).not.toContain(weak);
    }
  });

  it('boş / string olmayan girdi 400 WEAK_PASSWORD', () => {
    for (const bad of ['', undefined, null, 5, { $gt: '' }]) {
      expect(() => assertPasswordStrength(bad)).toThrow(expect.objectContaining({ statusCode: 400, code: 'WEAK_PASSWORD' }));
    }
  });
});
