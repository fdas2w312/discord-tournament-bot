const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Settings = require('../models/Settings');
const { COLORS, createEmbed } = require('../utils/embedBuilder');

module.exports = {
  async handleButton(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('tournament_participate_')) {
      return handleParticipate(interaction, customId);
    }
    if (customId.startsWith('tournament_teams_')) {
      return handleTeams(interaction, customId);
    }
    if (customId.startsWith('tournament_manage_')) {
      return handleManage(interaction, customId);
    }
    if (customId.startsWith('tournament_select_members_')) {
      return handleMemberSelect(interaction, customId);
    }
    if (customId.startsWith('tournament_approve_')) {
      return handleApproveTeam(interaction, customId);
    }
    if (customId.startsWith('tournament_reject_')) {
      return handleRejectTeam(interaction, customId);
    }
    if (customId.startsWith('tournament_start_')) {
      return handleStartTournament(interaction, customId);
    }
    if (customId.startsWith('tournament_end_')) {
      return handleEndTournament(interaction, customId);
    }
    if (customId.startsWith('tournament_winners_')) {
      return handleWinnersSelect(interaction, customId);
    }
    if (customId.startsWith('roll_join_')) {
      return handleRollJoin(interaction, customId);
    }
  },

  async handleModal(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('tournament_ask_modal_')) {
      return handleAskModal(interaction, customId);
    }
    if (customId.startsWith('tournament_team_modal_')) {
      return handleTeamModal(interaction, customId);
    }
  }
};

async function handleParticipate(interaction, customId) {
  const tournamentId = customId.replace('tournament_participate_', '');
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Турнир не найден', color: COLORS.ERROR })], ephemeral: true });
  }

  if (tournament.status !== 'open') {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Регистрация на турнир закрыта', color: COLORS.ERROR })], ephemeral: true });
  }

  const selectMenu = new UserSelectMenuBuilder()
    .setCustomId(`tournament_select_members_${tournamentId}`)
    .setPlaceholder('Выберите участников команды')
    .setMinValues(1)
    .setMaxValues(tournament.teamSize - 1);

  const row = new ActionRowBuilder().addComponents(selectMenu);
  return interaction.reply({ content: 'Выберите участников вашей команды:', components: [row], ephemeral: true });
}

async function handleMemberSelect(interaction, customId) {
  const tournamentId = customId.replace('tournament_select_members_', '');
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Турнир не найден', color: COLORS.ERROR })], ephemeral: true });
  }

  const selectedMembers = interaction.users;
  const allMembers = [interaction.user, ...selectedMembers.values()];

  if (allMembers.length > tournament.teamSize) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: `Слишком много участников. Максимум: ${tournament.teamSize}`, color: COLORS.ERROR })], ephemeral: true });
  }

  if (tournament.questionnaire && tournament.questionnaire.length > 0) {
    const modal = new ModalBuilder()
      .setCustomId(`tournament_team_modal_${tournamentId}_${allMembers.map(m => m.id).join(',')}`)
      .setTitle('Анкета команды');

    tournament.questionnaire.forEach((q, i) => {
      const input = new TextInputBuilder()
        .setCustomId(`answer_${i}`)
        .setLabel(q.label.substring(0, 45))
        .setStyle(q.style === 'PARAGRAPH' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(q.required);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
    });

    return interaction.showModal(modal);
  }

  await registerTeam(tournament, allMembers, [], interaction);
}

async function handleTeamModal(interaction, customId) {
  const parts = customId.replace('tournament_team_modal_', '').split('_');
  const tournamentId = parts[0];
  const memberIds = parts.slice(1).join(',').split(',');

  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Турнир не найден', color: COLORS.ERROR })], ephemeral: true });
  }

  const answers = [];
  tournament.questionnaire.forEach((q, i) => {
    const value = interaction.fields.getTextInputValue(`answer_${i}`);
    if (value) {
      answers.push({ label: q.label, value });
    }
  });

  const allMembers = [interaction.user];
  for (const id of memberIds) {
    if (id !== interaction.user.id) {
      try {
        const user = await interaction.client.users.fetch(id);
        allMembers.push(user);
      } catch {}
    }
  }

  await registerTeam(tournament, allMembers, answers, interaction);
}

