const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
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
        .setDescription('Добавить вопрос в анкету турнира')
        .addStringOption(opt =>
          opt.setName('турнир')
            .setDescription('Название турнира')
            .setRequired(true)
            .setAutocomplete(true))
        .addStringOption(opt =>
          opt.setName('вопрос')
            .setDescription('Текст вопроса')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('стиль')
            .setDescription('Стиль ответа')
            .addChoices(
              { name: 'Короткий', value: 'SHORT' },
              { name: 'Длинный', value: 'PARAGRAPH' }
            ))
    )
    .addSubcommand(sub =>
      sub.setName('settings')
        .setDescription('Настройки ролей для турниров')
        .addRoleOption(opt =>
          opt.setName('админ_роль')
            .setDescription('Добавить роль администрации турнира'))
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
    const query = {
      guildId: interaction.guild.id
    };

    // Безопасный поиск по tournamentId — только если focused — реальное число
    const focusedNum = Number(focused);
    if (focused.trim() !== '' && !isNaN(focusedNum) && Number.isInteger(focusedNum)) {
      query.$or = [
        { name: { $regex: focused, $options: 'i' } },
        { tournamentId: focusedNum }
      ];
    } else {
      query.name = { $regex: focused, $options: 'i' };
    }

    const tournaments = await Tournament.find(query).limit(25);
    return interaction.respond(
      tournaments.map(t => ({ name: `#${t.tournamentId} — ${t.name}`, value: t.tournamentId.toString() }))
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
    if (!hasAdmin && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'У вас нет прав для создания турниров', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
    }
  }

  const existing = await Tournament.findOne({ guildId: interaction.guild.id, name, status: { $ne: 'completed' } });
  if (existing) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: `Турнир "${name}" уже существует`, color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  let teamSize;
  if (format === 'custom') {
    if (!customSize) {
      return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Укажите custom_размер для формата Custom', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
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
      { name: 'ID', value: `#${tournament.tournamentId}`, inline: true },
      { name: 'Статус', value: 'Открыт для регистрации', inline: true },
      { name: 'Размер команды', value: `${teamSize} игрок(ов)`, inline: true }
    ]
  });

  return interaction.reply({ embeds: [embed] });
}

async function handlePanel(interaction) {
  const tournamentInput = interaction.options.getString('турнир');
  // Попробуем найти по tournamentId (число) или по названию
  let tournament;
  const inputNum = Number(tournamentInput);
  if (!isNaN(inputNum) && Number.isInteger(inputNum)) {
    tournament = await Tournament.findOne({ guildId: interaction.guild.id, tournamentId: inputNum, status: { $ne: 'completed' } });
  }
  if (!tournament) {
    tournament = await Tournament.findOne({ guildId: interaction.guild.id, name: tournamentInput, status: { $ne: 'completed' } });
  }

  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: `Турнир не найден`, color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  const teamCount = await Team.countDocuments({ tournamentId: tournament._id, status: { $in: ['pending', 'approved'] } });

  const embed = createEmbed({
    title: `Турнир #${tournament.tournamentId}: ${tournament.name}`,
    description: `Формат: ${tournament.teamSize}x${tournament.teamSize}\nСтатус: ${tournament.status === 'open' ? '🟢 Открыт' : tournament.status === 'ongoing' ? '🟡 Идёт' : '🔴 Завершён'}\nЗарегистрировано команд: ${teamCount}`,
    color: COLORS.TOURNAMENT,
    footer: 'Нажмите кнопку ниже для действий'
  });

  const tid = tournament.tournamentId;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tournament_participate_${tid}`)
      .setLabel('Участвовать')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🎮'),
    new ButtonBuilder()
      .setCustomId(`tournament_teams_${tid}`)
      .setLabel('Команды')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📋'),
    new ButtonBuilder()
      .setCustomId(`tournament_manage_${tid}`)
      .setLabel('Управление')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⚙️')
  );

  return interaction.reply({ embeds: [embed], components: [row1] });
}

// Неограниченное количество вопросов — добавляем по одному через команду
async function handleAsk(interaction) {
  const tournamentInput = interaction.options.getString('турнир');
  const question = interaction.options.getString('вопрос');
  const style = interaction.options.getString('стиль') || 'SHORT';

  let tournament;
  const inputNum = Number(tournamentInput);
  if (!isNaN(inputNum) && Number.isInteger(inputNum)) {
    tournament = await Tournament.findOne({ guildId: interaction.guild.id, tournamentId: inputNum, status: { $ne: 'completed' } });
  }
  if (!tournament) {
    tournament = await Tournament.findOne({ guildId: interaction.guild.id, name: tournamentInput, status: { $ne: 'completed' } });
  }

  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: `Турнир не найден`, color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  const settings = await Settings.findOne({ guildId: interaction.guild.id });
  if (settings?.tournamentAdminRoles?.length) {
    const memberRoles = interaction.member.roles.cache.map(r => r.id);
    const hasAdmin = settings.tournamentAdminRoles.some(r => memberRoles.includes(r));
    if (!hasAdmin && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'У вас нет прав для создания анкеты', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
    }
  }

  if (!tournament.questionnaire) tournament.questionnaire = [];
  tournament.questionnaire.push({
    label: question,
    style,
    required: true
  });
  await tournament.save();

  const questionList = tournament.questionnaire.map((q, i) => `${i + 1}. ${q.label} (${q.style === 'PARAGRAPH' ? 'Длинный' : 'Короткий'})`).join('\n');

  const embed = createEmbed({
    title: 'Вопрос добавлен!',
    description: `**Турнир:** #${tournament.tournamentId} ${tournament.name}\n**Всего вопросов:** ${tournament.questionnaire.length}\n\n${questionList}`,
    color: COLORS.SUCCESS,
    footer: 'Используйте /tournament ask чтобы добавить ещё вопросы'
  });

  return interaction.reply({ embeds: [embed] });
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
    updates.push(`Админ-роль добавлена: ${adminRole.name}`);
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
      flags: MessageFlags.Ephemeral
    });
  }

  await settings.save();
  return interaction.reply({
    embeds: [createEmbed({ title: 'Настройки обновлены', description: updates.join('\n'), color: COLORS.SUCCESS })],
    flags: MessageFlags.Ephemeral
  });
}
