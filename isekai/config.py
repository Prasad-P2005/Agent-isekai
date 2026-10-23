"""Runtime configuration, read from environment variables."""
import os
from pathlib import Path

LLM_URL = os.getenv("ISEKAI_LLM_URL", "http://localhost:11435")
LLM_MODEL = os.getenv("ISEKAI_LLM_MODEL", "qwen3.5:2b")
LLM_TIMEOUT = float(os.getenv("ISEKAI_LLM_TIMEOUT", "180"))
SAVE_DIR = Path(os.getenv("ISEKAI_SAVE_DIR", Path(__file__).resolve().parent.parent / "saves"))
CLIENT_DIR = Path(os.getenv("ISEKAI_CLIENT_DIR", Path(__file__).resolve().parent.parent / "client"))
HOST = os.getenv("ISEKAI_HOST", "127.0.0.1")
PORT = int(os.getenv("ISEKAI_PORT", "8000"))
# seconds between unprompted god narrations while a player is active
GOD_IDLE_INTERVAL = float(os.getenv("ISEKAI_GOD_IDLE", "150"))
