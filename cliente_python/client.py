import argparse
import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

RAIZ = Path(__file__).resolve().parent.parent


def chamar(caminho, dados=None, protocolo=None):
    base = os.environ.get("SAC_API_URL", "http://127.0.0.1:18080").rstrip("/")
    chave = os.environ.get("API_KEY")
    if not chave:
        arquivo = Path(os.environ.get("API_KEY_FILE", RAIZ / ".secrets" / "api-key"))
        if not arquivo.is_file():
            raise RuntimeError("Configure API_KEY, API_KEY_FILE ou execute node scripts/iniciar-local.mjs.")
        chave = arquivo.read_text(encoding="utf-8").strip()

    headers = {"X-API-Key": chave}
    corpo = None
    if dados is not None:
        corpo = json.dumps(dados).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if protocolo:
        headers["Idempotency-Key"] = protocolo
    requisicao = Request(base + caminho, data=corpo, headers=headers)
    try:
        with urlopen(requisicao, timeout=5) as resposta:
            return json.load(resposta)
    except HTTPError as erro:
        with erro:
            bruto = erro.read()
        try:
            mensagem = json.loads(bruto).get("erro", erro.reason)
        except (ValueError, AttributeError):
            mensagem = erro.reason
        raise RuntimeError(f"HTTP {erro.code} - {mensagem}") from erro
    except (URLError, TimeoutError) as erro:
        raise RuntimeError("Não foi possível obter resposta do serviço no tempo previsto.") from erro


def fila(posto):
    return chamar(f"/postos/{quote(posto, safe='')}/fila")


def recomendar(latitude, longitude):
    return chamar("/recomendacoes", {"latitude": latitude, "longitude": longitude})


def main():
    parser = argparse.ArgumentParser(description="Cliente SAC Bahia")
    acoes = parser.add_subparsers(dest="acao")
    consulta = acoes.add_parser("fila")
    consulta.add_argument("posto")
    recomendacao = acoes.add_parser("recomendar")
    recomendacao.add_argument("latitude", type=float)
    recomendacao.add_argument("longitude", type=float)
    chegada = acoes.add_parser("chegada")
    chegada.add_argument("posto")
    chegada.add_argument("latitude", type=float)
    chegada.add_argument("longitude", type=float)
    chegada.add_argument("protocolo")
    args = parser.parse_args()

    try:
        if args.acao == "recomendar":
            resultado = recomendar(args.latitude, args.longitude)
        elif args.acao == "chegada":
            resultado = chamar(f"/postos/{quote(args.posto, safe='')}/chegadas",
                               {"latitude": args.latitude, "longitude": args.longitude}, args.protocolo)
        else:
            posto = args.posto if args.acao else input("ID do posto (feira, salvador, shopping_bahia): ")
            resultado = fila(posto.strip())
        print(json.dumps(resultado, indent=2, ensure_ascii=False))
    except RuntimeError as erro:
        print(erro, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
