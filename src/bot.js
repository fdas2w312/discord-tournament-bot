require('dotenv').config();

const { Client, GatewayIntentBits, Partials, Events, Collection } = require('discord.js');
const { connect } = require('./database/connection');
const Scheduler = require('./utils/scheduler');

const commands = [
  require('./commands/tournament'),
  require('./commands/warning'),
  require('./commands/roll'),
  require('./commands/afk'),
  require('./commands/inactive'),
  require('./commands/status')
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
    const errorEmbed = {
      embeds: [{
        title: 'Ошибка',
        description: 'Произошла ошибка при выполнении команды',
        color: 0xED4245
      }],
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorEmbed).catch(() => {});
    } else {
      await interaction.reply(errorEmbed).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
