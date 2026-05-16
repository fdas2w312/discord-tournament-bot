import discord
from discord.ext import commands
from config import config
from database.db import get_db
from tasks.background import start_background_tasks

# Инициализация БД
get_db()

# Создание бота
intents = discord.Intents.default()
intents.guilds = True
intents.guild_messages = True
intents.message_content = True
intents.reactions = True
intents.members = True

bot = commands.Bot(command_prefix="!", intents=intents)


@bot.event
async def on_ready():
    print(f"✅ Бот {bot.user} запущен!")

    # Регистрация слеш-команд
    guild = discord.Object(id=config.GUILD_ID)

    # Импортируем команды
    from commands.afk import AFKGroup
    from commands.inactive import InactiveGroup
    from commands.status import StatusCommand
    from commands.roll import RollGroup

    bot.tree.clear_commands(guild=guild)

    # AFK
    afk_group = AFKGroup()
    bot.tree.add_command(afk_group, guild=guild)

    # Inactive
    inactive_group = InactiveGroup()
    bot.tree.add_command(inactive_group, guild=guild)

    # Status
    status_cmd = StatusCommand()
    bot.tree.add_command(status_cmd, guild=guild)

    # Roll
    roll_group = RollGroup(bot)
    bot.tree.add_command(roll_group, guild=guild)

    try:
        synced = await bot.tree.sync(guild=guild)
        print(f"📝 Синхронизировано команд: {len(synced)}")
        for cmd in synced:
            print(f"   /{cmd.name}")
    except Exception as e:
        print(f"❌ Ошибка синхронизации команд: {e}")

    # Запуск фоновых задач
    await start_background_tasks(bot)

    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.watching, name="📋 AFK/Inactive"))


@bot.event
async def on_interaction(interaction: discord.Interaction):
    if interaction.type == discord.InteractionType.application_command:
        try:
            await bot.tree.call(interaction)
        except Exception as e:
            print(f"Ошибка команды: {e}")
            if not interaction.response.is_done():
                await interaction.response.send_message("❌ Произошла ошибка.", ephemeral=True)
            else:
                await interaction.followup.send("❌ Произошла ошибка.", ephemeral=True)


if __name__ == "__main__":
    if not config.DISCORD_TOKEN:
        print("❌ DISCORD_TOKEN не установлен! Проверьте .env или переменные окружения.")
        exit(1)

    bot.run(config.DISCORD_TOKEN)
