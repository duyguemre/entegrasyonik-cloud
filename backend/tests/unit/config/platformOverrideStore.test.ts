// ADR-0020 Karar 3.6 (Aşama B) — bellek-içi "son bilinen yayın" deposu. Saf/senkron; DB/ağ YOK.
import { describe, it, expect, beforeEach } from '@jest/globals';
import {
    setTargetOverride, getKnownVersion, getPublishedOverrideValue, recordPollSuccess, recordPollFailure,
    setSystemWarningSink, getPollDiagnosticsForTests, resetPlatformOverrideStoreForTests,
    setTargetIntake, getIntake, isIntakeOpen, getMaintenance, checkIntakeDurationWarning, getIntakeDiagnosticsForTests,
} from '@integration/config/platformOverrideStore';

beforeEach(() => resetPlatformOverrideStoreForTests());

describe('ADR-0020 Karar 3.6 — platformOverrideStore', () => {
    it('bilinmeyen hedef için sürüm 0, değer undefined döner', () => {
        expect(getKnownVersion('zot-unknown')).toBe(0);
        expect(getPublishedOverrideValue('zot-unknown', 'x')).toBeUndefined();
    });

    it('setTargetOverride sonrası sürüm ve değerler okunabilir', () => {
        setTargetOverride('zot-t1', 3, { 'export.publisher.chunkSize': 40 });
        expect(getKnownVersion('zot-t1')).toBe(3);
        expect(getPublishedOverrideValue('zot-t1', 'export.publisher.chunkSize')).toBe(40);
        expect(getPublishedOverrideValue('zot-t1', 'olmayan.anahtar')).toBeUndefined();
    });

    it('recordPollSuccess ardışık hata sayacını sıfırlar', () => {
        recordPollFailure(); recordPollFailure();
        expect(getPollDiagnosticsForTests().consecutiveFailures).toBe(2);
        recordPollSuccess();
        expect(getPollDiagnosticsForTests().consecutiveFailures).toBe(0);
    });

    it('3. ardışık hatada sistem uyarısı TAM BİR KEZ üretilir (aynı seri sürerken tekrarlanmaz)', () => {
        const warnings: string[] = [];
        setSystemWarningSink((m) => warnings.push(m));
        recordPollFailure(); recordPollFailure();
        expect(warnings).toEqual([]); // henüz 3'e ulaşmadı
        recordPollFailure();
        expect(warnings.length).toBe(1);
        recordPollFailure(); recordPollFailure(); // seri sürüyor -- tekrar uyarmaz
        expect(warnings.length).toBe(1);

        recordPollSuccess();
        recordPollFailure(); recordPollFailure(); recordPollFailure(); // YENİ bir seri -- yeniden uyarır
        expect(warnings.length).toBe(2);
    });

    it('setSystemWarningSink(undefined) varsayılan (logger.error) davranışına döner ve fırlatmaz', () => {
        setSystemWarningSink(undefined);
        recordPollFailure(); recordPollFailure(); recordPollFailure();
        expect(getPollDiagnosticsForTests().consecutiveFailures).toBe(3);
    });

    it('resetPlatformOverrideStoreForTests tüm durumu temizler', () => {
        setTargetOverride('zot-t2', 9, { a: 1 });
        recordPollFailure();
        resetPlatformOverrideStoreForTests();
        expect(getKnownVersion('zot-t2')).toBe(0);
        expect(getPollDiagnosticsForTests()).toEqual({ consecutiveFailures: 0, lastSuccessAt: undefined, lastFailureAt: undefined, targets: [] });
    });
});

