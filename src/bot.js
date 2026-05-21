require('dotenv').config();

// Устанавливаем часовой пояс по умолчанию (Москва)
if (!process.env.TZ) process.env.TZ = 'Europe/Moscow';

const { Client, GatewayIntentBits, Partials, Events, Collection, MessageFlags } = require('discord.js');
const { connect } = require('./database/connection');
const Scheduler = require('./utils/scheduler');

const commands = [
  require('./commands/tournament'),
  require('./commands/warning'),
  require('./commands/roll'),
  require('./commands/afk'),
  require('./commands/inactive'),
  require('./commands/status'),
  require('./commands/message'),
  require('./commands/voice-message')
];

const interactionHandler = require('./handlers/interactions');
const selectMenuHandler = require('./handlers/selectMenu');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User
  ]
});

client.commands = new Collection();
for (const cmd of commands) {
  client.commands.set(cmd.data.name, cmd);
}

client.once(Events.ClientReady, async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);

  // Регистрация глобальных команд (работают на всех серверах)
  try {
    const rest = new (require('discord.js').REST)({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const clientId = process.env.CLIENT_ID;

    if (clientId) {
      console.log('[Commands] Deleting old global commands...');
      await rest.put(
        require('discord.js').Routes.applicationCommands(clientId),
        { body: [] }
      );
      console.log('[Commands] Old global commands deleted.');

      // Зарегистрировать глобальные команды
      const commandData = commands.map(c => c.data.toJSON());
      await rest.put(
        require('discord.js').Routes.applicationCommands(clientId),
        { body: commandData }
      );
      console.log(`[Commands] Registered ${commandData.length} global commands.`);
    } else {
      console.warn('[Commands] CLIENT_ID not set, skipping command registration.');
    }
  } catch (err) {
    console.error('[Commands] Error during command registration:', err);
  }

  // Удалить старые guild-команды тоже (если были)
  try {
    const rest = new (require('discord.js').REST)({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (clientId && guildId) {
      await rest.put(
        require('discord.js').Routes.applicationGuildCommands(clientId, guildId),
        { body: [] }
      );
      console.log('[Commands] Old guild commands cleaned up.');
    }
  } catch {}

  await connect();

  const scheduler = new Scheduler(client);
  scheduler.start();

  client.scheduler = scheduler;

  console.log('[Bot] Ready!');
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
    }
    else if (interaction.isButton()) {
      await interactionHandler.handleButton(interaction);
    }
    else if (interaction.isModalSubmit()) {
      await interactionHandler.handleModal(interaction);
    }
    else if (interaction.isStringSelectMenu()) {
      await selectMenuHandler.handleSelectMenu(interaction);
    }
    else if (interaction.isUserSelectMenu()) {
      await interactionHandler.handleButton(interaction);
    }
    else if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command || !command.autocomplete) return;
      await command.autocomplete(interaction);
    }
  } catch (error) {
    console.error('[Error]', error);

    // Для autocomplete нельзя использовать reply — только respond
    if (interaction.isAutocomplete()) {
      try {
        await interaction.respond([]);
      } catch {}
      return;
    }

    const errorEmbed = {
      embeds: [{
        title: 'Ошибка',
        description: 'Произошла ошибка при выполнении команды',
        color: 0xED4245
      }],
      flags: MessageFlags.Ephemeral
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorEmbed);
      } else {
        await interaction.reply(errorEmbed);
      }
    } catch {}
  }
});

client.login(process.env.DISCORD_TOKEN);
