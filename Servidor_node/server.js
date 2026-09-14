const express = require('express');
const app = express();
const port = 3000;

// Banco de dados em memória simulando os postos do SAC
const bancoDeDadosSAC = {
    'feira': { posto: 'SAC Feira de Santana', tempo_espera_minutos: 45 },
    'shopping_bahia': { posto: 'SAC Shopping da Bahia', tempo_espera_minutos: 120 },
    'salvador': { posto: 'SAC Salvador', tempo_espera_minutos: 30 }
};

// Rota REST conforme definido no openapi.yaml
app.get('/postos/:id_posto/fila', (req, res) => {
    const id = req.params.id_posto.toLowerCase();
    const dadosPosto = bancoDeDadosSAC[id];

    if (dadosPosto) {
        res.json(dadosPosto); // Retorna estritamente em formato JSON
    } else {
        res.status(404).json({ erro: 'Posto não encontrado' });
    }
});

app.listen(port, () => {
    console.log(`Servidor Node rodando em http://localhost:${port}`);
});
