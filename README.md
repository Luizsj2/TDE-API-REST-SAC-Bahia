# 🏛️ TDE Parte 1: Implementação Prática de Middlewares e IDLs

**Instituição:** Centro Universitário Nobre (UNIFAN)  
**Disciplina:** Sistemas Distribuídos (2026.2)  
**Docente:** Prof. Rafael Levi Batista Costa  
**Projeto Escolhido:** Opção 2 - REST (OpenAPI/Swagger) - Fila de Espera do SAC Bahia

---

## 👥 Trio, Papéis e Governança

A governança do projeto foi estruturada com versionamento semântico no Git (branches `main` e `develop`) e divisão clara de responsabilidades para a avaliação individual:

* **Luiz Henrique Santos de Jesus:** Engenharia de Frontend (Interface Tkinter), Infraestrutura (Mapeamento DNS) e DevOps.
* **Diego Araujo Silva:** Engenharia de Backend (Node.js), Estruturação do Banco de Dados (Mock) e Segurança de Borda (Middleware).
* **Thiago Gomes de Oliveira:** Arquitetura de Software, Modelagem Cliente-Servidor heterogênea e Estratégias de Resiliência (Failover).

---

## 🎯 Objetivo do Projeto e Proposta de Valor

O objetivo deste projeto é demonstrar a transparência de comunicação em sistemas heterogêneos e resolver o problema crônico de superlotação nas unidades de atendimento público. A proposta de valor é entregar previsibilidade ao cidadão em tempo real, permitindo a consulta do tempo de fila do SAC Bahia antes do deslocamento. O modelo foca na descentralização da informação.

---

## 🛠️ Tecnologias Utilizadas

* **Contrato (IDL):** OpenAPI Specification (Swagger)
* **Back-end (Servidor):** Node.js com o framework Express
* **Front-end (Cliente):** Python com as bibliotecas `requests` e `tkinter`

---

## 🏗️ Arquitetura e Decisões Técnicas

O projeto afasta-se do modelo de monólito tradicional, implementando uma arquitetura de **serviços distribuídos heterogêneos**.

* **Separação de Responsabilidades & Comunicação:** O Backend (Node.js) atua puramente como provedor de dados, enquanto o Frontend (Python/Tkinter) gerencia a experiência do usuário. A comunicação ocorre via protocolo HTTP no padrão **REST**, trafegando dados leves em **JSON**.
* **Segurança e Proteção de Borda:** Implementação de um Firewall lógico via *Middleware* no Express. Todas as requisições exigem o token de autenticação no cabeçalho (`x-api-key`). Acessos não autorizados recebem imediato bloqueio (HTTP 401 Unauthorized).
* **Escalonamento Horizontal (Elasticidade):** O design de recursos computacionais foi modelado para escalabilidade. Simulamos múltiplas instâncias do servidor rodando em portas distintas (3000 e 3001), permitindo aumento de capacidade frente a picos de tráfego.
* **Resiliência e Tolerância a Falhas:** Mecanismo ativo de **Failover** e **Retries** do lado do cliente. Caso o nó principal (Porta 3000) sofra uma parada crítica, o script Python intercepta o erro de conexão, não quebra a interface, e redireciona o tráfego instantaneamente para o nó de backup (Porta 3001).
* **Resolução de Nomes (DNS):** Mascaramento de IP através de mapeamento local, utilizando o domínio virtual `api.sacbahia.local`. Esta abstração permite alterar a infraestrutura de rede sem impactar a aplicação cliente.

---

## 🗺️ Diagrama Arquitetural

```mermaid
graph TD
    A[Cliente Python/Tkinter] -->|HTTP GET Request| B(DNS: api.sacbahia.local)
    B --> C{Firewall / Middleware}
    C -->|x-api-key Válida| D[Nó Principal - Porta 3000]
    C -.->|Falha/Timeout| E[Nó Backup - Porta 3001]
    D --> F[(Mock Database REST)]
    E --> F
    F -->|Resposta JSON| A
    C -->|x-api-key Inválida| G[Erro 401 Unauthorized]
