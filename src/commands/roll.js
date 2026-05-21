const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const Roll = require('../models/Roll');
const { COLORS, createEmbed, buildProgressBar, formatTime, parseTimeInput } = require('../utils/embedBuilder');

const PROGRESS_BAR_CHARS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];
const BAR_LENGTH = 20;

function getAnimatedBar(percent) {
  const filled = Math.round((percent / 100) * BAR_LENGTH);
  const empty = BAR_LENGTH - filled;
  const colorIndex = Math.min(Math.floor(percent / 20), PROGRESS_BAR_CHARS.length - 1);
  const emoji = PROGRESS_BAR_CHARS[colorIndex];
  return `${emoji}`.repeat(filled) + '⬛'.repeat(empty);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Ролл призов')
    .addSubcommandGroup(group =>
      group.setName('reak')
        .setDescription('Ролл по реакциям')
        .addSubcommand(sub =>
          sub.setName('start')
            .setDescription('Ролл по реакциям на сообщение')
            .addStringOption(opt =>
              opt.setName('время')
                .setDescription('Время окончания (ЧЧ:ММ, например 19:40)')
                .setRequired(true))
            .addStringOption(opt =>
              opt.setName('приз')
                .setDescription('Приз')
                .setRequired(true))
            .addStringOption(opt =>
              opt.setName('ссылка_сообщения')
                .setDescription('Ссылка на сообщение с реакциями')
                .setRequired(true))
        )
        .addSubcommand(sub =>
          sub.setName('delete')
            .setDescription('Удалить ролл по реакциям')
            .addStringOption(opt =>
              opt.setName('ролл')
                .setDescription('Выберите ролл')
                .setRequired(true)
                .setAutocomplete(true))
        )
        .addSubcommand(sub =>
          sub.setName('emergency')
            .setDescription('Аварийный ролл по реакциям')
            .addStringOption(opt =>
              opt.setName('ролл')
                .setDescription('Выберите ролл')
                .setRequired(true)
                .setAutocomplete(true))
        )
    )
    .addSubcommand(sub =>
      sub.setName('start')
        .setDescription('Начать ролл')
        .addStringOption(opt =>
          opt.setName('время')
            .setDescription('Время окончания (ЧЧ:ММ, например 19:40)')
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName('приз')
            .setDescription('Приз')
            .setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Удалить ролл')
        .addStringOption(opt =>
          opt.setName('ролл')
            .setDescription('Выберите ролл')
            .setRequired(true)
            .setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub.setName('emergency')
        .setDescription('Аварийный ролл')
        .addStringOption(opt =>
          opt.setName('ролл')
            .setDescription('Выберите ролл')
            .setRequired(true)
            .setAutocomplete(true))
    ),

  async execute(interaction) {
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (subcommandGroup === 'reak') {
      switch (subcommand) {
        case 'start':
          return handleReakStart(interaction);
        case 'delete':
          return handleReakDelete(interaction);
        case 'emergency':
          return handleReakEmergency(interaction);
      }
    }

    switch (subcommand) {
      case 'start':
        return handleStart(interaction);
      case 'delete':
        return handleDelete(interaction);
      case 'emergency':
        return handleEmergency(interaction);
    }
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const type = subcommandGroup === 'reak' ? 'reak' : 'normal';

    const rolls = await Roll.find({
      guildId: interaction.guild.id,
      type,
      status: 'active',
      prize: { $regex: focused, $options: 'i' }
    }).limit(25);

    return interaction.respond(
      rolls.map(r => ({
        name: `#${r.rollId} — ${r.prize} (до ${r.endTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})`,
        value: r.rollId.toString()
      }))
    );
  }
};

async function handleStart(interaction) {
  const timeStr = interaction.options.getString('время');
  const prize = interaction.options.getString('приз');

  const endTime = parseTimeInput(timeStr);
  if (!endTime) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Неверный формат времени. Используйте ЧЧ:ММ (например 19:40)', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  const roll = await Roll.create({
    guildId: interaction.guild.id,
    type: 'normal',
    prize,
    endTime,
    participants: [interaction.user.id],
    channelId: interaction.channel.id
  });

  const embed = buildRollEmbed(roll, 0);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`roll_join_${roll._id}`)
      .setLabel('Участвовать!')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎉')
  );

  const message = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
  roll.messageId = message.id;
  roll.channelId = message.channel.id;
  await roll.save();
}

async function handleDelete(interaction) {
  const rollIdStr = interaction.options.getString('ролл');
  const rollIdNum = parseInt(rollIdStr, 10);
  if (isNaN(rollIdNum)) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Неверный формат ID ролла', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }
  const roll = await Roll.findOne({ rollId: rollIdNum, guildId: interaction.guild.id, type: 'normal', status: 'active' });

  if (!roll) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Ролл не найден', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  roll.status = 'cancelled';
  await roll.save();

  return interaction.reply({ embeds: [createEmbed({ title: 'Ролл удалён', description: `Ролл #${roll.rollId} "${roll.prize}" отменён`, color: COLORS.SUCCESS })] });
}

async function handleEmergency(interaction) {
  const rollIdStr = interaction.options.getString('ролл');
  const rollIdNum = parseInt(rollIdStr, 10);
  if (isNaN(rollIdNum)) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Неверный формат ID ролла', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }
  const roll = await Roll.findOne({ rollId: rollIdNum, guildId: interaction.guild.id, type: 'normal', status: 'active' });

  if (!roll) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Ролл не найден', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  await executeRoll(roll, interaction.client, interaction);
}

