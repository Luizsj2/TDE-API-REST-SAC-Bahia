import requests

def consultar_fila():
    print("--- Consulta de Fila do SAC Bahia ---")
    print("Postos disponíveis: feira, shopping_bahia, salvador")
    id_posto = input("Digite o ID do posto que deseja consultar: ")

    url = f"http://localhost:3000/postos/{id_posto}/fila"
    
    try:
        response = requests.get(url)
        
        if response.status_code == 200:
            dados = response.json()
            print("\n✅ Sucesso na Consulta!")
            print(f"Posto: {dados['posto']}")
            print(f"Tempo estimado de espera: {dados['tempo_espera_minutos']} minutos")
        elif response.status_code == 404:
            print("\n❌ Erro: Posto não encontrado. Verifique o ID digitado.")
        else:
            print(f"\n❌ Erro desconhecido: {response.status_code}")
            
    except requests.exceptions.ConnectionError:
        print("\n❌ Falha de conexão. O servidor Node.js está rodando na porta 3000?")

if __name__ == "__main__":
    consultar_fila()
    