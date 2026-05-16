import re
import random
import asyncio
import discord
from discord import app_commands
from database.db import (
    create_roll, remove_active_roll, get_active_roll,
    get_all_active_rolls, save_roll_result
)
from utils.embeds import create_roll_result_embed
from config import config


def parse_message_target(input_str: str):
    """Парсинг ссылки Discord или ID сообщения."""
    url_match = re.match(r".*discord\.com/channels/(\d+)/(\d+)/(\d+)", input_str)
    if url_match:
        return {
            "guild_id": url_match.group(1),
            "channel_id": url_match.group(2),
            "message_id": url_match.group(3)
        }
    if re.match(r"^\d{17,20}$", input_str):
        return {"message_id": input_str, "channel_id": None, "guild_id": None}
    return None


async def fetch_reactors(bot, channel_id: int, message_id: int, emoji: str):
    """Получить участников, поставивших реакции на сообщение."""
    channel = bot.get_channel(channel_id)
    if not channel:
        try:
            channel = await bot.fetch_channel(channel_id)
        except:
            return None

    try:
        message = await channel.fetch_message(message_id)
    except:
        return None

    participants = {}  # user_id -> {id, username, reactions}
    total_reactions = 0

    if emoji == "all":
        for reaction in message.reactions:
            users = [u async for u in reaction.users()]
            total_reactions += len(users)
            for user in users:
                if user.bot:
                    continue
                if str(user.id) in participants:
                    participants[str(user.id)]["reactions"] += 1
                else:
                    participants[str(user.id)] = {
                        "id": str(user.id),
                        "username": user.display_name,
                        "reactions": 1
                    }
    else:
        reaction = None
        for r in message.reactions:
            if str(r.emoji) == emoji or r.emoji.name == emoji:
                reaction = r
                break

        if not reaction:
            return {"participants": [], "total_reactions": 0, "message": message}

        users = [u async for u in reaction.users()]
        total_reactions = len(users)
        for user in users:
            if user.bot:
                continue
            participants[str(user.id)] = {
                "id": str(user.id),
                "username": user.display_name,
                "reactions": 1
            }

    return {
        "participants": list(participants.values()),
        "total_reactions": total_reactions,
        "message": message
    }


async def perform_roll(bot, channel_id: int, message_id: str, emoji: str, reply_channel):
    """Провести ролл и отправить результаты."""
    try:
        result = await fetch_reactors(bot, channel_id, int(message_id), emoji)

        if not result:
            await reply_channel.send("❌ Не удалось найти сообщение или реакции.")
            remove_active_roll(message_id)
            return

        participants = result["participants"]
        total_reactions = result["total_reactions"]

        if not participants:
            embed = create_roll_result_embed(None, [], 0)
            await reply_channel.send(embed=embed)
            remove_active_roll(message_id)
            return

        # Случайный победитель
        winner = random.choice(participants)

        save_roll_result(message_id, winner["id"], winner["username"], len(participants))

        embed = create_roll_result_embed(winner, participants, total_reactions)
        await reply_channel.send(embed=embed)

        remove_active_roll(message_id)
    except Exception as e:
        print(f"Ошибка при проведении ролла: {e}")
        remove_active_roll(message_id)


async def setup(bot):
    bot.tree.add_command(RollGroup(bot))


