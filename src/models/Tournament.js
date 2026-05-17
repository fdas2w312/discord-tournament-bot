const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  teamSize: { type: Number, required: true },
  customSize: { type: Number, default: null },
  status: { type: String, enum: ['open', 'ongoing', 'completed'], default: 'open' },
  questionnaire: [{
    label: { type: String, required: true },
    style: { type: String, enum: ['SHORT', 'PARAGRAPH'], default: 'SHORT' },
    required: { type: Boolean, default: true }
  }],
  adminRoles: [{ type: String }],
  participantRole: { type: String, default: null },
  panelMessageId: { type: String, default: null },
  panelChannelId: { type: String, default: null },
  winnerTeamId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Tournament', tournamentSchema);
