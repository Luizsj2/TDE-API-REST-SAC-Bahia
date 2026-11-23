import tkinter as tk
from tkinter import ttk
from concurrent.futures import ThreadPoolExecutor

from client import fila, recomendar


def main():
    janela = tk.Tk()
    janela.title("SAC Bahia")
    janela.minsize(470, 260)
    painel = ttk.Frame(janela, padding=18)
    painel.pack(fill="both", expand=True)
    painel.columnconfigure(1, weight=1)
    resultado = tk.StringVar()
    executor = ThreadPoolExecutor(max_workers=1)

    def campo(rotulo, linha, valor):
        ttk.Label(painel, text=rotulo).grid(row=linha, column=0, sticky="w", padx=(0, 12), pady=4)
        entrada = ttk.Entry(painel)
        entrada.grid(row=linha, column=1, sticky="ew", pady=4)
        entrada.insert(0, valor)
        return entrada

    posto = campo("ID do posto", 0, "feira")
    latitude = campo("Latitude", 2, "-12.9790")
    longitude = campo("Longitude", 3, "-38.4520")

    def executar(acao, formatar, *args):
        resultado.set("Consultando…")
        consulta.state(["disabled"])
        rota.state(["disabled"])
        futuro = executor.submit(acao, *args)

        def atualizar():
            if not futuro.done():
                janela.after(100, atualizar)
                return
            try:
                resultado.set(formatar(futuro.result()))
            except (ValueError, RuntimeError) as erro:
                resultado.set(str(erro))
            consulta.state(["!disabled"])
            rota.state(["!disabled"])

        atualizar()

    def mostrar_fila(dados):
        return f"{dados['posto']}\nEspera estimada de {dados['tempo_espera_minutos']} min."

    def mostrar_rota(dados):
        sac = dados["recomendado"]
        return (f"{sac['posto']}\nViagem de {sac['viagem_minutos']} min · "
                f"Fila de {sac['tempo_espera_minutos']} min · Total de {sac['total_minutos']} min\n"
                f"Rota demonstrativa de {sac['distancia_km']} km.")

    def solicitar_rota():
        try:
            origem = (float(latitude.get().replace(",", ".")), float(longitude.get().replace(",", ".")))
        except ValueError:
            resultado.set("Informe latitude e longitude válidas.")
            return
        executar(recomendar, mostrar_rota, *origem)

    consulta = ttk.Button(painel, text="Consultar fila", command=lambda: executar(fila, mostrar_fila, posto.get().strip()))
    consulta.grid(row=1, column=1, sticky="w", pady=(0, 12))
    rota = ttk.Button(painel, text="Recomendar posto", command=solicitar_rota)
    rota.grid(row=4, column=1, sticky="w")
    ttk.Label(painel, textvariable=resultado, wraplength=430).grid(row=5, column=0, columnspan=2, sticky="w", pady=14)

    janela.protocol("WM_DELETE_WINDOW", lambda: (executor.shutdown(wait=False, cancel_futures=True), janela.destroy()))
    janela.mainloop()


if __name__ == "__main__":
    main()
