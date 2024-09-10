const mongoose = require('mongoose');

const prDetailsSchema = new mongoose.Schema({
  prNumber: {
    type: Number,
    required: true,
  },
  prTitle: {
    type: String,
    required: true,
  },
  prDescription: {
    type: String,
  },
  labels: {
    type: [String],
  },
  conversations: {
    type: Array,
  },
  numConversations: {
    type: Number,
  },
  participants: {
    type: [String],
  },
  numParticipants: {
    type: Number,
  },
  commits: {
    type: Array,
  },
  numCommits: {
    type: Number,
  },
  filesChanged: {
    type: [String],
  },
  numFilesChanged: {
    type: Number,
  },
  mergeDate: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  closedAt: {
    type: Date,
  },
  mergedAt: {
    type: Date,
  }
});

// Export the model
module.exports = mongoose.model('AllErcsPrDetails', prDetailsSchema);
