import tkinter as tk
import requests
import time

def consultar_fila():
    id_posto = entry_posto.get().strip().lower()
    if not id_posto:
        label_resultado.config(text="Informe o nome do posto.", fg="orange")
        return

    portas = [3000, 3001]
    headers = {'x-api-key': '32452555'}
    
    label_resultado.config(text="Consultando API...", fg="blue")
    janela.update()

    for porta in portas:
        url = f"http://api.sacbahia.local:{porta}/postos/{id_posto}/fila"
        
        try:
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                dados = response.json()
                label_resultado.config(
                    text=f"Status 200 (Porta {porta})\n\nPosto: {dados['posto']}\nEspera: {dados['tempo_espera_minutos']} min", 
                    fg="green"
                )
                return
            elif response.status_code == 404:
                label_resultado.config(text="Erro 404: Posto não localizado.", fg="red")
                return
            elif response.status_code == 401:
                label_resultado.config(text="Erro 401: Falha de autenticação.", fg="red")
                return
        except requests.exceptions.ConnectionError:
            # Failover caso a porta recuse conexao
            label_resultado.config(text=f"Timeout na porta {porta}. Tentando rota alternativa...", fg="orange")
            janela.update()
            time.sleep(1.5)

    label_resultado.config(text="Erro Crítico: Nenhum servidor disponível.", fg="red")

# init ui
janela = tk.Tk()
janela.title("SAC Bahia - Fila")
janela.geometry("350x250")

tk.Label(janela, text="Monitoramento SAC Bahia", font=("Arial", 12, "bold")).pack(pady=10)
tk.Label(janela, text="Postos disponíveis: feira, salvador, shopping_bahia").pack()

entry_posto = tk.Entry(janela, width=25, font=("Arial", 10))
entry_posto.pack(pady=5)

tk.Button(janela, text="Consultar", command=consultar_fila, bg="#eee").pack(pady=10)

label_resultado = tk.Label(janela, text="", font=("Arial", 10))
label_resultado.pack(pady=5)

janela.mainloop()