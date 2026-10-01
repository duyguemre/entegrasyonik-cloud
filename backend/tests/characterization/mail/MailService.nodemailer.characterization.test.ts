/**
 * CHARACTERIZATION: MailService + classifyMailError — GERÇEK nodemailer, jsonTransport (ağ/SMTP YOK).
 * Amaç: nodemailer majör yükseltmesi (BACKLOG C18b) sözleşmeyi değiştirmesin:
 * sendMessage başlıklarla {messageId} döner; EENVELOPE -> permanent/invalid_recipient; bağlantı hatası -> transient/network.
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import nodemailer from 'nodemailer';
import net from 'net';
import { classifyMailError } from '../../../src/services/mail/classifyMailError';

afterEach(() => { jest.restoreAllMocks(); });

function loadMailServiceWithJsonTransport(): { mailService: any; MailSendError: any; transport: any } {
  // isolateModules taze bir registry açar: gerçek nodemailer orada yüklenir, createTransport jsonTransport'a yönlenir.
  let mod: any; let transport: any;
  jest.isolateModules(() => {
    const real = jest.requireActual('nodemailer') as any;
    transport = real.createTransport({ jsonTransport: true });
    jest.doMock('nodemailer', () => ({ __esModule: true, default: { ...real, createTransport: () => transport }, createTransport: () => transport }));
    mod = require('../../../src/services/mail/MailService');
  });
  return { mailService: mod.mailService, MailSendError: mod.MailSendError, transport };
}

describe('MailService (gerçek nodemailer, jsonTransport)', () => {
  it('[MEVCUT DAVRANIŞ] sendMessage: {messageId} döner; to/subject/text/html ve özel başlıklar mesaja yansır; html yoksa text kullanılır', async () => {
    const { mailService, transport } = loadMailServiceWithJsonTransport();
    const spy = jest.spyOn(transport, 'sendMail');
    const res = await mailService.sendMessage({ to: 'kisi@example.com', subject: 'Konu', text: 'Merhaba', headers: { 'List-Unsubscribe': '<https://x.test/u>' } });
    expect(typeof res.messageId).toBe('string');
    expect(res.messageId.length).toBeGreaterThan(0);
    const sent: any = await (spy.mock.results[0].value as Promise<any>);
    const json = JSON.parse(sent.message);
    expect(json.subject).toBe('Konu');
    expect(json.to).toEqual([{ address: 'kisi@example.com', name: '' }]);
    expect(json.text).toBe('Merhaba');
    expect(json.html).toBe('Merhaba');
    expect(json.headers['List-Unsubscribe']).toBe('<https://x.test/u>');
  });

  it('[MEVCUT DAVRANIŞ] alıcı yok (EENVELOPE): MailSendError kind=permanent code=invalid_recipient; ham mesaj/adres SIZMAZ', async () => {
    const { mailService, transport } = loadMailServiceWithJsonTransport();
    const real = Object.assign(new Error('No recipients defined'), { code: 'EENVELOPE' });
    jest.spyOn(transport, 'sendMail').mockRejectedValue(real);
    const err: any = await mailService.sendMessage({ to: 'kisi@example.com', subject: 'K', text: 'T' }).catch((e: unknown) => e);
    expect(err.constructor.name).toBe('MailSendError');
    expect(err.kind).toBe('permanent');
    expect(err.code).toBe('invalid_recipient');
    expect(err.message).toBe('mail_send_failed:invalid_recipient');
  });

  it('[MEVCUT DAVRANIŞ] send(): hata "Mail sending failed: ..." olarak yeniden fırlatılır', async () => {
    const { mailService, transport } = loadMailServiceWithJsonTransport();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(transport, 'sendMail').mockRejectedValue(new Error('boom'));
    await expect(mailService.send('kisi@example.com', 'K', 'T')).rejects.toThrow('Mail sending failed: boom');
  });
});

describe('classifyMailError x gerçek nodemailer hataları', () => {
  it('[MEVCUT DAVRANIŞ] kapalı porta bağlantı (gerçek SMTP istemcisi, yerel kapalı port) -> transient/network', async () => {
    const port: number = await new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); }); });
    const t = nodemailer.createTransport({ host: '127.0.0.1', port, secure: false, connectionTimeout: 2000 });
    const err: any = await t.sendMail({ from: 'a@example.com', to: 'b@example.com', subject: 's', text: 't' }).catch((e: unknown) => e);
    expect(err?.message).toEqual(expect.any(String));
    expect(classifyMailError(err)).toEqual({ kind: 'transient', code: 'network' });
  });

  it('[MEVCUT DAVRANIŞ] SMTP 550 (yerel sahte sunucu) -> permanent/smtp_5xx', async () => {
    const server = net.createServer((sock) => {
      sock.write('220 fake ESMTP\r\n');
      sock.on('data', (d) => {
        const line = d.toString();
        if (/^(EHLO|HELO)/i.test(line)) sock.write('250 fake\r\n');
        else if (/^MAIL FROM/i.test(line)) sock.write('250 ok\r\n');
        else if (/^RCPT TO/i.test(line)) sock.write('550 no such user\r\n');
        else if (/^QUIT/i.test(line)) sock.end('221 bye\r\n');
        else sock.write('250 ok\r\n');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as net.AddressInfo).port;
    try {
      const t = nodemailer.createTransport({ host: '127.0.0.1', port, secure: false, ignoreTLS: true, connectionTimeout: 2000, greetingTimeout: 2000 });
      const err: any = await t.sendMail({ from: 'a@example.com', to: 'b@example.com', subject: 's', text: 't' }).catch((e: unknown) => e);
      expect(err.responseCode).toBe(550);
      expect(classifyMailError(err)).toEqual({ kind: 'permanent', code: 'smtp_5xx' });
    } finally { server.close(); }
  });
});
