"""
Конфигурация бота — загружается из config.json с переопределением через env vars.

Приоритет: переменная окружения > config.json > значение по умолчанию.
На Railway все чувствительные данные (токен, API-ключи) передаются через env vars.
"""

import json
import os
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "config.json"


def _load_config() -> dict:
    if not CONFIG_PATH.exists():
        # На Railway config.json может не существовать — используем только env vars
        return {}
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


_raw = _load_config()

# Токен бота Discord (обязательный)
TOKEN: str = os.environ.get("BOT_TOKEN", "") or _raw.get("token", "")

# Роли администраторов
ADMIN_ROLES: list[str] = _raw.get("admin_roles", [])

# Система предупреждений
WARNING_ROLES: list[str] = _raw.get("warning", {}).get("roles_on_warn", [])
MAX_WARNINGS: int = _raw.get("warning", {}).get("max_warnings_before_ban", 0)

# База данных
# На Railway можно использовать DATABASE_URL (PostgreSQL/SQLite),
# локально — файл из config.json
DATABASE: str = os.environ.get("DATABASE_PATH", "") or _raw.get("database", "bot.db")

# Цвет embed
EMBED_COLOR: int = int(_raw.get("embed_color", "#5865F2").lstrip("#"), 16)

# Локаль
LOCALE: str = _raw.get("locale", "ru")

# Challonge API ключ (обязательный для Challonge-интеграции)
CHALLONGE_API_KEY: str = os.environ.get("CHALLONGE_API_KEY", "") or _raw.get("challonge_api_key", "")


def reload_config() -> dict:
    """Перезагрузка конфига из файла (горячая перезагрузка). Env vars не перечитываются."""
    global _raw, TOKEN, ADMIN_ROLES, WARNING_ROLES, MAX_WARNINGS, DATABASE, EMBED_COLOR, LOCALE, CHALLONGE_API_KEY
    _raw = _load_config()

    # Env vars имеют приоритет — перечитываем только если env не задан
    if not os.environ.get("BOT_TOKEN"):
        TOKEN = _raw.get("token", "")
    if not os.environ.get("DATABASE_PATH"):
        DATABASE = _raw.get("database", "bot.db")
    if not os.environ.get("CHALLONGE_API_KEY"):
        CHALLONGE_API_KEY = _raw.get("challonge_api_key", "")

    ADMIN_ROLES = _raw.get("admin_roles", [])
    WARNING_ROLES = _raw.get("warning", {}).get("roles_on_warn", [])
    MAX_WARNINGS = _raw.get("warning", {}).get("max_warnings_before_ban", 0)
    EMBED_COLOR = int(_raw.get("embed_color", "#5865F2").lstrip("#"), 16)
    LOCALE = _raw.get("locale", "ru")
    return _raw
