# N11 — Künye / şirket bilgileri yayın kapısı: kontrol listesi

Durum: **uygulanmadı** — gerçek işletme verisi bekleniyor (ELEV A1, P0). `src/data/company.ts` →
`COMPANY_SAMPLE_VALUES = true`; footer, `/iletisim` künye kartı ve `/yasal/kunye` örnek değer gösteriyor.

## Kullanıcıdan / işletmeden gereken veriler

- [ ] Ticari unvan (tam, tescilli)
- [ ] MERSİS numarası
- [ ] Vergi dairesi ve vergi numarası
- [ ] Ticaret sicil müdürlüğü ve sicil numarası
- [ ] Merkez adresi (açık adres)
- [ ] Telefon (yayınlanacak numara) — yoksa alan gizlenir
- [ ] Kurumsal e-posta (iletişim / KVKK başvuru adresi ayrı mı?)
- [ ] KEP adresi (varsa)
- [ ] Veri sorumlusu bilgisi (KVKK aydınlatma metniyle aynı unvan)

## Uygulama adımları (veri gelince, tek görev)

1. [ ] `company.ts` değerlerini doldur; `COMPANY_SAMPLE_VALUES = false`.
2. [ ] Derleme koruması: `SITE_DRAFT=false` iken `COMPANY_SAMPLE_VALUES === true` ise derleme **dursun**
   (`astro.config.mjs` veya `site-config.ts` fail-fast) — yayına örnek künye çıkamasın.
3. [ ] Test: taslak derlemede örnek değerler görünür + "örnek" işareti; yayın derlemesinde örnek değer yok ya da
   derleme hatası (`legal.test.ts` / yeni `company.test.ts`).
4. [ ] Yasal metinlerdeki yer tutucular (`src/data/legal/placeholders.ts`) aynı kayıttan dolar; `legal.test.ts`
   "ham yer tutucu görünmez" yeşil.
5. [ ] Footer + `/iletisim` + `/yasal/kunye` 1440/390 görüntüleri; JSON-LD `Organization` alanları gerçek değer.
6. [ ] Hukuki inceleme notu: yasal sayfalar hâlâ TASLAK bandıyla; yayın kapısı ADR-0014 Protokol 12.
