# DS-v2 Aşama 4 — ikinci bağımsız premium tur, tur 1

Kaynak: `a3-final/` görselleri + W1/W2 inceleme görselleri (c12, c22, c24, c25) + kod okuması, ardından
`e2e/specs/a4-review.spec.ts` (A4_REVIEW=1) ile 1440 / 800 / 390 yeniden çekim. Ölçüt: kullanıcı brifi (`docs/design-reference/README.md`)
ve "hiçbir ekran eskiden kalma ya da diğerlerinden farklı dilde görünmez". Önceki turların (a3-critique-1..3) kaçırdıklarına odak:
mobil yoğunluk, tipografi tutarlılığı, ızgara/hizalama, durum dili. **D** = düzeltildi · **A** = açık (gerekçeli).

## Sistemik bulgular (birden çok ekran)

| # | Ekran(lar) | Kusur | Düzeltme | Durum |
|---|---|---|---|---|
| A4-1 | TÜM listeler (390) — Siparişler, İadeler, Müşteriler, Faturalar, Mesajlar, Ürünler, Bildirimler, İşlem kayıtları, Finans, Denetim, yönetim listeleri | Masaüstü tablo 390px'te yalnız 2 kolon + yapışık eylem kolonu gösteriyordu: durum, tutar, müşteri görünmüyordu; Mesajlar'da **mesaj metni ve yeni bekleme rozeti hiç görünmüyordu** (W2 "dar ekranda görünür" hedefi karşılanmıyordu) | `EkDataGrid` dar kap (< 600px, container query) **kart düzeni**: ☐ · kimlik başlığı · eylemler üstte; altında ETİKET–değer satırları; başlık satırı **sıralama çubuğuna** iner (sıralanabilir kolonlar + tümünü seç). Tablo anlamı açık ARIA rolleriyle korunur. Kolon `label` kart etiketi olur (`hideLabel` → etiketsiz) | D |
| A4-2 | Giriş, kayıt, şifre sıfırlama, abonelik, hesap güvenliği, veri ve gizlilik, ayar şablonu kaydet çubuğu, mesaj ayrıntısı… (ham `v-btn` kullanan her yer) | Kök yazı 14px; Vuetify düğme boyutunu rem ile verdiği için ham `v-btn` metni **12.25px** (small 10.5px, x-small 8.75px) çiziliyordu — `EkButton` 13px yarı kalın. Aynı ekranda iki farklı düğme dili ("Giriş", "Bu Plana Geç", "Parolayı değiştir" küçük ve silik) | `vuetify-overrides.css`: boyut → tipografi rolü (default/large = `label`, small = `caption`, x-small = `micro`), yarı kalın; ikon düğmeleri hariç | D |
| A4-3 | Stok politikası, Hesabım ve güvenlik, Veri ve gizlilik (ayar şablonu), Abonelik | Üç farklı sol kenar: listeler/pano x=272, abonelik x=318 (1100px ortalı), ayar ekranları x=364 (960px ortalı); ayar ekranlarında bölüm yolu (breadcrumb) yok | `EkSettingsTemplate` ve abonelik içeriği sayfa ızgarasına **sola hizalı** (okuma genişliği korunur); şablona `section` → bölüm yolu (Katalog / Hesap) | D |
| A4-4 | Finans (İşlemler sekmesi özet şeridi) | KPI değerleri renkli: satış yeşil, net hakediş **aksiyon mavisi** — pano KPI'ları nötr; mavi "aksiyon", yeşil "başarı" anlamı taşır, tutar vurgusu değildir | Özet şeridi değerleri nötr (işaretli +/− tutarlar tabloda renk anlamını korur) | D |
| A4-5 | Yönetim: destek, mağazalar, mağaza ayrıntısı, sistem; İşlem kayıtları silme; Seçenek/Etiket silme; Finans ayrıntısı; Ideasoft | Diyalog düğmeleri ve rozetler **BÜYÜK HARF** ("SİL", "İPTAL", "KAPAT", "MAĞAZA OLUŞTUR", "AKTİF", "YETKİLİ", "ÇALIŞIYOR", "BULLMQ", "INTERNAL") — DS'de yalnız mikro etiket büyük harf | Cümle düzeni ("Sil", "İptal", "Kapat", "Mağaza oluştur", "Aktif", "Yetkili", "Çalışıyor", "Dahili"…); e2e çapaları güncellendi | D |
| A4-6 | Yönetim: destek listesi + sohbet | Durum adı/tonu ekrana gömülü ayrı eşleme: "AÇIK" kırmızı (hata değil), "İŞLEMDE"; mağaza tarafındaki destek listesi "Açık" bilgi tonunda — aynı durum iki dilde | `TicketTypes` tek kaynak (`TICKET_STATUS_LABELS/COLORS`); tür satırındaki CSS büyük harf kaldırıldı | D |
| A4-7 | Liste başlığı (yönetim entegrasyonlar vb.) | Uzun açıklamada arama kutusu alt satıra **sola** düşüyordu; diğer listelerde sağ üstte — iki farklı başlık düzeni | ≥1024px'te başlık bloğu esner (açıklama sarar), arama + eylemler her ekranda sağ üstte | D |
| A4-8 | Ürünler, yönetim destek | Varsayılan sayfa boyutu 10 / 50 — standart 25 (a3 L1) | 25 | D |

