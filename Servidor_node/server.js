const express = require('express');
const { randomUUID, timingSafeEqual } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { hostname } = require('node:os');
const { join } = require('node:path');
const { recomendar, distanciaKm } = require('./rotas');
const { repositorioMemoria, repositorioPostgres } = require('./repositorio');

const app = express();
const port = Number(process.argv[2] || process.env.PORT || 3000);
const node = process.env.NODE_ID || hostname();
const apiKey = process.env.API_KEY_FILE
    ? readFileSync(process.env.API_KEY_FILE, 'utf8').trim() : process.env.API_KEY;
if (!apiKey) throw new Error('Configure API_KEY_FILE ou API_KEY antes de iniciar.');
const expectedKey = Buffer.from(apiKey);

const databasePassword = process.env.PGPASSWORD_FILE
    ? readFileSync(process.env.PGPASSWORD_FILE, 'utf8').trim() : process.env.PGPASSWORD;
const repository = process.env.PGHOST
    ? repositorioPostgres({
        password: databasePassword,
        ssl: process.env.PGSSLROOTCERT ? { ca: readFileSync(process.env.PGSSLROOTCERT, 'utf8') } : undefined,
    })
    : repositorioMemoria();

function log(nivel, evento, dados = {}) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), nivel, evento, no: node, ...dados }));
}

app.disable('x-powered-by');
app.use((req, res, next) => {
    const incoming = req.get('x-correlation-id');
    const albTrace = req.get('x-amzn-trace-id')?.match(/(?:^|;)\s*Root=(1-[0-9a-f]{8}-[0-9a-f]{24})(?=;|$)/i)?.[1];
    req.correlationId = incoming && /^[a-zA-Z0-9_-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    const start = performance.now();
    res.set('X-Correlation-ID', req.correlationId);
    if (process.env.EXPOR_NO === '1') res.set('X-Node-ID', node);
    res.on('finish', () => {
        if (req.path === '/health' && res.statusCode === 200) return;
        log(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'http', {
            correlation_id: req.correlationId, alb_trace: albTrace, metodo: req.method,
            rota: req.route?.path || 'desconhecida', status: res.statusCode,
            duracao_ms: Math.round(performance.now() - start),
        });
    });
    next();
});

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const jsonBody = express.json({ limit: '4kb' });
function semCache(_req, res, next) {
    res.set('Cache-Control', 'no-store');
    next();
}

function origemValida(latitude, longitude) {
    return typeof latitude === 'number' && typeof longitude === 'number'
        && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

const consultarFila = asyncRoute(async (req, res) => {
    const posto = await repository.obter(req.params.id_posto.toLowerCase());
    if (!posto) return res.status(404).json({ erro: 'Posto não encontrado.' });
    res.json({ posto: posto.posto, tempo_espera_minutos: posto.tempo_espera_minutos });
});

const recomendarPosto = asyncRoute(async (req, res) => {
    const { latitude, longitude } = req.body;
    if (!origemValida(latitude, longitude)) {
        return res.status(400).json({ erro: 'Informe latitude e longitude numéricas válidas.' });
    }
    // Limita o cálculo à região atendida pela malha de demonstração.
    if (latitude < -13.1 || latitude > -12.15 || longitude < -39.1 || longitude > -38.30) {
        return res.status(422).json({ erro: 'Origem fora da área demonstrativa Salvador–Feira.' });
    }
    const postos = await repository.listar();
    if (!postos.length) return res.status(503).json({ erro: 'Catálogo de postos indisponível.' });
    res.json(recomendar([latitude, longitude], postos));
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const web = express.Router();
web.use(semCache);
web.get('/postos', asyncRoute(async (_req, res) => res.json(await repository.listar())));
web.post('/recomendacoes', jsonBody, recomendarPosto);
web.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use('/web-api', web);
app.use(express.static(join(__dirname, 'frontend', 'dist'), {
    setHeaders(res, arquivo) {
        if (arquivo.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
}));

app.use((req, res, next) => {
    const provided = Buffer.from(req.get('x-api-key') || '');
    if (provided.length !== expectedKey.length || !timingSafeEqual(provided, expectedKey)) {
        return res.status(401).json({ erro: 'Acesso negado.' });
    }
    next();
});
app.use(jsonBody, semCache);

app.get('/ready', asyncRoute(async (_req, res) => {
    await repository.ping();
    res.json({ status: 'ok' });
}));
app.get('/postos/:id_posto/fila', consultarFila);
app.post('/recomendacoes', recomendarPosto);

app.post('/postos/:id_posto/chegadas', asyncRoute(async (req, res) => {
    const { latitude, longitude } = req.body;
    const protocolo = req.get('idempotency-key');
    if (!origemValida(latitude, longitude) || !protocolo || !/^[a-zA-Z0-9_-]{8,64}$/.test(protocolo)) {
        return res.status(400).json({ erro: 'Informe coordenadas válidas e Idempotency-Key (8 a 64 caracteres).' });
    }
    const posto = await repository.obter(req.params.id_posto.toLowerCase());
    if (!posto) return res.status(404).json({ erro: 'Posto não encontrado.' });
    if (distanciaKm([latitude, longitude], [posto.latitude, posto.longitude]) > 0.25) {
        return res.status(422).json({ erro: 'A localização informada fica a mais de 250 m do posto.' });
    }
    const { criada, ...registro } = await repository.chegada(posto.id, protocolo);
    res.status(criada ? 201 : 200).json(registro);
}));

app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((erro, req, res, _next) => {
    if (erro.status === 400 || erro.status === 413) {
        return res.status(erro.status).json({ erro: 'Corpo JSON inválido ou grande demais.' });
    }
    log('error', 'dependencia', { correlation_id: req.correlationId, codigo: erro.code });
    res.status(503).json({ erro: 'Serviço temporariamente indisponível.' });
});

const bind = process.env.BIND_HOST || '0.0.0.0';
const server = app.listen(port, bind, () => log('info', 'inicio', { porta: server.address().port }));
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
