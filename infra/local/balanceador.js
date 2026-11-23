const http = require('node:http');
const { lookup } = require('node:dns/promises');
const { randomUUID } = require('node:crypto');

const targets = (process.env.TARGETS || 'http://127.0.0.1:3001,http://127.0.0.1:3002')
    .split(',').map(url => ({
        url: new URL(url), healthy: false,
        agent: new http.Agent({ keepAlive: true, maxSockets: 12, maxFreeSockets: 8 }),
    }));
let cursor = 0;
const log = (nivel, evento, fields) =>
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), nivel, evento, no: 'balanceador', ...fields }));

async function checkTarget(target) {
    if (target.checking) return;
    target.checking = true;
    let healthy = false;
    let address;
    try {
        address = target.address || (await lookup(target.url.hostname, { family: 4 })).address;
        const probe = new URL('/health', target.url);
        probe.hostname = address;
        const response = await fetch(probe, { signal: AbortSignal.timeout(700) });
        healthy = response.status === 200;
        await response.body?.cancel();
    } catch {
        healthy = false;
    } finally {
        if (healthy !== target.healthy) {
            log(healthy ? 'info' : 'warn', 'saude_alvo', { alvo: target.url.host, saudavel: healthy });
        }
        if (!healthy && target.healthy) target.agent.destroy();
        target.healthy = healthy;
        target.address = healthy ? address : undefined;
        target.checking = false;
    }
}

function outgoingHeaders(headers) {
    const copy = { ...headers };
    for (const name of (headers.connection || '').toLowerCase().split(',')) delete copy[name.trim()];
    for (const name of ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te',
        'trailer', 'transfer-encoding', 'upgrade']) delete copy[name];
    return copy;
}

const server = http.createServer((req, res) => {
    const id = req.headers['x-correlation-id'];
    const correlation = typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : randomUUID();
    res.setHeader('X-Correlation-ID', correlation);
    const start = performance.now();
    const healthy = targets.filter(target => target.healthy);
    const target = healthy[(cursor++ % healthy.length)];
    res.on('finish', () => log(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http', {
        correlation_id: correlation, metodo: req.method, status: res.statusCode,
        alvo: target?.url.host, duracao_ms: Math.round(performance.now() - start),
    }));

    function unavailable() {
        if (res.writableEnded || res.destroyed) return;
        if (res.headersSent) return res.destroy();
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ erro: 'Serviço temporariamente indisponível.' }));
    }
    if (!target) return unavailable();
    const forward = http.request({
        hostname: target.address, port: target.url.port || 80,
        path: req.url, method: req.method,
        headers: { ...outgoingHeaders(req.headers), 'x-correlation-id': correlation, host: target.url.host },
        agent: target.agent,
    }, upstream => {
        res.writeHead(upstream.statusCode, outgoingHeaders(upstream.headers));
        upstream.on('error', () => res.destroy());
        upstream.pipe(res);
    });
    const deadline = setTimeout(() => forward.destroy(Object.assign(new Error('Prazo excedido.'), {
        code: 'ETIMEDOUT',
    })), 3500);
    forward.on('error', error => {
        if (res.writableEnded || res.destroyed) return;
        log('warn', 'falha_encaminhamento', { correlation_id: correlation, alvo: target.url.host, codigo: error.code });
        unavailable();
    });
    res.on('close', () => {
        clearTimeout(deadline);
        if (!res.writableFinished) forward.destroy();
    });
    req.pipe(forward);
});

server.listen(Number(process.env.PORT || 8080), process.env.BIND_HOST || '0.0.0.0');
const checkTargets = () => targets.forEach(checkTarget);
checkTargets();
setInterval(checkTargets, 1000);
