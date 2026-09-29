---
name: ai-native-docs-format
description: Entegrasyonik projesindeki dokuz AI-native dokümanı (MASTER_STATE.md, MILESTONES.md, INTEGRATIONS_REGISTRY.md, SAAS_CORE_AUDIT.md, INTEGRATION_ENGINE_STANDARDS.md, PRODUCT_SURFACES.md, DATA_ARCHITECTURE_AUDIT.md, BACKLOG.md, REVIEW.md) güncellerken ve commit atarken kullan. entegrasyonik-scribe subagent'ı için birincil referanstır, ama commit formatı her subagent için bağlayıcıdır.
---

# AI-Native Doküman Formatları (Entegrasyonik)

## Genel Kural

Her dosyanın DAVRANIŞI farklıdır — hangi dosyanın "üzerine yazılan" (mutable state) hangisinin "biriktirilen" (append-only log) olduğunu karıştırma:

| Dosya | Davranış | İçerik |
|---|---|---|
| `MASTER_STATE.md` | Üzerine yaz, güncelle | Şu anki faz, açık sorunlar, sıradaki adım, "karar bekliyor" listesi, "bloke" işaretleri |
| `MILESTONES.md` | Sadece ekle (log) | Faz sonu FAZ RAPORU'ları — tarih, faz, sonuçlar, sayılar |
| `REVIEW.md` | Üzerine yaz (tek güncel not) | En son "anlamlı kullanım noktası" bilgisi — asla geçmiş biriktirme |
| `BACKLOG.md` | Ekle + durum güncelle | Her kalem: açıklama, sınıflandırma (critical/planned/nice-to-have), durum (açık/kapalı), kaynak |
| `INTEGRATIONS_REGISTRY.md` | Güncelle | Her entegrasyon: konum, protokol, API durumu, sağlık durumu |
| `SAAS_CORE_AUDIT.md` | Güncelle | Her SaaS modülü: var/kısmen/yok, öncelik |
| `INTEGRATION_ENGINE_STANDARDS.md` | Güncelle | Her yetkinlik: durum, ilgili ADR referansı |
| `PRODUCT_SURFACES.md` | Güncelle | Üç bileşenin konumu/teknolojisi/durumu |
| `DATA_ARCHITECTURE_AUDIT.md` | Güncelle | Şema, indeksleme, izolasyon (cross-tenant leakage bulguları dahil), migration, şifreleme, RPO/RTO bulguları |

## MASTER_STATE.md Şablonu

```markdown
# Durum — <son güncelleme: tarih/saat>

## Şu anki faz
Faz N — <alt görev>

## Tamamlanan (bu fazda)
- ...

## Açık sorunlar / bloke
- [BLOKE] <açıklama> — <kaç deneme yapıldı> — <ne zaman fark edildi>

## Karar bekliyor
- <konu> — <varsayım ne> — <neden onaylanması gerekiyor>

## Sıradaki adım
- ...
```

## REVIEW.md Şablonu (HER ZAMAN üzerine yazılır)

```markdown
# İnceleme Notu — <tarih/saat>

**Az önce tamamlandı:** <ne>
**Nereden bakılır:** <URL / komut / dosya yolu>
**Deneyebileceğin bir şey:** <somut eylem önerisi>
```

## Commit Mesajı Formatı ve Sıklığı

Format: `<faz-etiketi>: <ne değişti, kısa>` — örn. `faz2-trendyol: circuit breaker ve retry eklendi, 8 senaryo testle doğrulandı`

**Ne zaman commit atılır (atomik commit disiplini):** Faz sonunu bekleme. Şu tetikleyicilerin HER birinde ayrı bir commit atılır:
- Bir characterization testi yazılıp yeşile döndüğünde (refactor'dan önce davranış sabitlendiğinde).
- Bir entegrasyon/modül test senaryosu (örn. happy path, 429, timeout) yeşile döndüğünde.
- Bir ekran/akış "anlamlı kullanım noktası" seviyesine ulaştığında.
- Bir ADR kabul edildiğinde ve buna bağlı ilk kod değişikliği yapıldığında.

Bu granülerite, otonom çalışma sırasında bir yerin bozulması durumunda geri almanın (revert/reset) tüm fazı değil, son anlamlı adımı hedeflemesini sağlar — `git log` faz raporlarıyla birlikte okunduğunda ilerlemenin ayrıntılı bir kaydını oluşturur.