describe('ADR-0020 Karar 3.8 (Aşama D) — kill-switch OKUMA yüzeyi (setTargetIntake/getIntake/isIntakeOpen/getMaintenance)', () => {
    it('bilinmeyen hedef -> intake "on" (Heads.intake varsayılanıyla TUTARLI), isIntakeOpen=true, maintenance yok', () => {
        expect(getIntake('zot-intake-unknown')).toBe('on');
        expect(isIntakeOpen('zot-intake-unknown')).toBe(true);
        expect(getMaintenance('zot-intake-unknown')).toBeUndefined();
    });

    it('setTargetIntake sonrası intake/maintenance okunabilir; isIntakeOpen yalnız "on" için true', () => {
        setTargetIntake('zot-intake-a', 'drain', { message: { tr: 'Bakımda', en: 'Maintenance' } });
        expect(getIntake('zot-intake-a')).toBe('drain');
        expect(isIntakeOpen('zot-intake-a')).toBe(false);
        expect(getMaintenance('zot-intake-a')?.message?.tr).toBe('Bakımda');

        setTargetIntake('zot-intake-a', 'off');
        expect(getIntake('zot-intake-a')).toBe('off');
        expect(isIntakeOpen('zot-intake-a')).toBe(false);
        expect(getMaintenance('zot-intake-a')).toBeUndefined(); // yeni çağrı maintenance TAŞIMADI -- eskisi KALMADI

        setTargetIntake('zot-intake-a', 'on');
        expect(isIntakeOpen('zot-intake-a')).toBe(true);
    });

    it('getIntakeDiagnosticsForTests: yalnız bilinen hedefleri ve intake değerlerini döner', () => {
        setTargetIntake('zot-intake-b', 'off');
        const diag = getIntakeDiagnosticsForTests();
        expect(diag.entries).toEqual(expect.arrayContaining([{ target: 'zot-intake-b', intake: 'off' }]));
    });
});

describe('ADR-0020 Karar 3.8 (Aşama D) — checkIntakeDurationWarning (24 saat mandalı)', () => {
    it('"on" iken hiçbir zaman uyarmaz (ve önceki mandalı sıfırlar)', () => {
        const warnings: string[] = [];
        setSystemWarningSink((m) => warnings.push(m));
        const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
        checkIntakeDurationWarning('zot-warn-on', 'on', since);
        expect(warnings).toEqual([]);
    });

    it('24 saatten AZ süredir drain/off ise uyarmaz', () => {
        const warnings: string[] = [];
        setSystemWarningSink((m) => warnings.push(m));
        const since = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 saat önce
        checkIntakeDurationWarning('zot-warn-recent', 'drain', since);
        expect(warnings).toEqual([]);
    });

    it('24 saati AŞMIŞ drain/off için TAM BİR KEZ uyarır (aynı hedefte tekrar tekrar uyarmaz)', () => {
        const warnings: string[] = [];
        setSystemWarningSink((m) => warnings.push(m));
        const since = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 saat önce
        checkIntakeDurationWarning('zot-warn-long', 'drain', since);
        expect(warnings.length).toBe(1);
        expect(warnings[0]).toMatch(/zot-warn-long/);

        checkIntakeDurationWarning('zot-warn-long', 'drain', since); // yine aynı seri -- tekrar UYARMAZ
        expect(warnings.length).toBe(1);
    });

    it('"on"a dönünce mandal sıfırlanır -- sonraki drain serisinde YENİDEN uyarır', () => {
        const warnings: string[] = [];
        setSystemWarningSink((m) => warnings.push(m));
        const longAgo = new Date(Date.now() - 30 * 60 * 60 * 1000);
        checkIntakeDurationWarning('zot-warn-reset', 'off', longAgo);
        expect(warnings.length).toBe(1);

        checkIntakeDurationWarning('zot-warn-reset', 'on', longAgo); // normale döndü -- mandal SIFIRLANDI
        checkIntakeDurationWarning('zot-warn-reset', 'off', longAgo); // YENİ seri -- yeniden uyarır
        expect(warnings.length).toBe(2);
    });

    it('geçersiz/eksik `since` (Date değil) sessizce yok sayılır, fırlatmaz', () => {
        const warnings: string[] = [];
        setSystemWarningSink((m) => warnings.push(m));
        expect(() => checkIntakeDurationWarning('zot-warn-invalid', 'drain', undefined)).not.toThrow();
        expect(warnings).toEqual([]);
    });

    it('resetPlatformOverrideStoreForTests intake durumunu ve 24 saat mandalını da temizler', () => {
        setTargetIntake('zot-intake-reset', 'off');
        const warnings: string[] = [];
        setSystemWarningSink((m) => warnings.push(m));
        checkIntakeDurationWarning('zot-intake-reset', 'off', new Date(Date.now() - 30 * 60 * 60 * 1000));
        expect(warnings.length).toBe(1);

        resetPlatformOverrideStoreForTests();
        expect(getIntake('zot-intake-reset')).toBe('on'); // bilinmeyene DÖNDÜ
        expect(getIntakeDiagnosticsForTests()).toEqual({ entries: [], warned: [] });
    });
});
