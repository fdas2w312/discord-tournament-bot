import os
import json
from dotenv import load_dotenv

load_dotenv()


class Config:
    DISCORD_TOKEN = os.getenv("DISCORD_TOKEN")
    GUILD_ID = int(os.getenv("GUILD_ID", "0"))
    CLIENT_ID = int(os.getenv("CLIENT_ID", "0"))

    STATUS_CHANNEL_ID = int(os.getenv("STATUS_CHANNEL_ID", "0")) or None
    AFK_ROLE_ID = int(os.getenv("AFK_ROLE_ID", "0")) or None
    INACTIVE_ROLE_ID = int(os.getenv("INACTIVE_ROLE_ID", "0")) or None
    MODERATOR_ROLE_ID = int(os.getenv("MODERATOR_ROLE_ID", "0")) or None

    ROLL_EMOJI = os.getenv("ROLL_EMOJI", "✅")
    ROLL_COLLECT_TIMEOUT = int(os.getenv("ROLL_COLLECT_TIMEOUT", "300"))
    STATUS_UPDATE_INTERVAL = int(os.getenv("STATUS_UPDATE_INTERVAL", "60"))


config = Config()
