const mongoose = require('mongoose');

const afkSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  durationMinutes: { type: Number, required: true },
  startedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  active: { type: Boolean, default: true }
});

afkSchema.pre('save', function(next) {
  if (this.isModified('durationMinutes') || this.isNew) {
    this.expiresAt = new Date(Date.now() + this.durationMinutes * 60 * 1000);
  }
  next();
});

module.exports = mongoose.model('AFK', afkSchema);
