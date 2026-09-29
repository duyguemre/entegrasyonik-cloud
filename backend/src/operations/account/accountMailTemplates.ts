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
