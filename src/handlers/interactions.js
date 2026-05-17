const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Settings = require('../models/Settings');
const { COLORS, createEmbed } = require('../utils/embedBuilder');

// Helper: найти турнир по tournamentId (число) или _id
async function findTournament(id) {
  if (!isNaN(id)) {
    return await Tournament.findOne({ tournamentId: parseInt(id) });
  }
  return await Tournament.findById(id);
}

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
    if (customId.startsWith('tournament_approve_btn_')) {
      return handleApproveTeam(interaction, customId);
    }
    if (customId.startsWith('tournament_reject_btn_')) {
      return handleRejectTeam(interaction, customId);
    }
    if (customId.startsWith('tournament_close_')) {
      return handleCloseTournament(interaction, customId);
    }
    if (customId.startsWith('tournament_open_')) {
      return handleOpenTournament(interaction, customId);
    }
    if (customId.startsWith('tournament_manage_teams_')) {
      return handleManageTeamsList(interaction, customId);
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

    if (customId.startsWith('tournament_team_modal_')) {
      return handleTeamModal(interaction, customId);
    }
  }
};

const TOURNEY_ERR = { embeds: [createEmbed({ title: 'Ошибка', description: 'Турнир не найден', color: COLORS.ERROR })], ephemeral: true };

async function handleParticipate(interaction, customId) {
  const tid = customId.replace('tournament_participate_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

  if (tournament.status !== 'open') {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Регистрация на турнир закрыта', color: COLORS.ERROR })], ephemeral: true });
  }

  // 1x1 — один участник, без выбора
  if (tournament.teamSize === 1) {
    const allMembers = [interaction.user];

    if (tournament.questionnaire && tournament.questionnaire.length > 0) {
      const modal = new ModalBuilder()
        .setCustomId(`tournament_team_modal_${tid}_${interaction.user.id}`)
        .setTitle('Анкета участника');

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

    return registerTeam(tournament, allMembers, [], interaction);
  }

  // teamSize > 1 — выбираем участников
  const maxSelect = Math.min(tournament.teamSize - 1, 25);
  const selectMenu = new UserSelectMenuBuilder()
    .setCustomId(`tournament_select_members_${tid}`)
    .setPlaceholder('Выберите участников команды')
    .setMinValues(1)
    .setMaxValues(maxSelect);

  const row = new ActionRowBuilder().addComponents(selectMenu);
  return interaction.reply({ content: 'Выберите участников вашей команды:', components: [row], ephemeral: true });
}

async function handleMemberSelect(interaction, customId) {
  const tid = customId.replace('tournament_select_members_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

  const selectedMembers = interaction.users;
  const allMembers = [interaction.user, ...selectedMembers.values()];

  if (allMembers.length > tournament.teamSize) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: `Слишком много участников. Максимум: ${tournament.teamSize}`, color: COLORS.ERROR })], ephemeral: true });
  }

  if (tournament.questionnaire && tournament.questionnaire.length > 0) {
    const modal = new ModalBuilder()
      .setCustomId(`tournament_team_modal_${tid}_${allMembers.map(m => m.id).join(',')}`)
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
  const parts = customId.replace('tournament_team_modal_', '');
  // Формат: tid_memberId1,memberId2,...
  const underscoreIdx = parts.indexOf('_');
  const tid = parts.substring(0, underscoreIdx);
  const memberIdsStr = parts.substring(underscoreIdx + 1);
  const memberIds = memberIdsStr ? memberIdsStr.split(',') : [];

  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

  const answers = [];
  if (tournament.questionnaire) {
    tournament.questionnaire.forEach((q, i) => {
      const value = interaction.fields.getTextInputValue(`answer_${i}`);
      if (value) answers.push({ label: q.label, value });
    });
  }

  const allMembers = [interaction.user];
  for (const id of memberIds) {
    if (id && id !== interaction.user.id) {
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
    description: `**Турнир:** #${tournament.tournamentId} ${tournament.name}\n**Участники:** ${memberList}\n**Статус:** Ожидает одобрения`,
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
  const tid = customId.replace('tournament_teams_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

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
    title: `📋 Команды — #${tournament.tournamentId} ${tournament.name}`,
    description: `Всего: ${teams.length} команд`,
    color: COLORS.TOURNAMENT,
    fields: fields.slice(0, 25)
  });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleManage(interaction, customId) {
  const tid = customId.replace('tournament_manage_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

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

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tournament_approve_btn_${tid}`)
      .setLabel(`Одобрить (${pendingTeams.length})`)
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`tournament_reject_btn_${tid}`)
      .setLabel(`Отклонить (${pendingTeams.length})`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tournament_close_${tid}`)
      .setLabel('Закрыть турнир')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔒')
      .setDisabled(tournament.status !== 'open'),
    new ButtonBuilder()
      .setCustomId(`tournament_open_${tid}`)
      .setLabel('Открыть турнир')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔓')
      .setDisabled(tournament.status === 'open'),
    new ButtonBuilder()
      .setCustomId(`tournament_manage_teams_${tid}`)
      .setLabel('Команды')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📋')
  );

  const statusText = tournament.status === 'open' ? '🟢 Открыт' : tournament.status === 'ongoing' ? '🟡 Идёт' : '🔴 Закрыт';

  const embed = createEmbed({
    title: `⚙️ Управление — #${tournament.tournamentId} ${tournament.name}`,
    description: `Статус: ${statusText}\nОжидают одобрения: ${pendingTeams.length}\nОдобрено: ${approvedTeams.length}`,
    color: COLORS.TOURNAMENT
  });

  return interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
}

async function handleApproveTeam(interaction, customId) {
  const tid = customId.replace('tournament_approve_btn_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

  const pendingTeams = await Team.find({ tournamentId: tournament._id, status: 'pending' });

  if (pendingTeams.length === 0) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Нет команд', description: 'Нет команд, ожидающих одобрения', color: COLORS.INFO })], ephemeral: true });
  }

  const options = pendingTeams.slice(0, 25).map(t => ({
    label: `${t.name} (${t.members.length} участников)`,
    description: `Капитан: <@${t.captainId}>`,
    value: t._id.toString()
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`approve_select_${tid}`)
    .setPlaceholder('Выберите команды для одобрения')
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  return interaction.reply({ content: 'Выберите команды для одобрения:', components: [row], ephemeral: true });
}

async function handleRejectTeam(interaction, customId) {
  const tid = customId.replace('tournament_reject_btn_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

  const pendingTeams = await Team.find({ tournamentId: tournament._id, status: 'pending' });

  if (pendingTeams.length === 0) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Нет команд', description: 'Нет команд, ожидающих отклонения', color: COLORS.INFO })], ephemeral: true });
  }

  const options = pendingTeams.slice(0, 25).map(t => ({
    label: `${t.name} (${t.members.length} участников)`,
    description: `Капитан: <@${t.captainId}>`,
    value: t._id.toString()
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`reject_select_${tid}`)
    .setPlaceholder('Выберите команды для отклонения')
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);
  return interaction.reply({ content: 'Выберите команды для отклонения:', components: [row], ephemeral: true });
}

async function handleCloseTournament(interaction, customId) {
  const tid = customId.replace('tournament_close_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

  tournament.status = 'ongoing';
  await tournament.save();

  return interaction.reply({ embeds: [createEmbed({
    title: `🔒 Турнир #${tournament.tournamentId} "${tournament.name}" закрыт`,
    description: 'Регистрация закрыта. Новые команды не могут подать заявку.',
    color: COLORS.WARNING
  })], ephemeral: true });
}

async function handleOpenTournament(interaction, customId) {
  const tid = customId.replace('tournament_open_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

  tournament.status = 'open';
  await tournament.save();

  return interaction.reply({ embeds: [createEmbed({
    title: `🔓 Турнир #${tournament.tournamentId} "${tournament.name}" открыт`,
    description: 'Регистрация открыта. Новые команды могут подать заявку.',
    color: COLORS.SUCCESS
  })], ephemeral: true });
}

async function handleManageTeamsList(interaction, customId) {
  const tid = customId.replace('tournament_manage_teams_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

  const allTeams = await Team.find({ tournamentId: tournament._id });

  if (allTeams.length === 0) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Команды', description: 'Нет команд', color: COLORS.INFO })], ephemeral: true });
  }

  const statusEmoji = { pending: '⏳', approved: '✅', rejected: '❌', eliminated: '❌' };
  const statusTextMap = { pending: 'Ожидает', approved: 'Одобрена', rejected: 'Отклонена', eliminated: 'Выбыла' };

  const fields = allTeams.map((team, i) => ({
    name: `${i + 1}. ${team.name} ${statusEmoji[team.status] || '❓'}`,
    value: `Капитан: <@${team.captainId}>\nУчастники: ${team.members.map(m => `<@${m}>`).join(', ')}\nСтатус: ${statusTextMap[team.status] || team.status}`,
    inline: false
  }));

  const embed = createEmbed({
    title: `📋 Все команды — #${tournament.tournamentId} ${tournament.name}`,
    description: `Всего: ${allTeams.length}`,
    color: COLORS.TOURNAMENT,
    fields: fields.slice(0, 25)
  });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleStartTournament(interaction, customId) {
  const tid = customId.replace('tournament_start_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

  tournament.status = 'ongoing';
  await tournament.save();

  const approvedTeams = await Team.find({ tournamentId: tournament._id, status: 'approved' });

  return interaction.reply({ embeds: [createEmbed({
    title: `▶️ Турнир #${tournament.tournamentId} "${tournament.name}" начался!`,
    description: `Формат: ${tournament.teamSize}x${tournament.teamSize}\nУчаствующих команд: ${approvedTeams.length}`,
    color: COLORS.SUCCESS
  })] });
}

async function handleEndTournament(interaction, customId) {
  const tid = customId.replace('tournament_end_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

  tournament.status = 'completed';
  await tournament.save();

  return interaction.reply({ embeds: [createEmbed({
    title: `🏁 Турнир #${tournament.tournamentId} "${tournament.name}" завершён!`,
    description: 'Объявите победителей через кнопку "Объявить победителей"',
    color: COLORS.WARNING
  })] });
}

async function handleWinnersSelect(interaction, customId) {
  const tid = customId.replace('tournament_winners_', '');
  const tournament = await findTournament(tid);
  if (!tournament) return interaction.reply(TOURNEY_ERR);

  const approvedTeams = await Team.find({ tournamentId: tournament._id, status: { $in: ['approved', 'eliminated'] } });

  if (approvedTeams.length === 0) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Нет команд для выбора победителя', color: COLORS.ERROR })], ephemeral: true });
  }

  const options = approvedTeams.slice(0, 25).map(t => ({
    label: t.name,
    description: `Капитан: <@${t.captainId}>`,
    value: t._id.toString()
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`winner_select_${tid}`)
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
