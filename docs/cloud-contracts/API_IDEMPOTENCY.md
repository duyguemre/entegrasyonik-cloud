# Idempotency-Key sözleşmesi (ADR-0030 X3) — FE brifi

Amaç: çift tık / zaman aşımı sonrası yeniden deneme / ağ tekrarı yüzünden dış etkili bir işlemin (fatura, iptal, mesaj, sevk...) pazaryerine iki kez gitmesini engellemek.

## Başlık
`Idempotency-Key: <UUID>` (8-128 karakter, `A-Za-z0-9._:-`; `crypto.randomUUID()` yeterli). İsteğe bağlıdır; anahtarsız istek bugünkü gibi çalışır.

## Kapsanan RPC'ler
Yetenek kaydında `external:true` ve `effect !== 'read'` olanlar (`backend/src/capabilities/domains/*`; liste orada tek kaynak):
- `OrderService/approveOrder, bulkApproveOrder, cancelOrder, bulkCancelOrder`
- `ClaimService/approveClaim, bulkApproveClaim, rejectClaim`
- `InvoiceService/createInvoice, bulkCreateInvoice, createManualInvoice, resolveAndReissueInvoice`
- `ShipmentService/createShipment, bulkCreateShipment`
- `MessageService/replyMessage`
- `IntegrationService/batchCreator, requestFetchFromPlatform, retrieveAndSetExternalToken`
- `BillingService/startCheckout`, `AccountService/resendVerificationEmail`, `UserService/inviteUser, resendInvitation, initiateOwnershipTransfer`

Diğer RPC'lerde başlık yok sayılır.

## Davranış
Kapsam: (tenant, kullanıcı, operasyon, anahtar). Kayıt 24 saat tutulur.

| Durum | Yanıt |
|---|---|
| Yeni anahtar | Normal çalışır; sonuç 24 sa saklanır |
| Aynı anahtar + aynı gövde, işlem bitmiş | Önceki yanıt aynen döner, işlem tekrar çalışmaz |
| Aynı anahtar + FARKLI gövde | 422 `IDEMPOTENCY_KEY_REUSED` |
| Aynı anahtarla işlem sürüyor | 409 `IDEMPOTENCY_IN_PROGRESS` (kısa süre sonra aynı anahtarla yeniden dene) |
| Geçersiz anahtar biçimi | 400 `VALIDATION` |
| İşlem hata ile bitti | Kayıt silinir; aynı anahtarla yeniden denenebilir |

## Kip (sunucu tarafı `IDEMPOTENCY_ENFORCE`)
Varsayılan `observe`: sunucu yalnız ölçer/loglar (`idempotency_duplicate_detected`, `idempotency_key_missing`), yukarıdaki 409/422 ve önbellekten yanıt henüz UYGULANMAZ; başlığı bugünden göndermek güvenlidir. `enforce`'a geçiş FE anahtar üretimi yayına alındıktan sonra, kullanıcı kararıyla yapılır.

## FE kuralları
1. Anahtar KULLANICI EYLEMİ başına bir kez üretilir (düğmeye basış), HTTP denemesi başına değil. Aynı eylemin yeniden denemesi (zaman aşımı, ağ hatası, 409) AYNI anahtarı kullanır.
2. Kullanıcı gövdeyi değiştirip yeniden gönderirse YENİ anahtar üretilir (yoksa 422).
3. Öneri: `frontend/src/composables/restapi.ts` içinde tek yerde — çağrı seçeneklerine `idempotent: true` (veya kapsanan RPC adı kümesi) verildiğinde `crypto.randomUUID()` ile üret, çağrı nesnesinde sakla, otomatik yeniden denemede aynısını başlığa koy.
4. 409 `IDEMPOTENCY_IN_PROGRESS` hata değil "işleniyor"dur: kullanıcıya gösterme, kısa gecikmeyle aynı anahtarla tekrar sor.
