// ADR-0006: gerçek dış ağa İSTEK YOK. Bu yardımcı, 127.0.0.1 üzerinde geçici bir HTTP sunucusu açar;
// ResilientHttpClient / adaptör sözleşme testleri bunu "mockserver" olarak kullanır (nock yerine, ek
// bağımlılık gerekmeden). Sunucu her testten sonra kapatılmalıdır (`server.close()`).
import http from 'http';
import type { AddressInfo } from 'net';

export type LocalHandler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

export interface LocalServerHandle {
    baseUrl: string;
    server: http.Server;
    close(): Promise<void>;
    /** Sunucuya gelen istek sayısı (test assertion'ları için). */
    requestCount(): number;
}

/** Sabit bir davranış: her istekte `handler` çağrılır. */
export function startLocalServer(handler: LocalHandler): Promise<LocalServerHandle> {
    let count = 0;
    const server = http.createServer((req, res) => {
        count++;
        handler(req, res);
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo;
            resolve({
                baseUrl: `http://127.0.0.1:${port}`,
                server,
                requestCount: () => count,
                close: () => new Promise<void>((res) => server.close(() => res())),
            });
        });
    });
}

/** Sırayla verilen yanıtları döner (dizide kalan son yanıtı tekrar eder). */
export function sequencedHandler(steps: Array<(req: http.IncomingMessage, res: http.ServerResponse) => void>): LocalHandler {
    let i = 0;
    return (req, res) => {
        const step = steps[Math.min(i, steps.length - 1)];
        i++;
        step(req, res);
    };
}

export function jsonResponder(status: number, body: any, headers?: Record<string, string>) {
    return (_req: http.IncomingMessage, res: http.ServerResponse) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify(body));
    };
}

export function delayedResponder(delayMs: number, status: number, body: any) {
    return (_req: http.IncomingMessage, res: http.ServerResponse) => {
        setTimeout(() => {
            try {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(body));
            } catch { /* istemci zaten iptal etmiş olabilir */ }
        }, delayMs);
    };
}
