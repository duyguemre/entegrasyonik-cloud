// ADR-0017 §10 / ADR-0016 §4.3: hata kodu kataloğu. `docs/ERROR_CODES.md` BU dosyadan üretilir
// (tests/unit/platform/errorCodes.docs.test.ts eşitliği zorlar; güncellemek için UPDATE_ERROR_CODES=1 ile o testi koşun).
//
// Kod = makine-okur, KARARLI sözleşme (FE ileti eşlemesi bu koda göre yapılır; metin yalnızca yedektir). Kod SİLİNMEZ/yeniden
// anlamlandırılmaz; yeni kod eklenir. `status` = varsayılan HTTP durumu.

export interface ErrorCodeDef {
    readonly status: number;
    /** Kullanıcıya gösterilebilir güvenli varsayılan ileti (TR). */
    readonly message: string;
    readonly group: 'genel' | 'entegrasyon' | 'hesap';
    readonly description: string;
}

export const ERROR_CODES = {
    // --- Genel (ADR-0016 §4.3) ---
    VALIDATION: { status: 400, group: 'genel', message: 'Geçersiz istek.', description: 'Girdi doğrulaması başarısız (eksik/yanlış tipli/aralık dışı alan).' },
    UNAUTHENTICATED: { status: 401, group: 'genel', message: 'Oturum gerekli.', description: 'Kimlik doğrulanamadı (token yok/geçersiz/süresi dolmuş).' },
    FORBIDDEN: { status: 403, group: 'genel', message: 'Bu işlem için yetkiniz yok.', description: 'Kimlik doğrulandı ama kademe/rol/tenant kuralı işleme izin vermiyor (ADR-0001).' },
    NOT_FOUND: { status: 404, group: 'genel', message: 'Kayıt bulunamadı.', description: 'İstenen kaynak yok ya da bu tenant için görünür değil.' },
    CONFLICT: { status: 409, group: 'genel', message: 'İşlem mevcut durumla çakışıyor.', description: 'Eşzamanlı değişiklik / benzersizlik ihlali.' },
    RATE_LIMITED: { status: 429, group: 'genel', message: 'Çok fazla istek. Lütfen biraz bekleyin.', description: 'Rate limit aşıldı; `Retry-After` başlığı beklenecek saniyeyi verir.' },
    QUOTA_EXCEEDED: { status: 403, group: 'genel', message: 'Plan kotanız doldu.', description: 'Abonelik planının sayısal sınırı aşıldı (ADR-0008 EntitlementService).' },
    PLAN_REQUIRED: { status: 402, group: 'genel', message: 'Bu özellik mevcut planınızda yok.', description: 'Özellik daha üst bir plan gerektiriyor (ADR-0008).' },
    SUBSCRIPTION_RESTRICTED: { status: 403, group: 'genel', message: 'Aboneliğiniz bu işlem için yeterli erişime sahip değil.', description: 'ADR-0008 §3 durum makinesi: `EntitlementService.checkAccess` reddetti (suspended/canceled/expired/no_subscription); asıl neden `error` alanındadır. Yalnızca `ENTITLEMENT_GUARD_ENABLED=true` iken üretilir.' },
    INTERNAL: { status: 500, group: 'genel', message: 'Beklenmeyen bir hata oluştu.', description: 'Beklenmeyen sunucu hatası. Ayrıntı YALNIZCA sunucu logunda; yanıtta `requestId` ile eşleştirilir.' },

    // --- Entegrasyon (ADR-0006 `IntegrationError` kodları; genel kodlarla aynı adlar aynı anlamdadır) ---
    AUTH: { status: 502, group: 'entegrasyon', message: 'Pazaryeri kimlik bilgisi geçersiz.', description: 'Dış servis kimlik doğrulamayı reddetti (kimlik bilgisi/anahtar yenilenmeli).' },
    UNAVAILABLE: { status: 503, group: 'entegrasyon', message: 'Dış servis geçici olarak kullanılamıyor.', description: 'Dış servis yanıt vermiyor / devre kesici açık (ADR-0006).' },
    NOT_SUPPORTED: { status: 501, group: 'entegrasyon', message: 'Bu işlem bu entegrasyonda desteklenmiyor.', description: 'Adaptör bu yeteneği sunmuyor (mock modunda mock\'lanmamış uç dahil).' },
    UNKNOWN_OUTCOME: { status: 502, group: 'entegrasyon', message: 'İşlemin sonucu doğrulanamadı.', description: 'Yazma çağrısı zaman aşımı/kopma ile bitti; sonuç belirsiz, otomatik yeniden deneme YAPILMAZ (ADR-0006).' },

    // --- Hesap yaşam döngüsü (docs/API_ACCOUNT_LIFECYCLE.md; mevcut özel kodlar — geriye uyum) ---
    INVALID_REQUEST: { status: 400, group: 'hesap', message: 'İstek geçersiz.', description: 'Hesap uçlarında genel geçersiz istek.' },
    INVALID_CURRENT_PASSWORD: { status: 400, group: 'hesap', message: 'Mevcut parola hatalı.', description: 'changePassword: mevcut parola yanlış.' },
    SAME_PASSWORD: { status: 400, group: 'hesap', message: 'Yeni parola mevcut parolayla aynı olamaz.', description: 'changePassword: yeni parola eskiyle aynı.' },
    WEAK_PASSWORD: { status: 400, group: 'hesap', message: 'Parola politikayı karşılamıyor.', description: 'Parola politikası ihlali (uzunluk/karmaşıklık).' },
    TOKEN_INVALID: { status: 400, group: 'hesap', message: 'Bağlantı geçersiz veya süresi dolmuş.', description: 'Parola sıfırlama / e-posta doğrulama belirteci geçersiz.' },
    EMAIL_NOT_CONFIGURED: { status: 503, group: 'hesap', message: 'E-posta gönderimi yapılandırılmamış.', description: 'PUBLIC_APP_URL/SMTP tanımsız; e-posta gerektiren uçlar kapalı.' },
    COOLDOWN: { status: 429, group: 'hesap', message: 'Lütfen yeni bir istekten önce bekleyin.', description: 'Aynı e-posta türü için bekleme süresi dolmadı.' },
    MAIL_FAILED: { status: 502, group: 'hesap', message: 'E-posta gönderilemedi.', description: 'SMTP gönderimi başarısız.' },
} as const satisfies Record<string, ErrorCodeDef>;

