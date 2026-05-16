import discord
from discord import app_commands
from database.db import get_all_afk_statuses, get_all_inactive_statuses
from utils.embeds import create_status_embed


async def setup(bot):
    bot.tree.add_command(StatusCommand())


class StatusCommand(app_commands.Command):
    def __init__(self):
        super().__init__(
            name="status",
            description="Показать таблицу AFK/Inactive участников",
            callback=self._callback
        )

    async def _callback(self, interaction: discord.Interaction):
        afk_list = get_all_afk_statuses()
        inactive_list = get_all_inactive_statuses()

        embed = create_status_embed(afk_list, inactive_list)
        await interaction.response.send_message(embed=embed)
