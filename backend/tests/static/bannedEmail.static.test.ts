// Koruma (K85): urun sahibinin isyeri e-posta adresi Entegrasyonik'te YASAKTIR — hicbir dosyada,
// commit yazar/isleyen bilgisinde, dokumanda veya yapilandirmada gecmez.
// Adres burada da duz metin yazilmaz; yalniz kucuk harfli SHA-256 ozeti tutulur.
// Depo kokundeki takip edilen tum metin dosyalarindaki e-posta benzeri dizgiler ozetlenip karsilastirilir.
import { describe, it, expect } from '@jest/globals';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BANNED_SHA256 = new Set(['5e5dea7ed5fcd30f5d03fc3f063ee8bafaada2d8f5b175637d947e5e50bc4dd2']);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TEXT_RE = /\.(ts|tsx|js|cjs|mjs|vue|json|md|txt|yml|yaml|html|css|scss|sh|ps1|env|example|toml|xml|svg|csv)$|(^|\/)[^./]+$/i;
const ROOT = path.resolve(__dirname, '..', '..', '..');
const MAX_BYTES = 5 * 1024 * 1024;

const sha = (s: string) => createHash('sha256').update(s.toLowerCase()).digest('hex');

function trackedFiles(): string[] {
    try {
        return execSync('git ls-files -z', { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
            .split('\0').filter(Boolean);
    } catch {
        return [];
    }
}

describe('yasakli e-posta adresi (K85)', () => {
    it('takip edilen hicbir metin dosyasinda gecmez', () => {
        const files = trackedFiles().filter(f => TEXT_RE.test(f));
        const hits: string[] = [];
        for (const rel of files) {
            const abs = path.join(ROOT, rel);
            let st: fs.Stats;
            try { st = fs.statSync(abs); } catch { continue; }
            if (!st.isFile() || st.size > MAX_BYTES) continue;
            const text = fs.readFileSync(abs, 'utf8');
            for (const m of text.match(EMAIL_RE) ?? []) {
                if (BANNED_SHA256.has(sha(m))) { hits.push(rel); break; }
            }
        }
        expect(hits).toEqual([]);
    });

    // main'deki eski commit'ler yerelde gecmis yeniden yazimiyla temizlenir (K85); burada dalin
    // main'e gore YENI commit'leri denetlenir (yazar, isleyen, mesaj/Co-Authored-By).
    it('dalin yeni commit\'lerinde (yazar/isleyen/mesaj) gecmez', () => {
        let log = '';
        try {
            log = execSync('git log --format=%ae%n%ce%n%B origin/main..HEAD', {
                cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
            });
        } catch { return; }
        const hits = (log.match(EMAIL_RE) ?? []).filter(m => BANNED_SHA256.has(sha(m)));
        expect(hits.length).toBe(0);
    });

    it('git yapilandirmasindaki commit kimligi yasakli adres degildir', () => {
        let email = '';
        try { email = execSync('git config user.email', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return; }
        expect(BANNED_SHA256.has(sha(email))).toBe(false);
    });
});