export type ErrorCode = keyof typeof ERROR_CODES;

export function isKnownErrorCode(code: unknown): code is ErrorCode {
    return typeof code === 'string' && Object.prototype.hasOwnProperty.call(ERROR_CODES, code);
}

/** HTTP durumundan katalog kodu (kod verilmemiş hatalar için). */
export function codeForStatus(status: number): ErrorCode {
    switch (status) {
        case 400: case 422: return 'VALIDATION';
        case 401: return 'UNAUTHENTICATED';
        case 402: return 'PLAN_REQUIRED';
        case 403: return 'FORBIDDEN';
        case 404: return 'NOT_FOUND';
        case 409: return 'CONFLICT';
        case 429: return 'RATE_LIMITED';
        case 501: return 'NOT_SUPPORTED';
        case 503: return 'UNAVAILABLE';
        default: return status >= 500 ? 'INTERNAL' : 'VALIDATION';
    }
}

/** `docs/ERROR_CODES.md` içeriği (tek üretici). */
export function renderErrorCodesMarkdown(): string {
    const groups: Array<[ErrorCodeDef['group'], string]> = [
        ['genel', 'Genel kodlar'],
        ['entegrasyon', 'Entegrasyon (dış servis) kodları'],
        ['hesap', 'Hesap yaşam döngüsü (özel) kodları'],
    ];
    const lines: string[] = [
        '# Hata kodları kataloğu',
        '',
        '> Bu dosya `backend/src/platform/core/errors/codes.ts` dosyasından ÜRETİLİR; elle düzenlemeyin.',
        '> Güncelleme: `UPDATE_ERROR_CODES=1 npx jest tests/unit/platform/errorCodes.docs.test.ts` (backend/).',
        '',
        '## Yanıt zarfı (RPC, FE sözleşmesi korunur)',
        '',
        'Hata yanıtı gövdesi: `{ "error": "<ileti>", "code": "<KOD>", "requestId": "<X-Request-Id>", "service": "...", "operation": "..." }`.',
        '',
        '- `error` **string olarak kalır** (geriye uyum); `code` ve `requestId` yalnızca EKLENMİŞ alanlardır. FE ileti eşlemesi `code`\'a göre yapılmalı, `error` metni yedektir.',
        '- Her yanıtta (başarı ve hata) `X-Request-Id` başlığı vardır; gövdedeki `requestId` ile aynıdır. Destek talebine bu kod yapıştırılır.',
        '- **Beklenmeyen (kataloğa/`AppError`\'a çevrilmemiş) hatalar 500 döner; ileti maskelenir** ("Beklenmeyen bir hata oluştu."), ayrıntı yalnızca sunucu logunda `requestId` ile bulunur.',
        '- Bilinçli üretilmiş 4xx hatalarında (`ApplicationError`/`AppError`) ileti olduğu gibi döner.',
        '',
    ];
    for (const [g, title] of groups) {
        lines.push(`## ${title}`, '', '| Kod | HTTP | Varsayılan ileti | Anlam |', '|---|---|---|---|');
        for (const [code, def] of Object.entries(ERROR_CODES) as Array<[string, ErrorCodeDef]>) {
            if (def.group !== g) continue;
            lines.push(`| \`${code}\` | ${def.status} | ${def.message} | ${def.description} |`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
