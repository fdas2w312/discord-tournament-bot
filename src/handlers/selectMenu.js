const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const { COLORS, createEmbed } = require('../utils/embedBuilder');

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
  const tournamentId = customId.replace('approve_select_', '');
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

  const embed = createEmbed({
    title: 'Команды одобрены',
    description: `Одобрено команд: **${approved}**`,
    color: COLORS.SUCCESS
  });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleRejectSelect(interaction, customId) {
  const tournamentId = customId.replace('reject_select_', '');
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

  const embed = createEmbed({
    title: 'Команды удалены',
    description: `Удалено команд: **${rejected}**`,
    color: COLORS.WARNING
  });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleWinnerSelect(interaction, customId) {
  const tournamentId = customId.replace('winner_select_', '');
  const teamId = interaction.values[0];

  const [tournament, team] = await Promise.all([
    Tournament.findById(tournamentId),
    Team.findById(teamId)
  ]);

  if (!tournament || !team) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Турнир или команда не найдены', color: COLORS.ERROR })], ephemeral: true });
  }

  tournament.winnerTeamId = teamId;
  tournament.status = 'completed';
  await tournament.save();

  const memberList = team.members.map(m => `<@${m}>`).join(', ');

  const embed = createEmbed({
    title: '🏆 Победители объявлены!',
    description: `**Турнир:** ${tournament.name}\n**Победившая команда:** ${team.name}\n**Участники:** ${memberList}`,
    color: COLORS.SUCCESS
  });

  return interaction.reply({ embeds: [embed] });
}
