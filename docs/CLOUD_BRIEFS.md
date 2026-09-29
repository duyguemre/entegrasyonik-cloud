# Bulut önyüz iş akışı ve görev şablonları

Bulut kredisiyle (claude.ai/code) **yalnızca önyüz** işleri yapılır: tanıtım sitesi (`site/`) ve web uygulaması (`frontend/`).
Bulut deposu `github.com/duyguemre/entegrasyonik-cloud` (private), yerel deponun **geçmişsiz** önyüz kopyasıdır —
yerel git geçmişi eski sırlar içerdiği için ASLA gönderilmez. Kurallar: `CLAUDE.md` kural 7.

## Akış

| Adım | Kim | Ne |
|---|---|---|
| 1 | Yerel | `scripts/cloud-sync.sh push` — `faz3-arayuz`'un güncel görüntüsü bulut `main`'ine (sır taraması geçmezse push iptal) |
| 2 | Kullanıcı | claude.ai/code → `entegrasyonik-cloud` → yeni oturum → aşağıdaki şablonlardan birini yapıştır |
| 3 | Bulut | İşi `cloud/<kısa-ad>` dalında yapar, küçük adımlarla commit + push |
| 4 | Yerel | `scripts/cloud-sync.sh pull cloud/<kısa-ad>` → yerel `cloud/<kısa-ad>` dalı; Windows'ta ekran görüntüsü + vitest + Playwright (görsel tabanlar burada yenilenir) → `faz3-arayuz`'a birleştir |

- **Aynı anda aynı dosya iki yerde değiştirilmez.** Bulut `site/`/`frontend/` üzerinde çalışırken yerelde yalnızca backend/doküman işi.
- Buluttan dönen yalnızca `site/` ve `frontend/` değişiklikleridir (pull filtreler); `*-linux.png` asla gelmez.
- Ortam kurulumu (claude.ai/code → Environment → setup): `bash scripts/cloud-setup.sh`. Ortam değişkenine **sır konmaz**.
- Kredi azalınca yeni büyük iş başlatılmaz; açık dallar çekilir, gerekirse depo arşivlenir. Kod yerelde tam durur.

## Token tasarrufu (her şablona dahil)

- Tek oturum = tek, net kapsamlı iş. "Bir tur daha" yerine yeni oturum + yeni kısa görev.
- Ara adımlarda yalnızca ilgili spec'i ve tek viewport'u çalıştır; tam Playwright + Lighthouse yalnızca sonda bir kez.
- Ekran görüntüsünü yalnızca değişen bölümden al; tam sayfa/3 viewport yalnızca son kontrolde.
- Büyük dosyayı baştan sona okuma; `grep` ile ilgili bölümü bul.

## Şablon A — Tanıtım sitesi bölüm/sayfa turu

```
Görev: site/ içinde <BÖLÜM veya SAYFA> için premium tasarım turu.
Önce CLAUDE.md (kural 7) ve .claude/skills/premium-ui-standards/SKILL.md'yi oku.
Dal: cloud/<kisa-ad> (main'den). Yalnızca site/ değişir.
Kullanıcı geri bildirimi: "<AYNEN YAPIŞTIR>"
Yapılacaklar:
- <somut madde 1>
- <somut madde 2>
Kurallar: uydurma iddia/sayı yok (içerik src/data/* kayıtlarından; tests/claims.test.ts ve tests/llms.test.ts yeşil);
animasyon yalnızca transform/opacity; reduced-motion + "Hareket" anahtarı her şeyi durdurur; kanal renkleri --site-channel-*.
Doğrulama: cd site && npm run build && npx vitest run && npx playwright test <ilgili spec> --project=chromium-desktop --update-snapshots=missing;
sonda bir kez tam: npx playwright test --update-snapshots=missing. *-linux.png commit'leme.
Küçük adımlarla commit + push (mesaj: faz3-3b-cloud-<kisa-ad>: ..., Türkçe ASCII).
Bitince: ne değişti (madde madde), test sonuçları, commit listesi.
```

## Şablon B — Web uygulaması (frontend) ekran grubu

```
Görev: frontend/ içinde <EKRAN GRUBU> görsel yenilemesi (ADR-0015 <AŞAMA>).
Önce CLAUDE.md (kural 7), docs/adr/0015-*.md ve .claude/skills/premium-ui-standards/SKILL.md'yi oku.
Dal: cloud/<kisa-ad>. Yalnızca frontend/ değişir; backend çalıştırılamaz (API çağrıları mock'lu testlerle doğrulanır).
Yapılacaklar:
- <somut madde>
Doğrulama: cd frontend && npm run build && npm test && npm run test:style-ratchet && npm run test:pattern-ratchet
&& npm run test:no-console-ratchet && npm run test:typecheck-ratchet; e2e: npx playwright test <ilgili spec> --update-snapshots=missing.
Küçük adımlarla commit + push. Bitince: ne değişti, test sonuçları, commit listesi.
```

## Şablon C — Önyüz test yazımı / karakterizasyon

```
Görev: <MODÜL/BİLEŞEN> için karakterizasyon/birim testleri (davranış değiştirme yok).
Önce CLAUDE.md (kural 7) ve .claude/skills/characterization-testing/SKILL.md'yi oku.
Dal: cloud/<kisa-ad>. Yalnızca site/ veya frontend/ altındaki test dosyaları eklenir.
Doğrulama: ilgili vitest dosyası + tam npm test bir kez. Bitince: eklenen testler, kapsam, commit listesi.
```
