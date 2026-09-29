---
name: adr-writing
description: Entegrasyonik projesinde herhangi bir mimari karar (refactor vs. yeniden yazım, kuyruk/cache/ölçekleme eşiği, veri modeli, tenant izolasyonu, repo yapısı vb.) alınırken ve /docs/adr/ altına yazılırken kullan. entegrasyonik-architect subagent'ı için birincil referanstır.
---

# ADR Yazım Standardı (Entegrasyonik)

Her mimari karar `/docs/adr/NNNN-kisa-baslik.md` dosyasına, sıralı numarayla (0001, 0002, ...) yazılır. Format:

```markdown
# NNNN — <Karar Başlığı>

## Durum
Kabul edildi | Ertelendi | Reddedildi (tarih)

## Bağlam
Bu kararı gerektiren durum nedir? Hangi audit bulgusu/keşif bu kararı tetikledi?
(İlgili registry dosyasına referans ver: örn. INTEGRATION_ENGINE_STANDARDS.md#kuyruk-mimarisi)

## Değerlendirilen Alternatifler
En az 2 alternatif, her biri için artı/eksi.

## Karar
Ne seçildi, tek cümlede net ifade.

## Gerekçe
Neden bu seçildi — özellikle Maliyet Bilinci protokolüne (tek haneli abone ölçeği) göre nasıl gerekçelendiği.

## Maliyet/Ölçek Notu
Bu kararın maliyeti nedir (varsa: ek servis, ek bağımlılık, ek operasyon yükü)? Hangi SOMUT SAYISAL eşikte (örn. "kuyruk gecikmesi sürekli 30sn'yi aşarsa", "aktif tenant sayısı 50'yi geçerse") bu karar yeniden değerlendirilmeli?

## Etki Alanı
Bu karardan hangi modüller/servisler etkileniyor?
```

## Refactor vs. Yeniden Yazım Kararı — Özel Kural

Bir modülü "clean-room yeniden yazma" kararı SADECE şu ikisi birlikte sağlanıyorsa verilebilir:
1. Faz 1 audit bulgusu modülün gerçekten çürümüş/yanlış kurulmuş olduğunu somut kanıtla gösteriyor (ör. ölçülebilir performans sorunu, tekrar eden hata oranı, imkansız test edilebilirlik).
2. Modülün characterization testleri YAZILABİLİYOR ve modülün mevcut davranışı bu testlerle belgelenmiş durumda (yeniden yazım bu testlere göre doğrulanacak).

"Daha kolay/hızlı olur" gerekçesi TEK BAŞINA asla yeterli değildir — bu, sıfırdan yeniden yazma riskine (gizli iş kuralı kaybı) geri döner. Şüphedeysen, refactor'ü tercih et.

## Geçiş/Migrasyon Kararlarında Ek Seçenek: Dual-Write Pilotu

Bir alt sistemi (özellikle kuyruk — bkz. `.claude/skills/integration-engine-standards/SKILL.md`) eskiden yeniye taşıma kararı gerçekten tetiklenirse (sayısal eşik aşıldığı için), ADR'nin "Karar" bölümünde tek seferlik kesin kesim (cutover) yerine **dual-write pilot stratejisi** bir alternatif olarak değerlendirilir: eski ve yeni sistem bir süre paralel yazılır, tutarlılık doğrulanır, sonra eski sistem kapatılır. Bu, veri kaybı riskini düşürür ama ek operasyon karmaşıklığı getirir — Maliyet/Ölçek Notu'nda bu ek karmaşıklığın tek haneli/düşük onlarca abone ölçeğinde gerekip gerekmediği açıkça tartışılır; çoğu durumda bu ölçekte basit bir bakım penceresinde tek seferlik kesim yeterli olacaktır, dual-write varsayılan değildir.

## Sık Görülen ADR Konuları (şablonlar)

- Kuyruk mimarisi seçimi (Redis Streams → Kafka/RabbitMQ eşiği, geçiş yapılırsa cutover vs. dual-write)
- Yerel uygulamanın repo konumu (aynı repo paket / ayrı repo)
- Zero-oversell rezervasyon modeli (optimistic lock / atomic decrement)
- Container orkestrasyonu (docker-compose / ileride k8s eşiği)
- Mobil platform stratejisi (PWA / native)
