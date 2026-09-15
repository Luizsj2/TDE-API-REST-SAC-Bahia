import requests
import time

def consultar_fila():
    print("--- Consulta de Fila do SAC Bahia ---")
    id_posto = input("Digite o ID do posto (feira, shopping_bahia, salvador): ")

    # Escalonamento e Tolerância a falhas (Itens 4 e 8)
    portas = [3000, 3001]
    headers = {'x-api-key': 'senha-secreta-123'} # Segurança (Item 2)

    for porta in portas:
        # DNS Simulado (Item 9) - Usando api.sacbahia.local
        url = f"http://localhost:{porta}/postos/{id_posto}/fila"
        print(f"Tentando conectar no servidor: Porta {porta}...")
        
        try:
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                dados = response.json()
                print("\n✅ Sucesso na Consulta!")
                print(f"Posto: {dados['posto']} | Espera: {dados['tempo_espera_minutos']} min")
                return
            elif response.status_code == 401:
                print("\n❌ Erro de Segurança: Acesso Negado. Chave inválida.")
                return
        except requests.exceptions.ConnectionError:
            print(f"⚠️ Servidor da porta {porta} caiu. Redirecionando para o próximo...")
            time.sleep(1)

    print("\n❌ Falha Crítica: Todos os servidores estão fora do ar.")

if __name__ == "__main__":
    consultar_fila()