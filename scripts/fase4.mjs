import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { promisify } from 'node:util';

const executar = promisify(execFile);
const raiz = new URL('../', import.meta.url);
const usuarios = 100;
const faseMs = 60_000;
const intervaloMs = 1_000;
const tempoLimiteMs = 4_500;
const porta = Number(process.env.SAC_PORT || 18080);
assert.ok(Number.isInteger(porta) && porta >= 1 && porta <= 65535, 'Porta local inválida.');
const url = 'http://127.0.0.1:' + porta + '/recomendacoes';
const chave = (await readFile(new URL('.secrets/api-key', raiz), 'utf8')).trim();
const execucao = 'fase4-' + randomUUID();
let sequencia = 0;
const corpo = JSON.stringify({ latitude: -12.979, longitude: -38.452 });
const docker = (...args) => executar('docker', ['compose', ...args], { cwd: raiz, maxBuffer: 8 * 1024 * 1024 });

async function recomendar() {
    const inicio = performance.now();
    try {
        const resposta = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': chave,
                'X-Correlation-ID': execucao + '-' + ++sequencia,
            },
            body: corpo,
            signal: AbortSignal.timeout(tempoLimiteMs),
        });
        await resposta.arrayBuffer();
        return { inicio, duracao: performance.now() - inicio, status: resposta.status,
            no: resposta.headers.get('x-node-id') };
    } catch (erro) {
        return { inicio, duracao: performance.now() - inicio,
            status: erro.name === 'TimeoutError' ? 'timeout' : 'erro_conexao' };
    }
}

function resumir(amostras) {
    const duracoes = [];
    const codigos = {};
    const nos = {};
    let falhas = 0;
    for (const { duracao, status, no } of amostras) {
        codigos[status] = (codigos[status] || 0) + 1;
        if (no) nos[no] = (nos[no] || 0) + 1;
        if (status >= 200 && status < 300) duracoes.push(duracao);
        if (typeof status !== 'number' || status >= 500) falhas++;
    }
    duracoes.sort((a, b) => a - b);
    const arredondar = valor => Math.round(valor * 100) / 100;
    const percentil = p => duracoes.length ? arredondar(duracoes[Math.ceil(duracoes.length * p) - 1]) : null;
    return {
        requisicoes: amostras.length, p50_ms: percentil(.5), p95_ms: percentil(.95),
        falhas, taxa_falhas_pct: amostras.length ? arredondar(100 * falhas / amostras.length) : null,
        codigos, nos,
    };
}

const preflight = await Promise.all(Array.from({ length: 4 }, recomendar));
assert.ok(preflight.every(r => r.status === 200) && new Set(preflight.map(r => r.no)).size === 2,
    'Inicie o Compose e confirme que as duas réplicas estão prontas antes do ensaio.');

const amostras = [];
const inicioExecucao = Date.now();
const inicioCarga = performance.now();
let parada;
let retorno;
let enviouParada = false;
let encerrou = false;
const controle = new AbortController();

async function usuario(i) {
    await wait(i * intervaloMs / usuarios);
    while (!encerrou && performance.now() - inicioCarga < 3 * faseMs) {
        const resposta = await recomendar();
        amostras.push(resposta);
        await wait(Math.max(0, intervaloMs - resposta.duracao));
    }
}

async function injetarFalha() {
    await wait(faseMs, undefined, { signal: controle.signal });
    parada = Date.now();
    enviouParada = true;
    console.log('Carga ativa: parando a réplica B.');
    await docker('stop', '-t', '0', 'api-b');
    await wait(Math.max(0, 2 * faseMs - (performance.now() - inicioCarga)), undefined, { signal: controle.signal });
    retorno = Date.now();
    console.log('Carga ativa: reiniciando a réplica B.');
    await docker('start', 'api-b');
    enviouParada = false;
}

const trabalhadores = Promise.all(Array.from({ length: usuarios }, (_, i) => usuario(i)));
const injecao = injetarFalha();
try {
    console.log('Fase 4: 100 usuários virtuais, 180 s, com pausa de até 1 s entre inícios por usuário.');
    await Promise.all([trabalhadores, injecao]);
} finally {
    encerrou = true;
    controle.abort();
    await Promise.allSettled([trabalhadores, injecao]);
    if (enviouParada) await docker('start', 'api-b');
}

const logs = await docker('logs', '--no-color', '--no-log-prefix', '--since',
    new Date(inicioExecucao).toISOString(), 'balanceador');
const eventos = logs.stdout.split('\n').flatMap(linha => {
    try {
        const evento = JSON.parse(linha);
        return evento.evento === 'saude_alvo' && evento.alvo === 'api-b:3000' ? [evento] : [];
    } catch {
        return [];
    }
});
const caiu = eventos.find(evento => !evento.saudavel && Date.parse(evento.timestamp) >= parada);
const recuperou = eventos.find(evento => evento.saudavel && Date.parse(evento.timestamp) >= retorno);
assert.ok(caiu && recuperou, 'Os logs devem comprovar a retirada e a volta da réplica.');
const faseDaAmostra = inicio => inicio - inicioCarga;
const intervalo = (de, ate) => amostras.filter(r => faseDaAmostra(r.inicio) >= de && faseDaAmostra(r.inicio) < ate);
const depoisDeteccao = Date.parse(caiu.timestamp) - inicioExecucao;
const depoisRetorno = Date.parse(recuperou.timestamp) - inicioExecucao;
const evidencias = {
    ambiente: 'Docker Compose local / PostgreSQL',
    inicio_utc: new Date(inicioExecucao).toISOString(),
    usuarios_virtuais: usuarios,
    duracao_s: 3 * faseMs / 1000,
    intervalo_por_usuario_ms: intervaloMs,
    rota: 'POST /recomendacoes',
    antes_da_parada: resumir(intervalo(0, faseMs)),
    janela_de_deteccao: resumir(intervalo(faseMs, depoisDeteccao)),
    com_uma_replica: resumir(intervalo(depoisDeteccao, 2 * faseMs)),
    janela_de_reintegracao: resumir(intervalo(2 * faseMs, depoisRetorno)),
    depois_da_reintegracao: resumir(intervalo(depoisRetorno, 3 * faseMs)),
    total: resumir(amostras),
    tempo_deteccao_ms: Date.parse(caiu.timestamp) - parada,
    tempo_reintegracao_ms: Date.parse(recuperou.timestamp) - retorno,
    eventos_balanceador: [caiu, recuperou],
};
assert.equal(Object.keys(evidencias.antes_da_parada.nos).length, 2);
assert.equal(Object.keys(evidencias.com_uma_replica.nos).length, 1);
assert.equal(Object.keys(evidencias.depois_da_reintegracao.nos).length, 2);
const json = JSON.stringify(evidencias, null, 2) + '\n';
await writeFile(new URL('output/fase4-local.json', raiz), json);
console.log(json);
