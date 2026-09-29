🚀 Katalog Entegrasyon Orkestratörü (V2)
Bu modül, dış platformlardan (Trendyol, Hepsiburada vb.) ürün çekme (Import) ve platformlara ürün/stok gönderme (Export) süreçlerini yöneten, Event-Driven (Olay Güdümlü) ve Multi-Tenant (Çok Kiracılı) mimariye sahip merkezi yönetim birimidir.


================================================================================
          KATALOG ENTEGRASYON SERVİSİ - DOSYA VE METOD SORUMLULUK MATRİSİ
================================================================================

1. API / SERVICE KATMANI (Giriş Katmanı)
----------------------------------------
integration-service.ts
    │   Sorumluluk: Kullanıcı taleplerini (Import/Export) valide eder 
    │               ve DB'de ilk kayıtları oluşturur.
    │
    ├── requestFetchProducts()
    │       Sorumluluk: Import Tetikleyici. Yeni bir ImportJob oluşturur 
    │                   ve PROCESS_NEXT_IMPORT_JOB sinyalini fırlatır.
    │
    └── batchCreator()
            Sorumluluk: Export Tetikleyici. Kuyruktaki ürün değişimlerini 
                        gruplayarak ExportSignal vagonlarını oluşturur.

2. ORCHESTRATION KATMANI (Yönetim Döngüleri)
--------------------------------------------
ImportOrchestrator.ts
    │   Sorumluluk: Import Döngüsü. Stager ve Importer worker'larını 
    │               sırasıyla koordine eder.
    │
ExportOrchestrator.ts
        Sorumluluk: Export Döngüsü. Dispatcher'ı çalıştırır ve "Vagon" (Signal) 
                    sırasına göre worker'ları yönetir.

3. WORKERS - IMPORT KATMANI (Veri Girişi)
-----------------------------------------
Stager.ts
    │   Sorumluluk: Platformdan ham veriyi çeker, ClientDB Staging alanına 
    │               yazar ve rapor üretir.
    │
Importer.ts
        Sorumluluk: Staging'deki geçerli verileri asıl Product/Variant 
                    tablolarına kalıcı olarak işler.

4. WORKERS - EXPORT KATMANI (Veri Çıkışı)
-----------------------------------------
Dispatcher.ts
    │   Sorumluluk: QUEUED durumundaki sinyalleri analiz eder ve işleme 
    │               hazır (PREPARING) hale getirir.
    │
Validator.ts
    │   Sorumluluk: Ürün verilerini platform kurallarına (nitelik, fiyat, stok) 
    │               göre doğrular.
    │
Publisher.ts
    │   Sorumluluk: Doğrulanmış veriyi platform API'lerine fiziksel olarak gönderir.
    │
Sentinel.ts
    │   Sorumluluk: Platforma gönderilen işlemin sonucunu (Asenkron cevap) takip eder.
    │
Sync.ts
        Sorumluluk: Platformdaki veriler ile lokal verilerin (stok/fiyat) 
                    son eşleşmesini doğrular.

================================================================================



🔄 Detaylı İşleyiş Senaryoları
1. Import (Ürün Çekme) Akışı
requestFetchProducts: Kullanıcı "Ürün Çek" butonuna basar. Metod, ApplicationDB'de WAITING_FOR_FETCH durumunda bir iş oluşturur ve uyanma sinyali fırlatır.

Stager: Worker uyanır. Ham ürün verilerini platformdan stream ederek çeker. ClientDB içindeki ImportStagedProducts tablosuna yazar. Eksik eşleşmeleri ImportJobReport'a kaydeder.

Importer: Stager işini bitirince Importer devreye girer. Staging alanındaki "VALID" işaretli ürünleri asıl ürün tablolarına (Variant/Product) taşır ve stok senkronizasyonunu yapar.

2. Export (Ürün Gönderimi) Akışı
batchCreator: Lokaldeki ürün değişimlerini (fiyat güncelleme vb.) yakalar ve bunları ExportSignal (Vagon) dokümanları olarak paketler.

Dispatcher: ExportOrchestrator içindeki döngüde çalışır. İşlem sırası gelen vagonları kilitler.

Vagon Zinciri:

Validator: "Veriler eksiksiz mi?"

Publisher: "API'ye gönder."

Sentinel: "Platform işlemi onayladı mı?"

Sync: "Her iki taraf da artık aynı veriye mi sahip?"

Final: Zincirdeki son vagon (isLast) bittiğinde kullanıcıya bildirim gönderilir.





================================================================================
          KATALOG ENTEGRASYON SERVİSİ - VERİ DAĞILIMI (SON REVİZE)
================================================================================

