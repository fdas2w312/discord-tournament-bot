const { EmbedBuilder } = require('discord.js');

const COLORS = {
  PRIMARY: 0x5865F2,
  SUCCESS: 0x57F287,
  WARNING: 0xFEE75C,
  ERROR: 0xED4245,
  INFO: 0x00B0F4,
  TOURNAMENT: 0x9B59B6,
  ROLL: 0xE91E63,
  AFK: 0xF39C12,
  INACTIVE: 0x3498DB
};

function createEmbed({ title, description, color = COLORS.PRIMARY, fields = [], footer, thumbnail, image }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (footer) embed.setFooter({ text: footer });
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);

  for (const field of fields) {
    embed.addFields({ name: field.name, value: field.value, inline: field.inline ?? false });
  }

  return embed;
}

function buildProgressBar(percent, length = 20) {
  const filled = Math.round((percent / 100) * length);
  const empty = length - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return bar;
}

function formatTime(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getTimezoneOffset() {
  const tz = process.env.TZ || 'UTC';
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: tz });
    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);
    return tzDate - utcDate; // offset in ms
  } catch {
    return 0;
  }
}

function parseTimeInput(timeStr) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  // Пользователь вводит время в СВОЁМ часовом поясе (TZ env, по умолчанию Europe/Moscow)
  // Сервер на Railway работает в UTC, поэтому нужно вычесть offset
  const offset = getTimezoneOffset();

  const nowUTC = new Date();
  const targetUTC = new Date(nowUTC);
  targetUTC.setUTCHours(hours, minutes, 0, 0);
  // offset > 0 значит TZ впереди UTC, значит 15:15 по Москве = 12:15 UTC
  targetUTC.setTime(targetUTC.getTime() - offset);

  if (targetUTC <= nowUTC) {
    targetUTC.setDate(targetUTC.getDate() + 1);
  }
  return targetUTC;
}

function parseDateRange(fromStr, toStr) {
  const parseRuDate = (s) => {
    const parts = s.split('.');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  };

  const start = parseRuDate(fromStr);
  const end = parseRuDate(toStr);
  if (!start || !end) return null;
  if (end <= start) return null;
  return { start, end };
}

module.exports = { COLORS, createEmbed, buildProgressBar, formatTime, formatDate, parseTimeInput, parseDateRange };
