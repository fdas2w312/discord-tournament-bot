const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { COLORS, createEmbed } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('message')
    .setDescription('Отправить сообщение в ЛС всем с выбранной ролью')
    .addRoleOption(opt =>
      opt.setName('роль')
        .setDescription('Роль, участникам которой будет отправлено сообщение')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('текст')
        .setDescription('Текст сообщения для отправки в ЛС')
        .setRequired(true)),

  async execute(interaction) {
    const role = interaction.options.getRole('роль');
    const text = interaction.options.getString('текст');

    // Только администраторы могут использовать команду
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [createEmbed({ title: 'Ошибка', description: 'Только администраторы могут использовать эту команду', color: COLORS.ERROR })],
        flags: MessageFlags.Ephemeral
      });
    }

    // Нельзя отправлять @everyone и @here
    if (!role || role.id === interaction.guild.id) {
      return interaction.reply({
        embeds: [createEmbed({ title: 'Ошибка', description: role ? 'Нельзя отправлять сообщение роли @everyone' : 'Роль не найдена', color: COLORS.ERROR })],
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Получаем всех участников с выбранной ролью
    const members = await interaction.guild.members.fetch();
    const targetMembers = members.filter(m => m.roles.cache.has(role.id) && !m.user.bot);

    if (targetMembers.size === 0) {
      return interaction.editReply({
        embeds: [createEmbed({ title: 'Ошибка', description: `Нет участников с ролью ${role.name}`, color: COLORS.ERROR })]
      });
    }

    let sent = 0;
    let failed = 0;

    const dmEmbed = createEmbed({
      title: `Сообщение от ${interaction.guild.name}`,
      description: text,
      color: COLORS.PRIMARY,
      footer: `Отправлено: ${interaction.user.tag}`
    });

    for (const [memberId, member] of targetMembers) {
      try {
        await member.send({ embeds: [dmEmbed] });
        sent++;
      } catch {
        failed++;
      }
      // Небольшая задержка чтобы не упереться в rate limit
      await new Promise(r => setTimeout(r, 300));
    }

    return interaction.editReply({
      embeds: [createEmbed({
        title: 'Рассылка завершена',
        description: `**Роль:** ${role.name}\n**Доставлено:** ${sent}\n**Не доставлено (ЛС закрыто):** ${failed}\n**Всего участников:** ${targetMembers.size}`,
        color: sent > 0 ? COLORS.SUCCESS : COLORS.WARNING
      })]
    });
  }
};
