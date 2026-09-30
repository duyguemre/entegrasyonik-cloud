# Önyüz review — 2. tur geri bildirim (kullanıcı, 2026-09-30)

Kaynak: kullanıcının önizleme (preview/fe-2) incelemesi. Genel çıta: **premium, naif, kullanıcı dostu, uygulama ve site ile tutarlı.** Her madde bir iş paketine (FR2-xx) atanmıştır.

## FR2-SHELL — Kabuk ve genel bileşenler
1. Breadcrumb'daki sayfa adı gösterimi amatör → premium yap.
2. Sol menü: ana grupları leaf'lerden farklı renklendirme (hâlâ yapılıyor) — gerek yok. Menü daha premium ve kaliteli tasarlanmalı.
3. Ürün sayfasında ve yardım merkezinde scroll yapınca ana tablar da yukarı kayıyor → ana tablar sabit kalmalı (sticky; tüm sayfalarda doğrula).
4. Uygulama genelinde textfield/arama: tıklayınca label yukarı kayıyor ama placeholder metni kısa bir an görünüp kayboluyor (flash) → düzelt.
5. Textfield yükseklikleri bir tık daha az olabilir (genel varsayılan).
6. Link stili: "mavi, üstüne gelince altı çizili" 20 sene öncesinde kaldı → modern link/aksiyon stili (genel).
7. Eğitim Merkezi'ni kaldır (yerine Yardım Merkezi var).
8. Ayarlar → Uygulama Ayarları üst seviyeye çekilsin ve ÇALIŞSIN.
9. (Önceden kuyrukta) Kaydet/sil butonları her yerde aynı renk/biçim; yenile butonu sağ üst premium; filtre paneli (başlık çubuğu, arka plan, içerik) premium; ana tablar taşarsa kaydırma yerine sağda "daha fazla" listesi.

## FR2-DARK — Karanlık mod
10. Frontend uygulamasının dark modu olmalı (tema tokenları üzerinden; tüm ekranlarda okunur kontrast).

## FR2-CHANNEL — Kanal kimliği (uygulama)
11. Anasayfa "Katalog ve kanal aktarımı" bölümündeki entegrasyon rozetleri: **border = entegrasyon renginin koyusu, iç background = açığı** biçimi daha güzeldi → bu biçim uygulamada kanal rozetinin kullanıldığı HER yerde standart olsun.
12. Her entegrasyonun **kısa ve uzun formu** (ad/rozet): kısa gereken yerde kısa, uzun gereken yerde uzun; tek kayıt, tüm bölümlerde tutarlı kullanım.
13. Kargoya ver → kargo firması listesi: markaların renkleriyle, entegrasyon rozetleriyle aynı gösterimle.
14. Filtrelerdeki seçim listeleri (kanal, kargo, durum) aynı standartta.

## FR2-SITE-CHANNEL — Kanal kimliği (site)
15. Madde 11'deki rozet biçimi (koyu border + açık iç) sitede de kanal rozetinin kullanıldığı her yerde.

## FR2-HELP — Yardım merkezi ve "sayfa hakkında"
16. "Sayfa hakkında bilgi" bölümünün içeriği: tasarım + içerik + kullanıcı deneyimi olarak premium.
17. Yardım merkezi fikri iyi ama tasarımı geliştirilmeli (link stili dahil, madde 6).

## FR2-PLIST — Ürün listesi
18. Thumbnail'ler çok küçük; resimler hücreye doğru oturmuyor.
19. Hover'da büyük resim açılması güzel, ama açılan önizlemenin altındaki küçük resimler anlamsız (hover'da açıldığı için tıklanamıyor) → daha mantıklı yapı (ör. hover önizleme tek büyük resim + adet göstergesi; galeriye gezinme tıklamayla).
20. Varyantlar açılınca oradaki resimler de aynı şekilde küçük ve oturmuyor.
21. "Platform durumu" kendini anlatamıyor → daha zeki bir gösterim düşün (kanal başına durum: yayında/hatalı/bekliyor/yok, tek bakışta anlaşılır).
22. Platform yükleme (hangi kanala gönderilecek) seçimi daha premium, kullanıcı deneyimi yüksek; liste bölümünün tasarımı özellikle daha güzel.

## FR2-PFORM — Ürün ekleme/düzenleme
23. Kategori ve marka combobox'larında en alttaki "yeni kategori/marka ekle" ÇALIŞMIYOR → düzelt.
24. Varyant listesindeki resimler daha büyük; tablo tasarımı uygulamadaki diğer tablolarla tutarlı.
25. Kanal bazında fiyat ekranı: çok daha premium, kullanıcı deneyimi yüksek; yapısı yeniden ele alınmalı.
26. Inline edit'ler daha kullanıcı dostu ve premium.
27. Ürün resim galerisi: thumbnail'ler küçük, hangi resim anlaşılmıyor → büyüt; "düzenle" modunda SIRA DEĞİŞTİRİLEBİLMELİ; ekranın amacı (neyi değiştiriyoruz, ne yapıyoruz) tasarım ve kullanımla kendini anlatmalı.
28. Galeride sürükle-bırak: sürüklenen öğe mouse'un bulunduğu yerden çok ayrı bir yerde görünüyor → hata, düzelt.
29. Ürün sayfasındaki varyant bölümündeki resimler küçük, anlaşılırlık zayıf → düzelt.

## FR2-ORDERS — Sipariş ve iade
30. Sipariş detayı: daha kullanıcı dostu, naif, premium, site ile uyumlu.
31. Sipariş durumu listesi tasarım olarak geliştirilmeli.
32. İade durumu kısmı ve filtrelerdeki seçim listeleri aynı şekilde.
33. İade detayı: sipariş detayı gibi premium seviyede yeniden tasarlanmalı.

## FR2-SCREENS — Diğer ekranlar (aynı çıta)
34. Müşteri kartı, müşteri listesi ve filtreleri.
35. Faturalar, mesajlar, destek kayıtları.
36. Ayarlar/yetkilendirme.
37. Çıktılar ve işlemler.

## FR2-FIN — Finansal işlemler
38. Finansal işlemler bölümü daha premium, albenili, anlaşılır, kullanıcı deneyimi yüksek.

## FR2-LOADER — Açılış/yükleme ekranı (uygulama + backoffice)
39. Logolu yükleme ekranı güzel ama bir kart içinde duruyor gibi görünüyor; bu kart/yüzey premium ve albenili olmalı — yükleme tasarımı üst seviyeye çıkarılsın. Tek bileşen (ortak pakette EkBrandLoader ve açılış/boot ekranı) iki uygulamada aynı; light+dark; reduced-motion uyumlu; hızlı yüklemede yanıp sönme yok (kısa gecikmeli gösterim).
