const express = require('express');
const app = express();
// Recebe a porta pelo terminal ou usa 3000 por padrão
const port = process.argv[2] || 3000;

const bancoDeDadosSAC = {
    'feira': { posto: 'SAC Feira de Santana', tempo_espera_minutos: 45 },
    'shopping_bahia': { posto: 'SAC Shopping da Bahia', tempo_espera_minutos: 120 },
    'salvador': { posto: 'SAC Salvador', tempo_espera_minutos: 30 }
};

// Segurança (Item 2) - Exige API Key
app.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey === '32452555') {
        next();
    } else {
        res.status(401).json({ erro: 'Acesso Negado.' });
    }
});

app.get('/postos/:id_posto/fila', (req, res) => {
    const id = req.params.id_posto.toLowerCase();
    const dadosPosto = bancoDeDadosSAC[id];
    if (dadosPosto) {
        res.json(dadosPosto);
    } else {
        res.status(404).json({ erro: 'Posto não encontrado' });
    }
});

app.listen(port, () => {
    console.log(`✅ Servidor Node rodando na porta ${port}`);
});