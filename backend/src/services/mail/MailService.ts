import nodemailer, { Transporter } from 'nodemailer';
import { config } from '@config';
import { logger } from '@platform/core/logger';
import { classifyMailError, maskEmail } from './classifyMailError';

export interface MailMessage { to: string; subject: string; text: string; html?: string; headers?: Record<string, string> }

/** `sendMessage` hatasi: `kind` (transient|permanent) ve ham hata ICERMEYEN `code` tasir (ADR-0029 Karar 4). */
export class MailSendError extends Error {
    constructor(public readonly kind: 'transient' | 'permanent', public readonly code: string) { super(`mail_send_failed:${code}`); }
}

/**
 * MailService: Sistem genelinde e-posta gönderimlerini yöneten merkezi servis.
 * Zoho SMTP yapılandırmasını kullanır.
 */
class MailService {
    private transporter: Transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: config.mail.host,
            port: config.mail.port,
            secure: config.mail.port === 465,
            auth: {
                user: config.mail.user || '',
                pass: config.mail.pass || '',
            },
            // Havuzlama (Pooling) kullanarak SMTP bağlantısını açık tutabiliriz
            pool: true,
            maxConnections: 5,
            maxMessages: 100
        });
    }

    /**
     * Temel e-posta gönderim metodu.
     */
    public async send(to: string, subject: string, text: string, html?: string): Promise<void> {
        try {
            const fromName = config.mail.fromName;
            const fromEmail = config.mail.fromEmail || '';

            const info = await this.transporter.sendMail({
                from: `"${fromName}" <${fromEmail}>`,
                to,
                subject,
                text,
                html: html || text, // HTML varsa kullan, yoksa text'i bas
            });

            console.log(`[MailService] Mail sent to ${to}. MessageID: ${info.messageId}`);
        } catch (error: any) {
            console.error('[MailService] Error sending mail:', error.message);
            throw new Error(`Mail sending failed: ${error.message}`);
        }
    }


    /**
     * ADR-0029 Karar 4: basliklı (List-Unsubscribe) gonderim; `{messageId}` doner; hata siniflandirilir; logda alici MASKELI.
     * Mevcut `send` davranisi degismez.
     */
    public async sendMessage(msg: MailMessage): Promise<{ messageId: string }> {
        try {
            const info = await this.transporter.sendMail({
                from: `"${config.mail.fromName}" <${config.mail.fromEmail || ''}>`,
                to: msg.to, subject: msg.subject, text: msg.text, html: msg.html ?? msg.text, headers: msg.headers,
            });
            logger.info({ module: 'mail', to: maskEmail(msg.to), messageId: info.messageId }, 'mail sent');
            return { messageId: String(info.messageId) };
        } catch (error: any) {
            const c = classifyMailError(error);
            logger.warn({ module: 'mail', to: maskEmail(msg.to), errClass: c.code }, 'sendMessage failed');
            throw new MailSendError(c.kind, c.code);
        }
    }

    /**
     * Şablon bazlı (Örn: Şifre Sıfırlama) özel gönderimler için genişletilebilir
     */
    public async sendWelcomeMail(to: string, userName: string): Promise<void> {
        const subject = "Entegrasyonik'e Hoş Geldiniz!";
        const text = `Merhaba ${userName}, aramıza katıldığınız için mutluyuz.`;
        return this.send(to, subject, text);
    }
}

// Named export: Singleton instance
export const mailService = new MailService();