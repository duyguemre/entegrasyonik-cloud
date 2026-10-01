import { describe, it, expect } from '@jest/globals';
import { redactLogObject } from '@platform/core/logger/redact';
import { logger } from '@platform/core/logger/logger';

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstu';

describe('hata günlüğü maskesi (MCP-5)', () => {
    const mask = (s: string) => (redactLogObject({ m: s }) as any).m as string;

    it('bağlantı dizgesi kimlik bilgisi maskelenir, host kalır', () => {
        const out = mask('connect failed mongodb+srv://admin' + ':P%40ss1@cluster0.x.mongodb.net/db');
        expect(out).not.toContain('P%40ss1');
        expect(out).not.toContain('admin');
        expect(out).toContain('cluster0.x.mongodb.net');
        expect(mask('redis://:hunter2@10.0.0.5:6379')).not.toContain('hunter2');
    });
    it('Bearer, JWT, sk-, AKIA, enc:v1, e-posta maskelenir', () => {
        expect(mask('Authorization failed Bearer abc123def456')).not.toContain('abc123def456');
        expect(mask(`bad ${JWT}`)).not.toContain('abcdefghijklmnopqrstu');
        expect(mask('key sk-ant-abcdefghijklmnop1234')).not.toContain('abcdefghijklmnop1234');
        expect(mask('id AKIA' + 'IOSFODNN7EXAMPLE x')).not.toContain('AKIA' + 'IOSFODNN7EXAMPLE');
        expect(mask('val enc:v1:k1:aaa:bbb:ccc')).not.toContain('k1:aaa');
        expect(mask('user a.b@firma.com')).not.toContain('a.b@firma.com');
    });
    it('sıradan hata metni korunur', () => {
        const t = 'Stok güncellenemedi: SKU ABC-123 için 3 deneme sonrası zaman aşımı (https://api.example.com/v1/items)';
        expect(mask(t)).toBe(t);
    });
    it('Error message/stack/cause zinciri logger çıktısında maskelenir', () => {
        const writes: string[] = [];
        const orig = process.stdout.write.bind(process.stdout);
        (process.stdout as any).write = (c: any) => { writes.push(String(c)); return true; };
        try {
            const inner = new Error('db mongodb://u' + ':topsecret@h1:27017/x down');
            const outer: any = new Error('wrapper Bearer zzzzzzzzzz1'); outer.cause = inner;
            logger.child({ module: 'T-MCP5' }).error(outer, 'boom');
        } finally { (process.stdout as any).write = orig; }
        const all = writes.join('');
        expect(all).toContain('boom');
        expect(all).not.toContain('topsecret');
        expect(all).not.toContain('zzzzzzzzzz1');
        expect(all).toContain('h1:27017');
    });
});
