# 03e — Sipariş / İade / Fatura / Finans / Mesaj modülleri: mevcut yapı ve yöntem envanteri

Kapsam: yalnız statik kod okuma (2026-10-03). Yollar `backend/src/` köküne göre, aksi belirtilmedikçe. `INTEGRATIONS_REGISTRY.md` bu kopyada YOK; yerine `docs/CAPABILITIES.md` ve `docs/INTEGRATION_CATEGORY_MODEL.md` okundu. `mockserver/` yok, `dev-tools/live-readonly-guard.js` `backend/dev-tools/` altında var.

Etiketler: **U**=uygulandı, **L**=limited, **PA**=platform_auto, **NS**=NOT_SUPPORTED fırlatır, **STUB**=throw etmeyen sessiz boş/false/`success:false`. "DOĞRULANAMADI" = statik okumayla karar verilemedi. Platform yanıt şeması için tek yerel kaynak `docs/research/2026-09-28-trendyol-v2-migration-spec.md` §2.3'tür (belge kaynaklı, canlı doğrulanmamış). HB/N11/Pazarama için yerelde resmi yanıt şeması yoktur (`docs/research/API_CONTRACTS_2026-09-30.md:68`, `MARKETPLACE_COMMISSIONS_2026-09-30.md:32-37`).

## (A) Veri modeli tablosu

| Model (koleksiyon) | Dosya | Benzersiz indeks (idempotency) | Platform-özel veri nerede | Durum enum'ları / not |
|---|---|---|---|---|
| Order (`Orders`) | `database/client/models/Order.ts` | `{integrationCode, externalOrderId}` unique (`:211`). `orderNumber` unique DEĞİL (Trendyol'da bölünmüş paketler aynı `orderNumber`'ı paylaşır) | `meta: Mixed` (`:199`) = adaptörlerin hepsinde ham yanıtın TAMAMI (`{...order}`). Tipli `platformData` yok. `platformActions[]` ham istek/yanıt (`:160`) | `internalStatus`: UNAPPROVED, AWAITING_APPROVAL, APPROVED, SHIPPED, DELIVERED, CANCELLED, RETURNED (`interfaces/order/index.ts:9-17`). `itemStatus`: ACTIVE/CANCELLED/RETURNED. `invoice.status` ve `fulfillment[].status`: PENDING/SUCCESS/FAILED/MANUAL_COMPLETED. `strict:true`. Şemada `history` YOK |
| Claim (`Claims`) | `models/Claim.ts` | `{integrationCode, externalClaimId}` unique (`:101`) | `meta: Mixed` (`:89`) | `type`: REFUND/REPLACEMENT/CANCEL/UNKNOWN. `internalStatus`: WAITING, UNDER_REVIEW, APPROVED, REJECTED, CANCELLED, DISPUTED, COMPLETED (`interfaces/claim/index.ts:14-22`). `history[]` var. Kalem düzeyinde durum alanı yok |
| Invoice (`Invoices`) | `models/Invoice.ts` | YALNIZ `ettn` unique+required (`:26`). `{integrationCode, externalOrderId, type}` (repo upsert filtresi) için unique indeks YOK. `externalInvoiceId` yalnız normal indeks | Ham alan yok (`pdfUrl`, `xmlUrl`, `invoiceLink`) | `invoiceMethod`: MARKETPLACE/INTEGRATOR/MANUAL; `documentType`: E_FATURA/E_ARSIV; `status`: DRAFT, QUEUED, PROCESSING, APPROVED, FAILED, CANCELLED |
| FinancialTransaction | `models/Financial.ts` | `{integrationCode, externalId}` unique (`:51`) | `meta: Mixed` (`:42`) | `transactionType`: SALE, RETURN, CANCEL, PAYOUT, DEDUCTION, CORRECTION, PROVISION, COUPON, DISCOUNT (`interfaces/platforms/financial.ts:7-17`). Alanlar: debt/credit/netAmount, commissionRate/Amount, sellerRevenue, payoutDate, paymentOrderId |
| CargoInvoice | `models/Financial.ts:82` | `{integrationCode, invoiceNumber, packageId}` unique | `meta` | `shipmentType`: FORWARD/RETURN |
| Message (`Messages`) | `models/Message.ts` | `{integrationCode, externalMessageId}` unique (`:65`) | `rawMetadata: Mixed` (`:55`) | `type`: PRODUCT_QUESTION/ORDER_QUESTION. `status` şema enum: WAITING_SELLER, ANSWERED, REJECTED, UNREAD, READ (`:27`). TS tipi ayrıca `WAITING_APPROVAL` içerir (`interfaces/message/index.ts:4`). Tutarsız (bkz. F-P1-6) |
| Customer (`Customers`) | `models/Customer.ts` | `externalIdentities` bileşik indeksi `unique:false` (`:82-85`). Müşteri tekilleştirme yalnız uygulama kodunda (`CustomerRepository.saveCustomer`) | `meta: Map<Mixed>`, `strict:false` | `status`: ACTIVE/INACTIVE/BLOCKED. Metrikler: totalSpent, totalClaimCount vb. |

Yazım (upsert) tarafı:
- **Order**: `OrderRepository` `{integrationCode, externalOrderId}` ile `$set` upsert (`:226-231`). İptal/iade statüsü her zaman üstüne yazar; terminal durum geri dönmez; fatura SUCCESS ise `invoice` ezilmez (`:104`); fatura kesildikten sonra tutar değişirse `platformDiscrepancy` yazılır.
- **Claim**: `$set` yalnız status/items/meta/tutar; `history`, `claimedAt`, `type` `$setOnInsert`'tedir (`ClaimRepository.ts:95,106`). Yani sync ile durum değişse de `history` ASLA büyümez.
- **Message**: `$set {...msg}`, filtre `{integrationCode, externalMessageId}`. Sipariş eşlemesi `orderNumber` ile yapılır, `integrationCode` filtresi YOK (`MessageRepository.ts:33`).
- **Financial**: `{integrationCode, externalId}` `$set` upsert.
- **Invoice**: filtre `{integrationCode, externalOrderId, type}` (`InvoiceRepository.ts`), mevcut kontrolü ise `externalInvoiceId` ile. İkisi tutarsız.

