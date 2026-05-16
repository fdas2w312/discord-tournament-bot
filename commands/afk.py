import discord
from discord import app_commands
from database.db import set_afk_status, remove_afk_status, get_afk_status
from utils.embeds import create_afk_confirm_embed, create_remove_status_embed
from config import config


async def setup(bot):
    bot.tree.add_command(AFKGroup())


class AFKGroup(app_commands.Group):
    def __init__(self):
        super().__init__(name="afk", description="AFK статус")

    @app_commands.command(name="set", description="Уйти в AFK на указанное время")
    @app_commands.describe(minutes="Время в минутах (1-1440)")
    async def afk_set(self, interaction: discord.Interaction, minutes: int):
        if minutes < 1 or minutes > 1440:
            await interaction.response.send_message("❌ Время от 1 до 1440 минут.", ephemeral=True)
            return

        user_id = str(interaction.user.id)
        username = interaction.user.display_name
        guild_id = str(interaction.guild.id)

        existing = get_afk_status(user_id)
        if existing:
            await interaction.response.send_message(
                "❌ У вас уже есть AFK статус. Используйте `/afk off` чтобы снять его.",
                ephemeral=True
            )
            return

        result = set_afk_status(user_id, username, minutes, guild_id)

        # Установить роль AFK
        if config.AFK_ROLE_ID:
            try:
                member = await interaction.guild.fetch_member(interaction.user.id)
                await member.add_roles(discord.Object(id=config.AFK_ROLE_ID))
            except Exception as e:
                print(f"Ошибка установки AFK роли: {e}")

        embed = create_afk_confirm_embed(username, minutes, result["expires_at"])
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="off", description="Снять AFK статус досрочно")
    async def afk_off(self, interaction: discord.Interaction):
        user_id = str(interaction.user.id)
        username = interaction.user.display_name

        existing = get_afk_status(user_id)
        if not existing:
            await interaction.response.send_message("❌ У вас нет активного AFK статуса.", ephemeral=True)
            return

        remove_afk_status(user_id)

        # Снять роль AFK
        if config.AFK_ROLE_ID:
            try:
                member = await interaction.guild.fetch_member(interaction.user.id)
                await member.remove_roles(discord.Object(id=config.AFK_ROLE_ID))
            except Exception as e:
                print(f"Ошибка снятия AFK роли: {e}")

        embed = create_remove_status_embed("afk", username)
        await interaction.response.send_message(embed=embed)
