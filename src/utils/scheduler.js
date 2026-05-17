const Roll = require('../models/Roll');
const AFK = require('../models/AFK');
const Inactive = require('../models/Inactive');
const { buildRollEmbed, buildReakRollEmbed } = require('../commands/roll');
const { COLORS, createEmbed } = require('../utils/embedBuilder');

class Scheduler {
  constructor(client) {
    this.client = client;
    this.intervals = [];
  }

  start() {
    this.intervals.push(setInterval(() => this.updateRolls(), 10000));
    this.intervals.push(setInterval(() => this.checkAFKExpiry(), 30000));
    this.intervals.push(setInterval(() => this.checkInactiveExpiry(), 60000));
    console.log('[Scheduler] Started');
  }

  stop() {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
  }

  async updateRolls() {
    const activeRolls = await Roll.find({ status: 'active' });

    for (const roll of activeRolls) {
      const now = Date.now();

      if (now >= roll.endTime) {
        await this.completeRoll(roll);
        continue;
      }

      try {
        const channel = await this.client.channels.fetch(roll.channelId).catch(() => null);
        if (!channel) continue;
        const message = await channel.messages.fetch(roll.messageId).catch(() => null);
        if (!message) continue;

        const remaining = roll.endTime - now;
        const totalDuration = roll.endTime - roll.createdAt.getTime();
        const percent = totalDuration > 0 ? ((totalDuration - remaining) / totalDuration) * 100 : 100;

        const embed = roll.type === 'reak'
          ? buildReakRollEmbed(roll, percent)
          : buildRollEmbed(roll, percent);

        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        if (roll.type === 'normal') {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`roll_join_${roll._id}`)
              .setLabel('Участвовать!')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🎉')
          );
          await message.edit({ embeds: [embed], components: [row] });
        } else {
          await message.edit({ embeds: [embed] });
        }
      } catch {}
    }
  }

  async completeRoll(roll) {
    const participants = roll.type === 'reak' ? roll.capturedReactions : roll.participants;

    if (participants.length === 0) {
      roll.status = 'completed';
      await roll.save();
      try {
        const channel = await this.client.channels.fetch(roll.channelId).catch(() => null);
        if (channel) {
          const message = await channel.messages.fetch(roll.messageId).catch(() => null);
          if (message) {
            await message.edit({
              embeds: [createEmbed({ title: '🎉 Ролл завершён!', description: `**Приз:** ${roll.prize}\nНет участников!`, color: COLORS.WARNING })],
              components: []
            });
          }
        }
      } catch {}
      return;
    }

    const winnerIndex = Math.floor(Math.random() * participants.length);
    const winnerId = participants[winnerIndex];

    roll.winnerId = winnerId;
    roll.status = 'completed';
    await roll.save();

    try {
      const channel = await this.client.channels.fetch(roll.channelId).catch(() => null);
      if (channel) {
        const message = await channel.messages.fetch(roll.messageId).catch(() => null);
        if (message) {
          await message.edit({
            embeds: [createEmbed({
              title: '🎉 Ролл завершён!',
              description: `**Приз:** ${roll.prize}\n**Победитель:** <@${winnerId}>\n**Участников:** ${participants.length}\n**Тип:** ${roll.type === 'reak' ? 'По реакциям' : 'Обычный'}`,
              color: COLORS.SUCCESS
            })],
            components: []
          });
        }

        await channel.send({
          embeds: [createEmbed({
            title: '🎉 Новый победитель!',
            description: `**Приз:** ${roll.prize}\n**Победитель:** <@${winnerId}>`,
            color: COLORS.SUCCESS
          })]
        });
      }
    } catch {}
  }

  async checkAFKExpiry() {
    const expired = await AFK.find({
      active: true,
      expiresAt: { $lte: new Date() }
    });

    for (const afk of expired) {
      afk.active = false;
      await afk.save();
    }
  }

  async checkInactiveExpiry() {
    const expired = await Inactive.find({
      active: true,
      endDate: { $lte: new Date() }
    });

    for (const inc of expired) {
      inc.active = false;
      await inc.save();
    }
  }
}

module.exports = Scheduler;
