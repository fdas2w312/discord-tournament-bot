const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Settings = require('../models/Settings');
const { COLORS, createEmbed } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('Управление турнирами')
    .addSubcommand(sub =>
      sub.setName('create')
        .setDescription('Создать турнир')
        .addStringOption(opt =>
          opt.setName('название')
            .setDescription('Название турнира')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('формат')
            .setDescription('Формат турнира')
            .setRequired(true)
            .addChoices(
              { name: '1x1', value: '1' },
              { name: '2x2', value: '2' },
              { name: '3x3', value: '3' },
              { name: '5x5', value: '5' },
              { name: 'Custom', value: 'custom' }
            ))
        .addIntegerOption(opt =>
          opt.setName('custom_размер')
            .setDescription('Размер команды для custom формата')
            .setMinValue(1)
            .setMaxValue(25))
    )
    .addSubcommand(sub =>
      sub.setName('panel')
        .setDescription('Открыть панель турнира')
        .addStringOption(opt =>
          opt.setName('турнир')
            .setDescription('Название турнира')
            .setRequired(true)
            .setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub.setName('ask')
        .setDescription('Создать анкету для турнира')
        .addStringOption(opt =>
          opt.setName('турнир')
            .setDescription('Название турнира')
            .setRequired(true)
            .setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub.setName('settings')
        .setDescription('Настройки ролей для турниров')
        .addRoleOption(opt =>
          opt.setName('админ_роль')
            .setDescription('Роль администрации турнира'))
        .addRoleOption(opt =>
          opt.setName('участник_роль')
            .setDescription('Роль участников турнира'))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'create':
        return handleCreate(interaction);
      case 'panel':
        return handlePanel(interaction);
      case 'ask':
        return handleAsk(interaction);
      case 'settings':
        return handleSettings(interaction);
    }
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const tournaments = await Tournament.find({
      guildId: interaction.guild.id,
      name: { $regex: focused, $options: 'i' }
    }).limit(25);
    return interaction.respond(
      tournaments.map(t => ({ name: t.name, value: t.name }))
    );
  }
};

async function handleCreate(interaction) {
  const name = interaction.options.getString('название');
  const format = interaction.options.getString('формат');
  const customSize = interaction.options.getInteger('custom_размер');

  const settings = await Settings.findOne({ guildId: interaction.guild.id });
  if (settings?.tournamentAdminRoles?.length) {
    const memberRoles = interaction.member.roles.cache.map(r => r.id);
    const hasAdmin = settings.tournamentAdminRoles.some(r => memberRoles.includes(r));
    if (!hasAdmin && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'У вас нет прав для создания турниров', color: COLORS.ERROR })], ephemeral: true });
    }
  }

  const existing = await Tournament.findOne({ guildId: interaction.guild.id, name, status: { $ne: 'completed' } });
  if (existing) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: `Турнир "${name}" уже существует`, color: COLORS.ERROR })], ephemeral: true });
  }

  let teamSize;
  if (format === 'custom') {
    if (!customSize) {
      return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Укажите custom_размер для формата Custom', color: COLORS.ERROR })], ephemeral: true });
    }
    teamSize = customSize;
  } else {
    teamSize = parseInt(format, 10);
  }

  const tournament = await Tournament.create({
    guildId: interaction.guild.id,
    name,
    teamSize,
    customSize: format === 'custom' ? customSize : null,
    adminRoles: settings?.tournamentAdminRoles || [],
    participantRole: settings?.tournamentParticipantRole || null
  });

  const embed = createEmbed({
    title: 'Турнир создан!',
    description: `**${name}** — формат ${teamSize}x${teamSize}`,
    color: COLORS.SUCCESS,
    fields: [
      { name: 'ID', value: tournament._id.toString(), inline: true },
      { name: 'Статус', value: 'Открыт для регистрации', inline: true },
      { name: 'Размер команды', value: `${teamSize} игрок(ов)`, inline: true }
    ]
  });

  return interaction.reply({ embeds: [embed] });
}

