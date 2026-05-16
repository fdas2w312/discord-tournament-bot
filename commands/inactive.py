import discord
from discord import app_commands
from database.db import set_inactive_status, remove_inactive_status, get_inactive_status
from utils.embeds import create_inactive_confirm_embed, create_remove_status_embed
from config import config


def parse_date(date_str: str) -> str | None:
    """Парсинг даты. Поддерживает DD.MM.YYYY и YYYY-MM-DD. Возвращает YYYY-MM-DD или None."""
    import re
    dmy = re.match(r"^(\d{2})\.(\d{2})\.(\d{4})$", date_str)
    if dmy:
        day, month, year = dmy.groups()
        return f"{year}-{month}-{day}"
    ymd = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", date_str)
    if ymd:
        return date_str
    return None


async def setup(bot):
    bot.tree.add_command(InactiveGroup())


class InactiveGroup(app_commands.Group):
    def __init__(self):
        super().__init__(name="inactive", description="Inactive статус")

    @app_commands.command(name="set", description="Уйти в инактив на указанный период")
    @app_commands.describe(
        from_date="Начальная дата (ДД.ММ.ГГГГ или YYYY-MM-DD)",
        to_date="Конечная дата (ДД.ММ.ГГГГ или YYYY-MM-DD)"
    )
    async def inactive_set(self, interaction: discord.Interaction, from_date: str, to_date: str):
        user_id = str(interaction.user.id)
        username = interaction.user.display_name
        guild_id = str(interaction.guild.id)

        parsed_from = parse_date(from_date)
        parsed_to = parse_date(to_date)

        if not parsed_from:
            await interaction.response.send_message(
                "❌ Неверный формат начальной даты. Используйте `ДД.ММ.ГГГГ` или `YYYY-MM-DD`.",
                ephemeral=True
            )
            return

        if not parsed_to:
            await interaction.response.send_message(
                "❌ Неверный формат конечной даты. Используйте `ДД.ММ.ГГГГ` или `YYYY-MM-DD`.",
                ephemeral=True
            )
            return

        from datetime import datetime
        try:
            from_ts = datetime.strptime(parsed_from, "%Y-%m-%d").timestamp()
            to_ts = datetime.strptime(parsed_to, "%Y-%m-%d").timestamp()
        except ValueError:
            await interaction.response.send_message("❌ Неверные даты.", ephemeral=True)
            return

        if from_ts > to_ts:
            await interaction.response.send_message(
                "❌ Начальная дата не может быть позже конечной.",
                ephemeral=True
            )
            return

        existing = get_inactive_status(user_id)
        if existing:
            await interaction.response.send_message(
                "❌ У вас уже есть Inactive статус. Используйте `/inactive off` чтобы снять его.",
                ephemeral=True
            )
            return

        set_inactive_status(user_id, username, parsed_from, parsed_to, guild_id)

        # Установить роль Inactive
        if config.INACTIVE_ROLE_ID:
            try:
                member = await interaction.guild.fetch_member(interaction.user.id)
                await member.add_roles(discord.Object(id=config.INACTIVE_ROLE_ID))
            except Exception as e:
                print(f"Ошибка установки Inactive роли: {e}")

        embed = create_inactive_confirm_embed(username, parsed_from, parsed_to)
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="off", description="Снять Inactive статус досрочно")
    async def inactive_off(self, interaction: discord.Interaction):
        user_id = str(interaction.user.id)
        username = interaction.user.display_name

        existing = get_inactive_status(user_id)
        if not existing:
            await interaction.response.send_message(
                "❌ У вас нет активного Inactive статуса.",
                ephemeral=True
            )
            return

        remove_inactive_status(user_id)

        # Снять роль Inactive
        if config.INACTIVE_ROLE_ID:
            try:
                member = await interaction.guild.fetch_member(interaction.user.id)
                await member.remove_roles(discord.Object(id=config.INACTIVE_ROLE_ID))
            except Exception as e:
                print(f"Ошибка снятия Inactive роли: {e}")

        embed = create_remove_status_embed("inactive", username)
        await interaction.response.send_message(embed=embed)
