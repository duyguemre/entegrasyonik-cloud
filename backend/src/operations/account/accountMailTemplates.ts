// Hesap yaşam döngüsü e-posta şablonları: sade Türkçe metin (+ minimal HTML). Gerçek alan adı YAZILMAZ; bağlantılar
// çağıran tarafından PUBLIC_APP_URL env'inden kurulur. Kullanıcı verisi (ad/soyad) şablona KONMAZ (HTML enjeksiyonu yok).

export interface MailContent { subject: string; text: string; html: string }

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrap(bodyHtml: string): string {
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222">${bodyHtml}</div>`;
}

export function passwordResetMail(link: string, ttlMinutes: number): MailContent {
    const text = [
        'Merhaba,',
        '',
        'Entegrasyonik hesabınız için parola sıfırlama talebi aldık. Yeni bir parola belirlemek için aşağıdaki bağlantıyı kullanın:',
        '',
        link,
        '',
        `Bu bağlantı ${ttlMinutes} dakika geçerlidir ve yalnızca bir kez kullanılabilir.`,
        'Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz; parolanız değişmeyecektir.',
    ].join('\n');
    const html = wrap(
        `<p>Merhaba,</p><p>Entegrasyonik hesabınız için parola sıfırlama talebi aldık. Yeni bir parola belirlemek için aşağıdaki bağlantıyı kullanın:</p>` +
        `<p><a href="${esc(link)}">Parolamı sıfırla</a></p><p>Bağlantı çalışmazsa şu adresi tarayıcınıza yapıştırın:<br>${esc(link)}</p>` +
        `<p>Bu bağlantı ${ttlMinutes} dakika geçerlidir ve yalnızca bir kez kullanılabilir.</p>` +
        `<p>Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz; parolanız değişmeyecektir.</p>`,
    );
    return { subject: 'Entegrasyonik parola sıfırlama', text, html };
}

export function emailVerificationMail(link: string, ttlHours: number): MailContent {
    const text = [
        'Merhaba,',
        '',
        'Entegrasyonik hesabınızın e-posta adresini doğrulamak için aşağıdaki bağlantıyı kullanın:',
        '',
        link,
        '',
        `Bu bağlantı ${ttlHours} saat geçerlidir ve yalnızca bir kez kullanılabilir.`,
        'Bu hesabı siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.',
    ].join('\n');
    const html = wrap(
        `<p>Merhaba,</p><p>Entegrasyonik hesabınızın e-posta adresini doğrulamak için aşağıdaki bağlantıyı kullanın:</p>` +
        `<p><a href="${esc(link)}">E-postamı doğrula</a></p><p>Bağlantı çalışmazsa şu adresi tarayıcınıza yapıştırın:<br>${esc(link)}</p>` +
        `<p>Bu bağlantı ${ttlHours} saat geçerlidir ve yalnızca bir kez kullanılabilir.</p>` +
        `<p>Bu hesabı siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.</p>`,
    );
    return { subject: 'Entegrasyonik e-posta doğrulama', text, html };
}

export function passwordChangedMail(): MailContent {
    const text = [
        'Merhaba,',
        '',
        'Entegrasyonik hesabınızın parolası az önce değiştirildi ve diğer tüm oturumlarınız kapatıldı.',
        'Bu değişikliği siz yapmadıysanız hemen parolanızı sıfırlayın ve destek ekibimizle iletişime geçin.',
    ].join('\n');
    const html = wrap(
        `<p>Merhaba,</p><p>Entegrasyonik hesabınızın parolası az önce değiştirildi ve diğer tüm oturumlarınız kapatıldı.</p>` +
        `<p>Bu değişikliği siz yapmadıysanız hemen parolanızı sıfırlayın ve destek ekibimizle iletişime geçin.</p>`,
    );
    return { subject: 'Entegrasyonik parolanız değiştirildi', text, html };
}

const ROLE_LABEL_TR: Record<string, string> = { owner: 'Sahip', admin: 'Yönetici', operator: 'Operatör' };
/** Başlığa (subject) kullanıcı/tenant verisi KONMAZ; gövdede tenant başlığı HTML-kaçışlıdır. */
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').slice(0, 120);

