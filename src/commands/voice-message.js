const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { COLORS, createEmbed } = require('../utils/embedBuilder');
const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gs')
    .setDescription('Отправить голосовое сообщение в ЛС всем с выбранной ролью (текст → TTS)')
    .addRoleOption(opt =>
      opt.setName('роль')
        .setDescription('Роль, участникам которой будет отправлено голосовое сообщение')
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName('текст')
        .setDescription('Текст для озвучивания')
        .setRequired(true)
        .setMaxLength(1000)),

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
    if (role.id === interaction.guild.id) {
      return interaction.reply({
        embeds: [createEmbed({ title: 'Ошибка', description: 'Нельзя отправлять сообщение роли @everyone', color: COLORS.ERROR })],
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

    // Генерируем аудио через Edge TTS
    const tts = new EdgeTTS({
      voice: 'ru-RU-SvetlanaNeural',
      lang: 'ru-RU',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
      rate: '+10%',
    });

    const tmpDir = path.join(require('os').tmpdir(), 'discord-bot');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const fileName = crypto.randomUUID() + '.mp3';
    const tmpPath = path.join(tmpDir, fileName);

    try {
      await tts.ttsPromise(text, tmpPath);
    } catch {
      return interaction.editReply({
        embeds: [createEmbed({ title: 'Ошибка', description: 'Не удалось сгенерировать голосовое сообщение', color: COLORS.ERROR })]
      });
    }

    const audioBuffer = fs.readFileSync(tmpPath);

    let sent = 0;
    let failed = 0;

    const dmEmbed = createEmbed({
      title: `Голосовое сообщение от ${interaction.guild.name}`,
      description: `🎙 Голосовое сообщение от **${interaction.user.tag}**`,
      color: COLORS.PRIMARY,
      footer: `Отправлено: ${interaction.user.tag}`
    });

    for (const [memberId, member] of targetMembers) {
      try {
        await member.send({
          embeds: [dmEmbed],
          files: [{ attachment: audioBuffer, name: 'voice-message.mp3' }]
        });
        sent++;
      } catch {
        failed++;
      }
      // Небольшая задержка чтобы не упереться в rate limit
      await new Promise(r => setTimeout(r, 300));
    }

    // Очищаем временный файл
    try { fs.unlinkSync(tmpPath); } catch {}

    return interaction.editReply({
      embeds: [createEmbed({
        title: 'Рассылка завершена',
        description: `**Роль:** ${role.name}\n**Доставлено:** ${sent}\n**Не доставлено (ЛС закрыто):** ${failed}\n**Всего участников:** ${targetMembers.size}`,
        color: sent > 0 ? COLORS.SUCCESS : COLORS.WARNING
      })]
    });
  }
};
