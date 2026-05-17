const mongoose = require('mongoose');
const Counter = require('./Counter');

const rollSchema = new mongoose.Schema({
  rollId: { type: Number, required: true, unique: true },
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

rollSchema.pre('validate', async function() {
  if (this.isNew && !this.rollId) {
    this.rollId = await Counter.getNext('roll');
  }
});

module.exports = mongoose.model('Roll', rollSchema);
