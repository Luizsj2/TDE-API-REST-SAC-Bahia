# TDE Parte 1: Implementação Prática de Middlewares e IDLs

**Instituição:** Centro Universitário Nobre (UNIFAN)
**Disciplina:** Sistemas Distribuídos (2026.2)
**Docente:** Prof. Rafael Levi Batista Costa
**Projeto Escolhido:** Opção 2 - REST (OpenAPI/Swagger) - Fila de Espera do SAC Bahia

## 👥 Trio
* Diego Araujo Silva
* Luiz Henrique Santos de Jesus
* Thiago Gomes De Oliveira

## 🎯 Objetivo do Projeto
O objetivo deste projeto é demonstrar a transparência de comunicação em sistemas heterogêneos. Para isso, foi implementada uma arquitetura cliente-servidor integrando uma API RESTful em Node.js (Servidor) com um script em Python (Cliente). O sistema simula a consulta de tempo de fila em diferentes postos do SAC Bahia.

## 🛠️ Tecnologias Utilizadas
* **Contrato (IDL):** OpenAPI Specification (Swagger)
* **Back-end (Servidor):** Node.js com o framework Express
* **Front-end (Cliente):** Python com a biblioteca `requests`

---

## 🚀 Como Executar o Projeto

Siga os passos abaixo para rodar o servidor e o cliente em sua máquina local.

### 1. Executando o Servidor (Node.js)

Abra um terminal, navegue até a pasta do servidor e execute os seguintes comandos:

```bash
# Acesse a pasta do servidor
cd servidor_node

# Instale as dependências (Express)
npm install

# Inicie o servidor
node server.js