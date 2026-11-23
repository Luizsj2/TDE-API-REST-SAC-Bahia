const cruzamentos = {
    feira_br324: [-12.2801, -38.9445],
    amelia: [-12.3926, -38.7680],
    acesso_candeias: [-12.6721, -38.5194],
    valeria: [-12.8570, -38.4658],
    piraja: [-12.9082, -38.4662],
    br324_acm: [-12.9490, -38.4600],
    acm: [-12.9759, -38.4576],
};

const vias = [
    ['feira', 'feira_br324', 35],
    ['feira_br324', 'amelia', 80],
    ['amelia', 'acesso_candeias', 80],
    ['acesso_candeias', 'valeria', 80],
    ['valeria', 'piraja', 70],
    ['piraja', 'br324_acm', 65],
    ['br324_acm', 'acm', 50],
    ['acm', 'salvador', 25],
    ['acm', 'shopping_bahia', 25],
];

function distanciaKm(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLon = (b[1] - a[1]) * rad;
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function recomendar(origem, postos) {
    const pontos = new Map(Object.entries(cruzamentos));
    for (const posto of postos) {
        pontos.set(posto.id, [posto.latitude, posto.longitude]);
    }
    const conexoes = new Map([...pontos.keys()].map(id => [id, []]));
    function ligar(a, b, velocidade) {
        if (!pontos.has(a) || !pontos.has(b)) return;
        const km = distanciaKm(pontos.get(a), pontos.get(b));
        conexoes.get(a).push({ destino: b, km, minutos: km * 60 / velocidade });
        conexoes.get(b).push({ destino: a, km, minutos: km * 60 / velocidade });
    }
    for (const [a, b, velocidade] of vias) ligar(a, b, velocidade);

    // A origem entra no grafo pelo nó mais próximo da malha demonstrativa.
    const acesso = [...pontos].reduce((melhor, atual) =>
        distanciaKm(origem, atual[1]) < distanciaKm(origem, melhor[1]) ? atual : melhor);
    pontos.set('origem', origem);
    conexoes.set('origem', []);
    ligar('origem', acesso[0], 30);

    const custos = new Map([['origem', { km: 0, minutos: 0, caminho: ['origem'] }]]);
    const pendentes = new Set(pontos.keys());
    while (pendentes.size) {
        const atual = [...pendentes].reduce((melhor, id) =>
            (custos.get(id)?.minutos ?? Infinity) < (custos.get(melhor)?.minutos ?? Infinity)
                ? id : melhor, undefined);
        if (atual === undefined) break;
        pendentes.delete(atual);
        const custo = custos.get(atual);
        for (const trecho of conexoes.get(atual)) {
            const minutos = custo.minutos + trecho.minutos;
            if (minutos >= (custos.get(trecho.destino)?.minutos ?? Infinity)) continue;
            custos.set(trecho.destino, {
                minutos, km: custo.km + trecho.km, caminho: [...custo.caminho, trecho.destino],
            });
        }
    }

    const candidatos = postos.filter(posto => custos.has(posto.id)).map(posto => {
        const trajeto = custos.get(posto.id);
        return {
            ...posto,
            viagem_minutos: Math.round(trajeto.minutos),
            total_minutos: Math.round(trajeto.minutos + posto.tempo_espera_minutos),
            distancia_km: Number(trajeto.km.toFixed(2)),
        };
    }).sort((a, b) => (custos.get(a.id).minutos + a.tempo_espera_minutos)
        - (custos.get(b.id).minutos + b.tempo_espera_minutos) || a.id.localeCompare(b.id));
    const [posto] = candidatos;
    return {
        recomendado: posto,
        alternativas: candidatos.slice(1),
        rota: {
            tipo: 'estimativa_grafo_demonstrativo',
            geometria: {
                type: 'LineString',
                coordinates: custos.get(posto.id).caminho.map(id => [...pontos.get(id)].reverse()),
            },
        },
    };
}

module.exports = { recomendar, distanciaKm };
