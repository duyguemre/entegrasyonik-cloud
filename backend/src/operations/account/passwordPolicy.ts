import { ApplicationError } from '@platform/core/errors';

// Hesap yaşam döngüsü: parola politikası TEK YERDE. changePassword ve confirmPasswordReset AYNI fonksiyonu kullanır.
// (Kayıt akışı `provisionInput.ts` içinde daha gevşek, eski asgari kuralı — 8 karakter — kullanmayı sürdürür; birleştirmek
//  mevcut kayıt sözleşmesini değiştirir ve ayrı insan kararıdır. docs/API_ACCOUNT_LIFECYCLE.md "Açık kararlar".)
//
// Kural (NIST 800-63B ruhuna yakın: uzunluk + yaygın parola kara listesi; bileşim kuralı yalnızca kısa parolalar için):
//  - en az 10 karakter (Unicode kod noktası), en fazla 72 BAYT (bcrypt yalnızca ilk 72 baytı kullanır; sessizce kesmek yerine reddederiz)
//  - 10-15 karakterli parolalar en az 3 karakter sınıfı içermeli (küçük harf, büyük harf, rakam, sembol); 16+ (parola cümlesi) için gerekmez
//  - yaygın parola kara listesinde olmamalı; tek karakterin tekrarı / basit ardışık dizi olmamalı
//  - e-posta yerel kısmını (>=4 karakter) veya adı/soyadı (>=4 karakter) içermemeli (kullanıcı bağlamı verilirse)

export const PASSWORD_POLICY_MIN_LENGTH = 10;
export const PASSWORD_POLICY_PASSPHRASE_LENGTH = 16;
export const PASSWORD_POLICY_MAX_BYTES = 72;
/** Mevcut/yanlış parola girdisi için makul üst sınır (login ile aynı; bcrypt maliyetini sınırlar). */
export const PASSWORD_INPUT_MAX_LENGTH = 1024;

export type PasswordPolicyIssue =
    | 'too_short' | 'too_long' | 'weak_composition' | 'common' | 'repetitive' | 'contains_identity';

export interface PasswordPolicyContext {
    email?: string;
    name?: string;
    surname?: string;
}

// Küçük, yaygın parola kara listesi (tam liste değil; kasıtlı olarak kısa ve statik). Karşılaştırma küçük harf + ayırıcısız.
const COMMON_PASSWORDS = new Set([
    'password', 'password1', 'password123', 'passw0rd', 'qwerty', 'qwerty123', 'qwertyuiop', 'qwertyuiop1', 'asdfghjkl',
    '1234567890', '12345678901', '123456789012', '0123456789', '1q2w3e4r5t', '1qaz2wsx3edc', 'iloveyou123', 'letmein123',
    'welcome123', 'admin12345', 'administrator', 'entegrasyonik', 'entegrasyonik1', 'entegrasyonik123', 'sifre12345',
    'sifre123456', 'parola12345', 'parola123456', 'trendyol123', 'hepsiburada', 'hepsiburada1', 'hepsiburada123',
    'turkiye123', 'turkey12345', 'galatasaray', 'fenerbahce', 'besiktas123', 'trabzonspor', 'istanbul34', 'istanbul1234',
    'ankara0606', 'changeme123', 'default1234', 'abcdefghij', 'abcd123456', 'abc1234567', 'football123', 'monkey12345',
]);

function classCount(p: string): number {
    let n = 0;
    if (/[a-zçğıöşü]/.test(p)) n++;
    if (/[A-ZÇĞİÖŞÜ]/.test(p)) n++;
    if (/[0-9]/.test(p)) n++;
    if (/[^A-Za-z0-9çğıöşüÇĞİÖŞÜı]/.test(p)) n++;
    return n;
}

function normalizeForBlacklist(p: string): string {
    return p.toLocaleLowerCase('en').replace(/[\s._\-]+/g, '');
}

