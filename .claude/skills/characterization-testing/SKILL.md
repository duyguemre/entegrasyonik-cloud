---
name: characterization-testing
description: Entegrasyonik projesinde mevcut bir modül refactor edilmeden veya değiştirilmeden ÖNCE, mevcut davranışını sabitleyen testler yazarken kullan. entegrasyonik-test-writer subagent'ı için birincil referanstır. Hiçbir modül bu testler yazılıp yeşil olmadan değiştirilemez.
---

# Characterization Test Yöntemi (Entegrasyonik)

## Amaç

Mevcut kodda muhtemelen hiçbir dokümanda yazmayan "gizli" iş kuralları var. Bu testlerin amacı, kodu "doğru" olduğu için değil, "şu an gerçekten böyle davrandığı" için sabitlemek — sonra yapılacak refactor'ün bu davranışı yanlışlıkla değiştirmediğini garanti etmek.

## Yöntem

1. Hedef modülü/fonksiyonu oku. Kodu DEĞİŞTİRME.
2. Farklı girdi kombinasyonlarıyla (normal senaryolar + sınır değerler + hata durumları) gerçek çıktıyı gözlemle (çalıştırarak veya statik analizle).
3. Gözlemlediğin her davranışı bir test olarak yaz — "böyle olmalı" diye düşündüğün için değil, "şu an böyle davranıyor" olduğu için.
4. **Özellikle şunlara dikkat et — bunlar genelde gizli iş kuralı adaylarıdır:**
   - Beklenmedik özel durum kontrolleri (`if (userId === 'xxx')` gibi spesifik/hardcoded görünen kontroller)
   - Açıklanamayan sayısal sabitler (neden 3, neden 15 dakika, neden %2.5 gibi)
   - Belirli bir sıralamaya bağlı yan etkiler
   - Try/catch içinde sessizce yutulan hatalar (bu bile "davranış"tır, test et)
5. Şüpheli/nedeni belirsiz bir davranış bulursan: testi yine de yaz (davranışı sabitle), AMA testin yanına yorum düş ve `BACKLOG.md`'ye "incelenmesi gereken davranış" olarak ekle. Bunu kendi başına "hata" sayıp DÜZELTME — bu senin kararın değil.

## Kabul Kriteri

- Modülün refactor'den önceki ve sonraki davranışı, bu testler üzerinden bit-bit aynı olmalı (kasıtlı bir değişiklik yoksa).
- Test coverage'ı "kod satırı kapsama" değil "davranış kapsama" hedefler — az ama anlamlı sayıda edge-case testi, çok sayıda yüzeysel testten daha değerlidir.
- Bir modülün characterization testi yoksa, o modül dokunulmaz kabul edilir.
- Her characterization testi yeşile döndüğünde hemen commit at (bkz. `.claude/skills/ai-native-docs-format/SKILL.md` — atomik commit disiplini); bir sonraki teste geçmeden önce bu adımı atlama.