class RollGroup(app_commands.Group):
    def __init__(self, bot):
        super().__init__(name="roll", description="Ролл среди участников")
        self.bot = bot

    @app_commands.command(name="reak", description="Ролл среди тех, кто поставил реакцию на сообщение")
    @app_commands.describe(
        message="Ссылка на сообщение или ID сообщения",
        emoji="Эмодзи реакции (по умолчанию ✅, 'all' — все реакции)",
        time_seconds="Время сбора реакций в секундах (по умолчанию 300)"
    )
    async def roll_reak(self, interaction: discord.Interaction, message: str, emoji: str = None, time_seconds: int = None):
        emoji = emoji or config.ROLL_EMOJI
        timeout = time_seconds or config.ROLL_COLLECT_TIMEOUT

        target = parse_message_target(message)
        if not target:
            await interaction.response.send_message(
                "❌ Неверный формат. Укажите ссылку на сообщение или ID сообщения.",
                ephemeral=True
            )
            return

        current_channel_id = interaction.channel.id
        current_guild_id = str(interaction.guild.id)
        target_channel_id = int(target["channel_id"]) if target["channel_id"] else current_channel_id
        target_guild_id = target["guild_id"] or current_guild_id

        # Проверяем существующее сообщение
        pre_check = await fetch_reactors(self.bot, target_channel_id, int(target["message_id"]), emoji)
        if not pre_check:
            await interaction.response.send_message(
                "❌ Не удалось найти сообщение. Проверьте ссылку/ID и доступ бота к каналу.",
                ephemeral=True
            )
            return

        # Проверяем нет ли уже ролла
        existing = get_active_roll(target["message_id"])
        if existing:
            await interaction.response.send_message(
                "❌ На это сообщение уже запущен ролл!",
                ephemeral=True
            )
            return

        import time
        expires_at = time.time() + timeout
        create_roll(target["message_id"], str(target_channel_id), target_guild_id, emoji, expires_at, False, str(interaction.user.id))

        # Подтверждение
        timeout_min = timeout // 60
        timeout_sec = timeout % 60
        time_str = f"{timeout_min} мин {timeout_sec} сек" if timeout_min > 0 else f"{timeout_sec} сек"

        confirm_embed = discord.Embed(
            color=0x5865F2,
            title="🎲 РОЛЛ ПО РЕАКЦИЯМ ЗАПУЩЕН",
            description=(
                f"Ролл среди тех, кто поставил реакцию **{'любую' if emoji == 'all' else emoji}** "
                f"на [сообщение](https://discord.com/channels/{target_guild_id}/{target_channel_id}/{target['message_id']})\n\n"
                f"⏱️ Время сбора: **{time_str}**\n"
                f"👥 Уже участников: **{len(pre_check['participants'])}**\n\n"
                f"Ставьте реакции! Результаты будут подведены автоматически."
            ),
            timestamp=discord.utils.utcnow()
        )
        confirm_embed.add_field(name="Организатор", value=f"<@{interaction.user.id}>", inline=True)
        confirm_embed.set_footer(text=f"ID сообщения: {target['message_id']}")

        await interaction.response.send_message(embed=confirm_embed)

        # Таймер
        async def delayed_roll():
            await asyncio.sleep(timeout)
            roll = get_active_roll(target["message_id"])
            if roll:
                channel = self.bot.get_channel(current_channel_id) or await self.bot.fetch_channel(current_channel_id)
                await perform_roll(self.bot, target_channel_id, target["message_id"], emoji, channel)

        asyncio.create_task(delayed_roll())

    @app_commands.command(name="reak_emergency", description="⚡ Аварийный ролл — мгновенный результат")
    @app_commands.describe(
        message="Ссылка на сообщение или ID сообщения",
        emoji="Эмодзи реакции (по умолчанию ✅, 'all' — все реакции)"
    )
    async def roll_emergency(self, interaction: discord.Interaction, message: str, emoji: str = None):
        emoji = emoji or config.ROLL_EMOJI

        target = parse_message_target(message)
        if not target:
            await interaction.response.send_message(
                "❌ Неверный формат. Укажите ссылку на сообщение или ID сообщения.",
                ephemeral=True
            )
            return

        current_channel_id = interaction.channel.id
        current_guild_id = str(interaction.guild.id)
        target_channel_id = int(target["channel_id"]) if target["channel_id"] else current_channel_id
        target_guild_id = target["guild_id"] or current_guild_id

        pre_check = await fetch_reactors(self.bot, target_channel_id, int(target["message_id"]), emoji)
        if not pre_check:
            await interaction.response.send_message(
                "❌ Не удалось найти сообщение. Проверьте ссылку/ID и доступ бота к каналу.",
                ephemeral=True
            )
            return

        emergency_embed = discord.Embed(
            color=0xFF0000,
            title="⚡ АВАРИЙНЫЙ РОЛЛ",
            description=(
                f"Мгновенный ролл среди тех, кто поставил реакцию **{'любую' if emoji == 'all' else emoji}** "
                f"на [сообщение](https://discord.com/channels/{target_guild_id}/{target_channel_id}/{target['message_id']})\n\n"
                f"👥 Участников: **{len(pre_check['participants'])}**\n\n"
                f"Результаты подводятся **прямо сейчас**!"
            ),
            timestamp=discord.utils.utcnow()
        )

        await interaction.response.send_message(embed=emergency_embed)

        remove_active_roll(target["message_id"])
        await perform_roll(self.bot, target_channel_id, target["message_id"], emoji, interaction.channel)

    @app_commands.command(name="cancel", description="Отменить активный ролл")
    async def roll_cancel(self, interaction: discord.Interaction):
        active_rolls = get_all_active_rolls()
        current_channel_id = str(interaction.channel.id)

        if not active_rolls:
            await interaction.response.send_message("❌ Нет активных роллов.", ephemeral=True)
            return

        channel_rolls = [r for r in active_rolls if r["channel_id"] == current_channel_id]
        if not channel_rolls:
            roll_list = "\n".join(
                f"• Сообщение <https://discord.com/channels/{r['guild_id']}/{r['channel_id']}/{r['message_id']}> — <@{r['creator_id']}>"
                for r in active_rolls
            )
            await interaction.response.send_message(
                f"❌ В этом канале нет активных роллов.\n\nАктивные роллы:\n{roll_list}",
                ephemeral=True
            )
            return

        cancelled = 0
        for roll in channel_rolls:
            if roll["creator_id"] != str(interaction.user.id):
                if config.MODERATOR_ROLE_ID:
                    member = await interaction.guild.fetch_member(interaction.user.id)
                    if config.MODERATOR_ROLE_ID not in [r.id for r in member.roles]:
                        continue
            remove_active_roll(roll["message_id"])
            cancelled += 1

        if cancelled == 0:
            await interaction.response.send_message(
                "❌ Вы можете отменить только свои роллы. Модераторы могут отменить любые.",
                ephemeral=True
            )
        else:
            await interaction.response.send_message(f"✅ Отменено роллов: **{cancelled}**")
