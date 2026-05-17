const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  tournamentAdminRoles: [{ type: String }],
  tournamentParticipantRole: { type: String, default: null },
  warningAdminRoles: [{ type: String }],
  warningTargetRoles: [{ type: String }],
  warningPenalties: [{
    name: { type: String, required: true },
    roleId: { type: String, required: true }
  }]
});

module.exports = mongoose.model('Settings', settingsSchema);
