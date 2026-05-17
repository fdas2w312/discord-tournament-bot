const mongoose = require('mongoose');

const warningSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  reason: { type: String, required: true },
  penaltyRoleId: { type: String, required: true },
  penaltyName: { type: String, required: true },
  addedBy: { type: String, required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Warning', warningSchema);
