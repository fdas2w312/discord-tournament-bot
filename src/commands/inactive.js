const { SlashCommandBuilder } = require('discord.js');
const Inactive = require('../models/Inactive');
const { COLORS, createEmbed, formatDate } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inactive')
    .setDescription('Инактив')
    .addSubcommand(sub =>
      sub.setName('on')
        .setDescription('Уйти в инактив')
        .addStringOption(opt =>
          opt.setName('с')
            .setDescription('Дата начала (ДД.ММ.ГГГГ)')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('по')
            .setDescription('Дата окончания (ДД.ММ.ГГГГ)')
            .setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('off')
        .setDescription('Выйти из инактива')
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

function parseRuDate(s) {
  const parts = s.split('.');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? null : d;
}

async function handleOn(interaction) {
  const fromStr = interaction.options.getString('с');
  const toStr = interaction.options.getString('по');

  const startDate = parseRuDate(fromStr);
  const endDate = parseRuDate(toStr);

  if (!startDate || !endDate) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Неверный формат даты. Используйте ДД.ММ.ГГГГ', color: COLORS.ERROR })], ephemeral: true });
  }

  if (endDate <= startDate) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Дата окончания должна быть позже даты начала', color: COLORS.ERROR })], ephemeral: true });
  }

  const existing = await Inactive.findOne({
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    active: true
  });

  if (existing) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Вы уже в инактиве. Сначала выйдите через /inactive off', color: COLORS.ERROR })], ephemeral: true });
  }

  const inactive = await Inactive.create({
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    startDate,
    endDate,
    active: true
  });

  const embed = createEmbed({
    title: 'Инактив включён',
    description: `Вы ушли в инактив\n**С:** ${formatDate(startDate)}\n**По:** ${formatDate(endDate)}`,
    color: COLORS.INACTIVE
  });

  return interaction.reply({ embeds: [embed] });
}

async function handleOff(interaction) {
  const inactive = await Inactive.findOneAndUpdate(
    { guildId: interaction.guild.id, userId: interaction.user.id, active: true },
    { active: false },
    { new: true }
  );

  if (!inactive) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Вы не в инактиве', color: COLORS.ERROR })], ephemeral: true });
  }

  const embed = createEmbed({
    title: 'Инактив выключен',
    description: 'Вы вернулись из инактива',
    color: COLORS.SUCCESS
  });

  return interaction.reply({ embeds: [embed] });
}
