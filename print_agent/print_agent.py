import logging
import os
from logging.handlers import RotatingFileHandler

from flask import Flask, jsonify, request


LOG_FILE = os.environ.get("PRINT_AGENT_LOG_FILE", "print_agent.log")
MAX_LOG_BYTES = 5 * 1024 * 1024

app = Flask(__name__)

logger = logging.getLogger("print_agent")
logger.setLevel(logging.INFO)

if not logger.handlers:
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=MAX_LOG_BYTES, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(file_handler)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(console_handler)


def get_printer_name():
    return os.environ.get("PRINT_AGENT_PRINTER_NAME", "").strip()


def get_expected_token():
    return os.environ.get("PRINT_AGENT_TOKEN", "").strip()


def is_authorized():
    expected = get_expected_token()
    header = request.headers.get("Authorization", "")
    prefix = "Bearer "
    if not expected:
        logger.warning("PRINT_AGENT_TOKEN nao configurado; recusando impressao.")
        return False
    if not header.startswith(prefix):
        return False
    return header[len(prefix):].strip() == expected


def write_raw_to_printer(printer_name, payload):
    if not printer_name:
        raise RuntimeError("PRINT_AGENT_PRINTER_NAME nao configurada.")
    if not payload:
        raise RuntimeError("Corpo EPL vazio.")

    try:
        import win32print
    except ImportError as exc:
        raise RuntimeError("pywin32 nao esta instalado ou este script nao esta rodando no Windows.") from exc

    printer_handle = None
    doc_started = False
    page_started = False

    try:
        printer_handle = win32print.OpenPrinter(printer_name)
        win32print.StartDocPrinter(printer_handle, 1, ("Etiqueta EPL", None, "RAW"))
        doc_started = True
        win32print.StartPagePrinter(printer_handle)
        page_started = True
        win32print.WritePrinter(printer_handle, payload)
    finally:
        if printer_handle:
            if page_started:
                try:
                    win32print.EndPagePrinter(printer_handle)
                except Exception:
                    logger.exception("Falha ao finalizar pagina de impressao.")
            if doc_started:
                try:
                    win32print.EndDocPrinter(printer_handle)
                except Exception:
                    logger.exception("Falha ao finalizar documento de impressao.")
            win32print.ClosePrinter(printer_handle)


@app.get("/status")
def status():
    return jsonify({"status": "up", "printer": get_printer_name()}), 200


@app.post("/imprimir")
def imprimir():
    printer_name = get_printer_name()
    payload = request.get_data()

    if not is_authorized():
        logger.warning("Tentativa de impressao recusada por token invalido. bytes=%s printer=%s", len(payload), printer_name)
        return jsonify({"status": "error", "detail": "Nao autorizado."}), 401

    try:
        write_raw_to_printer(printer_name, payload)
        logger.info("Etiqueta enviada com sucesso. bytes=%s printer=%s", len(payload), printer_name)
        return jsonify({"status": "ok"}), 200
    except Exception as exc:
        logger.exception("Falha ao imprimir etiqueta. bytes=%s printer=%s", len(payload), printer_name)
        return jsonify({"status": "error", "detail": str(exc)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PRINT_AGENT_PORT", "9200"))
    app.run(host="0.0.0.0", port=port)
