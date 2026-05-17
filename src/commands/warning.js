const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const Warning = require('../models/Warning');
const Settings = require('../models/Settings');
const { COLORS, createEmbed } = require('../utils/embedBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warning')
    .setDescription('Система штрафов')
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Выдать штраф')
        .addUserOption(opt =>
          opt.setName('человек')
            .setDescription('Человек, которому выдают штраф')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('причина')
            .setDescription('Причина штрафа')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('штраф')
            .setDescription('Тип штрафа (роль)')
            .setRequired(true)
            .setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Снять штраф')
        .addUserOption(opt =>
          opt.setName('человек')
            .setDescription('Человек, у которого снимают штраф')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('штраф')
            .setDescription('ID штрафа для удаления (#1, #2 и т.д.)')
            .setRequired(true)
            .setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Настроить систему штрафов')
        .addRoleOption(opt =>
          opt.setName('админ_роль')
            .setDescription('Добавить роль, которая может выдавать штрафы'))
        .addStringOption(opt =>
          opt.setName('название_штрафа')
            .setDescription('Название нового типа штрафа'))
        .addRoleOption(opt =>
          opt.setName('роль_штрафа')
            .setDescription('Роль, выдаваемая при этом штрафе'))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'add':
        return handleAdd(interaction);
      case 'delete':
        return handleDelete(interaction);
      case 'set':
        return handleSet(interaction);
    }
  },

  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused();

    if (subcommand === 'add') {
      const settings = await Settings.findOne({ guildId: interaction.guild.id });
      const penalties = settings?.warningPenalties || [];
      return interaction.respond(
        penalties
          .filter(p => p.name.toLowerCase().includes(focused.toLowerCase()))
          .map(p => ({ name: `${p.name} (роль: <@&${p.roleId}>)`, value: p.name }))
          .slice(0, 25)
      );
    }

    if (subcommand === 'delete') {
      const user = interaction.options.getUser('человек');
      if (!user) return interaction.respond([]);
      const warnings = await Warning.find({
        guildId: interaction.guild.id,
        userId: user.id,
        active: true
      }).limit(25);
      return interaction.respond(
        warnings.map(w => ({ name: `#${w.warningId} — ${w.reason} (${w.penaltyName})`, value: w.warningId.toString() }))
      );
    }

    return interaction.respond([]);
  }
};

async function checkWarningAdmin(interaction) {
  const settings = await Settings.findOne({ guildId: interaction.guild.id });
  if (settings?.warningAdminRoles?.length) {
    const memberRoles = interaction.member.roles.cache.map(r => r.id);
    const hasAdmin = settings.warningAdminRoles.some(r => memberRoles.includes(r));
    if (!hasAdmin && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return false;
    }
  }
  return true;
}

async function handleAdd(interaction) {
  const hasPerm = await checkWarningAdmin(interaction);
  if (!hasPerm) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'У вас нет прав для выдачи штрафов', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  const user = interaction.options.getUser('человек');
  const reason = interaction.options.getString('причина');
  const penaltyName = interaction.options.getString('штраф');

  const settings = await Settings.findOne({ guildId: interaction.guild.id });
  const penalty = settings?.warningPenalties?.find(p => p.name === penaltyName);

  if (!penalty) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: `Штраф "${penaltyName}" не найден. Настройте его через /warning set`, color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Пользователь не найден на сервере', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  await member.roles.add(penalty.roleId).catch(() => {});

  const warning = await Warning.create({
    guildId: interaction.guild.id,
    userId: user.id,
    reason,
    penaltyRoleId: penalty.roleId,
    penaltyName: penalty.name,
    addedBy: interaction.user.id,
    active: true
  });

  const embed = createEmbed({
    title: 'Штраф выдан',
    description: `**ID:** #${warning.warningId}\n**Пользователь:** ${user}\n**Причина:** ${reason}\n**Штраф:** ${penalty.name} (<@&${penalty.roleId}>)\n**Выдал:** ${interaction.user}`,
    color: COLORS.WARNING
  });

  return interaction.reply({ embeds: [embed] });
}

async function handleDelete(interaction) {
  const hasPerm = await checkWarningAdmin(interaction);
  if (!hasPerm) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'У вас нет прав для снятия штрафов', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  const user = interaction.options.getUser('человек');
  const warningIdStr = interaction.options.getString('штраф');
  const warningIdNum = parseInt(warningIdStr, 10);

  const warning = await Warning.findOne({
    warningId: warningIdNum,
    guildId: interaction.guild.id,
    userId: user.id,
    active: true
  });
  if (!warning) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Штраф не найден', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  warning.active = false;
  await warning.save();

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (member) {
    const otherActiveWarnings = await Warning.find({
      guildId: interaction.guild.id,
      userId: user.id,
      penaltyRoleId: warning.penaltyRoleId,
      active: true
    });
    if (otherActiveWarnings.length === 0) {
      await member.roles.remove(warning.penaltyRoleId).catch(() => {});
    }
  }

  const embed = createEmbed({
    title: 'Штраф снят',
    description: `**ID:** #${warning.warningId}\n**Пользователь:** ${user}\n**Причина:** ${warning.reason}\n**Штраф:** ${warning.penaltyName}\n**Снял:** ${interaction.user}`,
    color: COLORS.SUCCESS
  });

  return interaction.reply({ embeds: [embed] });
}

async function handleSet(interaction) {
  const adminRole = interaction.options.getRole('админ_роль');
  const penaltyName = interaction.options.getString('название_штрафа');
  const penaltyRole = interaction.options.getRole('роль_штрафа');

  let settings = await Settings.findOne({ guildId: interaction.guild.id });
  if (!settings) {
    settings = await Settings.create({ guildId: interaction.guild.id });
  }

  const updates = [];

  if (adminRole) {
    if (!settings.warningAdminRoles.includes(adminRole.id)) {
      settings.warningAdminRoles.push(adminRole.id);
    }
    updates.push(`Админ-роль добавлена: ${adminRole.name}`);
  }

  if (penaltyName && penaltyRole) {
    const existing = settings.warningPenalties.findIndex(p => p.name === penaltyName);
    if (existing >= 0) {
      settings.warningPenalties[existing].roleId = penaltyRole.id;
    } else {
      settings.warningPenalties.push({ name: penaltyName, roleId: penaltyRole.id });
    }
    updates.push(`Штраф "${penaltyName}" → ${penaltyRole.name}`);
  } else if (penaltyName && !penaltyRole) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Для добавления штрафа укажите и название, и роль', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  if (updates.length === 0) {
    const currentAdmins = settings.warningAdminRoles.length
      ? settings.warningAdminRoles.map(r => `<@&${r}>`).join(', ')
      : 'Не заданы';
    const currentPenalties = settings.warningPenalties.length
      ? settings.warningPenalties.map(p => `${p.name} → <@&${p.roleId}>`).join('\n')
      : 'Не заданы';

    return interaction.reply({
      embeds: [createEmbed({
        title: 'Настройки штрафов',
        description: `**Админ-роли:** ${currentAdmins}\n**Штрафы:**\n${currentPenalties}`,
        color: COLORS.INFO
      })],
      flags: MessageFlags.Ephemeral
    });
  }

  await settings.save();
  return interaction.reply({
    embeds: [createEmbed({ title: 'Настройки штрафов обновлены', description: updates.join('\n'), color: COLORS.SUCCESS })],
    flags: MessageFlags.Ephemeral
  });
}
