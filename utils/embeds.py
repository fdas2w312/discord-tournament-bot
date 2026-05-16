import time
from datetime import datetime
import discord


def format_time_remaining(ms: float) -> str:
    if ms <= 0:
        return "Истекло"
    seconds = int(ms)
    minutes = seconds // 60
    hours = minutes // 60
    days = hours // 24

    if days > 0:
        return f"{days}д {hours % 24}ч"
    if hours > 0:
        return f"{hours}ч {minutes % 60}м"
    if minutes > 0:
        return f"{minutes}м {seconds % 60}с"
    return f"{seconds}с"


def format_date(date_str: str) -> str:
    """YYYY-MM-DD -> DD.MM.YYYY"""
    parts = date_str.split("-")
    return f"{parts[2]}.{parts[1]}.{parts[0]}"


def create_status_embed(afk_list: list, inactive_list: list) -> discord.Embed:
    embed = discord.Embed(
        color=0x2B2D31,
        title="📋 Таблица статусов участников",
        timestamp=datetime.utcnow()
    )

    # AFK
    if afk_list:
        lines = []
        for i, entry in enumerate(afk_list):
            remaining = entry["expires_at"] - time.time()
            time_str = format_time_remaining(remaining) if remaining > 0 else "⏳ Истекает..."
            lines.append(f"`{i+1}.` <@{entry['user_id']}> — **AFK** {time_str} ({entry['minutes']} мин)")
        embed.add_field(name="🔴 AFK", value="\n".join(lines), inline=False)
    else:
        embed.add_field(name="🔴 AFK", value="*Нет участников в AFK*", inline=False)

    # Inactive
    if inactive_list:
        lines = []
        for i, entry in enumerate(inactive_list):
            now = time.time()
            is_active = entry["from_timestamp"] <= now <= entry["to_timestamp"]
            is_upcoming = now < entry["from_timestamp"]
            icon = "🟡" if is_active else "🔵" if is_upcoming else "⚪"
            text = "Сейчас в инактиве" if is_active else "Ожидается" if is_upcoming else "Завершено"
            lines.append(
                f"`{i+1}.` <@{entry['user_id']}> — **Инактив** "
                f"{format_date(entry['from_date'])} — {format_date(entry['to_date'])} {icon} {text}"
            )
        embed.add_field(name="🟠 Inactive", value="\n".join(lines), inline=False)
    else:
        embed.add_field(name="🟠 Inactive", value="*Нет участников в инактиве*", inline=False)

    embed.set_footer(text=f"AFK: {len(afk_list)} • Inactive: {len(inactive_list)}")
    return embed


def create_afk_confirm_embed(username: str, minutes: int, expires_at: float) -> discord.Embed:
    remaining = expires_at - time.time()
    embed = discord.Embed(
        color=0xFF6B6B,
        title="🔴 Вы перешли в AFK",
        description=(
            f"**{username}** теперь в AFK на **{minutes} минут**\n"
            f"Статус снимется автоматически через {format_time_remaining(remaining)}"
        ),
        timestamp=datetime.utcnow()
    )
    return embed


def create_inactive_confirm_embed(username: str, from_date: str, to_date: str) -> discord.Embed:
    embed = discord.Embed(
        color=0xFF9F43,
        title="🟠 Вы перешли в Inactive",
        description=(
            f"**{username}** теперь в инактиве\n"
            f"Период: с **{format_date(from_date)}** по **{format_date(to_date)}**\n"
            f"Роль будет снята автоматически после окончания периода"
        ),
        timestamp=datetime.utcnow()
    )
    return embed


def create_remove_status_embed(status_type: str, username: str) -> discord.Embed:
    is_afk = status_type == "afk"
    embed = discord.Embed(
        color=0x57F287,
        title="✅ AFK статус снят" if is_afk else "✅ Inactive статус снят",
        description=f"**{username}** больше не {'в AFK' if is_afk else 'в инактиве'}",
        timestamp=datetime.utcnow()
    )
    return embed


def create_roll_result_embed(winner: dict | None, participants: list[dict], total_reactions: int) -> discord.Embed:
    embed = discord.Embed(
        color=0xFEE75C,
        title="🎉 РЕЗУЛЬТАТЫ РОЛЛА"
    )

    if winner:
        embed.description = f"🏆 **Победитель:** <@{winner['id']}>\n\n👑 Поздравляем!"
    else:
        embed.description = "❌ Никто не поставил реакцию! Ролл отменён."

    if participants:
        sorted_p = sorted(participants, key=lambda x: x["reactions"], reverse=True)

        lines = []
        for i, p in enumerate(sorted_p[:30]):
            medal = ""
            if i == 0: medal = "👑 "
            elif i == 1: medal = "🥇 "
            elif i == 2: medal = "🥈 "
            elif i == 3: medal = "🥉 "
            reactions_info = f" ({p['reactions']} реакций)" if p["reactions"] > 1 else ""
            lines.append(f"`{i+1}.` {medal}<@{p['id']}>{reactions_info}")

        # Split into chunks of 10
        chunk_size = 10
        for i in range(0, len(lines), chunk_size):
            chunk = lines[i:i+chunk_size]
            field_name = f"👥 Участники ({len(participants)})" if i == 0 else "\u200B"
            embed.add_field(name=field_name, value="\n".join(chunk), inline=False)

    embed.set_footer(text=f"Всего реакций: {total_reactions} • Участников: {len(participants)}")
    return embed
