---
name: quality-gates
description: Entegrasyonik projesinde bir fazın veya bir modülün Definition of Done'ının gerçekten karşılandığını doğrularken kullan — coverage, contract test, güvenlik/lisans taraması, performans testi, E2E ortamı. entegrasyonik-qa-verifier subagent'ı için birincil referanstır.
---

# Test ve Kalite Kapıları — Uygulama Detayları (Entegrasyonik)

## Coverage

- Kritik modüller (ödeme akışı, stok/sipariş senkronizasyonu, auth/RBAC, tenant izolasyonu): satır coverage ≥%70, ayrıca characterization testleriyle davranış kapsaması.
- Diğer modüller: makul bir coverage hedefi yeterli, %100 zorunlu değil (80/20 ilkesi).

## Kademeli Test Sıralaması (Progressive Testing)

Faz 2 DoD'sindeki "her entegrasyon için en az 8 senaryo" hedefi değişmez — ama bu 8 senaryoya ulaşma SIRASI token/zaman verimliliği için önemlidir:

1. **Önce:** happy path (başarılı senaryo) + en kritik 2 hata senaryosu (429 rate-limit, 500/timeout). Bu 3 test yazılır, çalıştırılır ve yeşile dönene kadar diğer senaryolara geçilmez.
2. **Sonra:** kalan senaryolar (≥3 farklı hata kodu, yetkisiz erişim, kısmi başarı) sırayla eklenir.

Bu sıralama bir kısayol değildir — 8 senaryonun tamamı Faz 2 DoD'si için hâlâ zorunludur; sadece riski en yüksek olan 3 senaryoya önce token/zaman ayırıp erken bir sinyal almayı sağlar.

## Contract Test

Her pazaryeri/kargo/ERP entegrasyonu için: Local Mock Server'ın döndürdüğü yanıt şeması, ilgili sistemin GERÇEK/resmi API şemasıyla (dokümantasyondan veya sandbox'tan alınan örnek yanıtlarla) karşılaştırılır. Mock gerçek şemadan sapıyorsa, testler yanlış bir güven duygusu verir — bu kontrol edilmeden entegrasyon "test edildi" sayılmaz.

## Bağımlılık Güvenlik ve Lisans Taraması

- `npm audit` (veya proje diline uygun eşdeğeri) her faz sonunda çalıştırılır, yüksek/kritik seviye açıklar giderilmeden faz kapatılmaz.
- Kullanılan üçüncü parti kütüphanelerin lisansları (özellikle ticari bir SaaS'ta) uyumsuzluk (örn. GPL copyleft) açısından kontrol edilir.

## Performans/Yük Testi

- Beklenen zirve yükün (tahmini abone sayısına göre makul bir çarpan, örn. 5-10 kat) altında temel bir yük testi çalıştırılır — amaç kırılma noktasını bulmak değil, "bu ölçekte makul çalışıyor mu" sorusuna cevap vermek.

## E2E Ortamı

- E2E testler, sandbox'a bağlı, gerçek üretim verisinden izole bir ortamda çalışır (staging benzeri).
- Faz 5'teki 15 müşteri yolculuğu senaryosu bu ortamda, gerçekten uçtan uca (tıklama/komut seviyesinde) çalıştırılır — sadece API çağrısı simülasyonu değil.

## Tenant İzolasyon Doğrulaması

- Kritik modüllerin coverage'ı içinde tenant izolasyonu ayrıca test edilir: en az iki farklı test tenant'ı ile aynı endpoint/servis çağrılır, birinin verisinin diğerine hiçbir koşulda (normal akış, hata akışı, cache, batch işlem) sızmadığı doğrulanır. `DATA_ARCHITECTURE_AUDIT.md`'deki cross-tenant leakage bulguları bu testlerle kapatılmadan ilgili modül "güvenli" sayılmaz.

## Doğrulama Disiplini

Bir faz raporu "X testi geçti" diyorsa, bunu olduğu gibi kabul etme — testi gerçekten çalıştır, sonucu kendi gözünle doğrula. Rapor ile gerçek sonuç uyuşmuyorsa, bunu `MASTER_STATE.md`'ye "DOĞRULANAMADI" olarak net şekilde işaretle.
