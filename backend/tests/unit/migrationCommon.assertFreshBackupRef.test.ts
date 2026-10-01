/**
 * ADR-0021 Karar 4 — `--apply` öncesi doğrulanmış-taze-yedek şartı (`_migrationCommon.assertFreshBackupRef`).
 * Dosya sistemi TAMAMEN mock'lu (gerçek `backup/`/`docs/` dizinlerine dokunmaz, DB YOK).
 */
import { describe, it, expect } from '@jest/globals';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertFreshBackupRef, MAX_BACKUP_AGE_HOURS } = require('../../dev-tools/_migrationCommon');

function fakeFs({ backupExists = true, docs = {} }: { backupExists?: boolean; docs?: Record<string, string> } = {}) {
    return {
        existsSync: (_p: string) => backupExists,
        readdirSync: (_dir: string) => Object.keys(docs),
        readFileSync: (p: string) => {
            const name = p.split(/[\\/]/).pop() as string;
            return docs[name];
        },
    };
}

const VERIFICATION_MD = (date: string, sourceDump: string) =>
    `# DB Yedek Doğrulama\n\n**Tarih:** ${date} · **Kaynak dump:** \`${sourceDump}\` · **Hedef:** local\n\n## Sonuç\nOK\n`;

describe('assertFreshBackupRef', () => {
    it('backupRef verilmezse fırlatır', () => {
        expect(() => assertFreshBackupRef(undefined, { fs: fakeFs() })).toThrow(/--backup-ref/);
    });

    it('"backup/" ile başlamayan yol REDDEDİLİR', () => {
        expect(() => assertFreshBackupRef('etc/passwd', { fs: fakeFs() })).toThrow(/backup\//);
    });

    it('yol fs\'te yoksa fırlatır', () => {
        const fs = fakeFs({ backupExists: false });
        expect(() => assertFreshBackupRef('backup/atlas/20260929', { fs })).toThrow(/bulunamadı/);
    });

    it('docs/DB_BACKUP_VERIFICATION*.md hiç yoksa fırlatır', () => {
        const fs = fakeFs({ docs: {} });
        expect(() => assertFreshBackupRef('backup/atlas/20260929', { fs })).toThrow(/doğrulama kaydı bulunamadı/);
    });

    it('eşleşen "Kaynak dump" kaydı yoksa fırlatır', () => {
        const fs = fakeFs({ docs: { 'DB_BACKUP_VERIFICATION.md': VERIFICATION_MD('2026-09-29', 'backup/atlas/BASKA_GUN') } });
        expect(() => assertFreshBackupRef('backup/atlas/20260929', { fs, now: () => new Date('2026-09-29T12:00:00Z') })).toThrow(/eşleşen/);
    });

    it('kayıt taze (≤24 sa) ise OK döner', () => {
        const fs = fakeFs({ docs: { 'DB_BACKUP_VERIFICATION.md': VERIFICATION_MD('2026-09-29', 'backup/atlas/20260929') } });
        const res = assertFreshBackupRef('backup/atlas/20260929', { fs, now: () => new Date('2026-09-29T10:00:00Z') });
        expect(res.ok).toBe(true);
        expect(res.record.date).toBe('2026-09-29');
    });

    it(`kayıt ${MAX_BACKUP_AGE_HOURS} saatten ESKİ ise REDDEDİLİR`, () => {
        const fs = fakeFs({ docs: { 'DB_BACKUP_VERIFICATION.md': VERIFICATION_MD('2026-09-26', 'backup/atlas/20260926') } });
        expect(() => assertFreshBackupRef('backup/atlas/20260926', { fs, now: () => new Date('2026-09-29T12:00:00Z') })).toThrow(/taze değil/);
    });

    it('birden çok kayıt dosyası varsa EN YENİ eşleşeni seçer', () => {
        const fs = fakeFs({
            docs: {
                'DB_BACKUP_VERIFICATION.md': VERIFICATION_MD('2026-09-20', 'backup/atlas/20260929'),
                'DB_BACKUP_VERIFICATION_2.md': VERIFICATION_MD('2026-09-29', 'backup/atlas/20260929'),
            },
        });
        const res = assertFreshBackupRef('backup/atlas/20260929', { fs, now: () => new Date('2026-09-29T12:00:00Z') });
        expect(res.record.date).toBe('2026-09-29');
    });

    it('gerçek docs/DB_BACKUP_VERIFICATION.md dosyasını okuyabilir (gerçek fs, ama 2026-09-26 tarihli — bu görev günü 2026-09-29\'a göre TAZE DEĞİL, reddi bekleniyor)', () => {
        // Gerçek dosya sistemi ama yalnızca OKUMA (backup/ klasörüne DOKUNULMAZ); DB YOK.
        expect(() => assertFreshBackupRef('backup/atlas/20260926', { now: () => new Date('2026-09-29T12:00:00Z') }))
            .toThrow(/taze değil|bulunamadı/);
    });
});
