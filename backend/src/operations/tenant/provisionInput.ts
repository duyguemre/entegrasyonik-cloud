import { ApplicationError } from '@platform/core/errors';

// ADR-0003 A.1: provisioning girdisi AÇIK alan listesiyle doğrulanır. `...spread` yok; listede olmayan hiçbir alan
// (isGlobalAdmin, roleCode, owner, order, clientId, dbConfig, status ...) modele taşınmaz — yok sayılır.

export interface ProvisionInput {
    name: string;
    surname: string;
    /** Küçük harfe normalize edilmiş, kırpılmış e-posta. */
    email: string;
    password: string;
    storeName?: string;
}

export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt yalnızca ilk 72 baytı kullanır; daha uzun parolayı sessizce kesmek yerine reddederiz. */
export const PASSWORD_MAX_BYTES = 72;
export const EMAIL_MAX_LENGTH = 254;
export const NAME_MAX_LENGTH = 100;
export const STORE_NAME_MAX_LENGTH = 100;

// Pragmatik biçim kontrolü (RFC tam uyumu hedeflenmez; gerçek doğrulama e-posta doğrulamasıyla — ADR A.4).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    return value.trim().toLowerCase();
}

function fail(message: string): never {
    throw new ApplicationError(message, 400);
}

function requireName(value: unknown, label: string): string {
    if (typeof value !== 'string') fail(`${label} zorunludur.`);
    const v = (value as string).trim();
    if (v.length === 0) fail(`${label} zorunludur.`);
    if (v.length > NAME_MAX_LENGTH) fail(`${label} en fazla ${NAME_MAX_LENGTH} karakter olabilir.`);
    return v;
}

/** Ham girdiyi doğrular; geçersizse ApplicationError(400) fırlatır. Yalnızca izinli alanları içeren yeni nesne döner. */
export function validateProvisionInput(raw: unknown): ProvisionInput {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Geçersiz istek.');
    const r = raw as Record<string, unknown>;

    const name = requireName(r.name, 'Ad');
    const surname = requireName(r.surname, 'Soyad');

    const email = normalizeEmail(r.email);
    if (email === undefined || email.length === 0) fail('E-posta zorunludur.');
    if ((email as string).length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(email as string)) fail('Geçerli bir e-posta adresi giriniz.');

    if (typeof r.password !== 'string' || r.password.length === 0) fail('Parola zorunludur.');
    const password = r.password as string;
    if (password.length < PASSWORD_MIN_LENGTH) fail(`Parola en az ${PASSWORD_MIN_LENGTH} karakter olmalıdır.`);
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) fail(`Parola en fazla ${PASSWORD_MAX_BYTES} bayt olabilir.`);

    // password2 (FE tekrar alanı) verilmişse eşleşmelidir; verilmemişse (ör. yönetici paneli) aranmaz.
    if (r.password2 !== undefined && r.password2 !== null && r.password2 !== '' && r.password2 !== password) fail('Parolalar eşleşmiyor.');

    let storeName: string | undefined;
    if (r.storeName !== undefined && r.storeName !== null && r.storeName !== '') {
        if (typeof r.storeName !== 'string') fail('Mağaza adı geçersiz.');
        const s = (r.storeName as string).trim();
        if (s.length > STORE_NAME_MAX_LENGTH) fail(`Mağaza adı en fazla ${STORE_NAME_MAX_LENGTH} karakter olabilir.`);
        if (s.length > 0) storeName = s;
    }

    return { name, surname, email: email as string, password, ...(storeName !== undefined ? { storeName } : {}) };
}
