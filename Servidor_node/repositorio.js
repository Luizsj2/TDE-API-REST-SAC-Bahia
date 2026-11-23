const postosDemonstracao = require('./postos.json');

function repositorioMemoria() {
    const chegadas = new Map();
    return {
        async ping() {},
        async listar() { return postosDemonstracao; },
        async obter(id) { return postosDemonstracao.find(posto => posto.id === id); },
        async chegada(id, protocolo) {
            const chave = id + ':' + protocolo;
            if (chegadas.has(chave)) return { ...chegadas.get(chave), criada: false };
            const registro = { posto_id: id, protocolo, status: 'chegou', registrado_em: new Date() };
            chegadas.set(chave, registro);
            return { ...registro, criada: true };
        },
    };
}

function repositorioPostgres(config) {
    const { Pool } = require('pg');
    const pool = new Pool({ ...config, max: 6, connectionTimeoutMillis: 2000, query_timeout: 2500,
        statement_timeout: 2200 });
    pool.on('error', erro => console.error(JSON.stringify({
        timestamp: new Date().toISOString(), nivel: 'error', evento: 'pool_db', codigo: erro.code,
    })));
    const campos = 'id, posto, latitude, longitude, tempo_espera_minutos';
    return {
        async ping() { await pool.query('SELECT id FROM postos LIMIT 1'); },
        async listar() { return (await pool.query('SELECT ' + campos + ' FROM postos ORDER BY id')).rows; },
        async obter(id) {
            return (await pool.query('SELECT ' + campos + ' FROM postos WHERE id = $1', [id])).rows[0];
        },
        async chegada(id, protocolo) {
            const insercao = await pool.query(
                "INSERT INTO chegadas (posto_id, protocolo) VALUES ($1, $2) ON CONFLICT DO NOTHING "
                + "RETURNING posto_id, protocolo, registrado_em, 'chegou' AS status", [id, protocolo]);
            if (insercao.rowCount) return { ...insercao.rows[0], criada: true };
            const leitura = await pool.query(
                "SELECT posto_id, protocolo, registrado_em, 'chegou' AS status "
                + "FROM chegadas WHERE posto_id = $1 AND protocolo = $2", [id, protocolo]);
            return { ...leitura.rows[0], criada: false };
        },
    };
}

module.exports = { repositorioMemoria, repositorioPostgres };
