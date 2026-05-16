import asyncio
import time
import discord
from database.db import (
    get_expired_afk_statuses, remove_afk_status,
    get_expired_inactive_statuses, remove_inactive_status,
    get_all_afk_statuses, get_all_inactive_statuses
)
from utils.embeds import create_status_embed
from config import config


_status_message_id = None


async def update_status_table(bot):
    """Обновить закреплённое сообщение с таблицей статусов."""
    global _status_message_id

    if not config.STATUS_CHANNEL_ID:
        return

    channel = bot.get_channel(config.STATUS_CHANNEL_ID)
    if not channel:
        try:
            channel = await bot.fetch_channel(config.STATUS_CHANNEL_ID)
        except:
            return

    afk_list = get_all_afk_statuses()
    inactive_list = get_all_inactive_statuses()
    embed = create_status_embed(afk_list, inactive_list)

    # Ищем закреплённое сообщение бота
    if not _status_message_id:
        pinned = await channel.pins()
        for msg in pinned:
            if msg.author.id == bot.user.id:
                _status_message_id = msg.id
                break

    if _status_message_id:
        try:
            msg = await channel.fetch_message(_status_message_id)
            await msg.edit(embed=embed)
            return
        except:
            _status_message_id = None

    # Создаём новое
    msg = await channel.send(embed=embed)
    try:
        await msg.pin()
    except:
        pass
    _status_message_id = msg.id


async def check_expired_statuses(bot):
    """Проверить и снять истёкшие статусы."""
    expired_afk = get_expired_afk_statuses()
    for entry in expired_afk:
        remove_afk_status(entry["user_id"])
        if config.AFK_ROLE_ID and entry["guild_id"]:
            try:
                guild = bot.get_guild(int(entry["guild_id"]))
                if not guild:
                    guild = await bot.fetch_guild(int(entry["guild_id"]))
                member = await guild.fetch_member(int(entry["user_id"]))
                await member.remove_roles(discord.Object(id=config.AFK_ROLE_ID))
                print(f"✅ AFK роль снята: {entry['username']}")
            except Exception as e:
                print(f"Не удалось снять AFK роль у {entry['username']}: {e}")

    expired_inactive = get_expired_inactive_statuses()
    for entry in expired_inactive:
        remove_inactive_status(entry["user_id"])
        if config.INACTIVE_ROLE_ID and entry["guild_id"]:
            try:
                guild = bot.get_guild(int(entry["guild_id"]))
                if not guild:
                    guild = await bot.fetch_guild(int(entry["guild_id"]))
                member = await guild.fetch_member(int(entry["user_id"]))
                await member.remove_roles(discord.Object(id=config.INACTIVE_ROLE_ID))
                print(f"✅ Inactive роль снята: {entry['username']}")
            except Exception as e:
                print(f"Не удалось снять Inactive роль у {entry['username']}: {e}")

    if expired_afk or expired_inactive:
        await update_status_table(bot)


async def start_background_tasks(bot):
    """Запустить фоновые задачи."""
    # Обновление таблицы
    async def status_updater():
        await bot.wait_until_ready()
        while not bot.is_closed():
            try:
                await update_status_table(bot)
            except Exception as e:
                print(f"Ошибка обновления таблицы: {e}")
            await asyncio.sleep(config.STATUS_UPDATE_INTERVAL)

    # Проверка истёкших статусов
    async def expiry_checker():
        await bot.wait_until_ready()
        while not bot.is_closed():
            try:
                await check_expired_statuses(bot)
            except Exception as e:
                print(f"Ошибка проверки истёкших: {e}")
            await asyncio.sleep(30)

    asyncio.create_task(status_updater())
    asyncio.create_task(expiry_checker())
    print("🔄 Фоновые задачи запущены")