function isRepetitive(p: string): boolean {
    if (new Set(Array.from(p)).size <= 2) return true; // aaaaaaaaaa, ababababab
    if (/^([\s\S]+?)\1+$/.test(p)) return true;// aynı birimin tekrarı: passwordpassword, Aa1!Aa1!Aa1!
    const digits = p.replace(/[^0-9]/g, '');
    if (digits.length === p.length) {
        // yalnızca rakam: düz artan/azalan dizi (1234567890, 9876543210)
        let asc = true; let desc = true;
        for (let i = 1; i < digits.length; i++) {
            const d = (digits.charCodeAt(i) - digits.charCodeAt(i - 1) + 10) % 10;
            if (d !== 1) asc = false;
            if (d !== 9) desc = false;
        }
        if (asc || desc) return true;
    }
    return false;
}

/** Sorunları döndürür (boş dizi = güçlü). Hata fırlatmaz. */
export function checkPasswordStrength(password: unknown, ctx: PasswordPolicyContext = {}): PasswordPolicyIssue[] {
    const issues: PasswordPolicyIssue[] = [];
    if (typeof password !== 'string') return ['too_short'];
    const len = Array.from(password).length;
    if (len < PASSWORD_POLICY_MIN_LENGTH) issues.push('too_short');
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_POLICY_MAX_BYTES) issues.push('too_long');
    if (len >= PASSWORD_POLICY_MIN_LENGTH && len < PASSWORD_POLICY_PASSPHRASE_LENGTH && classCount(password) < 3) issues.push('weak_composition');
    if (COMMON_PASSWORDS.has(normalizeForBlacklist(password))) issues.push('common');
    if (len >= 1 && isRepetitive(password)) issues.push('repetitive');

    const lower = password.toLocaleLowerCase('tr');
    const fragments: string[] = [];
    if (typeof ctx.email === 'string') { const local = ctx.email.split('@')[0]; if (local) fragments.push(local); }
    if (typeof ctx.name === 'string') fragments.push(ctx.name);
    if (typeof ctx.surname === 'string') fragments.push(ctx.surname);
    for (const f of fragments) {
        const frag = f.trim().toLocaleLowerCase('tr');
        if (frag.length >= 4 && lower.includes(frag)) { issues.push('contains_identity'); break; }
    }
    return issues;
}

const MESSAGES: Record<PasswordPolicyIssue, string> = {
    too_short: `Parola en az ${PASSWORD_POLICY_MIN_LENGTH} karakter olmalıdır.`,
    too_long: `Parola en fazla ${PASSWORD_POLICY_MAX_BYTES} bayt olabilir.`,
    weak_composition: `${PASSWORD_POLICY_MIN_LENGTH}-${PASSWORD_POLICY_PASSPHRASE_LENGTH - 1} karakterlik parola; büyük harf, küçük harf, rakam ve sembolden en az üçünü içermelidir (veya ${PASSWORD_POLICY_PASSPHRASE_LENGTH}+ karakterli bir parola cümlesi kullanın).`,
    common: 'Bu parola çok yaygın kullanılıyor; daha benzersiz bir parola seçin.',
    repetitive: 'Parola tekrarlayan veya ardışık karakterlerden oluşmamalıdır.',
    contains_identity: 'Parola e-posta adresinizi veya adınızı/soyadınızı içermemelidir.',
};

export const WEAK_PASSWORD_CODE = 'WEAK_PASSWORD';

/** Geçersizse ApplicationError(400, code WEAK_PASSWORD) fırlatır; mesaj kuralları listeler (parolayı ASLA içermez). */
export function assertPasswordStrength(password: unknown, ctx: PasswordPolicyContext = {}): string {
    if (typeof password !== 'string' || password.length === 0) {
        throw new ApplicationError('Yeni parola zorunludur.', 400, WEAK_PASSWORD_CODE);
    }
    const issues = checkPasswordStrength(password, ctx);
    if (issues.length > 0) throw new ApplicationError(issues.map((i) => MESSAGES[i]).join(' '), 400, WEAK_PASSWORD_CODE);
    return password;
}
