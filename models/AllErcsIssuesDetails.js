const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
  issueNumber: { type: Number, required: true, unique: true },
  issueTitle: { type: String, required: true },
  issueDescription: { type: String },
  labels: [String],
  conversations: [Object],
  numConversations: { type: Number, default: 0 },
  participants: [String],
  numParticipants: { type: Number, default: 0 },
  state: { type: String, required: true },
  createdAt: { type: Date, required: true },
  closedAt: { type: Date },
  updatedAt: { type: Date, required: true },
  author: { type: String, required: true },
});

const AllErcsIssueDetails = mongoose.model('AllErcsIssueDetails', issueSchema);

module.exports = AllErcsIssueDetails;
