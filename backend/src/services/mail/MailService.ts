import nodemailer, { Transporter } from 'nodemailer';
import { config } from '@config';

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