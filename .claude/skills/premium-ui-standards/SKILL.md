---
name: premium-ui-standards
description: Entegrasyonik projesinde herhangi bir ekran/bileşen tasarlarken veya değiştirirken kullan — tanıtım sitesi, web uygulaması, admin paneli, yerel uygulama arayüzü dahil. entegrasyonik-frontend-builder subagent'ı için birincil referanstır.
---

# Premium/Profesyonel Görsel Dil Standardı (Entegrasyonik)

## Genel İlke

Referans seviye: Stripe Dashboard, Linear. Kurumsal, sade, güvenilir. **Kesinlikle YASAK:** zıplayan/sekmeli geçişler, confetti, elastic/bounce easing, oyunlaştırılmış rozet/coin animasyonları, aşırı renkli gradient'ler, "eğlenceli" maskotlar. Bu bir tüketici oyunu değil, banka seviyesinde ciddiyet bekleyen bir B2B SaaS.

Not: Bu standart müşteri/admin yüzeylerini (tanıtım sitesi, web app, admin panel, yerel uygulama) kapsar. `mockserver` gibi salt geliştirici-araçlarında (Local Mock Server arayüzleri) bu kadar sıkı bir kısıtlama gerekmez; oradaki görsel tercihler (örn. dark mode) geliştiriciye bırakılır ve bu skill'in kapsamı dışındadır.

## Design Token Kuralları

- Renk, spacing, tipografi, radius, elevation, motion — HİÇBİRİ hardcode edilmez, hepsi merkezi token kaynağından gelir.
- Motion token'ları: süre 150–300ms arası, easing `ease-in-out` veya `ease-out`. `cubic-bezier` ile bounce/elastic efekt YASAK.
- Dark mode her token için tanımlı olmalı, sonradan eklenen bir "tema" değil.

## Somut Kalite Eşikleri

- **Erişilebilirlik:** WCAG 2.1 AA. Kontrast oranı, klavye navigasyonu, ARIA etiketleri, focus göstergeleri zorunlu.
- **Tarayıcı desteği:** Son 2 majör Chrome/Edge/Firefox sürümü + güncel Safari.
- **Performans bütçesi:** Lighthouse performans skoru ≥80, LCP <2.5sn, CLS <0.1.
- **Durum kapsamı (her ekran için ZORUNLU):** boş durum (empty state — ilk kullanım, veri yok), hata durumu (aksiyon alınabilir mesajla, ham API hatası değil), yükleniyor durumu (skeleton/spinner — sıçramayan, sade). Bu üç durum tasarlanmadan bir ekran "tamamlandı" sayılmaz.
- **Responsive kırılım noktaları:** masaüstü (≥1024px), tablet (768–1023px), mobil (<768px) — üçünde de test edilmeli, sadece "sıkışmıyor" değil, kullanılabilir olmalı.

## Hata Mesajı Standardı

Ham hata asla kullanıcıya gösterilmez. Format: "<Ne oldu, sade dille> — <Ne yapılmalı>". Örnek: "Trendyol bu kategori için Kumaş Tipi bilgisini zorunlu kılıyor — lütfen ürün formunda bu alanı doldurun." Her entegrasyonun hata kodu → mesaj eşleme tablosu backend'den gelir, frontend bunu olduğu gibi gösterir, kendi başına yeni metin uydurmaz.

## Mevcut Vue Bileşenlerini İncelerken (Token/Context Verimliliği)

Var olan bir ekranı değiştirmeden önce onu analiz ederken, bileşenin tamamını (script + template + style) satır satır okumak yerine önce `<script setup>` bloğuna bak — state, prop, composable ve store bağlantıları büyük ölçüde davranışı orada ortaya koyar. `<template>`'e sadece DOM yapısı/görsel davranış doğrudan değişikliğin konusuysa in. Bu, büyük bir ekran setini (frontend'de ~30 ekran) tararken gereksiz token tüketimini azaltır.

## Tasarım İnceleme Kontrol Listesi (bir ekranı "bitti" işaretlemeden önce)

- [ ] Tüm renkler/spacing token'dan mı geliyor?
- [ ] Animasyon var mı, varsa 150–300ms/ease-in-out mu?
- [ ] Boş/hata/yükleniyor durumları var mı?
- [ ] WCAG kontrast kontrolü yapıldı mı?
- [ ] Üç form faktöründe test edildi mi?
- [ ] "Lunapark" hissi veren hiçbir öğe yok mu?
