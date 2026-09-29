import os from 'os';

/**
 * ADR-0006 Karar 4: pod/instance kimliği için TEK yardımcı.
 * `POD_NAME` env'i varsa onu kullanır; yoksa `hostname:pid` ile ASLA undefined üretmeyen bir kimlik döner.
 * Dispatcher/Sync gibi Mongo lease alan tüm bileşenler bu yardımcıyı kullanmalıdır (dağınık
 * `process.env.POD_NAME || os.hostname()` kopyalarının tek kaynağı).
 */
export function getPodIdentity(): string {
    const podName = process.env.POD_NAME;
    if (podName && podName.trim() !== '') return podName;
    return `${os.hostname()}:${process.pid}`;
}
