require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const AllEipsPrDetails = require('./models/AllEipsPrDetails');
const AllEipsIssueDetails = require('./models/AllEipsIssuesDetails');
const AllErcsPrDetails = require('./models/AllErcsPrDetails');
const AllErcsIssueDetails = require('./models/AllErcsIssuesDetails');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log('MongoDB connection error:', err));

// Fetch PR Details and Update in Database
const fetchPRDetails = async (prNumber, repo, model, existingPR = null) => {
  try {
    const prResponse = await axios.get(
      `https://api.github.com/repos/ethereum/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        },
      }
    );

    const prData = prResponse.data;

    // Fetch other details (e.g., comments)
    const commentsResponse = await axios.get(
      `https://api.github.com/repos/ethereum/${repo}/issues/${prNumber}/comments`,
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
      if (!existingPR.closedAt && prData.closed_at) {
        updateFields.closedAt = new Date(prData.closed_at);
      }
      if (!existingPR.mergedAt && prData.merged_at) {
        updateFields.mergedAt = new Date(prData.merged_at);
      }
      await model.updateOne({ prNumber: prNumber }, updateFields);
      console.log(`PR #${prNumber} updated in MongoDB`);
    } else {
      const newPrDetails = new model({
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
    console.log(`Error fetching PR #${prNumber} from ${repo}:`, error.message);
  }
};

// Fetch Issue Details and Update in Database
const fetchIssueDetails = async (issueNumber, repo, model, existingIssue = null) => {
  try {
    const issueResponse = await axios.get(
      `https://api.github.com/repos/ethereum/${repo}/issues/${issueNumber}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        },
      }
    );

    const issueData = issueResponse.data;

    // Ensure the fetched data is an issue, not a pull request
    if (issueData.pull_request) {
      console.log(`Skipping PR #${issueNumber} as it is not an issue.`);
      return;
    }

    const commentsResponse = await axios.get(
      `https://api.github.com/repos/ethereum/${repo}/issues/${issueNumber}/comments`,
      {
        headers: {
          Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        },
      }
    );
    const comments = commentsResponse.data;

    const updateFields = {
      labels: issueData.labels.map((label) => label.name),
      conversations: comments,
      numConversations: comments.length,
      participants: comments.map((comment) => comment.user.login),
      numParticipants: comments.length,
      state: issueData.state,
      closedAt: issueData.closed_at ? new Date(issueData.closed_at) : null,
      updatedAt: new Date(issueData.updated_at),
    };

    if (existingIssue) {
      if (!existingIssue.closedAt && issueData.closed_at) {
        updateFields.closedAt = new Date(issueData.closed_at);
      }
      await model.updateOne({ issueNumber: issueNumber }, updateFields);
      console.log(`Issue #${issueNumber} updated in MongoDB`);
    } else {
      const newIssueDetails = new model({
        issueNumber: issueData.number,
        issueTitle: issueData.title,
        issueDescription: issueData.body,
        ...updateFields,
        createdAt: new Date(issueData.created_at),
        author: issueData.user.login,
      });
      await newIssueDetails.save();
      console.log(`Issue #${issueNumber} saved to MongoDB`);
    }

    await delay(2000); // Delay to avoid hitting rate limits
  } catch (error) {
    console.log(`Error fetching issue #${issueNumber} from ${repo}:`, error.message);
  }
};

// Fetch all PRs in batches
const fetchAllPRDetails = async (repo, model) => {
  let page = 1;
  const perPage = 30;
  let hasMorePRs = true;

  while (hasMorePRs) {
    try {
      const prResponse = await axios.get(
        `https://api.github.com/repos/ethereum/${repo}/pulls`,
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
        const existingPR = await model.findOne({ prNumber: pr.number });

        if (existingPR) {
          console.log(`PR #${pr.number} already exists in the database.`);

          if (!existingPR.closedAt || !existingPR.mergedAt) {
            console.log(`PR #${pr.number} is not closed or merged. Checking for updates...`);
            await fetchPRDetails(pr.number, repo, model, existingPR);
          } else {
            console.log(`PR #${pr.number} is already closed or merged. Skipping...`);
          }
        } else {
          await fetchPRDetails(pr.number, repo, model);
        }

        await delay(2000);
      }

      page++;
      console.log(`Processed page ${page} of PRs for ${repo}.`);
    } catch (error) {
      console.log(`Error fetching PRs on page ${page} for ${repo}:`, error.message);
      hasMorePRs = false;
    }
  }
};

// Fetch all issues in batches
const fetchAllIssueDetails = async (repo, model) => {
  let page = 1;
  const perPage = 30;
  let hasMoreIssues = true;

  while (hasMoreIssues) {
    try {
      const issueResponse = await axios.get(
        `https://api.github.com/repos/ethereum/${repo}/issues`,
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

      const issues = issueResponse.data;

      if (issues.length === 0) {
        hasMoreIssues = false;
        break;
      }

      for (const issue of issues) {
        if (issue.pull_request) {
          console.log(`Skipping PR #${issue.number} as it is not an issue.`);
          continue;
        }

        const existingIssue = await model.findOne({ issueNumber: issue.number });

        if (existingIssue) {
          console.log(`Issue #${issue.number} already exists in the database.`);
          if (!existingIssue.closedAt) {
            console.log(`Issue #${issue.number} is not closed. Checking for updates...`);
            await fetchIssueDetails(issue.number, repo, model, existingIssue);
          } else {
            console.log(`Issue #${issue.number} is already closed. Skipping...`);
          }
        } else {
          await fetchIssueDetails(issue.number, repo, model);
        }

        await delay(2000);
      }

      page++;
      console.log(`Processed page ${page} of issues for ${repo}.`);
    } catch (error) {
      console.log(`Error fetching issues on page ${page} for ${repo}:`, error.message);
      hasMoreIssues = false;
    }
  }
};

// // Scheduler to run the process every 12 hours
// const schedulePRProcessing = () => {
//   fetchAllPRDetails('EIPs', AllEipsPrDetails);
//   fetchAllPRDetails('ERCs', AllErcsPrDetails);
//   setInterval(() => {
//     fetchAllPRDetails('EIPs', AllEipsPrDetails);
//     fetchAllPRDetails('ERCs', AllErcsPrDetails);
//   }, 12 * 60 * 60 * 1000);
// };

// const scheduleIssueProcessing = () => {
//   fetchAllIssueDetails('EIPs', AllEipsIssueDetails);
//   fetchAllIssueDetails('ERCs', AllErcsIssueDetails);
//   setInterval(() => {
//     fetchAllIssueDetails('EIPs', AllEipsIssueDetails);
//     fetchAllIssueDetails('ERCs', AllErcsIssueDetails);
//   }, 12 * 60 * 60 * 1000);
// };

// schedulePRProcessing();
// scheduleIssueProcessing();

const scheduleAllProcessing = async () => {
  await fetchAllPRDetails('EIPs', AllEipsPrDetails);
  await fetchAllIssueDetails('EIPs', AllEipsIssueDetails);
  await fetchAllPRDetails('ERCs', AllErcsPrDetails);
  await fetchAllIssueDetails('ERCs', AllErcsIssueDetails);
  setInterval(scheduleAllProcessing, 12 * 60 * 60 * 1000); // Run every 12 hours
};

// Start the scheduler
scheduleAllProcessing();