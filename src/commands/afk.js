const { SlashCommandBuilder } = require('discord.js');
const AFK = require('../models/AFK');
const Inactive = require('../models/Inactive');
const { COLORS, createEmbed, formatDate } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('AFK статус')
    .addSubcommand(sub =>
      sub.setName('on')
        .setDescription('Встать в AFK')
        .addIntegerOption(opt =>
          opt.setName('время')
            .setDescription('Время в минутах')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1440))
    )
    .addSubcommand(sub =>
      sub.setName('off')
        .setDescription('Выйти из AFK')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'on':
        return handleOn(interaction);
      case 'off':
        return handleOff(interaction);
    }
  }
};

async function handleOn(interaction) {
  const duration = interaction.options.getInteger('время');

  const existing = await AFK.findOne({
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    active: true
  });

  if (existing) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Вы уже в AFK. Сначала выйдите через /afk off', color: COLORS.ERROR })], ephemeral: true });
  }

  const afk = await AFK.create({
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    durationMinutes: duration,
    active: true
  });

  const embed = createEmbed({
    title: 'AFK включён',
    description: `Вы ушли в AFK на **${duration} мин.**\nВернётесь автоматически через ${duration} мин. или используйте /afk off`,
    color: COLORS.AFK
  });

  return interaction.reply({ embeds: [embed] });
}

async function handleOff(interaction) {
  const afk = await AFK.findOneAndUpdate(
    { guildId: interaction.guild.id, userId: interaction.user.id, active: true },
    { active: false },
    { new: true }
  );

  if (!afk) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Вы не в AFK', color: COLORS.ERROR })], ephemeral: true });
  }

  const embed = createEmbed({
    title: 'AFK выключен',
    description: 'Вы вернулись из AFK',
    color: COLORS.SUCCESS
  });

  return interaction.reply({ embeds: [embed] });
}
