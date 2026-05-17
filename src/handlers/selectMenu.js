const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const { COLORS, createEmbed } = require('../utils/embedBuilder');

async function findTournament(id) {
  if (!isNaN(id)) {
    return await Tournament.findOne({ tournamentId: parseInt(id) });
  }
  return await Tournament.findById(id);
}

module.exports = {
  async handleSelectMenu(interaction) {
    const customId = interaction.customId;

    if (customId.startsWith('approve_select_')) {
      return handleApproveSelect(interaction, customId);
    }
    if (customId.startsWith('reject_select_')) {
      return handleRejectSelect(interaction, customId);
    }
    if (customId.startsWith('winner_select_')) {
      return handleWinnerSelect(interaction, customId);
    }
  }
};

async function handleApproveSelect(interaction, customId) {
  const tid = customId.replace('approve_select_', '');
  const selectedIds = interaction.values;

  let approved = 0;
  for (const teamId of selectedIds) {
    const team = await Team.findById(teamId);
    if (team && team.status === 'pending') {
      team.status = 'approved';
      await team.save();
      approved++;
    }
  }

  return interaction.reply({ embeds: [createEmbed({
    title: 'Команды одобрены',
    description: `Одобрено команд: **${approved}**`,
    color: COLORS.SUCCESS
  })], ephemeral: true });
}

async function handleRejectSelect(interaction, customId) {
  const tid = customId.replace('reject_select_', '');
  const selectedIds = interaction.values;

  let rejected = 0;
  for (const teamId of selectedIds) {
    const team = await Team.findById(teamId);
    if (team && team.status === 'pending') {
      team.status = 'rejected';
      await team.save();
      rejected++;
    }
  }

  return interaction.reply({ embeds: [createEmbed({
    title: 'Команды отклонены',
    description: `Отклонено команд: **${rejected}**`,
    color: COLORS.WARNING
  })], ephemeral: true });
}

async function handleWinnerSelect(interaction, customId) {
  const tid = customId.replace('winner_select_', '');
  const teamId = interaction.values[0];

  const tournament = await findTournament(tid);
  const team = await Team.findById(teamId);

  if (!tournament || !team) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Турнир или команда не найдены', color: COLORS.ERROR })], ephemeral: true });
  }

  tournament.winnerTeamId = teamId;
  tournament.status = 'completed';
  await tournament.save();

  const memberList = team.members.map(m => `<@${m}>`).join(', ');

  const embed = createEmbed({
    title: '🏆 Победители объявлены!',
    description: `**Турнир:** #${tournament.tournamentId} ${tournament.name}\n**Победившая команда:** ${team.name}\n**Участники:** ${memberList}`,
    color: COLORS.SUCCESS
  });

  return interaction.reply({ embeds: [embed] });
}
