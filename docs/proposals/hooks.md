# Kapsam ve DB kurallarını hook ile zorlamak (KURULDU — 2026-09-26)

Kurulu dosyalar: `.claude/settings.json` (hook tanımı) ve `.claude/hooks/guard.js` (gerçek betik; aşağıdaki kod ilk öneri taslağıdır, güncel sürüm dosyadadır: tırnak içi metinleri yok sayar, scratchpad ve hafıza klasörüne yazmaya izin verir). 15 birim senaryosu ve canlı bir engelleme testiyle doğrulandı.

`CLAUDE.md` kuralları yalnızca metindir; auto mode'da bir modelin hatası bunları çiğneyebilir. `PreToolUse` hook'u en riskli üç ihlali komut düzeyinde engeller.

## Ne engeller
1. `git add -A`, `git add .`, `git commit -a/-am` ve `.env*` (`.env.example` hariç) ya da `backup/` yollarını `git add` etmek.
2. `mongodump`, `mongorestore`, `mongosh`, `mongo` komutları (izinli DB listesi dışına yanlışlıkla dokunmayı önlemek için insan çalıştırır).
3. Proje kökü (`ENTEGRASYONIK_FACTORY`) dışına `Write`/`Edit` (kök + Claude'un scratchpad'i hariç).

## Sınırlar (dürüst not)
- Node/mongoose betiğiyle DB'ye bağlanmayı yakalayamaz; o yol yine talimat disiplinine bağlıdır.
- Basit regex kontrolüdür; kasıtlı atlatmaya karşı değil, kazara hataya karşıdır.

## `.claude/settings.json`
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard.js\"" }
        ]
      }
    ]
  }
}
```

## `.claude/hooks/guard.js`
```js
// Exit code 2 + stderr = çağrıyı engelle ve mesajı modele göster.
const path = require('path');
let raw = '';
process.stdin.on('data', d => (raw += d));
process.stdin.on('end', () => {
  const { tool_name: tool, tool_input: input = {} } = JSON.parse(raw || '{}');
  const block = msg => { console.error('[guard] ' + msg); process.exit(2); };
  const root = path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd()).toLowerCase();

  if (tool === 'Bash') {
    const cmd = input.command || '';
    if (/\bgit\s+add\s+(-A|--all|\.)(\s|$)/.test(cmd) || /\bgit\s+commit\b[^|;&]*\s-\w*a/.test(cmd))
      block('git add -A / add . / commit -a yasak: dosyaları yol yol ekle (CLAUDE.md kural 6).');
    if (/\bgit\s+add\b/.test(cmd) && /(^|[\s/])\.env(?!\.example)\S*|backup\//.test(cmd))
      block('.env* ve backup/ commit edilemez (CLAUDE.md kural 6).');
    if (/\b(mongodump|mongorestore|mongosh|mongo)\b/.test(cmd))
      block('Mongo CLI araçlarını insan çalıştırır; izinli 7 DB listesi CLAUDE.md kural 2\'dedir.');
  }

  if (tool === 'Write' || tool === 'Edit') {
    const p = path.resolve(input.file_path || '').toLowerCase();
    const scratch = (process.env.CLAUDE_SCRATCHPAD || '\u0000').toLowerCase();
    if (!p.startsWith(root) && !p.startsWith(scratch))
      block('Proje kökü dışına yazma yasak (CLAUDE.md kural 1): ' + input.file_path);
  }
  process.exit(0);
});
```

Not: `CLAUDE_SCRATCHPAD` ortam değişkeni varsayımdır; yoksa scratchpad yazımları da engellenir — o durumda ilgili satıra scratchpad yolunu sabit yaz.
