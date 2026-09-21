import requests
import time
import sys

def iniciar_cliente():
    print("--- Sistema de Consulta SAC Bahia ---")
    posto = input("Informe o ID do posto (ex: feira, salvador): ").strip().lower()
    
    if not posto:
        print("Erro: ID do posto não informado.")
        sys.exit(1)

    portas = [3000, 3001]
    headers = {'x-api-key': 'unifan-tde-api'}
    
    print("\nIniciando requisição...")

    for porta in portas:
        url = f"http://api.sacbahia.local:{porta}/postos/{posto}/fila"
        
        try:
            response = requests.get(url, headers=headers)
            
            if response.status_code == 200:
                dados = response.json()
                print(f"Status 200 OK (Rota {porta})")
                print(f"Posto: {dados['posto']}")
                print(f"Espera estimada: {dados['tempo_espera_minutos']} minutos")
                return
            elif response.status_code == 404:
                print("Erro 404: Posto não encontrado no registro.")
                return
            elif response.status_code == 401:
                print("Erro 401: Acesso negado. Verifique a credencial.")
                return
            else:
                print(f"Erro {response.status_code}: Falha na comunicação.")
                return
                
        except requests.exceptions.ConnectionError:
            print(f"Falha de conexão na porta {porta}. Acionando failover...")
            time.sleep(1)

    print("\nErro Crítico: Todos os nós do servidor estão inoperantes.")

if __name__ == "__main__":
    iniciar_cliente()