1. APPLICATION DB (Merkezi Orkestrasyon ve İş Kuyruğu)
------------------------------------------------------
Sorumluluk: Koordinasyon, Kilitler ve Vagon Durumları.

    ├── ImportJobs (İş listesi ve Pod kilitleri)
    ├── ExportSignals (Vagonlar ve Sequence yönetimi)
    └── ExportFlag 🚩 (Merkezi değişim bayrağı)


2. CLIENT DB (Müşteri İzolasyonu ve Ağır Veri Yükü)
----------------------------------------------------
Sorumluluk: Müşteriye özel canlı tablolar ve yüksek hacimli staging verileri.

    ├── Products / Variants (Canlı veri ve variantHash)
    │
    ├── ImportStagedProducts [Ağır Yük] 📥
    │       Sorumluluk: Platformdan çekilen ham (raw) ürün verileri.
    │
    ├── ExportStagedProducts [Ağır Yük] 📤
    │       Sorumluluk: Platforma gönderilmek üzere hazırlanan paketler, 
    │                   API istek kopyaları ve platformdan dönen hata logları.
    │
    ├── ImportStagedProductSummaries
    └── ImportJobReports / ExportJobReports


3. SİSTEMİN ÖZET MANTIĞI
------------------------
    - NEYİN değiştiği? -> ApplicationDB (ExportFlag / Signals)
    - NE ile değiştiği? -> ClientDB (StagedProducts / Products)
================================================================================


================================================================================
          KATALOG ENTEGRASYON SERVİSİ - EVENT SİSTEMİ (MİMARİ OMURGA)
================================================================================

Sistem, bileşenler arası iletişimi sağlamak ve Worker'ları anında uyandırmak için 
merkezi bir EventBus yapısı kullanır.

1. İLGİLİ DOSYALAR VE TANIMLAR
------------------------------
IntegrationEventBus.ts (Sistem İçi Sinyaller)
    │   Sorumluluk: Orchestrator döngülerini uykudan uyandıran teknik sinyaller.
    │
    ├── EVENTS.PROCESS_NEXT_SIGNAL      : Export vagon zincirini ilerletir.
    └── EVENTS.PROCESS_NEXT_IMPORT_JOB : Import aşamalarını tetikler.

NotificationEventBus.ts (Kullanıcı Bildirimleri)
    │   Sorumluluk: İşlem sonuçlarını (Başarı/Hata) UI üzerinden kullanıcıya iletir.
    │
    └── NOTIFICATION_EVENTS.SEND_CLIENT_NOTIFICATION : Socket üzerinden push atar.


2. EVENT AKIŞ ŞEMASI VE TETİKLEYİCİLER (Trigger Points)
-------------------------------------------------------

A. IMPORT (Ürün Çekme) TETİKLERİ
   1. API (integration-service.ts)  -> requestFetchProducts() bittiğinde:
      >> EMIT: PROCESS_NEXT_IMPORT_JOB (Orchestrator'ı uyandırır)

   2. WORKER (Stager.ts)            -> Ham veri çekme (Fetching) bittiğinde:
      >> EMIT: PROCESS_NEXT_IMPORT_JOB (Importer'ı anında başlatır)

   3. ORCHESTRATOR (ImportOrch.)    -> İşlem TAMAMLANDI veya HATA aldığında:
      >> EMIT: SEND_CLIENT_NOTIFICATION (Kullanıcıya "İşlem bitti" push'u atar)


B. EXPORT (Ürün Gönderimi) TETİKLERİ
   1. SERVICE (integration-service.ts) -> batchCreator() vagonları oluşturunca:
      >> EMIT: PROCESS_NEXT_SIGNAL (Export döngüsünü tetikler)

   2. WORKER (Validator/Publisher/etc) -> Kendi işini (Vagonu) bitirdiğinde:
      >> EMIT: PROCESS_NEXT_SIGNAL (Sıradaki vagonun önünü açar)

   3. ORCHESTRATOR (ExportOrch.)       -> 'isLast' mühürlü vagon bittiğinde:
      >> EMIT: SEND_CLIENT_NOTIFICATION (Kullanıcıya "Aktarım sonuçlandı" der)


3. NEDEN BU YAPIYI KULLANIYORUZ?
--------------------------------
    - Düşük Latency: "Aman 5 saniye dolsun da bakayım" mantığı biter, 
                    milisaniyeler içinde işleme başlanır.
    - Kaynak Tasarrufu: İş yokken Orchestrator'lar 'Wait' modunda bekler, 
                       DB'ye boş sorgu atmazlar.
    - UI Canlılığı: Kullanıcı sayfayı yenilemeden işlemin bittiğini görür.

================================================================================