Ölü/yanlış alanlar:
- `Orders.financials.integrationCommission` hiçbir yerde yazılmıyor (grep: yalnız şema ve interface).
- `Orders.dates.invoiceDate` (indeksli, `Order.ts:174`) yazılmıyor; fatura akışı şemada olmayan `dates.invoicedAt`'e yazıyor (`operations/orders/invoices.ts:204`, strict tarafından düşer).
- `Claim.resolvedAt` ve `Claim.externalUpdatedAt` hiçbir adaptör tarafından doldurulmuyor (grep: transformer'larda yok).
- `IOrderPackage.invoices` (`interfaces/order/index.ts:27`) hiçbir adaptör tarafından doldurulmuyor (grep `invoices:` modules içinde 0 sonuç).

## (B) Platform × metot envanter tablosu

`IPlatform` imzaları: `interfaces/platforms/index.ts:278-333`. Sözleşmede şunlar YOK: sipariş mesajı, e-fatura/fatura okuma-iptal, iade red-nedeni kataloğu, paket bölme, `retrieveInvoices`.

Kısaltmalar: TY=Trendyol, HB=Hepsiburada, N11, PZ=Pazarama, IS=Ideasoft, BH=Bizimhesap. Yollar `integration/modules/…` altında.

| Metot | TY | HB | N11 | PZ | IS | BH |
|---|---|---|---|---|---|---|
| retrieveOrders | U `marketplace/trendyol/index.ts:190` → `api/OrderConnector.ts:30` (V2, ≤14 gün pencere, 10k aşımında bölme) | U `hepsiburada/index.ts:85` → `api/OrderConnector.ts:39` (offset sayfalı) | U/L `n11/index.ts:75` → `services/OrderService.ts:89` (REST sayfalı, UNAVAILABLE/NS'te SOAP, SOAP sayfasız) | U `pazarama/index.ts:78` → `api/OrderConnector.ts:12` (POST getOrdersForApi, okuma) | L `ecommerce/ideasoft/index.ts:85` → `services/OrderService.ts:19` | L `erp/bizimhesap/index.ts:86`. Zamanlanmaz: `engine/order/OrderQueueProducer.ts:88` yalnız marketplace/ecommerce tarar |
| approveOrder | **PA** `trendyol/index.ts:195` (`return true`, çağrı yok) | U `hepsiburada/index.ts:86` → `services/OrderService.ts:73` (detay GET + createPackage POST + etiket GET) | **NS** `n11/index.ts:76` → `OrderService.ts:179` | U `pazarama/index.ts:79` (status 12; YALNIZ ilk satır) | L `OrderService.ts:43` (PUT status:'preparing') | **STUB** `bizimhesap/index.ts:87` (`success:false`) |
| rejectOrder | U `api/OrderConnector.ts:208` (PUT unsupplied, `reasonId: Number(...)` `:232`) | U `OrderConnector.ts:75` (POST cancel, `reasonId||'Other'`) | **NS** `OrderService.ts:146` | U `services/OrderService.ts:66` (status 13; reason kullanılmaz) | L `OrderService.ts:55` | **STUB** `index.ts:88` (`false`) |
| retrieveOrderRejectionReasons | canlı GET `claim-issue-reasons` = İADE kataloğu (`api/ClaimConnector.ts:112`) | statik İADE kataloğu (`services/ClaimService.ts:47`) | statik tek madde `OUT_OF_STOCK` (`OrderService.ts:199`) | statik 4 madde (`services/OrderService.ts:130`) | statik 4 | statik 2 |
| sendOrderShipping | L `OrderConnector.ts:244`. `services/OrderService.ts:51` `meta.shipmentMethod==='MARKETPLACE'` ise no-op `success:true` | L, ama gerçekte yalnız `createPackage` (`services/OrderService.ts:106-111`); takip no/kargo firması GÖNDERİLMİYOR | L `OrderService.ts:152` (SOAP MakeOrderItemShipment, ilk kalem) | L `api/OrderConnector.ts:29` (PUT status 5, ilk kalem; 3→12 geçişi yalnız `meta.currentExternalStatus` ile `services/OrderService.ts:95`) | L `OrderService.ts:67` | **STUB** `index.ts:89` |
| sendOrderInvoice | U `OrderConnector.ts:286` (`seller-invoice-links`, `shipmentPackageId`+`invoiceLink`+opsiyonel `invoiceNumber`) | U `OrderConnector.ts:89` (`invoiceUrl: pdfUrl` yalnız) | U `OrderService.ts:185` (SOAP SaveLinkSellerInvoice) | U `api/OrderConnector.ts:73` (`order/invoice-link`) | **NS** `OrderService.ts:90` | **STUB** `index.ts:90` |
| retrieveClaims | U `ClaimConnector.ts:16` → `ClaimTransformer.ts` | U `hepsiburada/index.ts:91` → `services/ClaimService.ts:19` | **L ve HAM** `n11/services/ClaimService.ts:15-29`: yalnız `status:'REQUESTED'`, sayfa 0/100, **mapper yok**, `IClaimPackage` üretmez | U `pazarama/api/ClaimConnector.ts:14` (sayfalı) → `ClaimTransformer.ts` | **STUB** `index.ts:92` (`[]`) | **STUB** `index.ts:94` |
| approveClaim | U `ClaimConnector.ts:128`. Hata `IntegrationError` değil, `{success:false}` döner (`:149-158`) | U `api/ClaimConnector.ts:23` | U `services/ClaimService.ts:35` (SOAP ClaimReturnApprove) | U `api/ClaimConnector.ts:47` (`updateRefund` status 2) | **STUB** `index.ts:93` | **STUB** `index.ts:95` |
| rejectClaim | U `ClaimConnector.ts:161` (açıklama URL-encode edilmeden sorguya `:171`) | U `ClaimConnector.ts:34` | U (SOAP ClaimReturnReject) | U `ClaimConnector.ts:68` (`updateRefund` status 3, `RefundRejectType`) | **STUB** | **STUB** |
| Pazarama sendToReview / sendRevision | — | — | — | Connector `ClaimConnector.ts:100,131` ve `services/ClaimService.ts` içinde var; `pazarama/index.ts` ve `IPlatform`'da YOK → ULAŞILAMAZ (ölü kod). Descriptor "incelemeye gönderilir/revize edilir" diyor | — | — |
| retrieveMessages | U `MessageConnector.ts:16` (tek sayfa, `size=50`, sayfalama yok `:18,44`) | L `services/QuestionService.ts:17` (offset sayfalı, tarih parametresi doğrulanmadı) | L `services/MessageService.ts` (yalnız `OPEN`, sayfa 0/100, `startDate` yok sayılır) | U `services/MessageService.ts` (liste + her soru için detay GET, sınırsız `Promise.all` `:30`) | **STUB** `index.ts:98` | **STUB** `index.ts:97` |
| answerMessage | U `MessageConnector.ts:58` | U `QuestionService.ts` | U | U (PUT sellerAnswer) | **STUB** `index.ts:99` (`false`) | **STUB** `index.ts:98` |
| retrieveFinancials | U `services/FinancialService.ts:36` (settlements: yalnız Sale+Return `:13`; otherfinancials: PaymentOrder, DeductionInvoices, CreditNote, CommissionInvoice `:15`; 15 günlük parça, sayfalı, tavanda `incomplete`) | L `services/FinancialService.ts:19` (`settlements/merchantid`) | L `services/AuxiliaryServices.ts:26` (SOAP GetSettlementList, sayfa 0/100, hep SALE) | L `services/FinancialService.ts:18` (yalnız `order/paymentAgreement`; `fetchOtherFinancials` connector'da var, çağrılmıyor) | **STUB** `index.ts:102` | **STUB** `index.ts:99` |
| retrieveCargoInvoices | U | **STUB** `[]` `hepsiburada/index.ts:100` | **STUB** `[]` `AuxiliaryServices.ts:45`, buna rağmen descriptor `finance.methods` listeliyor | U `services/FinancialService.ts:28` | **STUB** | **STUB** |
| retrieveSettlementsByPaymentId | U `FinancialConnector.ts:58` (tek istek `size:1000`, sayfalama/pencere yok) | **STUB** `index.ts:101` | **STUB** `n11/index.ts:94` | **STUB** `pazarama/index.ts:107` | **STUB** | **STUB** |
| Fatura okuma / e-fatura sağlayıcı | Yok | Yok | Yok | Yok | Yok | Yok |

Descriptor (`descriptor.ts`) ↔ kod tutarlılığı:
- **TY**: `orderActions: platform_auto` (approveOrder) kodla tutarlı (`tests/contract/catalog/platformAuto.consistency.test.ts`). `shippingNotice: limited` notu "elle girilir ve pazaryerine iletilir" diyor, ama kod her Trendyol siparişi için iletmeyi atlıyor (F-P0-2). `limitations[1]` ("`line.id→lineId` uygulanmadı", `trendyol/descriptor.ts:138`) BAYAT: uygulandı (`OrderTransformer.ts:101`).
- **HB**: `limitations` "kargo faturası ve komisyon bilgisi sağlanmıyor" diyor, ama `FinancialMapper` komisyon alanlarını eşliyor (`transformers/FinancialMapper.ts:12-20`). `shippingNotice: limited` ("takip bilgisi doğrulanmadı") doğru, fakat gerçekte takip bilgisi hiç gönderilmiyor.
- **N11**: `orderActions: not_supported` doğru (`OrderService.ts:147,180`). `returns: limited` notu "ilk sayfa" diyor, "mapper yok / sonuç motora uymuyor" demiyor (F-P0-1). `finance.methods`'taki `retrieveCargoInvoices` stub.
- **PZ**: `returns` notu `sendToReview`/`revize`'yi destekliyor gibi yazıyor (ulaşılamaz).
- **IS / BH**: desteklenmeyen metotlar NOT_SUPPORTED fırlatmıyor, sessiz `[]`/`false`/`{success:false}` dönüyor (`ideasoft/index.ts:92-104`, `bizimhesap/index.ts:87-101`). `docs/INTEGRATION_CATEGORY_MODEL.md` "NOT_SUPPORTED fırlatarak taşıyor" diyor. Yalnız `Ideasoft.sendOrderInvoice` gerçekten fırlatır (test: `notSupported.consistency.test.ts`).
- Backlog denetimi (`docs/audits/BACKEND_INTEGRATION_AUDIT_2026-09-30.md:80,279` F-02 "HB/N11 sayfalama yok") bayat: sayfalama artık var (`hepsiburada/api/paginateOffset.ts`, `n11/api/paginatePage.ts`).

## (C) Platform × veri türü alan eşleme eksikleri (alan alan)

Genel durum: tüm sipariş/iade/finans/mesaj dönüştürücüleri ham kaydı `meta` / `rawMetadata`'ya koyar (TY order `OrderTransformer.ts:242-254`, HB `:88`, PZ `:99`, N11 `OrderMapper.ts:93,221`, IS `:106`, BH `:134`; HB claim `ClaimTransformer.ts:225`; PZ claim/finans `meta:{...}`). **Eksik eşleme = normalize alana taşınmayan, yalnız ham `meta`'da duran veri.** Trendyol finans, Trendyol iade ve N11 mesaj/finans/iadede `meta` yalnız küçük bir alt küme taşır; kalanı DB'ye hiç girmez (aşağıda ayrı belirtildi).

### C-1 Trendyol SİPARİŞ (belge alanı kaynağı: migration-spec §2.3; canlı doğrulama YOK)

| Belge alanı | İç model | Durum |
|---|---|---|
| shipmentPackageId | externalOrderId (+ `meta.packageId`) | eşlendi (`OrderTransformer.ts:95,243`) |
| orderNumber | orderNumber | eşlendi |
| packageGrossAmount | financials.subTotal | eşlendi (`:193`) |
| packageTotalDiscount / packageSellerDiscount | financials.totalDiscount | tek alana birleşir, TY-indirimi ayrımı yok (`:194`) |
| packageTyDiscount | — | DÜŞER (yalnız ham meta) |
| packageTotalPrice | financials.grandTotal | eşlendi |
| **paymentMethod** | yalnız `meta.paymentMethod` | normalize alan yok (`:247`) |
| **commercial** | yalnız `meta.commercial` | normalize alan yok (`:245`); `isCorporate` yalnız `invoiceAddress.taxNumber`'dan |
| micro, etgbNo, etgbDate | meta | normalize yok |
| **createdBy** (order-creation/cancel/split/transfer) | — | DÜŞER (meta). Statü/ilişki kullanılmaz |
| **originPackageIds** | — | DÜŞER (meta). Bölünmüş paketler ilişkisiz ayrı Order olur; CRM `totalSpent` paket başına birikir (`OrderWorker.ts` LTV döngüsü) |
| **packageHistories[]** | — | DÜŞER. `dates.approvedDate/shippedDate/deliveredDate` platform zamanından değil, ilk tespit anından mühürlenir (`OrderRepository.ts:170-190`). `invoiceDate` hiç yazılmaz |
| status / shipmentPackageStatus | externalStatus / internalStatus | `status` kullanılır, 13 statü tablosu (`:45-59`); `shipmentPackageStatus` okunmaz |
| **invoiceLink** | invoice.invoiceLink | eşlendi (`:216`) |
| **invoiceNumber, invoiceStatus, invoiceRejectedReasonKeys** | — | DÜŞER. `invoice.invoiceNumber` doldurulmaz; faturanın Trendyol'ca reddi görünmez. `invoicedAt = new Date()` yalnız `status==='Invoiced'` iken ve her sync'te yeniden (`:217`) |
| cargoTrackingNumber, cargoTrackingLink, cargoDeci | fulfillment.trackingCode/trackingUrl/desi | eşlendi (`:203-209`) |
| cargoProviderName | fulfillment.carrierCode **ve** carrierName (aynı değer) | kod/ad ayrımı yok (`:204-205`) |
| cargoSenderNumber | — | DÜŞER. Ayrıca `campaignCode = trackingNumber` yanlış alana kopyalanıyor (`:208`) |
| shipmentAddress (firstName, lastName, address1/2, city, district, postalCode, phone, company) | shippingAddress | eşlendi (`:301-327`) |
| shipmentAddress addressLines, latitude/longitude | — | DÜŞER (ham meta) |
| invoiceAddress (+taxOffice, taxNumber) | billingAddress | eşlendi |
| identityNumber | customer.taxNumber (fallback) | TCKN müşteri vergi no alanına yazılır (`:131`) |
| orderCountryCode | — | DÜŞER (adres `countryCode` sabit 'TR', `:325`) |
| **supplierId, channelId (25=Luxe)** | — | DÜŞER (meta). Kanal ayrımı yok |
| discountDisplays[] | — | DÜŞER |
| hsCode, deliveryAddressType, whoPays, **isCod**, containsDangerousProduct, is4P, 3pByTrendyol | — | DÜŞER (meta). `isCod` finansal etkili ama normalize değil |
| **taxAmount / cargoAmount** | financials.totalTax / shippingFee | Güncel şemada alan yok → daima 0 (`:195-196`). KDV tutarı ve kargo bedeli normalize yok |
| currencyCode, orderDate (−3 sa düzeltmesi), lastModifiedDate, estimatedDeliveryEndDate, shippedDate, deliveredDate | dates.* | eşlendi. `orderDate` kayma yönü `TODO(WP5)` (`:269`): DOĞRULANAMADI |
| **line.lineId** | externalLineItemId = externalItemId (aynı) | eşlendi (`:101,225-226`) |
| line.stockCode / barcode / productName / quantity / lineUnitPrice | sku / barcode / productName / quantity / unitPrice | eşlendi |
| line.lineTotalDiscount / lineSellerDiscount | discountAmount | birleşik; **lineTyDiscount DÜŞER** |
| line.vatRate | taxRate | eşlendi; fallback `vatBaseAmount` (`:233`). Satır `taxAmount` hesaplanmaz |
| **line.commission** | — | DÜŞER (meta). `financials.integrationCommission` ölü alan |
| line.contentId, productSize, productColor, productOrigin, productCategoryId, salesCampaignId, businessUnit | — | DÜŞER (meta) |
| line.discountDetails[] | — | DÜŞER. `totalPrice` = `lineUnitPrice×qty` (`:235`), indirim düşüldü mü: DOĞRULANAMADI (PRICE_MISMATCH tespitini etkiler) |
| line.cancelledBy | — | DÜŞER; `cancelSource` Türkçe `statusReason` metninden tahmin (`:158-163`) |
| line.cancelReason / cancelReasonCode | order.cancelReason (yalnız `lines[0]`) | kod düşer (`:175`) |

### C-2 Trendyol İADE (`transformers/ClaimTransformer.ts`; belge şeması yerelde YOK → "belgede olup düşenler" DOĞRULANAMADI)
- Statü yalnız İLK kalemden alınır (`:67`). Karma kalem durumlu iadede kalem düzeyi durum kaybolur (`ClaimItemSchema`'da durum alanı yok).
- `claimItemStatus`, `lastModifiedDate`, `resolvedAt` taşınmaz. `externalUpdatedAt` set edilmez (repo `new Date()` yazar). Sync ile `history` büyümez.
- `meta` yalnız `isDisputed, disputeStatus, replacementInfo, rejectedInfo, orderOutboundPackageId` (`:101-107`); geri kalan ham iade DB'ye girmez (Trendyol sipariş/finans `meta`'sının aksine).
- `totalRefundAmount` yoksa kalemlerden hesaplanır (`:59-64`); KDV/komisyon iadesi yok.
- `externalLineItemId = orderLine.id`: V2'de `orderLine.id` alanı mevcut mu: DOĞRULANAMADI. Sipariş tarafı `lineId` kullanıyor, iade-sipariş köprüsü kırık olabilir.
- Satır 128'de `s === 'Accepted'` (büyük A) ölü dal: `accepted` küçük harfle `:124`'te APPROVED'a düşer, COMPLETED hiç üretilmez. HB'de `accepted→COMPLETED` (`hepsiburada/transformers/ClaimTransformer.ts:68`). Statü semantiği platformlar arası tutarsız.

### C-3 Hepsiburada
- **Sipariş** (`transformers/OrderTransformer.ts`): `totalDiscount: 0`, `totalTax: 0`, `shippingFee: 0` sabit (`:57-59`); `subTotal == grandTotal == totalPrice.amount`. Satır `taxAmount` ve `discountAmount` yok; yalnız `vatRate`. Fatura `status:'PENDING'` sabit (`:71`); platformdaki fatura bilgisi okunmaz. Kargo: yalnız `order.barcode` + `cargoCompany` (`:62-67`), takip URL'i/desi/kod yok. `dates.approvedDate/cancelledDate` yok. Adreste `town`/`district` ayrımı; `addressLine2 = district`. Tüm diğer alanlar yalnız `meta`'da.
- **İade** (`ClaimTransformer.ts`): iade başına TEK kalem (`:20`); `type` daima REFUND (`:38`); `claimDate` yoksa `new Date()` (`:43`); `history.changedAt = new Date()` (`:51`). Sebep alanı `claimType`'a bağlı. `refundAmount`/`totalPriceAmount` ikisi de fallback.
- **Finans** (`FinancialMapper.ts`): `externalId = String(item.id || '')` (`:9`) → boş id'ler unique indekste birbirini ezer. `transactionDate = orderDate` (hakediş/işlem tarihi değil, `:16`). `sellerRevenue`, `shipmentPackageId`, `paymentOrderId` hiç eşlenmez. Bilinmeyen tür → SALE (`:32`). Alan adları canlı doğrulanmadı (`MARKETPLACE_COMMISSIONS_2026-09-30.md:34` "HB finans komisyon alanı DOĞRULANAMADI").
- **Mesaj** (`QuestionTransformer.ts`): `Closed→REJECTED` (`:34`, anlam DOĞRULANAMADI); `rejectionReason/isRejected` yok; yalnız `orderNumber, productName, productSku` bağlama gider.

### C-4 N11
- **Sipariş REST** (`OrderMapper.ts:135-231`): `fulfillment: []` (`:220`), kargo takip yalnız `meta`. `taxRate: 20` SABİT (`:60,169`, doğrulanmadı), `taxAmount: 0`. `subTotal == grandTotal == totalAmount`; `shippingFee/totalTax` yok. Müşteri `lastName` boş, telefon yalnız gsm. Fatura/`invoice` alanı hiç yok. `orderDate` = `packageHistories[Created]` veya `lastModifiedDate`. SOAP kolu `dates` yalnız `orderDate`, ayrıca `externalUpdatedAt` yok.
- **İade**: dönüştürücü YOK; ham SOAP nesnesi döner (F-P0-1). `customer`/`claim` paketi oluşmaz.
- **Mesaj** (`Mappers.ts:212-233`): `date: new Date()` (`:226`, soru tarihi okunmuyor, her sync'te ezilir), `status` yalnız `answer` var/yok (`:224`), `type` daima PRODUCT_QUESTION, `answeredAt` yok, `buyerEmail` kullanıcı adı olarak saklanır (PII).
- **Finans** (`Mappers.ts:235-254`): `externalId = s.settlementDate || Date.now()` (`:244`) → aynı gün birden çok hakediş birbirini ezer, tarih yoksa her turda yeni kayıt; tür daima SALE; `debt/commission/sellerRevenue/paymentOrderId/orderNumber` yok.

### C-5 Pazarama
- **Sipariş** (`OrderTransformer.ts`): `subTotal == grandTotal == OrderAmount` (`:58`); satır `taxAmount/discountAmount` yok; `cancelledDate = new Date()` her sync'te (`:52`); PascalCase/camelCase ikili okuma (şema belirsizliği). **Satır kimliği**: `externalLineItemId = OrderItemId`, `externalItemId = ProductId` (`:87-88`). Kargo yalnız ilk takipli kalemden tek `fulfillment`.
- **İade** (`ClaimTransformer.ts`): `type` daima REFUND (`:63`); `RefundStatus 1→UNDER_REVIEW` (yorum "WAITING daha doğru", `:91`); 9 (İncelemeye Gönderildi) ve 6/8 default'a düşer (`:100`); `history.changedAt = new Date()` (`:77`).
- **Finans** (`FinancialMapper.ts`): yalnız `paymentAgreement`; `debt = isReturn ? amount : commission` (`:30`), `netAmount = allowanceAmount` (`:32`); `sellerRevenue`, `paymentOrderId` eşlenmez; `otherfinancials` hiç çekilmiyor.
- **Mesaj** (`MessageTransformer.ts`): `WAITING_APPROVAL` üretir (`:41`; şema enum'unda yok); `isRejected` var, `rejectionReason/rejectedAt` yok (`:29`).

### C-6 Ideasoft ve Bizimhesap
- **IS sipariş** (`OrderTransformer.ts`): `taxRate: 0` (`:59`), `taxAmount/discountAmount` yok, `subTotal = grandTotal − shippingFee`; para birimi 'TRY' sabit; fatura/`approvedDate/shippedDate` yok. Durum tablosu belgesiz (sayısal 1-5 tahmini).
- **BH sipariş** (`OrderService.ts`): `internalStatus` DAİMA AWAITING_APPROVAL (`:125`, ham durum yalnız `externalStatus`), `taxRate: 0` (`:108`). Zamanlanmadığı için bugün etkisiz; zamanlanırsa tüm ERP siparişleri "onay bekliyor" olur. Resmi sipariş LİSTELEME ucu doğrulanamadı (`bizimhesap/descriptor.ts` limitation).

### C-7 Finans — Trendyol (`FinancialMapper.ts`)
- Eşlenen: id, orderNumber, shipmentPackageId, transactionType, debt, credit, commissionRate/Amount, sellerRevenue, transactionDate, paymentDate→payoutDate, paymentOrderId, description. `meta` yalnız `receiptId, barcode, paymentPeriod, affiliate`.
- **DÜŞEN** (`MARKETPLACE_COMMISSIONS_2026-09-30.md:32` belge alanları): `commissionInvoiceSerialNumber`, `country`, bölünmüş `shipmentPackageType`, vb. (DB'ye girmez).
- Çekilmeyen işlem türleri: Discount, Coupon, ProvisionPositive/Negative vb. (`FinancialService.ts:13` yalnız `Sale, Return`). `UniversalTransactionType` COUPON/DISCOUNT/PROVISION üretilmiyor.
- `retrieveSettlementsByPaymentId`: tek istek `size:1000`, sayfalama yok; kargo faturası yanıtı yanlış sözleşmeyle (`TRENDYOL_SETTLEMENTS_LIST`) gözlemlenir (`FinancialConnector.ts:51`).

## (D) Durum değiştiren uç nokta listesi ("okuma gibi görünen" olanlar vurgulu)

Salt-okuma kipi (`docs/LIVE_READONLY.md`, `integration/modules/common/security/liveReadonlyPolicy.ts`): GET/HEAD serbest; N11 SOAP yalnız `N11_READ_OPERATIONS` (`:20`); Pazarama okuma-POST'ları `PAZARAMA_READ_POST_PATHS` (`:27`); Trendyol/HB/IS/BH'de tüm POST/PUT/DELETE bloklu. Uygulama katmanında `external && effect!=read` RPC'ler 423 döner (`capabilities/domains/*.ts`: orders.approve/cancel, claims.approve/reject, shipments.create, invoices.create/create_manual/reissue, messages.reply).

| Adaptör çağrısı | Yöntem | Durum değiştirir mi | Not |
|---|---|---|---|
| TY: siparişleri/iadeleri/soruları/finansı listeleme | GET | hayır | `orders/stream` KULLANILMIYOR (kuyruk tüketimi yok) |
| TY: rejectOrder (`items/unsupplied`), sendOrderShipping (`shipment-packages/shipped`), sendOrderInvoice (`seller-invoice-links`), approveClaim, rejectClaim, answerMessage | PUT/POST | EVET | okuma-guard'ı bloklar |
| **HB: approveOrder** | GET detay → POST `packages` → GET `labels` | **EVET (paket oluşturur)** | adı "onay"; HB `sendOrderShipping` da aynı `createPackage`'ı çağırır (`services/OrderService.ts:111`) |
| HB: rejectOrder (`cancel`), sendOrderInvoice, approveClaim, rejectClaim, answerMessage | POST | EVET | |
| HB: `fetchPackageLabel` (`OrderConnector.ts:117`) | GET | DOĞRULANAMADI (etiket üretimi yan etkisi) | yalnız approveOrder içinde çağrılır |
| **PZ: getOrdersForApi, getRefund, paymentAgreement, finance/*, getApprovalAnswersByMerchant(Search)** | **POST** | hayır (filtreli okuma) | idempotent işaretli, guard allowlist'inde |
| PZ: updateOrderStatus (onay/ret/kargo), invoice-link, updateRefund (onay/ret/inceleme), sellerAnswer | PUT/POST | EVET | |
| **N11: OrderList, ClaimReturnList, GetSettlementList, GetProductQuestionList, GetShipmentCompanies** | **SOAP POST** | hayır | guard gövdeyi inceler |
| N11: MakeOrderItemShipment, SaveLinkSellerInvoice, ClaimReturnApprove/Reject, SaveProductAnswer | SOAP POST | EVET | guard bloklar |
| IS: `orders/<id>` PUT (preparing/cancelled/shipped) | PUT | EVET | token akışı kopuk |
| Yerel: `markMessageRead` (`operations/orders/messages.ts:112`) | — | YEREL (pazaryerine gitmez) | "okundu" platforma yansımaz |
| Yerel: `createManualInvoice`/`createInvoice` | — | Yerel DB + (createInvoice) pazaryeri link bildirimi | |
| Yerel: `requestFetchFromPlatform` | — | ilgili entegrasyonun staging kayıtlarını siler/yeniler (`docs/LIVE_READONLY.md`) | |

Sipariş "alındı" işaretleme/okundu bayrağı/kuyruk tüketimi yapan gizli bir okuma çağrısı bulunmadı (DOĞRULANAMADI: mock yok). `docs/LIVE_READONLY.md` listesi ile `liveReadonlyPolicy.ts` ve adaptör kodu tutarlı. İstisna: HB'nin POST-yazma uçları ve Trendyol'un POST-yazma uçları listede açık olarak hiç yok (hepsi varsayılan bloklu), doğru.

## (E) Mevcut örnek yanıt / mock dosya listesi

`mockserver/` bu kopyada YOK (`CLAUDE.md` kural 7). Mock rotaları kaynağı: `mockserver/backend/src/platforms/<platform>/server.js` (`integration/modules/adapterKeys.ts:7`). Mock'ta çağrılabilir uç listeleri `adapterKeys.ts:11-13`: HB `listings, product/api, orders/merchantid, packages/merchantid, claims, questions, settlements, suppliers, merchant-messages, ticket-api, rest/delivery/v1/shipmentPackages`; IS `products, orders, categories, brands, option-groups, product-variant-options, oauth`; BH `products, orders`; TY/PZ/N11 yalnız env'den (varsayılan boş). Not: HB mock'ta `merchant-messages`/`ticket-api` var, adaptörde karşılığı YOK. `backend/tests/fixtures` altında yalnız `trendyol/buybox-information.json`; `common/mock/` yalnız `MockMode.ts`.

Tüm sipariş/iade/finans/mesaj fikstürleri test dosyalarına GÖMÜLÜ sentetik nesnelerdir (gerçek yanıt DEĞİL; `helpers/trendyolOrderFixtures.ts:3-4` açıkça belirtir). Yollar `backend/tests/` altında:

| Platform | Sipariş | İade | Finans | Mesaj |
|---|---|---|---|---|
| Trendyol | `helpers/trendyolOrderFixtures.ts` (v1Package, v2Package, page), `characterization/trendyol-orders/Trendyol.{orderV2.*,wp5.orders,claimPaging}.test.ts`, `characterization/orders/Trendyol.internalOrderSnapshot.*` + `__snapshots__/…snap`, `contract/Trendyol.schema.test.ts` | satır-içi: `trendyol-orders/Trendyol.claimPaging.test.ts`. **Transformer testi YOK** | `characterization/trendyol-finance/Trendyol.finance.{characterization,com03}.test.ts`, `characterization/financial-service/*` | satır-içi: `characterization/stubs/Trendyol.errorSwallow.stub.test.ts`. **Transformer testi YOK** |
| Hepsiburada | `characterization/transformers/Hepsiburada/OrderTransformer…`, `characterization/orders/Hepsiburada.{internalOrderSnapshot,orderStatus,orderIdentity,orderClaimPaging,remainingEndpoints}…` + snap | `transformers/Hepsiburada/ClaimTransformer…` | `transformers/Hepsiburada/FinancialMapper…` | `transformers/Hepsiburada/QuestionTransformer…` |
| N11 | `characterization/orders/N11.{orderIntake,orderPaging,orderStatus,internalOrderSnapshot}…` + snap, `unit/integration/N11.responseContracts.test.ts` | **YOK** | **YOK** | **YOK** |
| Pazarama | `transformers/Pazarama/OrderTransformer…`, `orders/Pazarama.{internalOrderSnapshot,orderStatus,paging}…` + snap | `transformers/Pazarama/ClaimTransformer…` | `transformers/Pazarama/FinancialMapper…` | `transformers/Pazarama/MessageTransformer…` |
| Ideasoft | `transformers/Ideasoft/OrderTransformer…`, `orders/IdeasoftBizimhesap.orderIntake…`, `conformance/ideasoft.conformance.test.ts` | — | — | — |
| Bizimhesap | `orders/IdeasoftBizimhesap.orderIntake…`, `conformance/bizimhesap.conformance.test.ts` | — | — | — |
| Servis/panel | — | `characterization/claim-service/ClaimService.characterization.test.ts` | — | `characterization/message-service/MessageService.characterization.test.ts`, `characterization/invoice-service/InvoiceService.characterization.test.ts` |

Descriptor `mock.contractFixtures` hepsinde `[]` (`trendyol/descriptor.ts:174` vb.); Trendyol `contracts:` yalnız `orders.list@v2`, `claims.list@v1`, `products.buybox@v1` (zod, `contracts/*.ts`). HB/N11/PZ/BH için `contracts: []`.

Uyumluluk analizi için gerçek yanıt örneği yok: tek belge kaynaklı şema `migration-spec §2.3` (Trendyol sipariş V2). HB/N11/PZ için yalnız kodun okuduğu alan listeleri (audit §2.4 ve bu rapor C bölümü) var. Canlı salt-okuma turunda (`docs/LIVE_READONLY.md` 2026-10-03) Siparişler/İadeler canlı veri ÇEKMEDİ; yalnız bağlantı testi ve katalog okundu. Pazarama anahtarı geçersiz, Ideasoft token süresi dolmuş, Bizimhesap 402.

## (F) Bulgular

### P0
- **F-P0-1 — N11 iade senkronu motorun beklediği biçimi üretmiyor.** `n11/services/ClaimService.ts:15-29` ham SOAP nesnelerini (`claimReturnList.claimReturn`) döner. Mapper yok, test yok. `OrderWorker.ts:229-231` her öğede `claimPkg.customer`/`claimPkg.claim` bekler. `saveCustomer(undefined)` ve `claimsToSave.push(undefined)` → `ClaimRepository.ts:28` (`c.externalClaimId`) TypeError. İade bloğu try/catch içinde izole DEĞİL (`OrderWorker.ts:225-246`); iş FAIL olur, sipariş imleci ilerlemez. Koşul: N11'de açık `REQUESTED` iade varken (15 dk'lık claim penceresi). Kod yolu kesin, çalışma zamanı DOĞRULANAMADI. Descriptor yalnız "ilk sayfa" diyor.
- **F-P0-2 — Trendyol kargo bildirimi fiilen hiç gönderilmiyor ama başarı dönüyor.** `OrderTransformer.ts:200-202` her Trendyol siparişine `fulfillment[0].shipmentMethod:'MARKETPLACE'` (takip yokken `status:'PENDING'`) yazar. `shipments.ts:221-222` bunu `meta.shipmentMethod` olarak iletir. `services/OrderService.ts:51-57` `AUTOMATED_LOGISTICS_SKIP` ile `success:true` döner; `shipments.ts:92-120` siparişi yerelde SHIPPED yapar. Sahte başarı (ADR-0006 ilkesi). Satıcının kendi kargosu kullanıldığı durumda doğruluk: DOĞRULANAMADI (hangi satıcı modeli desteklenmeli kararı gerekir).
- **F-P0-3 — Kargo bildirimi yükü eksik; HB/N11/PZ yanlış kimlik veya boş paket gönderir.** `operations/orders/shipments.ts:213-224` `lineItems`, `meta.orderItemId`, `meta.currentExternalStatus` göndermez. Etki: HB `createPackage([])` (`services/OrderService.ts:106-111`, takip no/firma hiç gitmez); N11 `orderItemId = orderNumber` (`n11/services/OrderService.ts:156`); PZ `orderItemId = orderNumber` ve 3→12 geçişi atlanır (`pazarama/api/OrderConnector.ts:36`, `services/OrderService.ts:95`). Platform reddi/sessiz hata: DOĞRULANAMADI (canlı yok).
- **F-P0-4 — Pazarama red/iptalde yanlış satır kimliği.** `orderActions.ts:21` ve `OversellCompensationJob.ts:~316` `externalLineId: item.externalItemId` yollar (= ProductId, `OrderTransformer.ts:88`); Pazarama `updateOrderStatus` OrderItemId bekler (`pazarama/services/OrderService.ts:77`). Pazarama, oversell otomatik iptalinde "doğrulanmış kanal"dır (`OversellCompensationJob.ts:36`), dolayısıyla zero-oversell telafisi bu kanalda yanlış çalışabilir. Canlı doğrulama: DOĞRULANAMADI.

### P1
- **F-P1-1 — Fatura modülü yalnız "manuel giriş + link bildirimi".** `invoices.ts:158` `hasIntegratedProvider = false`. `INTEGRATOR` yöntemi hiçbir yerde üretilmez; e-fatura sağlayıcı yok (`INTEGRATION_CATEGORY_MODEL` §1: einvoice YOK; UI'daki 4 e-fatura formu çalışmıyor). Pazaryerinden fatura OKUMA hiçbir adaptörde yok (`IOrderPackage.invoices` boş). Ideasoft `sendOrderInvoice` NS, Bizimhesap STUB. `uploadInvoiceFile` ve fatura linki silme Trendyol'da belgelerde var (`migration-spec.md:303`), adaptörde yok.
- **F-P1-2 — Fatura veri bütünlüğü.** (a) `ettn` UUID değil: manuel `SYS-MANUAL-<ts>` (`invoices.ts:30`), otomatik `ObjectId` (`:169`); (b) upsert filtresi `{integrationCode, externalOrderId, type}` için unique indeks yok (yalnız `ettn` unique); (c) `dates.invoicedAt` (`:204`) ve `history` (`:221`) Order şemasında yok → strict tarafından sessizce düşer; (d) `syncInvoiceToPlatform` `order.currency` (olmayan alan, `:347`) ve `meta` göndermez (Pazarama `deliveryCompanyId/trackingNumber` null kalır); (e) pazaryerine iletim başarısız olsa bile `Invoices` kaydı APPROVED kalır, Order `invoice.status` FAILED yapılmaz (`:171,181-190`).
- **F-P1-3 — Denetim izi kaybı.** `orderActions.ts:40,162,203`, `shipments.ts:125`, `invoices.ts:221` Orders'a `$push history` yapar; `OrderSchema`'da `history` yok (strict) → kayıt yazılmaz. Gerçek iz yalnız `platformActions` (kargo/fatura/`markPrinted`); iptal/onay için yok. Ayrıca `fulfillment` push'undaki `shippedAt` şemada yok (`shipments.ts:123`).
- **F-P1-4 — Sipariş-iptal sebep kataloğu anlamsal olarak tutarsız; tek RPC (`getOrderRejectionReasons`) hem iptal hem iade reddi için kullanılıyor, iade-reddi kataloğu RPC'si yok.** TY: iptal için iade-sebep (claim-issue) kataloğu (`ClaimConnector.ts:112`), `reasonId: Number()` (`OrderConnector.ts:232`); yorum `OversellCompensationJob.ts:44-56` bunu doğrulanamadı olarak işaretler. HB: iade sebepleri iptal sebebi olarak `cancellationReason`'a gider. PZ: sipariş sebepleri (1-4) `RefundRejectType` (1-12 iade sebebi) olarak kullanılır (`ClaimConnector.ts:74`); PZ iade sebep listesi `services/ClaimService.ts` içinde ULAŞILAMAZ. N11: `claimRejectReasonId` serbest dize. Sonuç: Trendyol'da oversell otomatik iptali hiç çalışmaz (`VERIFIED_REASON_ID_BY_CHANNEL` yok → UNKNOWN_OUTCOME, `OversellCompensationJob.ts:291-298`).
- **F-P1-5 — Pazarama sipariş onayı yalnız ilk satır.** `pazarama/index.ts:79-90` + `orderActions.ts:125,192` yalnız `items[0].externalLineItemId`; çok satırlı siparişte diğer kalemler 3'te kalır. Aynı şekilde Pazarama/N11 kargo bildirimi yalnız ilk kalem (descriptor limited).
- **F-P1-6 — Mesaj durum enum'u tutarsız.** Şema (`Message.ts:27`) `WAITING_APPROVAL` içermez; Pazarama transformer (`MessageTransformer.ts:41`) ve `replyMessage` (`operations/orders/messages.ts:89`) bunu yazar. Mongoose `bulkWrite`/`findOneAndUpdate` enum doğrulaması varsayılan kapalıysa kayıt yazılır ama sorgu/UI filtreleri etkilenir (çalışma zamanı DOĞRULANAMADI). Frontend `messageSla.ts` `WAITING_APPROVAL`'ı bekleyen saymaz (`isAwaitingReply`). N11 `status` yalnız cevap var/yok → `UNREAD`.
- **F-P1-7 — Finans idempotency kırıkları.** N11 `externalId = settlementDate || Date.now()` (`Mappers.ts:244`); HB `String(item.id || '')` (`FinancialMapper.ts:9`); Trendyol `item.id?.toString()` undefined olabilir (`FinancialMapper.ts:15`). `{integrationCode, externalId}` unique ile aynı gün hakedişler birbirini ezer veya her turda çift satır oluşur.
- **F-P1-8 — Finans panel hesabı.** `FinancialPanelRepository.ts:11` `$sum:"$cargoAmount"` şemada olmayan alan → `totalCargo` hep 0 (kargo faturası `CargoInvoices.amount`'ta). Toplamlar (`credit/debt/netAmount`) satış, iade ve ödeme emri satırlarını birlikte topluyor; çift sayım niyeti DOĞRULANAMADI. Sıralama anahtarı izin listesiz (`financialPanel.ts:49`; diğer modüllerde allowlist var).
- **F-P1-9 — İade verisi sync ile güncellenmiyor.** `ClaimRepository.ts:95,106` `history` yalnız `$setOnInsert`; `resolvedAt/externalUpdatedAt/claimedAt` güncellenmez; adaptörler bunları zaten doldurmaz. HB/PZ `history.changedAt = new Date()` (tespit anı). Dolayısıyla iade yaşam çizgisi ve çözüm süresi platform zamanından hesaplanamaz.
- **F-P1-10 — Trendyol iade statüsü yalnız ilk kalemden (`ClaimTransformer.ts:67`); `Accepted` ölü dal (`:128`); Trendyol `approveClaim/rejectClaim` `IntegrationError` yerine `{success:false}` döner (`ClaimConnector.ts:149-158,181-190`), UNKNOWN_OUTCOME/ret ayrımı kaybolur.**
- **F-P1-11 — Trendyol finansında kapsam eksikleri.** Yalnız Sale/Return + 4 otherfinancials türü (`FinancialService.ts:13,15`); Discount/Coupon/Provision/CashAdvance çekilmez. `retrieveSettlementsByPaymentId` tek sayfa. Trendyol dışındaki 3 adaptörde komisyon/hakediş alanları doğrulanmadı veya yok (N11 yalnız tutar+tarih; PZ otherfinancials kullanılmıyor).
- **F-P1-12 — Mesaj kapsamı.** Yalnız soru-cevap (ürün/sipariş sorusu). Sipariş mesajı/ticket yok (HB mock'unda `merchant-messages`/`ticket-api` rotası var, adaptörde yok; resmi API'de olup olmadığı DOĞRULANAMADI). Trendyol `size=50` tek sayfa (`MessageConnector.ts:18,44`; yanıt `totalElements: 864` yorumu `MessageTransformer.ts`), N11/HB ilk sayfa. SLA: backend'de alan/iş yok; yalnız önyüz `frontend/src/components/message/messageSla.ts` (hipotez eşikleri 24/48 sa, "pazaryeri SLA'sı değildir", Trendyol cevap 10–2000 karakter). `cloud/w2-message-sla` dalı yerelde bulunamadı (yalnız bu dosya + `frontend/tests/message-sla.test.ts`); backend SLA alanı/bildirimi YOK.
- **F-P1-13 — Bölünmüş Trendyol paketleri** (`createdBy: split`, `originPackageIds`) ilişkilendirilmez; her paket ayrı Order, CRM `totalSpent` ve discrepancy hesabı paket başına (`OrderWorker.ts` LTV döngüsü). Etki ölçümü DOĞRULANAMADI.

### P2
- **F-P2-1 — PII duplikasyonu.** Tüm adaptörlerde `meta: {...order}` (TY'de `identityNumber`, e-posta, adres koordinatları; HB soru `rawMetadata:item`; PZ `...claim`) şifresiz Mixed alanda; ayrıca normalize alanlarda kopya. KVKK dışa aktarma/silmede ek yüzey. Anonimleştirme kapsamı DOĞRULANAMADI.
- **F-P2-2 — Mesaj-sipariş eşleme** `orderNumber` ile ve `integrationCode` filtresiz (`MessageRepository.ts:33`): farklı pazaryerlerinde aynı sipariş no varsa yanlış bağ.
- **F-P2-3 — Pazarama `retrieveMessages`** her soru için sınırsız `Promise.all` detay GET (`services/MessageService.ts:30`); `sendRevision` her zaman `success:true` (`ClaimConnector.ts:140`).
- **F-P2-4 — Trendyol URL'leri.** Claim/mesaj/finans URL'leri kod varsayılanı olmadan `settings.urls.*`'dan okunur (`ClaimConnector.ts:20`, `MessageConnector.ts:16`, `FinancialConnector.ts:79`); eksik ise TypeError/Error. Reddetme açıklaması URL-encode edilmeden sorguya girer (`ClaimConnector.ts:171`). Kargo gövdesinde `lineId: item.merchantSku` (`OrderConnector.ts:263`).
- **F-P2-5 — Ideasoft/Bizimhesap desteklenmeyen metotlar sessiz `[]/false`** (NOT_SUPPORTED yerine); `OrderQueueProducer` bu adaptörler için iade/mesaj/finans penceresini "başarılı" sayıp imleci ilerletir. Customer `externalIdentities` indeksi unique değil (`Customer.ts:82-85`).
- **F-P2-6 — Trendyol `invoicedAt = new Date()`** her sync'te yenilenir (`OrderTransformer.ts:217`); `invoice` nesnesi SUCCESS değilken her sync'te ezilir (`OrderRepository.ts:104`).
- **F-P2-7 — Eksik yetenek özeti (platform destekliyor/deniyor, bizde yok).** Kodda: N11 sipariş onay/ret (descriptor NS); Pazarama `sendToReview/sendRevision` (yazıldı, bağlanmadı); HB/N11/PZ `retrieveSettlementsByPaymentId`; HB/N11 `retrieveCargoInvoices`; Ideasoft iade/mesaj/finans/fatura. Belgede ama kodda yok: Trendyol `uploadInvoiceFile`, fatura linki silme. DOĞRULANAMADI (kaynak yok): Trendyol paket statü güncelleme (Picking/Invoiced), sipariş mesajları, N11/HB/PZ resmi yanıt şemalarındaki ek alanlar.

### Ek notlar
- Backend ham `meta` ile hiçbir veriyi "kaybetmiyor" (sipariş/HB/PZ/N11/IS/BH); gerçek DB kaybı yalnız Trendyol iadesi (`meta` küçük alt küme), Trendyol finansı (`meta` 4 alan), N11 mesaj/finans ve N11 iade (hiç kaydedilmez).
- Descriptor/kod/doküman bayatlıkları: `BACKEND_INTEGRATION_AUDIT_2026-09-30.md` F-02 (sayfalama), `trendyol/descriptor.ts:138` (R9). `INTEGRATIONS_REGISTRY.md` bu kopyada yok (CLAUDE.md ona atıf yapıyor).
- Mimari karar gerektiren konular: (1) normalize edilmemiş alanlar için tipli `platformData` mı, `meta` mı; (2) kargo/sevkiyat sözleşmesi (`lineItems`, `orderItemId`, "platform-yönetimli lojistik" ayrımı); (3) iade/iptal sebep kataloğu için ayrı `IPlatform` metotları; (4) e-fatura sağlayıcı kategorisi; (5) Order `history` şeması.
