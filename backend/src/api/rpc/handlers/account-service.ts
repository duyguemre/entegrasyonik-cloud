import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import type { SessionResult } from '../dto/sessionResult'
import { AccountLifecycleService, GENERIC_RESET_MESSAGE, runInBackground, defaultMailSender } from '@operations/account/AccountLifecycleService'
import { InvitationService } from '@operations/users/invitations'
import { DatabaseManagerInstance } from '@database/DatabaseManager'

/**
 * Kimlik hesabı yaşam döngüsü uçları (docs/API_ACCOUNT_LIFECYCLE.md). İnce API katmanı: iş kuralları AccountLifecycleService'te.
 *
 *  - changePassword, resendVerificationEmail: kimlikli (member kademesi; kendi hesabı — hedef kullanıcı DAİMA doğrulanmış principal.sub).
 *  - requestPasswordReset, confirmPasswordReset, verifyEmail: AÇIK (kimliksiz) operasyonlar (operationPolicy.OPEN_OPERATIONS).
 *    Rate limit ve çerez işlemleri ApiManager'daki özel rotalardadır (login/register deseni).
 */
export default class AccountService extends BaseApi implements IService {

    /** IService sözleşmesi (zayıf tip) için; politika kaydında YOK -> jenerik RPC ile çağrılamaz (403). */
    async get(): Promise<any> {
    }

    private lifecycle(): AccountLifecycleService {
        return new AccountLifecycleService({ applicationDB: this.applicationDB })
    }

    private ip(): string | undefined {
        return this.request?.requestMeta?.ip
    }

    /**
     * Oturum açmış kullanıcının parolasını değiştirir. Sonuç { sessionClaims, body } zarfıdır: ApiManager mevcut oturum için YENİ çerezi
     * basar (diğer oturumlar tokenVersion artışıyla düşer); claim'ler gövdeye ASLA girmez.
     */
    async changePassword(): Promise<SessionResult> {
        const { currentPassword, newPassword } = this.request ?? {}
        return await this.lifecycle().changePassword({ principal: this.request?.principal, currentPassword, newPassword, ip: this.ip() })
    }

    /**
     * HER ZAMAN aynı genel yanıt (kayıtlı/kayıtsız/pasif/cooldown ayrımı yok). Kullanıcı arama, token üretimi ve e-posta gönderimi yanıttan
     * SONRA arka planda yapılır (yanıt süresi de varlığı sızdırmaz). Tek istisnalar kullanıcıdan bağımsız hatalar: geçersiz biçim (400),
     * bağlantı tabanı yapılandırılmamış (503).
     */
    async requestPasswordReset(): Promise<any> {
        const lifecycle = this.lifecycle()
        const { email, baseUrl } = lifecycle.prepareResetRequest(this.request?.email)
        runInBackground(lifecycle.executeResetRequest(email, baseUrl, this.ip()))
        return { success: true, message: GENERIC_RESET_MESSAGE }
    }

    /** Tek kullanımlık token + yeni parola. Oturum AÇMAZ; başarıda kullanıcının tüm oturumları düşer. */
    async confirmPasswordReset(): Promise<any> {
        const { token, newPassword } = this.request ?? {}
        return await this.lifecycle().confirmPasswordReset(token, newPassword, this.ip())
    }

    /** E-posta doğrulama token'ını tüketir; kullanıcı kimliksiz olabilir (bağlantı başka tarayıcıda açılmış olabilir). */
    async verifyEmail(): Promise<any> {
        return await this.lifecycle().verifyEmail(this.request?.token, this.ip())
    }

    /** Oturum açmış kullanıcının doğrulama e-postasını yeniden gönderir (dakikada en fazla 1). */
    async resendVerificationEmail(): Promise<any> {
        return await this.lifecycle().resendVerification(this.request?.principal, this.ip())
    }

    /**
     * [ADR-0028 WP-A4] AÇIK (kimliksiz) davet uçları: yalnız `{tenantTitle, role, email (maskeli), expiresAt}` döner. Rate limit ApiManager'daki özel rotada
     * (accountTokenLimiter). Oturum AÇMAZ (kabul sonrası kullanıcı giriş yapar).
     */
    async getInvitation(): Promise<any> {
        return await this.invitations().getPublic(this.request?.token, this.ip())
    }

    /** Token (tek kullanım, sha256 sabit-zamanlı) + ad/soyad/parola; kullanıcı + üyelik oluşturur (e-posta doğrulanmış sayılır: token e-postaya gitti). */
    async acceptInvitation(): Promise<any> {
        const { token, name, surname, password } = this.request ?? {}
        return await this.invitations().accept({ token, name, surname, password }, this.ip())
    }

    private invitations(): InvitationService {
        return new InvitationService({
            applicationDB: this.applicationDB, mailSender: defaultMailSender,
            getClientDB: (tid: number) => DatabaseManagerInstance.getClientDB(tid),
        })
    }

    /** [ADR-0028 Karar 8] Adım-yükseltmesi: parolayı yeniden doğrular; `reauthValidUntil` (5 dk) döner. Kimlikli. */
    async reauthenticate(): Promise<any> {
        return await this.lifecycle().reauthenticate(this.request?.principal, this.request?.password, this.ip())
    }
}