async function registerTeam(tournament, members, answers, interaction) {
  const teamName = `Команда ${interaction.user.username}`;

  const team = await Team.create({
    tournamentId: tournament._id,
    guildId: interaction.guild.id,
    name: teamName,
    captainId: interaction.user.id,
    members: members.map(m => m.id),
    status: 'pending',
    answers
  });

  const memberList = members.map(m => `<@${m.id}>`).join(', ');
  const embed = createEmbed({
    title: 'Заявка подана!',
    description: `**Турнир:** ${tournament.name}\n**Участники:** ${memberList}\n**Статус:** Ожидает одобрения`,
    color: COLORS.SUCCESS
  });

  if (tournament.participantRole) {
    for (const member of members) {
      try {
        const guildMember = await interaction.guild.members.fetch(member.id);
        await guildMember.roles.add(tournament.participantRole);
      } catch {}
    }
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleTeams(interaction, customId) {
  const tournamentId = customId.replace('tournament_teams_', '');
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Турнир не найден', color: COLORS.ERROR })], ephemeral: true });
  }

  const teams = await Team.find({ tournamentId: tournament._id, status: { $in: ['pending', 'approved'] } });

  if (teams.length === 0) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Команды', description: 'Пока нет зарегистрированных команд', color: COLORS.INFO })], ephemeral: true });
  }

  const fields = teams.map((team, i) => ({
    name: `${i + 1}. ${team.name} ${team.status === 'pending' ? '⏳' : '✅'}`,
    value: `Капитан: <@${team.captainId}>\nУчастники: ${team.members.map(m => `<@${m}>`).join(', ')}\nСтатус: ${team.status === 'pending' ? 'Ожидает' : 'Одобрена'}`,
    inline: false
  }));

  const embed = createEmbed({
    title: `📋 Команды — ${tournament.name}`,
    description: `Всего: ${teams.length} команд`,
    color: COLORS.TOURNAMENT,
    fields: fields.slice(0, 25)
  });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleManage(interaction, customId) {
  const tournamentId = customId.replace('tournament_manage_', '');
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Турнир не найден', color: COLORS.ERROR })], ephemeral: true });
  }

  const settings = await Settings.findOne({ guildId: interaction.guild.id });
  const memberRoles = interaction.member.roles.cache.map(r => r.id);
  const isAdmin = (settings?.tournamentAdminRoles?.some(r => memberRoles.includes(r))) ||
                  tournament.adminRoles.some(r => memberRoles.includes(r)) ||
                  interaction.member.permissions.has('Administrator');

  if (!isAdmin) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'У вас нет прав для управления турниром', color: COLORS.ERROR })], ephemeral: true });
  }

  const pendingTeams = await Team.find({ tournamentId: tournament._id, status: 'pending' });
  const approvedTeams = await Team.find({ tournamentId: tournament._id, status: 'approved' });

  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  if (pendingTeams.length > 0) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`tournament_approve_${tournamentId}`)
        .setLabel(`Одобрить (${pendingTeams.length})`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`tournament_reject_${tournamentId}`)
        .setLabel(`Удалить (${pendingTeams.length})`)
        .setStyle(ButtonStyle.Danger)
    );
  }

  if (tournament.status === 'open' && approvedTeams.length > 0) {
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`tournament_start_${tournamentId}`)
        .setLabel('Начать турнир')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('▶️')
    );
  }

  if (tournament.status === 'ongoing') {
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`tournament_end_${tournamentId}`)
        .setLabel('Завершить турнир')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🏁')
    );
  }

  if (tournament.status === 'ongoing' || tournament.status === 'completed') {
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`tournament_winners_${tournamentId}`)
        .setLabel('Объявить победителей')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🏆')
    );
  }

  const components = [];
  if (row1.components.length > 0) components.push(row1);
  if (row2.components.length > 0) components.push(row2);

  const embed = createEmbed({
    title: `⚙️ Управление — ${tournament.name}`,
    description: `Статус: ${tournament.status}\nОжидают одобрения: ${pendingTeams.length}\nОдобрено: ${approvedTeams.length}`,
    color: COLORS.TOURNAMENT
  });

  return interaction.reply({ embeds: [embed], components, ephemeral: true });
}

