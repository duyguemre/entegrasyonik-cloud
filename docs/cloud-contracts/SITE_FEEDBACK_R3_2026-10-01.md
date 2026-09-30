# Site review — 3. tur geri bildirim (kullanıcı, 2026-10-01)

Bağlam: site bir **pazarlama/tanıtım sitesidir**; reklam dili, fayda anlatımı, seçkin tasarım. Kararlar: USER_DECISIONS K43–K46.

## SR3-TONE — Dil ve konumlama
1. Otopilot "erken erişim / geliştiriyoruz / geliştirme aşamasında" diye sunulmaz; hazır bir özellik gibi, şimdiki zamanla, kendinden emin reklam diliyle sunulur (K43). Erken erişim formu/e-postası → "Demo talep edin" / "Hemen başlayın".
2. "Örnek görünüm", "Temsilî tasarım; canlı ürün ekranı değildir" gibi etiketler kaldırılır.
3. Teknik terim ve "nasıl yaptığımız" anlatılmaz: "Açık standart: Model Context Protocol" bölümü ve benzeri teknik görsel/açıklamalar kalkar (K44). Yerel uygulama + MCP bölümü fayda diliyle sadeleşir ya da kalkar.
4. Ziyaretçiye "müşteri" denmez; "siz / işletmeniz" (K45). "Her müşteri için ayrı veritabanı" → üst seviye güven mesajı (ör. "Verileriniz yalnızca size ait; izole ve şifreli ortamda korunur"). Tüm sitede tara.
5. YAYIN KAPISI (K43 şartı): canlıya çıkmadan önce her Otopilot vaadinin üründe karşılığı doğrulanır — bu belge dışı süreç; sitede kodla koruma: vaatler tek veri dosyasında (ör. `agent-claims.ts`) toplanır ki kontrol listesi oradan çıkarılsın.

## SR3-HOME — Anasayfa
6. Hero altındaki istatistik/özellik şeridi ("Tek merkez — Tüm satış kanallarınız tek panelde", "Eşzamanlı stok — ...", "14 gün ücretsiz — Kart bilgisi gerekmez", "Kurumsal güvenlik — ...") koyu zeminin aşağıya çok uzamasına neden oluyor → daha kompakt ve zarif bir çözüm (ör. hero içinde tek satır güven şeridi, ya da açık zemine taşınan kompakt kartlar).
7. Bu şeridin ve kayan özellik yazısının (marquee) arkasındaki zemin "sonradan yerleştirilmiş gibi" duruyor → hero ile bütünleşik, doğal geçiş.
8. Anasayfadaki "Entegrasyonik Otopilot" bölümü daha seçkin/premium tasarım.

## SR3-OTOPILOT — Otopilot sayfası
9. Hero metin olarak çok kalabalık → sade: tek güçlü başlık + tek cümle + tek CTA; ayrıntı aşağıya.
10. Paket bilgisi (dahil mi ekstra mı) K46 araştırma sonucuna göre işlenecek — o gelene kadar fiyat vaadi yazma.

## SR3-NAV — Üst bar
11. Kullanıcı üst bardaki sayfa linki kalabalığının sürdüğünü söyledi (S23 gruplamasından önceki önizlemeyi görmüş olabilir). S23 sonrası hâli değerlendir; hâlâ kalabalıksa daha radikal sadeleştir: en fazla 3-4 üst öğe + tek birincil CTA + "Giriş", geri kalan her şey açılır panelde; 1280 px'te nefes alan bir bar.

## SR3-HERO-ANIM — Operasyon merkezi animasyonu (2026-10-01, ek)
12. "Tek merkez, tek stok, tek sipariş akışı" animasyonundaki sabit "6 — Kullanılabilir stok — tek merkezden tüm kanallara" anlamsız. Rakam bir HİKÂYE anlatmalı (sıfır aşırı satış): bir kanaldan sipariş gelir → merkezde stok 6→5 (kısa "rezerve edildi" vurgusu) → diğer kanal rozetleri aynı anda 5'e güncellenir → "Tüm kanallarda eşzamanlı · aşırı satış yok" etiketi. Döngü farklı kanal/ürünle sakin tempoda; reduced-motion'da tek anlamlı son kare. Sabit, anlamsız sayı kalmaz. (S24 anasayfa hero'suna dokunduğu için S24 SONRASI turda yapılır.)
13. Sitedeki hareket (animasyon aç/kapa) toggle'ı seçkin bir tasarım seviyesine çıkarılır: marka diliyle uyumlu, zarif anahtar/segment kontrolü, anlaşılır etiket ve ikon, yumuşak durum geçişi, klavye/erişilebilirlik (aria-pressed/switch rolü, odak halkası), açık/koyu zeminde tutarlı; yeri tutarlı (üst bar veya footer — S25 menü kararıyla uyumlu), tercih kalıcı ve sistem reduced-motion ayarına saygılı. (S26'da.)
