---
name: integration-engine-standards
description: Entegrasyonik projesinde bir pazaryeri/kargo/e-fatura/ERP entegrasyon servisi geliştirirken veya denetlerken kullan — zero-oversell, kuyruk, circuit breaker, webhook, cache, container mimarisi kararları için. entegrasyonik-backend-builder ve entegrasyonik-auditor subagent'ları için birincil referanstır.
---

# Entegrasyon Motoru Standartları — Uygulama Detayları (Entegrasyonik)

## Zero-Oversell Mekanizması (somut, opsiyonel değil)

- **Rezervasyon modeli:** Bir sipariş oluşurken stok, atomic decrement (`findOneAndUpdate` + koşullu güncelleme) veya optimistic lock (versiyon numarası) ile düşürülür — asla "önce oku, sonra yaz" (read-then-write) yapılmaz, bu race condition'a açık kapı bırakır.
- **Çakışma çözümü:** Birden fazla kanaldan aynı anda gelen talep varsa, hangi kanalın önceliği olduğu bir kural olarak tanımlanır (örn. "ilk gelen kazanır" + idempotency key ile tekrar işlenmeyi engelleme).
- **Telafi akışı:** Oversell gerçekleşirse (nadir de olsa): otomatik iptal + müşteriye bildirim + varsa alternatif ürün önerisi tetiklenir. Bu akış test edilmeden zero-oversell "tamamlandı" sayılmaz.

## Kuyruk Mimarisi Eşiği (nasıl belirlenir)

1. Önce Redis Streams ile başla (mevcut Redis stack'te zaten var, ek servis maliyeti yok).
2. Faz 1/2'de gerçek ölçüm yap: kuyruk gecikmesi, mesaj throughput'u, retry hacmi.
3. Kafka/RabbitMQ'ya geçiş kararı SADECE somut bir sayısal eşik aşıldığında düşünülür — örnek eşikler (gerçek ölçüme göre kalibre et): kuyruk gecikmesi sürekli >30 saniye, throughput dakikada >500 mesaj, tek Redis instance CPU/bellek kullanımı sürekli >%70.
4. Bu eşik ADR'de yazılı olmadan "ileride Kafka'ya geçeriz" gibi belirsiz bir not YETERLİ DEĞİLDİR.
5. **Geçiş gerçekten tetiklenirse:** cutover stratejisi (tek seferlik kesim, bakım penceresinde) varsayılan yaklaşımdır. Veri kaybı riski yüksek görünüyorsa (örn. kuyrukta iş kaybı kabul edilemezse), ADR'de dual-write pilot stratejisi (`.claude/skills/adr-writing/SKILL.md`'deki ilgili bölüme bak) bir alternatif olarak değerlendirilir — ama bu ek operasyon karmaşıklığı getirdiği için varsayılan değildir, sadece somut bir veri kaybı riski varsa seçilir.

## Circuit Breaker & Retry

- Exponential backoff: ilk retry 1sn, sonra 2sn, 4sn, 8sn (üst sınır ~30sn).
- 5 ardışık başarısızlıktan sonra circuit "açık" duruma geçer — o servise istek gönderilmez, yerine cache'lenmiş son bilinen durum veya net bir "servis geçici olarak kullanılamıyor" mesajı döner.
- Circuit "yarı açık" durumda tek bir test isteğiyle servisin düzelip düzelmediği kontrol edilir.

## Webhook vs Polling

- Pazaryeri webhook destekliyorsa ZORUNLU tercih odur.
- Desteklemiyorsa: en düşük kabul edilebilir frekansta polling (örn. 5 dakika, ürün/sipariş kritikliğine göre) — ve bu tercih ADR'de gerekçelendirilir.

## Container-Native Yaklaşım

- Her entegrasyon servisi kendi Dockerfile'ına sahip, bağımsız build/deploy edilebilir.
- Yerel geliştirme: tek bir `docker-compose.yml` ile servisler + Redis ayağa kalkar. **MongoDB docker-compose'a DAHİL EDİLMEZ** — kullanıcının makinesinde zaten kurulu olan local MongoDB kullanılır (bağlantı: `backend/.env` → `LOCAL_DB_URL`). Atlas'tan alınan güncel yedekler bu local instance'a önceden `mongorestore` ile aktarılmıştır. Docker'da ayrı bir Mongo container/instance açma girişiminde bulunma.
- Health endpoint: `/health` (servis canlı mı), Readiness endpoint: `/ready` (bağımlılıklara — local Mongo, cache — bağlanabiliyor mu).
- Kubernetes/tam orkestrasyon bu ölçekte YOK — ADR'de somut bir tenant/trafik eşiği tanımlanmadan bu yöne geçilmez.