async function handleReakStart(interaction) {
  const timeStr = interaction.options.getString('время');
  const prize = interaction.options.getString('приз');
  const messageLink = interaction.options.getString('ссылка_сообщения');

  const endTime = parseTimeInput(timeStr);
  if (!endTime) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Неверный формат времени. Используйте ЧЧ:ММ (например 19:40)', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  const linkMatch = messageLink.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (!linkMatch) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Неверная ссылка на сообщение', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  const [, , channelId, messageId] = linkMatch;
  let sourceMessage;
  try {
    const channel = await interaction.client.channels.fetch(channelId);
    sourceMessage = await channel.messages.fetch(messageId);
  } catch {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Не удалось получить сообщение. Проверьте ссылку и права бота.', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  const reactedUsers = new Set();
  for (const reaction of sourceMessage.reactions.cache.values()) {
    const users = await reaction.users.fetch();
    users.forEach(u => {
      if (!u.bot) reactedUsers.add(u.id);
    });
  }

  const capturedReactions = [...reactedUsers];

  const roll = await Roll.create({
    guildId: interaction.guild.id,
    type: 'reak',
    prize,
    endTime,
    participants: capturedReactions,
    sourceMessageId: messageId,
    sourceChannelId: channelId,
    capturedReactions,
    channelId: interaction.channel.id
  });

  const embed = buildReakRollEmbed(roll, 0);

  const message = await interaction.reply({ embeds: [embed], withResponse: true });
  roll.messageId = message.id;
  roll.channelId = message.channel.id;
  await roll.save();
}

async function handleReakDelete(interaction) {
  const rollIdStr = interaction.options.getString('ролл');
  const rollIdNum = parseInt(rollIdStr, 10);
  if (isNaN(rollIdNum)) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Неверный формат ID ролла', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }
  const roll = await Roll.findOne({ rollId: rollIdNum, guildId: interaction.guild.id, type: 'reak', status: 'active' });

  if (!roll) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Ролл не найден', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  roll.status = 'cancelled';
  await roll.save();

  return interaction.reply({ embeds: [createEmbed({ title: 'Ролл по реакциям удалён', description: `Ролл #${roll.rollId} "${roll.prize}" отменён`, color: COLORS.SUCCESS })] });
}

async function handleReakEmergency(interaction) {
  const rollIdStr = interaction.options.getString('ролл');
  const rollIdNum = parseInt(rollIdStr, 10);
  if (isNaN(rollIdNum)) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Неверный формат ID ролла', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }
  const roll = await Roll.findOne({ rollId: rollIdNum, guildId: interaction.guild.id, type: 'reak', status: 'active' });

  if (!roll) {
    return interaction.reply({ embeds: [createEmbed({ title: 'Ошибка', description: 'Ролл не найден', color: COLORS.ERROR })], flags: MessageFlags.Ephemeral });
  }

  await executeRoll(roll, interaction.client, interaction);
}

async function executeRoll(roll, client, interaction) {
  const participants = roll.type === 'reak' ? roll.capturedReactions : roll.participants;

  if (participants.length === 0) {
    roll.status = 'completed';
    await roll.save();
    return interaction.reply({ embeds: [createEmbed({ title: 'Ролл завершён', description: 'Нет участников для ролла!', color: COLORS.WARNING })] });
  }

  const winnerIndex = Math.floor(Math.random() * participants.length);
  const winnerId = participants[winnerIndex];

  roll.winnerId = winnerId;
  roll.status = 'completed';
  await roll.save();

  const participantList = participants.map(p => p === winnerId ? `🏆 <@${p}>` : `<@${p}>`).join(', ');

  const embed = createEmbed({
    title: '🎉 Ролл завершён!',
    description: `**Ролл:** #${roll.rollId}\n**Приз:** ${roll.prize}\n**Победитель:** <@${winnerId}>\n**Участников:** ${participants.length}\n**Тип:** ${roll.type === 'reak' ? 'По реакциям' : 'Обычный'}\n\n**Все участники:**\n${participantList}`,
    color: COLORS.SUCCESS
  });

  return interaction.reply({ embeds: [embed] });
}

function buildRollEmbed(roll, progressPercent) {
  const remaining = Math.max(0, roll.endTime - Date.now());
  const totalDuration = roll.endTime - roll.createdAt.getTime();
  const percent = totalDuration > 0 ? Math.max(0, Math.min(100, ((totalDuration - remaining) / totalDuration) * 100)) : 100;
  const bar = getAnimatedBar(percent);

  return createEmbed({
    title: '🎉 Ролл приза!',
    description: `**Ролл:** #${roll.rollId}\n**Приз:** ${roll.prize}\n**Осталось:** ${formatTime(remaining)}\n\n${bar} ${Math.round(percent)}%\n\n**Участников:** ${roll.participants.length}`,
    color: COLORS.ROLL,
    footer: 'Нажмите кнопку чтобы участвовать!'
  });
}

function buildReakRollEmbed(roll, progressPercent) {
  const remaining = Math.max(0, roll.endTime - Date.now());
  const totalDuration = roll.endTime - roll.createdAt.getTime();
  const percent = totalDuration > 0 ? Math.max(0, Math.min(100, ((totalDuration - remaining) / totalDuration) * 100)) : 100;
  const bar = getAnimatedBar(percent);

  return createEmbed({
    title: '🎉 Ролл по реакциям!',
    description: `**Ролл:** #${roll.rollId}\n**Приз:** ${roll.prize}\n**Осталось:** ${formatTime(remaining)}\n\n${bar} ${Math.round(percent)}%\n\n**Участников (из реакций):** ${roll.capturedReactions.length}`,
    color: COLORS.ROLL,
    footer: 'Ролл между теми, кто уже поставил реакции!'
  });
}

module.exports.buildRollEmbed = buildRollEmbed;
module.exports.buildReakRollEmbed = buildReakRollEmbed;
module.exports.getAnimatedBar = getAnimatedBar;
