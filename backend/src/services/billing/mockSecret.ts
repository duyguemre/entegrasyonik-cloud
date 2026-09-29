// ADR-0008 §1 + CLAUDE.md kural 4: mock HMAC sırrı yalnızca env'de (`BILLING_MOCK_HMAC_SECRET`); tanımsız/kısa ise fail-fast
// (sabit/varsayılan sır YOK). Hem MockPaymentProvider (webhook imzası) hem mock checkout token'ı (mockCheckoutToken.ts)
// aynı sırrı buradan okur (döngüsel import olmasın diye ayrı dosya).
export function getMockHmacSecret(): string {
    const secret = process.env.BILLING_MOCK_HMAC_SECRET;
    if (!secret || secret.length < 16) {
        throw new Error('[MockPaymentProvider] BILLING_MOCK_HMAC_SECRET tanımsız veya çok kısa (>=16 karakter).');
    }
    return secret;
}
