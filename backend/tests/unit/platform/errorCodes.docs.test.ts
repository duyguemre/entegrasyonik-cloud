/**
 * ADR-0016 §4.3: `docs/ERROR_CODES.md` bu dosyadan (kaynak: `platform/core/errors/codes.ts`) ÜRETİLİR.
 * Güncelleme: `UPDATE_ERROR_CODES=1 npx jest tests/unit/platform/errorCodes.docs.test.ts` (backend/).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { renderErrorCodesMarkdown } from '@platform/core/errors';

const DOC_PATH = path.resolve(__dirname, '../../../../docs/ERROR_CODES.md');

describe('docs/ERROR_CODES.md <- platform/core/errors/codes.ts', () => {
    it('dosya güncel değilse mandal kırılır (UPDATE_ERROR_CODES=1 ile yeniden üretilir)', () => {
        const rendered = renderErrorCodesMarkdown();
        if (process.env.UPDATE_ERROR_CODES === '1') {
            fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
            fs.writeFileSync(DOC_PATH, rendered, 'utf8');
        }
        // Satır sonu bağımsız: Windows'ta core.autocrlf=true dosyayı CRLF ile çıkarır; içerik aynıysa geçer.
        const onDisk = fs.existsSync(DOC_PATH) ? fs.readFileSync(DOC_PATH, 'utf8').replace(/\r\n/g, '\n') : '';
        expect(onDisk).toBe(rendered.replace(/\r\n/g, '\n'));
    });
});
