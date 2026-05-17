const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  tournamentId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Tournament', index: true },
  guildId: { type: String, required: true },
  name: { type: String, required: true },
  captainId: { type: String, required: true },
  members: [{ type: String }],
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'eliminated'], default: 'pending' },
  answers: [{ label: String, value: String }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Team', teamSchema);
