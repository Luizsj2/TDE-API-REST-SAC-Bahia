import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';
import { createRequire } from 'node:module';

const compose = process.argv.includes('--compose');
const usarBanco = compose || Boolean(process.env.PGHOST);
const caminhoSaida = process.argv.find(arg => arg.startsWith('--saida='))?.slice(8);
const cwd = new URL('..', import.meta.url);
const logs = [];
const processes = [];
const ids = { b: 'api-b', proxy: 'balanceador' };
const unique = randomUUID();
const inicioDaBancada = new Date().toISOString();
const key = compose
    ? readFileSync(new URL('.secrets/api-key', cwd), 'utf8').trim()
    : process.env.API_KEY || randomUUID();
let base = process.env.SAC_API_URL || 'http://127.0.0.1:' + (process.env.SAC_PORT || '18080');
let alvoB;
let iniciarReplicaB;
let alvoParado = false;

function docker(...args) {
    const result = spawnSync('docker', ['compose', ...args], { cwd, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
    return result.stdout;
}

function start(path, env) {
    const child = spawn(process.execPath, [path], {
        cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    processes.push(child);
    for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding('utf8');
        let pending = '';
        stream.on('data', chunk => {
            pending += chunk;
            const lines = pending.split('\n');
            pending = lines.pop();
            for (const line of lines) {
                try { logs.push(JSON.parse(line)); }
                catch { if (line.trim()) console.error(line); }
            }
        });
    }
    return child;
}

async function port() {
    const listener = createServer();
    await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
    const value = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    return value;
}

const origem = { latitude: -12.979, longitude: -38.452 };
const idRastreio = 'bancada-' + unique;
const apiRequest = async (path, options = {}) => {
    const start = performance.now();
    try {
        const response = await fetch(base + path, {
            ...options,
            headers: { 'x-api-key': key, 'content-type': 'application/json', ...options.headers },
            signal: AbortSignal.timeout(4500),
        });
        return {
            status: response.status, node: response.headers.get('x-node-id'),
            correlation: response.headers.get('x-correlation-id'),
            body: await response.json(), ms: performance.now() - start,
        };
    } catch {
        return { status: 0, ms: performance.now() - start };
    }
};
const recomendar = (local = origem) => apiRequest('/recomendacoes', { method: 'POST', body: JSON.stringify(local) });
const fila = () => apiRequest('/postos/feira/fila');

async function until(check, what) {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (await check()) return;
        await wait(300);
    }
    throw new Error('Condição não atingida: ' + what);
}

function metrics(samples) {
    const ok = samples.filter(item => item.status >= 200 && item.status < 300)
        .map(item => item.ms).sort((a, b) => a - b);
    const percentile = p => ok.length ? Math.round(ok[Math.ceil(ok.length * p) - 1] * 10) / 10 : null;
    const nos = {};
    const codigos = {};
    for (const item of samples) {
        if (item.node) nos[item.node] = (nos[item.node] || 0) + 1;
        const codigo = item.status || 'sem_resposta';
        codigos[codigo] = (codigos[codigo] || 0) + 1;
    }
    return {
        total: samples.length, p50_ms: percentile(.5), p95_ms: percentile(.95),
        taxa_falhas_pct: Math.round(1000 * samples.filter(item => item.status === 0 || item.status >= 500).length
            / samples.length) / 10, nos, codigos,
    };
}

function checkIn(protocolo, local = { latitude: -12.9769, longitude: -38.4553 }) {
    return apiRequest('/postos/salvador/chegadas', {
        method: 'POST', headers: { 'idempotency-key': protocolo },
        body: JSON.stringify(local),
    });
}

try {
    if (!compose) {
        const [a, b, gateway] = await Promise.all([port(), port(), port()]);
        const comum = { API_KEY: key, API_KEY_FILE: '', EXPOR_NO: '1', BIND_HOST: '127.0.0.1' };
        start('Servidor_node/server.js', { ...comum, PORT: String(a), NODE_ID: 'api-a' });
        iniciarReplicaB = () => start('Servidor_node/server.js', { ...comum, PORT: String(b), NODE_ID: 'api-b' });
        alvoB = iniciarReplicaB();
        start('infra/local/balanceador.js', {
            TARGETS: 'http://127.0.0.1:' + a + ',http://127.0.0.1:' + b,
            PORT: String(gateway), BIND_HOST: '127.0.0.1',
        });
        base = 'http://127.0.0.1:' + gateway;
    }

    await until(async () => {
        const pair = await Promise.all([fila(), fila()]);
        return pair.every(x => x.status === 200) && new Set(pair.map(x => x.node)).size === 2;
    }, 'duas réplicas e dados disponíveis');

    if (compose) {
        const pagina = await fetch(base, { signal: AbortSignal.timeout(4500) });
        assert.equal(pagina.status, 200);
        const html = await pagina.text();
        assert.match(html, /Planeje sua ida ao SAC/);
        const asset = html.match(/src="([^"]+\.js)"/)?.[1];
        assert.ok(asset, 'A página deve carregar o JavaScript compilado pelo Vite.');
        const bundle = await fetch(new URL(asset, base), { signal: AbortSignal.timeout(4500) });
        assert.equal(bundle.status, 200);
        assert.match(bundle.headers.get('content-type'), /javascript/);
        await bundle.arrayBuffer();

        const catalogo = await apiRequest('/web-api/postos', { headers: { 'x-api-key': '' } });
        assert.equal(catalogo.status, 200);
        assert.ok(catalogo.body.some(posto => posto.id === 'feira' && Number.isInteger(posto.tempo_espera_minutos)));
        const recomendacaoWeb = await apiRequest('/web-api/recomendacoes', {
            method: 'POST', headers: { 'x-api-key': '' }, body: JSON.stringify(origem),
        });
        assert.equal(recomendacaoWeb.status, 200);
        assert.equal(recomendacaoWeb.body.recomendado.id, 'salvador');
        const chegadaSemChave = await apiRequest('/postos/salvador/chegadas', {
            method: 'POST', headers: { 'x-api-key': '' }, body: JSON.stringify(origem),
        });
        assert.equal(chegadaSemChave.status, 401);
    }

    const [salvador, feira, invalida, semChave, fora] = await Promise.all([
        recomendar(), recomendar({ latitude: -12.257, longitude: -38.958 }),
        recomendar({ latitude: 400, longitude: 0 }),
        apiRequest('/postos/feira/fila', { headers: { 'x-api-key': 'incorreta' } }),
        checkIn(unique + '-distante', { latitude: -12.2563, longitude: -38.9586 }),
    ]);
    assert.equal(salvador.status, 200);
    assert.equal(salvador.body.recomendado.id, 'salvador');
    assert.equal(salvador.body.rota.geometria.type, 'LineString');
    assert.ok(salvador.body.rota.geometria.coordinates.length >= 2);
    assert.equal(feira.body.recomendado.id, 'feira');
    assert.equal(invalida.status, 400);
    assert.equal(semChave.status, 401);
    assert.equal(fora.status, 422);

    const anomala = await apiRequest('/postos/inexistente/fila', { headers: { 'x-correlation-id': idRastreio } });
    assert.equal(anomala.status, 404);
    assert.equal(anomala.correlation, idRastreio);

    const baseline = await Promise.all(Array.from({ length: 75 }, () => recomendar()));
    const antes = metrics(baseline);
    assert.equal(antes.codigos['200'], 75);
    assert.equal(Object.keys(antes.nos).length, 2);
    let integridade;
    if (usarBanco) {
        const protocolo = unique + '-concorrente';
        const concorrentes = await Promise.all(Array.from({ length: 75 }, () => checkIn(protocolo)));
        const metricas = metrics(concorrentes);
        assert.equal(metricas.codigos['201'], 1);
        assert.equal(metricas.codigos['200'], 74);
        assert.equal(Object.keys(metricas.nos).length, 2);
        assert.equal(new Set(concorrentes.map(x => x.body.registrado_em)).size, 1);
        if (compose) {
            const rows = docker('exec', '-T', 'banco', 'psql', '-U', 'sac', '-d', 'sac', '-Atc',
                "SELECT count(*) FROM chegadas WHERE protocolo = '" + protocolo + "';");
            assert.equal(rows.trim(), '1');
        } else {
            const { Client } = createRequire(new URL('Servidor_node/server.js', cwd))('pg');
            const db = new Client();
            await db.connect();
            try {
                const { rows } = await db.query('SELECT count(*) FROM chegadas WHERE protocolo = $1', [protocolo]);
                assert.equal(rows[0].count, '1');
            } finally {
                await db.end();
            }
        }
        integridade = { ...metricas, registros_no_banco: 1 };
    }

    if (compose) ids.b = docker('exec', '-T', 'api-b', 'hostname').trim();
    const injecao = Date.now();
    if (compose) docker('stop', '-t', '0', 'api-b');
    else alvoB.kill('SIGKILL');
    alvoParado = true;
    const janelaFalha = [];
    for (let i = 0; i < 12; i++) {
        janelaFalha.push(await fila());
        await wait(100);
    }
    await until(async () => {
        const pair = await Promise.all([fila(), fila()]);
        return pair.every(x => x.status === 200 && x.node && x.node !== ids.b);
    }, 'balanceador encaminhando somente à réplica remanescente');
    const depois = metrics(await Promise.all(Array.from({ length: 75 }, () => recomendar())));
    assert.equal(depois.codigos['200'], 75, JSON.stringify(depois));
    assert.equal(Object.keys(depois.nos).length, 1);
    assert.ok(!depois.nos[ids.b]);

    if (compose) {
        for (const service of ['balanceador', 'api-a', 'api-b']) {
            for (const line of docker('logs', '--no-color', '--no-log-prefix', '--since', inicioDaBancada, service).split('\n')) {
                try { logs.push(JSON.parse(line)); } catch { /* Docker status output */ }
            }
        }
    }
    const evidenciaRastreio = logs.filter(line => line.correlation_id === idRastreio);
    assert.ok(evidenciaRastreio.some(line => line.no === ids.proxy && line.status === 404));
    assert.ok(evidenciaRastreio.some(line => line.no !== ids.proxy && line.status === 404));
    const deteccao = logs.find(l => l.evento === 'saude_alvo' && !l.saudavel && Date.parse(l.timestamp) >= injecao);
    assert.ok(deteccao, 'O balanceador deve registrar a transição de saúde.');
    const inicioRetorno = Date.now();
    if (compose) docker('start', 'api-b');
    else alvoB = iniciarReplicaB();
    alvoParado = false;
    await until(async () => {
        const pair = await Promise.all([fila(), fila()]);
        return pair.every(x => x.status === 200) && new Set(pair.map(x => x.node)).size === 2;
    }, 'réplica recuperada e novamente recebendo tráfego');
    const resultado = {
        executado_em_utc: new Date().toISOString(),
        ambiente: compose ? 'Docker Compose/PostgreSQL' : usarBanco ? 'Processos locais/PostgreSQL' : 'Processos locais/memória',
        rajada_antes: antes, falha_transicao: metrics(janelaFalha), rajada_com_no_fora: depois,
        tempo_deteccao_ms: Date.parse(deteccao.timestamp) - injecao,
        deteccao_registrada: deteccao,
        tempo_reintegracao_ms: Date.now() - inicioRetorno,
        integridade, rastreamento: evidenciaRastreio,
    };
    const output = JSON.stringify(resultado, null, 2) + '\n';
    if (caminhoSaida) writeFileSync(caminhoSaida, output);
    console.log(output);
} finally {
    if (compose && alvoParado) docker('start', 'api-b');
    for (const child of processes.reverse()) child.kill();
}
