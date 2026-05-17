const { SlashCommandBuilder } = require('discord.js');
const AFK = require('../models/AFK');
const Inactive = require('../models/Inactive');
const { COLORS, createEmbed, formatDate } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Таблица AFK и инактивов'),

  async execute(interaction) {
    const [afkList, inactiveList] = await Promise.all([
      AFK.find({ guildId: interaction.guild.id, active: true }).sort({ expiresAt: 1 }),
      Inactive.find({ guildId: interaction.guild.id, active: true }).sort({ endDate: 1 })
    ]);

    if (afkList.length === 0 && inactiveList.length === 0) {
      return interaction.reply({ embeds: [createEmbed({ title: '📊 Статус', description: 'Никто не в AFK или инактиве', color: COLORS.INFO })] });
    }

    const fields = [];

    if (afkList.length > 0) {
      const afkLines = await Promise.all(afkList.map(async (afk) => {
        const member = await interaction.guild.members.fetch(afk.userId).catch(() => null);
        const name = member ? member.displayName : `<@${afk.userId}>`;
        const remaining = Math.max(0, Math.ceil((afk.expiresAt - Date.now()) / 60000));
        return `🟡 **${name}** — ${remaining} мин. осталось`;
      }));
      fields.push({ name: '🟡 AFK', value: afkLines.join('\n'), inline: false });
    }

    if (inactiveList.length > 0) {
      const inactiveLines = await Promise.all(inactiveList.map(async (inc) => {
        const member = await interaction.guild.members.fetch(inc.userId).catch(() => null);
        const name = member ? member.displayName : `<@${inc.userId}>`;
        return `🔵 **${name}** — с ${formatDate(inc.startDate)} по ${formatDate(inc.endDate)}`;
      }));
      fields.push({ name: '🔵 Инактив', value: inactiveLines.join('\n'), inline: false });
    }

    const embed = createEmbed({
      title: '📊 Статус участников',
      description: `AFK: **${afkList.length}** | Инактив: **${inactiveList.length}**`,
      color: COLORS.INFO,
      fields
    });

    return interaction.reply({ embeds: [embed] });
  }
};
