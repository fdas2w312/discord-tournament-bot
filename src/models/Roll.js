const mongoose = require('mongoose');

const rollSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  type: { type: String, enum: ['normal', 'reak'], required: true },
  prize: { type: String, required: true },
  endTime: { type: Date, required: true },
  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  messageId: { type: String, default: null },
  channelId: { type: String, default: null },
  participants: [{ type: String }],
  sourceMessageId: { type: String, default: null },
  sourceChannelId: { type: String, default: null },
  capturedReactions: [{ type: String }],
  winnerId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Roll', rollSchema);