## Ekran bazında

| # | Ekran | Kusur | Düzeltme | Durum |
|---|---|---|---|---|
| A4-9 | Sol menü | "Erp" (kısaltma yanlış yazım) | "ERP" | D |
| A4-10 | İşlem kayıtları, Finans (sekmeli sayfalar) | Bölüm yolu yok (diğer tüm sayfalarda var); "İşlem Kayıtları" / "Ürün Gönderim İşlemleri" Başlık Düzeni | Bölüm yolu (Ayarlar / Finans ve raporlar), cümle düzeni | D |
| A4-11 | Bildirimler | Eylem kolonunda görünür "İŞLEMLER" başlığı ve yapışık değil — diğer listelerde eylem kolonu etiketsiz ve sağa yapışık | `hideLabel` + `pin: 'end'` | D |
| A4-12 | Yönetim: sistem | İngilizce terim ("Export/Import operasyonları", "global"); yan yana iki seçici farklı boyut/renkte ("Bugün" küçük kalın mavi, mağaza seçici normal); "Sistem Durum Özeti" Başlık Düzeni | "Gönderim / Çekim işlemleri" (İşlem kayıtlarıyla aynı terim), "tüm mağazalar"; seçici değer override'ı kaldırıldı (DS alan tipografisi); cümle düzeni | D |
| A4-13 | Mesaj ayrıntısı (yan panel) | Kanal ham kodla BÜYÜK HARF ("TRENDYOL") — listede "● Trendyol"; bağlam kartında 36px gri ikon (ikon/yazı oranı dışı) | `EkChannelDot` (listeyle aynı); `EkIconTile` kapsülü | D |
| A4-14 | Şifre sıfırlama, şifremi unuttum, kayıt | "Parolamı Güncelle", "Şifremi Sıfırla", "Kayıt Ol", "Yeni Parola" Başlık Düzeni | cümle düzeni | D |
| A4-15 | Giriş / sıfırlama | "Şifre" (giriş) ↔ "Parola" (sıfırlama, hesap güvenliği) terim karışıklığı | — | A — ürün metni; tek terim seçimi ürün sahibinin (T3-5 ile aynı metin turu) |
| A4-16 | Pazaryeri kapsam ayrıntıları | Kullanıcıya dönük notlarda teknik ifade ("V1-V2 ortak uç", "size<=50") | — | A — metin backend manifestosundan birebir geliyor (fixture = manifesto); FE uydurmaz |
| A4-17 | Hızlı başlangıç rehberi, sekme adları ("Api Bilgileri") | Başlık Düzeni metinler | — | A — T3-5 (i18n metin turu) |