async function handlePanel(interaction) {
  const name = interaction.options.getString('турнир');
  const tournament = await Tournament.findOne({ guildId: interaction.guild.id, name, status: { $ne: 'completed' } });

  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: `Турнир "${name}" не найден`, color: COLORS.ERROR })], ephemeral: true });
  }

  const teamCount = await Team.countDocuments({ tournamentId: tournament._id, status: { $in: ['pending', 'approved'] } });

  const embed = createEmbed({
    title: `Турнир: ${tournament.name}`,
    description: `Формат: ${tournament.teamSize}x${tournament.teamSize}\nСтатус: ${tournament.status === 'open' ? '🟢 Открыт' : tournament.status === 'ongoing' ? '🟡 Идёт' : '🔴 Завершён'}\nЗарегистрировано команд: ${teamCount}`,
    color: COLORS.TOURNAMENT,
    footer: 'Нажмите кнопку ниже для действий'
  });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tournament_participate_${tournament._id}`)
      .setLabel('Участвовать')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎮'),
    new ButtonBuilder()
      .setCustomId(`tournament_teams_${tournament._id}`)
      .setLabel('Команды')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📋'),
    new ButtonBuilder()
      .setCustomId(`tournament_manage_${tournament._id}`)
      .setLabel('Управление')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⚙️')
  );

  return interaction.reply({ embeds: [embed], components: [row1] });
}

async function handleAsk(interaction) {
  const name = interaction.options.getString('турнир');
  const tournament = await Tournament.findOne({ guildId: interaction.guild.id, name, status: { $ne: 'completed' } });

  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: `Турнир "${name}" не найден`, color: COLORS.ERROR })], ephemeral: true });
  }

  const settings = await Settings.findOne({ guildId: interaction.guild.id });
  if (settings?.tournamentAdminRoles?.length) {
    const memberRoles = interaction.member.roles.cache.map(r => r.id);
    const hasAdmin = settings.tournamentAdminRoles.some(r => memberRoles.includes(r));
    if (!hasAdmin && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'У вас нет прав для создания анкеты', color: COLORS.ERROR })], ephemeral: true });
    }
  }

  const modal = new ModalBuilder()
    .setCustomId(`tournament_ask_modal_${tournament._id}`)
    .setTitle(`Анкета для "${tournament.name}"`);

  for (let i = 0; i < 5; i++) {
    const input = new TextInputBuilder()
      .setCustomId(`question_${i}`)
      .setLabel(`Вопрос ${i + 1} (оставьте пустым если не нужен)`)
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder('Введите текст вопроса...');
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return interaction.showModal(modal);
}

async function handleSettings(interaction) {
  const adminRole = interaction.options.getRole('админ_роль');
  const participantRole = interaction.options.getRole('участник_роль');

  let settings = await Settings.findOne({ guildId: interaction.guild.id });
  if (!settings) {
    settings = await Settings.create({ guildId: interaction.guild.id });
  }

  const updates = [];
  if (adminRole) {
    if (!settings.tournamentAdminRoles.includes(adminRole.id)) {
      settings.tournamentAdminRoles.push(adminRole.id);
    }
    updates.push(`Админ-роль: ${adminRole.name}`);
  }
  if (participantRole) {
    settings.tournamentParticipantRole = participantRole.id;
    updates.push(`Роль участников: ${participantRole.name}`);
  }

  if (updates.length === 0) {
    const currentAdmins = settings.tournamentAdminRoles.length
      ? settings.tournamentAdminRoles.map(r => `<@&${r}>`).join(', ')
      : 'Не заданы';
    const currentPart = settings.tournamentParticipantRole
      ? `<@&${settings.tournamentParticipantRole}>`
      : 'Не задана';

    return interaction.reply({
      embeds: [createEmbed({
        title: 'Настройки турниров',
        description: `Админ-роли: ${currentAdmins}\nРоль участников: ${currentPart}`,
        color: COLORS.INFO
      })],
      ephemeral: true
    });
  }

  await settings.save();
  return interaction.reply({
    embeds: [createEmbed({ title: 'Настройки обновлены', description: updates.join('\n'), color: COLORS.SUCCESS })],
    ephemeral: true
  });
}
