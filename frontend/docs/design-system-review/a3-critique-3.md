# DS-v2 Aşama 3 — premium eleştiri turu 3 (son tur) + brif karşılama tablosu

Tur 2 düzeltmeleri + renk envanteri temizliğinden sonra tüm ekranlar (`screens.ts` 32 ekran + 5 kimliksiz) 1440/390 yeniden çekildi.
**D** = düzeltildi · **A** = açık (gerekçeli).

## Tur 3 bulguları

| # | Ekran | Kusur | Madde | Durum |
|---|---|---|---|---|
| T3-1 | Finans (390) | Sayfa sekmeleri taşıyor, "Ödeme dökümü" kesik, kaydırma ipucu yok | 4 | D — `EkPageTabs` `show-arrows` |
| T3-2 | Tüm listeler (390) | Başlıksız/eylemsiz listelerde "yenile" tek başına bir satır kaplıyor | 6, 10 | D — arama 220px taban; yenile arama ya da birincil eylemle aynı satırda |
| T3-3 | Stok politikası, entegrasyon formları | Alan yardım metni iki satıra düşünce satırlar üst üste biniyor (Vuetify tembel CSS'i `line-height:12px` ile override'ı eziyordu) | 9 | D — özgüllük (`.v-input .v-messages__message`) |
| T3-4 | Etkin yapılandırma | KPI kartları sayfa başlığının ÜSTÜNDE (hiyerarşi ters); KPI tipografisi diğer KPI'lardan farklı | 5, 10 | D (tur 2) — `#summary` + `EkKpiCard` = `EkMetricCard` dili |
| T3-5 | Pazaryeri / E-ticaret formları | Sekme adları kaynakta Başlık Düzeninde ("Api Bilgileri") — CSS büyük harfi kalkınca görünür oldu | 1 | A — i18n metni; ayrı metin turu (ürün sahibi dili onaylamalı) |
| T3-6 | Giriş (390) | Form ile alt bilgi arasında geniş boşluk (alt bilgi ekranın dibine yaslı) | 10 | A — bilinçli: yasal bağlantılar sabit konumda, klavye açılınca kaydırılabilir |
| T3-7 | Admin ekranları (menü) | İkonsuz menü kaydında nokta yedeği | 2 | A — gerçek `MenuService` ağacı ikon taşır |
| T3-8 | Ürünler | Görseli olmayan ürün satırında yer tutucu | 6 | A — mock fixture'da görsel yok; bileşen token'lı |

## Brif maddesi × ekran karşılama tablosu

Sütunlar brif maddeleri: **1** tasarım sistemi/renk · **2** sidebar · **3** üst bar/arama · **4** sekmeler · **5** dashboard/KPI ·
**6** tablo standardı · **7** filtre · **8** menü/diyalog · **9** form · **10** layout/geçiş. ✓ karşılandı · — ekranda yok · ◐ kısmi (not).

Kabuk (2, 3, 4) tüm kimlikli ekranlarda ortaktır: kimlik taşıyan degrade üst bar + akıllı arama (gruplu, klavye), ham anahtarsız sol menü
(etkin/hover net, 2 satıra sarılan etiket), gerçek sekme şeridi. Aşağıda ✓ olarak sayılır.

| Ekran | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Anasayfa (dashboard) | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | ✓ |
| Bildirimler | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | ✓ |
| Siparişler (+ detay, tahsis zaman çizgisi) | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ürünler | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| İadeler | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | ✓ |
| Müşteriler (+ kart, anonimleştirme) | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Faturalar | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Mesajlar | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | ✓ |
| İşlem kayıtları | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | ◐ başlık ritmi (sekmeli sayfa, bölüm yolu yok) |
| Stok sağlığı | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | ✓ |
| Stok politikası | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ |
| Finans (4 sekme) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Abonelik | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | — | ✓ |
| Pazaryeri / E-ticaret / Kargo / E-fatura / ERP | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ (T3-5 metin açık) |
| Entegrasyon sağlığı | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | ✓ |
| Denetim günlüğü | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hesabım ve güvenlik | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ |
| Veri ve gizlilik | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ |
| Yönetim: mağazalar | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Yönetim: destek | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Yönetim: sistem | ✓ | ✓ | ✓ | ✓ | ✓ | — | ◐ satır içi zaman/mağaza seçimi (panel değil — gösterge ekranı) | ✓ | — | ✓ |
| Yönetim: entegrasyonlar / ayarlar / motor / etkin yapılandırma | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Yönetim: entegrasyon uyum | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ satır içi filtre çubuğu (katlanır panel değil) | ✓ | — | ✓ |
| Giriş / kayıt / şifremi unuttum / sıfırlama / doğrulama | ✓ | — | — | ✓ (ekran içi sekme) | — | — | — | — | ✓ | ✓ |

Madde 1 için ölçülebilir kanıt: kaynakta hex/rgb/cubic-bezier literal **0**, eski tema anahtarı çağrı yeri **0**, Material palet adı **0**
(DESIGN_SYSTEM.md §9). Madde 6 için: tüm listeler `EkListScreen`/`EkDataGrid`, sayfa boyutu tek standart, yatay taşma ipucu.
