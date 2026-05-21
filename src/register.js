require('dotenv').config();
const { REST, Routes } = require('discord.js');

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

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registering ${commands.length} application commands...`);

    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(c => c.data.toJSON()) }
    );

    console.log(`Successfully registered ${data.length} global commands.`);
  } catch (error) {
    console.error('Error:', error);
  }
})();
