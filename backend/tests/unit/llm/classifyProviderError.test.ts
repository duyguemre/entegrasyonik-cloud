/** BR-5: saglayici hata siniflandirici (SAF). Ham govde/mesaj sonuca girmez. */
import { describe, it, expect } from '@jest/globals';
import { classifyProviderError, extractErrorInfo, parseRetryAfter } from '../../../src/platform/llm/classifyProviderError';

const c = (i: Parameters<typeof classifyProviderError>[0]) => classifyProviderError(i);

describe('classifyProviderError', () => {
    it.each([
        ['401', { status: 401 }, 'LLM_KEY_INVALID'],
        ['403 (yetki)', { status: 403, type: 'permission_error' }, 'LLM_KEY_INVALID'],
        ['Google 400 API_KEY_INVALID', { status: 400, code: 'API_KEY_INVALID' }, 'LLM_KEY_INVALID'],
        ['OpenAI invalid_api_key', { status: 401, code: 'invalid_api_key' }, 'LLM_KEY_INVALID'],
        ['OpenAI 429 insufficient_quota = KOTA (hiz siniri degil)', { status: 429, code: 'insufficient_quota', type: 'insufficient_quota' }, 'LLM_QUOTA'],
        ['Anthropic 400 kredi bitti', { status: 400, type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API' }, 'LLM_QUOTA'],
        ['402', { status: 402 }, 'LLM_QUOTA'],
        ['Google 400 FAILED_PRECONDITION billing', { status: 400, type: 'FAILED_PRECONDITION', message: 'Billing is not enabled for this project' }, 'LLM_QUOTA'],
        ['429', { status: 429 }, 'LLM_RATE_LIMITED'],
        ['Google 429 RESOURCE_EXHAUSTED', { status: 429, type: 'RESOURCE_EXHAUSTED' }, 'LLM_RATE_LIMITED'],
        ['404', { status: 404 }, 'LLM_MODEL_UNAVAILABLE'],
        ['OpenAI 403 model_not_found (anahtar degil, model)', { status: 403, code: 'model_not_found' }, 'LLM_MODEL_UNAVAILABLE'],
        ['Anthropic not_found_error', { status: 404, type: 'not_found_error' }, 'LLM_MODEL_UNAVAILABLE'],
        ['500', { status: 500 }, 'LLM_UNAVAILABLE'],
        ['503', { status: 503 }, 'LLM_UNAVAILABLE'],
        ['Anthropic 529 overloaded', { status: 529, type: 'overloaded_error' }, 'LLM_UNAVAILABLE'],
        ['408', { status: 408 }, 'LLM_UNAVAILABLE'],
        ['400 gecersiz istek (bizim hata) -> UNAVAILABLE', { status: 400, type: 'invalid_request_error', message: 'messages: bad' }, 'LLM_UNAVAILABLE'],
        ['akis ici overloaded_error (status 0)', { status: 0, type: 'overloaded_error' }, 'LLM_UNAVAILABLE'],
        ['akis ici rate_limit_error (status 0)', { status: 0, type: 'rate_limit_error' }, 'LLM_RATE_LIMITED'],
        ['akis ici authentication_error (status 0)', { status: 0, type: 'authentication_error' }, 'LLM_KEY_INVALID'],
    ])('%s -> %s', (_n, input, code) => { expect(c(input as any).code).toBe(code); });

    it('429: retry-after saniye/tarih -> retryAfterSec (1..3600 sinirli); yoksa undefined', () => {
        expect(c({ status: 429, retryAfter: '17' }).retryAfterSec).toBe(17);
        expect(c({ status: 429, retryAfter: '0' }).retryAfterSec).toBe(1);
        expect(c({ status: 429, retryAfter: '999999' }).retryAfterSec).toBe(3600);
        expect(c({ status: 429 }).retryAfterSec).toBeUndefined();
        expect(c({ status: 429, retryAfter: 'sacma' }).retryAfterSec).toBeUndefined();
        expect(parseRetryAfter(new Date(1_000_000 + 30_000).toUTCString(), 1_000_000)).toBeGreaterThanOrEqual(29);
    });

    it('ham mesaj/govde hata nesnesine SIZMAZ', () => {
        const e = c({ status: 401, message: 'Incorrect API key provided: sk-live-SECRET123' });
        expect(e.message).toBe('LLM_KEY_INVALID');
        expect(JSON.stringify(e)).not.toContain('SECRET');
    });
});

describe('extractErrorInfo', () => {
    it('Anthropic / OpenAI / Google govde bicimleri', () => {
        expect(extractErrorInfo({ type: 'error', error: { type: 'overloaded_error', message: 'x' } })).toMatchObject({ type: 'overloaded_error' });
        expect(extractErrorInfo({ error: { message: 'm', type: 'insufficient_quota', code: 'insufficient_quota' } })).toMatchObject({ code: 'insufficient_quota' });
        expect(extractErrorInfo({ error: { code: 400, status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } })).toMatchObject({ type: 'INVALID_ARGUMENT', code: 'API_KEY_INVALID' });
    });
    it('bozuk govde -> bos', () => {
        expect(extractErrorInfo(null)).toEqual({});
        expect(extractErrorInfo('x')).toEqual({});
        expect(extractErrorInfo({ error: 'str' })).toEqual({});
    });
});
