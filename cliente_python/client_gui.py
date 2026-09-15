import tkinter as tk
import requests
import time

def consultar_fila():
    id_posto = entry_posto.get().strip().lower()
    if not id_posto:
        label_resultado.config(text="Por favor, digite um posto.", fg="orange")
        return

    portas = [3000, 3001]
    headers = {'x-api-key': '32452555'}
    
    label_resultado.config(text="Consultando...", fg="blue")
    janela.update()

    for porta in portas:
        url = f"http://localhost:{porta}/postos/{id_posto}/fila"
        
        try:
            response = requests.get(url, headers=headers)
            if response.status_code == 200:
                dados = response.json()
                label_resultado.config(
                    text=f"✅ Sucesso (Porta {porta})!\n\nPosto: {dados['posto']}\nEspera: {dados['tempo_espera_minutos']} minutos", 
                    fg="green"
                )
                return
            elif response.status_code == 404:
                label_resultado.config(text="❌ Erro: Posto não encontrado.", fg="red")
                return
            elif response.status_code == 401:
                label_resultado.config(text="❌ Erro: Acesso Negado (API Key).", fg="red")
                return
        except requests.exceptions.ConnectionError:
            label_resultado.config(text=f"⚠️ Servidor {porta} caiu.\nTrocando de rota...", fg="orange")
            janela.update()
            time.sleep(1.5)

    label_resultado.config(text="❌ Falha Crítica:\nTodos os servidores caíram.", fg="red")

janela = tk.Tk()
janela.title("SAC Bahia - Fila")
janela.geometry("350x250")

# Textos e Entradas
tk.Label(janela, text="Consulta de Fila - SAC Bahia", font=("Arial", 14, "bold")).pack(pady=10)
tk.Label(janela, text="Postos: feira, salvador, shopping_bahia").pack()

entry_posto = tk.Entry(janela, width=20, font=("Arial", 12))
entry_posto.pack(pady=5)

# Botão
tk.Button(janela, text="Consultar Fila", command=consultar_fila, bg="#0078D7", fg="white", font=("Arial", 10, "bold")).pack(pady=10)

# Onde o resultado aparece
label_resultado = tk.Label(janela, text="", font=("Arial", 11))
label_resultado.pack(pady=5)

janela.mainloop()