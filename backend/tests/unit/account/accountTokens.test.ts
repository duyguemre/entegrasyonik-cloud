import { describe, it, expect } from '@jest/globals';
import {
  EMAIL_VERIFY_TTL_MS, PASSWORD_RESET_TTL_MS, consumeToken, generateToken, hashToken, isWellFormedToken, isWithinCooldown,
  issueToken, peekToken, TOKEN_RESEND_COOLDOWN_MS,
} from '../../../src/operations/account/accountTokens';
import { makeFakeModel } from './_fakeDb';

describe('token üretimi / özet / biçim', () => {
  it('token 256 bit rastgele (43 karakter base64url), her seferinde farklı; özet sha256 hex ve token\'dan farklı', () => {
    const a = generateToken(); const b = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).not.toContain(a);
  });

  it('isWellFormedToken: yalnızca beklenen biçimdeki string; nesne/dizi/kısa/uzun/özel karakter reddedilir', () => {
    expect(isWellFormedToken(generateToken())).toBe(true);
    for (const bad of [undefined, null, 5, {}, { $ne: null }, ['x'.repeat(43)], '', 'kisa', 'x'.repeat(200), 'a'.repeat(40) + '$ne', 'a b'.repeat(15)]) {
      expect([bad, isWellFormedToken(bad)]).toEqual([bad, false]);
    }
  });
});

describe('issueToken / consumeToken (atomik tek kullanım)', () => {
  it('yalnızca HASH saklanır: kayıtta düz token yok; amaç başına TTL (sıfırlama 30 dk, doğrulama 24 sa)', async () => {
    const model = makeFakeModel();
    const now = 1_700_000_000_000;
    const r = await issueToken(model, 'u1', 'password_reset', { now, ip: '203.0.113.5' });
    const v = await issueToken(model, 'u1', 'email_verify', { now });
    expect(model.docs).toHaveLength(2);
    for (const d of model.docs) expect(JSON.stringify(d)).not.toContain(r.token);
    expect(model.docs[0].tokenHash).toBe(hashToken(r.token));
    expect(model.docs[0].expiresAt.getTime() - now).toBe(PASSWORD_RESET_TTL_MS);
    expect(model.docs[1].expiresAt.getTime() - now).toBe(EMAIL_VERIFY_TTL_MS);
    expect(PASSWORD_RESET_TTL_MS).toBe(30 * 60 * 1000);
    expect(v.token).not.toBe(r.token);
  });

  it('tek aktif token: yenisi üretilince aynı kullanıcı+amaçtaki eski token geçersiz olur; başka amaç/kullanıcı etkilenmez', async () => {
    const model = makeFakeModel();
    const now = 1_700_000_000_000;
    const t1 = await issueToken(model, 'u1', 'password_reset', { now });
    const other = await issueToken(model, 'u2', 'password_reset', { now });
    const t2 = await issueToken(model, 'u1', 'password_reset', { now: now + 1000 });
    expect(await consumeToken(model, t1.token, 'password_reset', now + 2000)).toBeNull();
    expect(await consumeToken(model, other.token, 'password_reset', now + 2000)).toEqual({ sub: 'u2' });
    expect(await consumeToken(model, t2.token, 'password_reset', now + 2000)).toEqual({ sub: 'u1' });
  });

  it('tek kullanım: ikinci tüketim null; eşzamanlı iki tüketimden YALNIZCA biri başarılı', async () => {
    const model = makeFakeModel();
    const now = 1_700_000_000_000;
    const t = await issueToken(model, 'u1', 'email_verify', { now });
    const [a, b] = await Promise.all([consumeToken(model, t.token, 'email_verify', now + 10), consumeToken(model, t.token, 'email_verify', now + 10)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await consumeToken(model, t.token, 'email_verify', now + 20)).toBeNull();
  });

  it('süresi dolmuş token tüketilemez (sınır: expiresAt anı dahil değil); yanlış amaçla tüketilemez', async () => {
    const model = makeFakeModel();
    const now = 1_700_000_000_000;
    const t = await issueToken(model, 'u1', 'password_reset', { now });
    expect(await consumeToken(model, t.token, 'email_verify', now + 1000)).toBeNull();
    expect(await consumeToken(model, t.token, 'password_reset', now + PASSWORD_RESET_TTL_MS)).toBeNull();
    expect(await consumeToken(model, t.token, 'password_reset', now + PASSWORD_RESET_TTL_MS - 1)).toEqual({ sub: 'u1' });
  });

  it('biçimsiz token veritabanına HİÇ gitmez (operatör enjeksiyonu güvenli)', async () => {
    const model = makeFakeModel();
    for (const bad of [{ $ne: null } as any, ['x'], 'x', undefined as any]) {
      expect(await consumeToken(model, bad, 'password_reset')).toBeNull();
      expect(await peekToken(model, bad, 'password_reset')).toBeNull();
    }
    expect(model.calls.findOneAndUpdate ?? []).toHaveLength(0);
    expect(model.calls.findOne ?? []).toHaveLength(0);
  });

  it('peekToken tüketmez; isWithinCooldown son token\'a göre karar verir', async () => {
    const model = makeFakeModel();
    const now = 1_700_000_000_000;
    const t = await issueToken(model, 'u1', 'password_reset', { now });
    expect(await peekToken(model, t.token, 'password_reset', now + 5)).toEqual({ sub: 'u1' });
    expect(await peekToken(model, t.token, 'password_reset', now + 5)).toEqual({ sub: 'u1' }); // hâlâ geçerli
    expect(await isWithinCooldown(model, 'u1', 'password_reset', now + TOKEN_RESEND_COOLDOWN_MS - 1)).toBe(true);
    expect(await isWithinCooldown(model, 'u1', 'password_reset', now + TOKEN_RESEND_COOLDOWN_MS)).toBe(false);
    expect(await isWithinCooldown(model, 'u2', 'password_reset', now)).toBe(false);
  });
});
