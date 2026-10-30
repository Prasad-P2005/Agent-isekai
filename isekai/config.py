"""Runtime configuration, read from environment variables."""
import os
from pathlib import Path

SAVE_DIR = Path(os.getenv("ISEKAI_SAVE_DIR", Path(__file__).resolve().parent.parent / "saves"))
CLIENT_DIR = Path(os.getenv("ISEKAI_CLIENT_DIR", Path(__file__).resolve().parent.parent / "client"))
CONTENT_DIR = Path(os.getenv("ISEKAI_CONTENT_DIR", Path(__file__).resolve().parent.parent / "content"))
HOST = os.getenv("ISEKAI_HOST", "127.0.0.1")
PORT = int(os.getenv("ISEKAI_PORT", "8000"))