async function handleApproveTeam(interaction, customId) {
  const tournamentId = customId.replace('tournament_approve_', '');
  const pendingTeams = await Team.find({ tournamentId, status: 'pending' });

  if (pendingTeams.length === 0) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Нет команд', description: 'Нет команд, ожидающих одобрения', color: COLORS.INFO })], ephemeral: true });
  }

  const options = pendingTeams.slice(0, 25).map(t => ({
    label: `${t.name} (${t.members.length} участников)`,
    description: `Капитан: <@${t.captainId}>`,
    value: t._id.toString()
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`approve_select_${tournamentId}`)
    .setPlaceholder('Выберите команды для одобрения')
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  return interaction.reply({ content: 'Выберите команды для одобрения:', components: [row], ephemeral: true });
}

async function handleRejectTeam(interaction, customId) {
  const tournamentId = customId.replace('tournament_reject_', '');
  const pendingTeams = await Team.find({ tournamentId, status: 'pending' });

  if (pendingTeams.length === 0) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Нет команд', description: 'Нет команд, ожидающих удаления', color: COLORS.INFO })], ephemeral: true });
  }

  const options = pendingTeams.slice(0, 25).map(t => ({
    label: `${t.name} (${t.members.length} участников)`,
    description: `Капитан: <@${t.captainId}>`,
    value: t._id.toString()
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`reject_select_${tournamentId}`)
    .setPlaceholder('Выберите команды для удаления')
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  return interaction.reply({ content: 'Выберите команды для удаления:', components: [row], ephemeral: true });
}

async function handleStartTournament(interaction, customId) {
  const tournamentId = customId.replace('tournament_start_', '');
  const tournament = await Tournament.findById(tournamentId);

  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Турнир не найден', color: COLORS.ERROR })], ephemeral: true });
  }

  tournament.status = 'ongoing';
  await tournament.save();

  const approvedTeams = await Team.find({ tournamentId, status: 'approved' });

  const embed = createEmbed({
    title: `▶️ Турнир "${tournament.name}" начался!`,
    description: `Формат: ${tournament.teamSize}x${tournament.teamSize}\nУчаствующих команд: ${approvedTeams.length}`,
    color: COLORS.SUCCESS
  });

  return interaction.reply({ embeds: [embed] });
}

async function handleEndTournament(interaction, customId) {
  const tournamentId = customId.replace('tournament_end_', '');
  const tournament = await Tournament.findById(tournamentId);

  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Турнир не найден', color: COLORS.ERROR })], ephemeral: true });
  }

  tournament.status = 'completed';
  await tournament.save();

  const embed = createEmbed({
    title: `🏁 Турнир "${tournament.name}" завершён!`,
    description: 'Объявите победителей через кнопку "Объявить победителей"',
    color: COLORS.WARNING
  });

  return interaction.reply({ embeds: [embed] });
}

async function handleWinnersSelect(interaction, customId) {
  const tournamentId = customId.replace('tournament_winners_', '');
  const approvedTeams = await Team.find({ tournamentId, status: { $in: ['approved', 'eliminated'] } });

  if (approvedTeams.length === 0) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Нет команд для выбора победителя', color: COLORS.ERROR })], ephemeral: true });
  }

  const options = approvedTeams.slice(0, 25).map(t => ({
    label: t.name,
    description: `Капитан: <@${t.captainId}>`,
    value: t._id.toString()
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`winner_select_${tournamentId}`)
    .setPlaceholder('Выберите команду-победителя')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  return interaction.reply({ content: 'Выберите команду-победителя:', components: [row], ephemeral: true });
}

async function handleRollJoin(interaction, customId) {
  const Roll = require('../models/Roll');
  const rollId = customId.replace('roll_join_', '');
  const roll = await Roll.findById(rollId);

  if (!roll || roll.status !== 'active' || roll.type !== 'normal') {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Ролл уже завершён или не найден', color: COLORS.ERROR })], ephemeral: true });
  }

  if (roll.participants.includes(interaction.user.id)) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Вы уже участвуете', description: 'Вы уже зарегистрированы в этом ролле', color: COLORS.WARNING })], ephemeral: true });
  }

  roll.participants.push(interaction.user.id);
  await roll.save();

  return interaction.reply({ embeds: [createEmbed({ title: 'Вы участвуете!', description: `Ролл: ${roll.prize}\nУчастников: ${roll.participants.length}`, color: COLORS.SUCCESS })], ephemeral: true });
}

async function handleAskModal(interaction, customId) {
  const tournamentId = customId.replace('tournament_ask_modal_', '');
  const tournament = await Tournament.findById(tournamentId);

  if (!tournament) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Турнир не найден', color: COLORS.ERROR })], ephemeral: true });
  }

  const questions = [];
  for (let i = 0; i < 5; i++) {
    const value = interaction.fields.getTextInputValue(`question_${i}`);
    if (value && value.trim()) {
      questions.push({
        label: value.trim(),
        style: 'SHORT',
        required: true
      });
    }
  }

  if (questions.length === 0) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Добавьте хотя бы один вопрос', color: COLORS.ERROR })], ephemeral: true });
  }

  tournament.questionnaire = questions;
  await tournament.save();

  const embed = createEmbed({
    title: 'Анкета создана!',
    description: `**Турнир:** ${tournament.name}\n**Вопросов:** ${questions.length}`,
    fields: questions.map((q, i) => ({ name: `${i + 1}. ${q.label}`, value: `Стиль: ${q.style}`, inline: false })),
    color: COLORS.SUCCESS
  });

  return interaction.reply({ embeds: [embed] });
}