/** [ADR-0028 WP-A4] Tenant daveti. Bağlantı `#t=<token>` parçasıyla gelir (sunucu günlüklerine/Referer'a düşmesin). */
export function invitationMail(link: string, tenantTitle: string, role: string, ttlDays: number): MailContent {
    const title = oneLine(tenantTitle || 'bir mağaza');
    const roleLabel = ROLE_LABEL_TR[role] ?? role;
    const text = [
        'Merhaba,',
        '',
        `"${title}" mağazasına Entegrasyonik'te "${roleLabel}" rolüyle davet edildiniz. Hesabınızı oluşturmak için aşağıdaki bağlantıyı kullanın:`,
        '',
        link,
        '',
        `Bu bağlantı ${ttlDays} gün geçerlidir ve yalnızca bir kez kullanılabilir.`,
        'Bu daveti beklemiyorsanız bu e-postayı yok sayabilirsiniz.',
    ].join('\n');
    const html = wrap(
        `<p>Merhaba,</p><p>"${esc(title)}" mağazasına Entegrasyonik'te "${esc(roleLabel)}" rolüyle davet edildiniz. Hesabınızı oluşturmak için aşağıdaki bağlantıyı kullanın:</p>` +
        `<p><a href="${esc(link)}">Daveti kabul et</a></p><p>Bağlantı çalışmazsa şu adresi tarayıcınıza yapıştırın:<br>${esc(link)}</p>` +
        `<p>Bu bağlantı ${ttlDays} gün geçerlidir ve yalnızca bir kez kullanılabilir.</p><p>Bu daveti beklemiyorsanız bu e-postayı yok sayabilirsiniz.</p>`,
    );
    return { subject: 'Entegrasyonik mağaza daveti', text, html };
}

/** [ADR-0028 WP-A4] Sahiplik devri talebi (hedefe). Bağlantı uygulama içi kabul sayfasına gider (oturum açık olmalı). */
export function ownershipTransferMail(link: string, tenantTitle: string, ttlHours: number): MailContent {
    const title = oneLine(tenantTitle || 'bir mağaza');
    const text = [
        'Merhaba,',
        '',
        `"${title}" mağazasının sahipliği size devredilmek isteniyor. Kabul etmek için Entegrasyonik'e giriş yapıp aşağıdaki bağlantıyı açın:`,
        '',
        link,
        '',
        `Bu bağlantı ${ttlHours} saat geçerlidir ve yalnızca bir kez kullanılabilir. Kabul ettiğinizde mevcut sahip "Yönetici" rolüne düşer.`,
        'Bu talebi beklemiyorsanız bu e-postayı yok sayın; sahiplik değişmeyecektir.',
    ].join('\n');
    const html = wrap(
        `<p>Merhaba,</p><p>"${esc(title)}" mağazasının sahipliği size devredilmek isteniyor. Kabul etmek için Entegrasyonik'e giriş yapıp aşağıdaki bağlantıyı açın:</p>` +
        `<p><a href="${esc(link)}">Sahipliği kabul et</a></p><p>Bağlantı çalışmazsa şu adresi tarayıcınıza yapıştırın:<br>${esc(link)}</p>` +
        `<p>Bu bağlantı ${ttlHours} saat geçerlidir ve yalnızca bir kez kullanılabilir. Kabul ettiğinizde mevcut sahip "Yönetici" rolüne düşer.</p>` +
        `<p>Bu talebi beklemiyorsanız bu e-postayı yok sayın; sahiplik değişmeyecektir.</p>`,
    );
    return { subject: 'Entegrasyonik sahiplik devri talebi', text, html };
}

/** [B12] Platform yöneticisi daveti. Bağlantı BACKOFFICE'e ait kabul sayfasına gider ve `#t=<token>` parçasıyla gelir (sunucu günlüğü/Referer görmez). */
export function adminInvitationMail(link: string, ttlHours: number): MailContent {
    const text = [
        'Merhaba,',
        '',
        "Entegrasyonik yönetim uygulamasında platform yöneticisi olarak davet edildiniz. Hesabınızı etkinleştirmek için aşağıdaki bağlantıyı kullanın:",
        '',
        link,
        '',
        `Bu bağlantı ${ttlHours} saat geçerlidir ve yalnızca bir kez kullanılabilir. İlk girişte iki adımlı doğrulama kurulumu istenecektir.`,
        'Bu daveti beklemiyorsanız bu e-postayı yok sayın.',
    ].join('\n');
    const html = wrap(
        `<p>Merhaba,</p><p>Entegrasyonik yönetim uygulamasında platform yöneticisi olarak davet edildiniz. Hesabınızı etkinleştirmek için aşağıdaki bağlantıyı kullanın:</p>` +
        `<p><a href="${esc(link)}">Daveti kabul et</a></p><p>Bağlantı çalışmazsa şu adresi tarayıcınıza yapıştırın:<br>${esc(link)}</p>` +
        `<p>Bu bağlantı ${ttlHours} saat geçerlidir ve yalnızca bir kez kullanılabilir. İlk girişte iki adımlı doğrulama kurulumu istenecektir.</p><p>Bu daveti beklemiyorsanız bu e-postayı yok sayın.</p>`,
    );
    return { subject: 'Entegrasyonik yönetici daveti', text, html };
}
