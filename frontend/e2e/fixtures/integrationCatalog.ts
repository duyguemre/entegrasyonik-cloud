// C1.2 — `IntegrationService/getCatalog` sentetik yanıtı. İçerik backend manifestolarından
// (`backend/src/integration/modules/*/*/descriptor.ts`, 2026-09-30) BİREBİR aktarıldı: code/displayName/
// category/status/adapterVersion/capabilities{level,note}/limitations/verification — uydurma alan yok.
// Sıra `IntegrationDescriptorRegistry.ts` ile aynı.
export function integrationCatalogFixture() {
  return [
    {
      "code": "trendyol",
      "displayName": "Trendyol",
      "category": "marketplace",
      "status": "available",
      "adapterVersion": "1.1.0",
      "capabilities": {
        "products": {
          "level": "supported",
          "note": "Ürün aktarımı (V2), içerik/varyant/teslimat güncelleme ve toplu işlem durumu sorgulama."
        },
        "stockPrice": {
          "level": "supported",
          "note": "Stok/fiyat V1-V2 ortak uç; aynı gövde 15 dk içinde tekrarlanamaz (TRENDYOL_PRODUCT_LIMITS.SAME_BODY_COOLDOWN_MS)."
        },
        "orders": {
          "level": "supported",
          "note": "Sipariş V2 (`v2/orders`); pencere <=14 gün, sayfa/oran limitli, ardışık çekim (limits.ts, TRENDYOL_ORDER_V2)."
        },
        "orderActions": {
          "level": "platform_auto",
          "note": "Trendyol siparişi kendisi onaylar; `approveOrder` gerçek çağrı yapmadan `true` döner (bilinçli no-op). Ayrı `rejectOrder` gerçek çağrı yapar (supported)."
        },
        "returns": {
          "level": "supported",
          "note": "İade talepleri listelenir, onaylanır veya red nedeniyle reddedilir."
        },
        "questions": {
          "level": "supported",
          "note": "Müşteri soruları listelenir ve cevaplanır (size<=50, tarih aralığı <=2 hafta)."
        },
        "finance": {
          "level": "supported",
          "note": "Hakediş, diğer finansal hareketler, kargo faturası ve ödeme emri görünümü."
        },
        "shippingNotice": {
          "level": "limited",
          "note": "Kargo takip bilgisi elle girilir ve pazaryerine iletilir; paket kimliği eşleşmesi uçtan uca doğrulanmadı (INTEGRATIONS_REGISTRY §2.1)."
        },
        "invoiceNotice": {
          "level": "supported",
          "note": "Fatura bağlantısı resmi şemayla (`invoiceLink`, `shipmentPackageId`, opsiyonel `invoiceNumber`) iletilir."
        },
        "categories": {
          "level": "supported",
          "note": "Kategori, nitelik, marka ve komisyon bilgisi pazaryerinden alınır."
        }
      },
      "limitations": [
        "Kargo takip bilgisi otomatik değil, elle girilerek iletilir.",
        "Sipariş satır kimliği yeniden adlandırması (`line.id`→`lineId`) adaptörde henüz uygulanmadı (BACKLOG R9, doğruluk riski).",
        "`origin` (menşe) alanı ürün gönderiminde henüz eklenmedi (23.10.2026'da zorunlu olacak, BACKLOG R6)."
      ],
      "verification": {
        "liveApi": false,
        "mockEnvironment": true
      }
    },
    {
      "code": "pazarama",
      "displayName": "Pazarama",
      "category": "marketplace",
      "status": "available",
      "adapterVersion": "1.0.0",
      "capabilities": {
        "products": {
          "level": "supported",
          "note": "Ürün aktarımı ve güncelleme toplu işlem akışıyla yapılır."
        },
        "stockPrice": {
          "level": "supported",
          "note": "Stok ve fiyat güncellemeleri pazaryerine iletilir."
        },
        "orders": {
          "level": "supported",
          "note": "Siparişler çekilir; sipariş durumu, kargo ve fatura bağlantısı güncellenir. Sayfalama doğrulanamadı (INTEGRATIONS_REGISTRY §2.4)."
        },
        "orderActions": {
          "level": "supported",
          "note": "Sipariş onaylama (\"hazırlanıyor\" statüsüne geçiş) ve reddetme desteklenir."
        },
        "returns": {
          "level": "supported",
          "note": "İade talepleri onaylanır, reddedilir, incelemeye gönderilir veya revize edilir."
        },
        "questions": {
          "level": "supported",
          "note": "Müşteri mesajları listelenir ve cevaplanır."
        },
        "finance": {
          "level": "limited",
          "note": "Hakediş görünümü mevcuttur; ödeme emrine göre ayrıntı sorgusu (retrieveSettlementsByPaymentId) bu sürümde yoktur (daima boş dizi)."
        },
        "shippingNotice": {
          "level": "limited",
          "note": "Kargo bilgisi yalnızca siparişin ilk kalemi için iletilir."
        },
        "invoiceNotice": {
          "level": "supported",
          "note": "Fatura bağlantısı pazaryerine iletilir."
        },
        "categories": {
          "level": "supported",
          "note": "Kategori, marka ve komisyon bilgisi pazaryerinden alınır."
        }
      },
      "limitations": [
        "Ödeme emrine göre hakediş ayrıntısı sağlanmıyor.",
        "Kargo bilgisi yalnızca siparişin ilk kalemi için iletilir.",
        "Sipariş çekimi sayfalaması doğrulanamadı; resmi rate limit yayınlanmamış."
      ],
      "verification": {
        "liveApi": false,
        "mockEnvironment": true
      }
    },
    {
      "code": "n11",
      "displayName": "N11",
      "category": "marketplace",
      "status": "available",
      "adapterVersion": "1.0.0",
      "capabilities": {
        "products": {
          "level": "supported",
          "note": "Ürün aktarımı ve güncelleme toplu görev akışıyla (ms/product/tasks) yapılır."
        },
        "stockPrice": {
          "level": "supported",
          "note": "Stok ve fiyat güncellemeleri pazaryerine iletilir."
        },
        "orders": {
          "level": "limited",
          "note": "Siparişler önce REST (`rest/delivery/v1/shipmentPackages`), UNAVAILABLE/NOT_SUPPORTED olursa SOAP'a düşerek çekilir; çekim tek sayfa ile sınırlıdır."
        },
        "orderActions": {
          "level": "not_supported",
          "note": "N11 sipariş onay/paketleme ve red uç noktaları uygulanmadı; her ikisi de NOT_SUPPORTED fırlatır. `retrieveOrderRejectionReasons` ayrıca statik bir liste döner (throw etmez)."
        },
        "returns": {
          "level": "limited",
          "note": "Yalnızca yeni iade talepleri ve yalnızca ilk sayfa listelenir."
        },
        "questions": {
          "level": "limited",
          "note": "Yalnızca açık sorular ve yalnızca ilk sayfa listelenir."
        },
        "finance": {
          "level": "limited",
          "note": "Hakediş görünümü kısmidir; ilk sayfa ile sınırlıdır. Ödeme emri sorgusu (retrieveSettlementsByPaymentId) daima boş dizi döner."
        },
        "shippingNotice": {
          "level": "limited",
          "note": "Kargo bilgisi yalnızca siparişin ilk kalemi için iletilir (SOAP orderItemShipment)."
        },
        "invoiceNotice": {
          "level": "supported",
          "note": "Fatura bağlantısı SOAP SellerInvoiceService ile pazaryerine iletilir."
        }
      },
      "limitations": [
        "Sipariş onaylama ve reddetme bu sürümde desteklenmez; işlem NOT_SUPPORTED hatası olarak bildirilir.",
        "İade, soru ve hakediş listeleri ilk sayfa ile sınırlıdır.",
        "Marka bilgisi ve ödeme emri sorgusu sağlanmıyor.",
        "SOAP servislerinin (ProductSellingService/ProductStockService dahil) gelecekteki kapanış takvimi doğrulanamadı (BACKLOG P2)."
      ],
      "verification": {
        "liveApi": false,
        "mockEnvironment": true
      }
    },
    {
      "code": "hepsiburada",
      "displayName": "Hepsiburada",
      "category": "marketplace",
      "status": "available",
      "adapterVersion": "1.0.0",
      "capabilities": {
        "products": {
          "level": "supported",
          "note": "Ürün aktarımı, içerik güncelleme ve toplu işlem durumu sorgulama. Varyant/teslimat güncelleme (updateProductVariant/updateProductDelivery) NOT_SUPPORTED fırlatır (kategorinin ayrı bir metodu, görünür sınır olarak limitations'ta)."
        },
        "stockPrice": {
          "level": "supported",
          "note": "Stok ve fiyat güncellemeleri pazaryerine iletilir."
        },
        "orders": {
          "level": "limited",
          "note": "Sipariş çekimi sayfalamasızdır; tek seferde sınırlı sayıda sipariş alınır (doğrulanamadı, INTEGRATIONS_REGISTRY §2.2)."
        },
        "orderActions": {
          "level": "supported",
          "note": "Sipariş reddetme ve paket oluşturma desteklenir."
        },
        "returns": {
          "level": "supported",
          "note": "İade talepleri listelenir, onaylanır veya reddedilir."
        },
        "questions": {
          "level": "limited",
          "note": "Soru servisi mevcuttur; kapsamı bu sürümde sınırlıdır (sayfalama/filtre doğrulanmadı)."
        },
        "finance": {
          "level": "limited",
          "note": "Hakediş görünümü kısmidir; kargo faturası ve ödeme emri sorgusu döner ama daima boş dizi (retrieveCargoInvoices/retrieveSettlementsByPaymentId)."
        },
        "shippingNotice": {
          "level": "limited",
          "note": "Paket oluşturulur; takip bilgisinin pazaryerine iletimi bu sürümde doğrulanmamıştır."
        },
        "invoiceNotice": {
          "level": "supported",
          "note": "Fatura bağlantısı pazaryerine iletilir."
        }
      },
      "limitations": [
        "Varyant güncelleme desteklenmiyor (NOT_SUPPORTED).",
        "Teslimat güncelleme desteklenmiyor (NOT_SUPPORTED).",
        "Kargo faturası ve komisyon bilgisi sağlanmıyor.",
        "Sipariş çekimi sayfalamasızdır."
      ],
      "verification": {
        "liveApi": false,
        "mockEnvironment": true
      }
    },
    {
      "code": "ideasoft",
      "displayName": "Ideasoft",
      "category": "ecommerce",
      "status": "limited",
      "adapterVersion": "1.0.0",
      "capabilities": {
        "products": {
          "level": "limited",
          "note": "Ürün oluşturma, fiyat/stok/içerik güncelleme çalışır; ama gerçek modda OAuth token akışı KOPUK (aşağıdaki limitations), bu yüzden coverage=limited."
        },
        "stockPrice": {
          "level": "limited",
          "note": "Stok ve fiyat güncellemeleri mağazaya iletilir (gerçek modda token akışı kopukluğu geçerli)."
        },
        "orders": {
          "level": "limited",
          "note": "Siparişler sayfalı olarak çekilir."
        },
        "orderActions": {
          "level": "limited",
          "note": "Sipariş hazırlanıyor, iptal ve kargolandı durumları güncellenir."
        },
        "shippingNotice": {
          "level": "limited",
          "note": "Kargolandı durumu ve takip numarası mağazaya iletilir."
        },
        "invoiceNotice": {
          "level": "not_supported",
          "note": "Ideasoft sipariş faturası bildirimi henüz gerçek olarak uygulanmadı; NOT_SUPPORTED fırlatır."
        },
        "categories": {
          "level": "limited",
          "note": "Kategori ve marka bilgisi mağazadan alınır."
        }
      },
      "limitations": [
        "Gerçek mağaza bağlantısında yetkilendirme (OAuth) adımı bu sürümde tamamlanmamıştır; entegrasyon şu an test/mock ortamında çalışır (BACKLOG C10).",
        "İade yönetimi sağlanmıyor.",
        "Mesaj (soru-cevap) yönetimi sağlanmıyor.",
        "Finans görünümü sağlanmıyor.",
        "Fatura bilgisi bildirimi desteklenmiyor."
      ],
      "verification": {
        "liveApi": false,
        "mockEnvironment": true
      }
    },
    {
      "code": "bizimhesap",
      "displayName": "Bizimhesap",
      "category": "erp",
      "status": "limited",
      "adapterVersion": "1.0.0",
      "capabilities": {
        "products": {
          "level": "limited",
          "note": "Ürünler ERP kaynağından yalnızca okunur (streamProducts); yazma metotları (transferProducts/updateProduct/updateProductVariant/updateProductDelivery/updateProductStock/updateProductPrice) NOT_SUPPORTED fırlatır."
        },
        "orders": {
          "level": "limited",
          "note": "Siparişler yalnızca okunur; sipariş üreticisi (OrderQueueProducer.ts) ERP tipini taramadığı için otomatik zamanlanmış sipariş çekimine dahil değildir."
        },
        "categories": {
          "level": "limited",
          "note": "Kategori ve marka bilgisi ürün kataloğundan türetilir (Bizimhesap'ın kendi kategori API'si değil)."
        }
      },
      "limitations": [
        "Yalnızca okuma: Bizimhesap tarafına ürün, stok veya fatura yazılmaz.",
        "Sipariş okuma otomatik zamanlanmış çekime dahil değildir (OrderQueueProducer erp tipini taramıyor).",
        "İade, mesaj ve finans görünümü sağlanmıyor.",
        "Fatura oluşturma desteklenmiyor.",
        "Resmi dokümantasyonda sipariş LİSTELEME (okuma) uç noktası görünmüyor; yalnızca \"Sipariş/Fatura Ekleme\" (yazma) dokümante — adaptörün sipariş okuma davranışı mock'a dayanıyor olabilir (BACKLOG P1 doğruluk riski)."
      ],
      "verification": {
        "liveApi": false,
        "mockEnvironment": true
      }
    }
  ]
}
