import type { PaymentProvider } from './PaymentProvider';
import { MockPaymentProvider } from './MockPaymentProvider';

// ADR-0008 §1: "Seçim PAYMENT_PROVIDER=mock|iyzico ve PAYMENT_ENV=sandbox|live env değişkenleriyle; 'live' değeri
// insan onayı olmadan hiçbir ortamda ayarlanmaz."
//
// Aşama A kapsamı: yalnızca 'mock' desteklenir. 'iyzico' AYRI bir görevdir (görev talimatı: "'mock' DIŞINDA bir
// değer (iyzico) bu aşamada YAZMA/uygulamaya ÇALIŞMA") -- burada sessizce mock'a düşmek YERİNE (davranışı
// gizler) açık, tanılanabilir bir hata fırlatılır (fail-fast; projedeki diğer sır/yapılandırma kontrolleriyle
// tutarlı desen, bkz. Security.loadConfig).

export type PaymentProviderName = 'mock' | 'iyzico';
export type PaymentEnv = 'sandbox' | 'live';

export function getConfiguredProviderName(): PaymentProviderName {
    const raw = (process.env.PAYMENT_PROVIDER || 'mock').trim().toLowerCase();
    if (raw === 'mock' || raw === 'iyzico') return raw;
    throw new Error(`[PaymentProviderFactory] PAYMENT_PROVIDER geçersiz: "${raw}" (yalnızca "mock" desteklenir; "iyzico" ayrı bir görevde eklenecek).`);
}

export function getConfiguredEnv(): PaymentEnv {
    const raw = (process.env.PAYMENT_ENV || 'sandbox').trim().toLowerCase();
    if (raw === 'sandbox' || raw === 'live') return raw as PaymentEnv;
    throw new Error(`[PaymentProviderFactory] PAYMENT_ENV geçersiz: "${raw}" (yalnızca "sandbox"/"live").`);
}

let singleton: PaymentProvider | undefined;

/** Süreç boyunca tek bir sağlayıcı örneği (MockPaymentProvider'ın süreç-içi durumu tutarlı kalsın diye). */
export function getPaymentProvider(): PaymentProvider {
    if (singleton) return singleton;

    const name = getConfiguredProviderName();
    if (name === 'mock') {
        singleton = new MockPaymentProvider();
        return singleton;
    }

    // ADR §1: 'live' insan onayı olmadan hiçbir ortamda ayarlanmaz -- iyzico henüz yazılmadığı için bu dal zaten
    // hiçbir zaman 'mock' dışına ulaşmaz; burada olası ileri-taşıma hatalarına karşı açık bir işaretleyici bırakılır.
    throw new Error('[PaymentProviderFactory] iyzico adaptörü henüz uygulanmadı (ADR-0008 Aşama A kapsamı dışında; ayrı görev).');
}

/** Yalnızca testler için: singleton'ı ve env'e bağlı seçimi sıfırlar. */
export function resetPaymentProviderForTests(): void {
    singleton = undefined;
}
