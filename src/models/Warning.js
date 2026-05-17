const mongoose = require('mongoose');
const Counter = require('./Counter');

const warningSchema = new mongoose.Schema({
  warningId: { type: Number, required: true, unique: true },
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  reason: { type: String, required: true },
  penaltyRoleId: { type: String, required: true },
  penaltyName: { type: String, required: true },
  addedBy: { type: String, required: true },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

warningSchema.pre('validate', async function() {
  if (this.isNew && !this.warningId) {
    this.warningId = await Counter.getNext('warning');
  }
});

module.exports = mongoose.model('Warning', warningSchema);
