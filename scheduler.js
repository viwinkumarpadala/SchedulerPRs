require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const AllErcsPrDetails = require('./models/AllErcsPrDetails');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log('MongoDB connection error:', err));

const fetchPRDetails = async (prNumber, existingPR = null) => {
  try {
    const prResponse = await axios.get(
      `https://api.github.com/repos/ethereum/ERCs/pulls/${prNumber}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        },
      }
    );

    const prData = prResponse.data;

    // Fetch other details (e.g., comments)
    const commentsResponse = await axios.get(
      `https://api.github.com/repos/ethereum/ERCs/issues/${prNumber}/comments`,
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        },
      }
    );
    const comments = commentsResponse.data;

    const updateFields = {
      labels: prData.labels.map((label) => label.name),
      conversations: comments,
      numConversations: comments.length,
      participants: comments.map((comment) => comment.user.login),
      numParticipants: comments.length,
      mergeDate: prData.merged_at ? new Date(prData.merged_at) : null,
      closedAt: prData.closed_at ? new Date(prData.closed_at) : null,
      mergedAt: prData.merged_at ? new Date(prData.merged_at) : null,
    };

    if (existingPR) {
      // If PR exists but closedAt or mergedAt is null, update them if the PR is closed or merged
      if (!existingPR.closedAt && prData.closed_at) {
        updateFields.closedAt = new Date(prData.closed_at);
      }
      if (!existingPR.mergedAt && prData.merged_at) {
        updateFields.mergedAt = new Date(prData.merged_at);
      }
      await AllErcsPrDetails.updateOne({ prNumber: prNumber }, updateFields);
      console.log(`PR #${prNumber} updated in MongoDB`);
    } else {
      // Save PR details if it's a new PR
      const newPrDetails = new AllErcsPrDetails({
        prNumber: prData.number,
        prTitle: prData.title,
        prDescription: prData.body,
        ...updateFields,
        createdAt: new Date(prData.created_at),
      });
      await newPrDetails.save();
      console.log(`PR #${prNumber} saved to MongoDB`);
    }

    await delay(2000); // Delay to avoid hitting rate limits
  } catch (error) {
    console.log(`Error fetching PR #${prNumber}:`, error.message);
  }
};

// Fetch all PRs in batches
const fetchAllPRDetails = async () => {
  let page = 1;
  const perPage = 30;
  let hasMorePRs = true;

  while (hasMorePRs) {
    try {
      const prResponse = await axios.get(
        `https://api.github.com/repos/ethereum/ERCs/pulls`,
        {
          params: {
            state: 'all',
            page,
            per_page: perPage,
          },
          headers: {
            Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
          },
        }
      );

      const prs = prResponse.data;

      if (prs.length === 0) {
        hasMorePRs = false;
        break;
      }

      for (const pr of prs) {
        // Check if PR already exists in the database
        const existingPR = await AllErcsPrDetails.findOne({ prNumber: pr.number });

        if (existingPR) {
          console.log(`PR #${pr.number} already exists in the database.`);

          // If PR is not closed yet, check for updates
          if (!existingPR.closedAt || !existingPR.mergedAt) {
            console.log(`PR #${pr.number} is not closed or merged. Checking for updates...`);
            await fetchPRDetails(pr.number, existingPR);
          } else {
            console.log(`PR #${pr.number} is already closed or merged. Skipping...`);
          }
        } else {
          // Fetch and store PR details if not in the database
          await fetchPRDetails(pr.number);
        }

        await delay(2000);
      }

      page++;
      console.log(`Processed page ${page} of PRs.`);
    } catch (error) {
      console.log(`Error fetching PRs on page ${page}:`, error.message);
      hasMorePRs = false;
    }
  }
};

// Scheduler to run the process every 12 hours
const schedulePRProcessing = () => {
  fetchAllPRDetails();
  setInterval(fetchAllPRDetails, 12 * 60 * 60 * 1000);
};

// Start the scheduler
schedulePRProcessing();
