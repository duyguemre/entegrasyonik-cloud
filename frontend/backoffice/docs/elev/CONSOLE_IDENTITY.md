# Konsol kimliği — backoffice'in ruhu

Bu belge backoffice'in **neden** böyle göründüğünü ve davrandığını anlatır; **nasıl** (bileşen, sınıf, kayıt) için
`../BO_UI_PATTERNS.md`. İkisi birlikte bağlayıcıdır: çelişki olursa önce bu belgenin ilkesi, sonra desen belgesi güncellenir.
Kaynak kararlar: K10 (ayrı yönetim uygulaması), K11 (ortak paket), K18 (premium, yüksek UX), K48 (BO-ELEV özerkliği).

## Kim için, hangi anda

Kullanıcı: platform ekibi — nöbetçi mühendis, destek, finans operasyonu. Tipik an: bir uyarı geldi, telefon ya da dizüstü,
dikkat dağınık, zaman dar. Ekranın işi **"ne bozuk → kim etkileniyor → ne yapmalıyım → yaptığım kayda geçti mi"** zincirini
en az bakışla ve en az tıklamayla kurmak.

Backoffice bir tanıtım sitesi değildir. Kimseyi ikna etmeye çalışmaz; **güven verir**.

## Yedi ilke

1. **Önce karar, sonra veri.** Her ekranın ilk satırı bir hüküm verir ("Tüm sistemler çalışıyor" / "2 konu dikkat istiyor")
   ve hükmün her maddesi bir sonraki adıma bağlanır. Bağlantısız uyarı, yarım uyarıdır.
2. **Renk yalnız durum taşır.** Kırmızı = şimdi müdahale, sarı = izlenmeli, yeşil = doğrulanmış iyi, mavi = bilgi, gri = nötr/kimlik.
   Hata kodu, kuyruk adı, kanal, plan gibi **kimlikler** renkli rozet olmaz; mono, nötr etiket olur. Bir ekranda kırmızı
   azsa kırmızı görülür.
3. **Yoğunluk saygıdır.** Operasyon listeleri sıkıdır (36 px satır), sayılar sağa hizalı ve tabular, zamanlar göreli + ipucunda
   mutlak. Boşluk süs için değil gruplamak için kullanılır. Büyük puntolu tek metrik yalnız gerçekten tek sayı olan yerde.
4. **Klavye birinci sınıf.** Her ekrana `g` + harf ile, her kayda palet ile gidilir; `?` tüm kısayolları gösterir.
   Fare kullanan da kaybetmez, klavye kullanan hiç fareye uzanmaz.
5. **Tehlike görünür ve yavaştır.** Yıkıcı eylem güvenli eylemin yanında aynı ağırlıkta durmaz. Onay diyaloğu dört soruyu
   (ne olacak, geri alınır mı, kim etkilenir, kimlik doğrulandı mı) ve **hangi ortamda** olunduğunu söyler; gerekçe denetime gider.
6. **Her şey izlenebilir.** Bir kimlik (müşteri, istek, iş) gördüğün her yerde kopyalanabilir ve ilgili iz ekranına
   (log, denetim, bildirim geçmişi) tek tıkla bağlıdır. "Kim, ne zaman, neden" sorusunun cevabı iki tıklamadan uzak değildir.
7. **Bozulma dürüsttür.** Okunamayan bölüm "okunamadı" der, eski veri "eski" olduğunu söyler, sahte/taslak veri etiketlidir.
   Yeşil tik yalnızca doğrulanmış iyiliği anlatır.

## Yap / yapma

| Yap | Yapma |
|---|---|
| Durum şeridinde her maddeyi hedef ekrana bağla ("Hata oranı %1,7 → Loglar") | "Dikkat gerektiren durum var" yazıp bırakma |
| Hata kodunu `.bo-code-tag` (mono, nötr kenarlık) + gerekiyorsa tek ton noktası | Her hata koduna ayrı renkli rozet |
| Satır eylemini sakin tut: ikincil düğme; yıkıcı eylem ayraçla ayrık, ikon + aria-label | Her satıra tam renkli birincil düğme, sil ikonunu yeniden dene'ye yapıştırma |
| Kimlik → kopyala + iz bağlantısı (müşteri: loglar, denetim, bildirimler, abonelik) | Kimliği düz metin bırakma |
| Sayıyı birimiyle, tabular ve sağa hizalı yaz; eşik aşımında rozet metniyle söyle | Rengi tek anlam taşıyıcı yapma |
| Metni "<ne oldu> — <ne yapılmalı>" kalıbında yaz | Ham istisna, enum (`MARKETPLACE`) ya da stack izi gösterme |
| Hareketi 150–300 ms, yalnız opaklık/renk; reduced-motion'da kapat | Sıçrama, kayma, sayaç animasyonu, konfeti, parlama |
| Ortamı her tehlikeli anda göster (ÜRETİM kırmızı, Staging sarı) | Ortamı yalnız üst barda bırakma |
| Mobilde önce hüküm ve sayılar (2 sütun KPI), sonra listeler | Masaüstü kartlarını alt alta dizip 4.000 px'lik sayfa üretme |
| Boş durumda nedenini ve sonraki adımı söyle | "Veri yok" deyip bırakma |

## Ton ve dil

- "Siz" dili, kısa cümle, etken çatı. Etiket isim ("Bekleyen iş"), açıklama tek cümle.
- Ünlem yok, övgü yok, satış yok ("harika", "güçlü", "kolayca" kullanılmaz).
- Teknik terim gerekiyorsa parantezle açıklanır: "DLQ (elle inceleme bekleyen işler)".
- Sayılar Türkçe biçimde (`1.284`, `%1,7`), zaman göreli ("3 dk önce") + ipucunda mutlak.

## Kontrol listesi (yeni ekran ya da değişiklik)

- [ ] İlk satır bir hüküm mü, ve hüküm bağlantılı mı?
- [ ] Renkli her öğe bir durum mu? Kimlikler nötr mü?
- [ ] Operasyon listesi sıkı yoğunlukta mı; sayılar tabular ve sağa hizalı mı?
- [ ] Ekran `g` dizisi / palet ile erişilebilir mi (kayıtta `keywords` + gerekirse `hotkey`)?
- [ ] Tehlikeli eylem `DangerActionDialog`/`GuardedDialog` ile mi; ortam görünüyor mu?
- [ ] Her kimlik kopyalanabilir ve iz ekranına bağlı mı?
- [ ] Dört durum (yükleniyor, boş, hata, kısmi bozulma) çizildi mi; bayat veri belli mi?
- [ ] Açık/koyu × 1440/390'da axe 0 ihlal mi?
