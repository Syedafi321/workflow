import axios from 'axios';
import { Octokit } from "@octokit/rest";
import { context } from '@actions/github';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function getOpenPullRequests() {
  const { data: pullRequests } = await octokit.pulls.list({
    owner: context.repo.owner,
    repo: context.repo.repo,
    state: 'open'
  });

  return pullRequests;
}

async function getReviewers(owner, repo, pull_number) {
  const { data: reviews } = await octokit.pulls.listReviews({
    owner,
    repo,
    pull_number
  });

  const { data: reviewRequests } = await octokit.pulls.listReviewRequests({
    owner,
    repo,
    pull_number
  });

  const reviewers = reviews.map(review => review.user.login);
  const requestedReviewers = reviewRequests.users.map(user => user.login);

  return [...new Set([...reviewers, ...requestedReviewers])];
}

async function generateReport() {
  const pullRequests = await getOpenPullRequests();
  const owner = context.repo.owner;
  const repo = context.repo.repo;

  if (pullRequests.length === 0) {
    return 'No open pull requests at the moment.';
  }

  let report = 'Daily Report: Open Pull Requests\n\n';
  report += '| PR | Author | From | To | Files Changed | Open Days | Reviewers |\n';
  report += '|---|--------|------|----|---------------|-----------|-----------|\n';

  for (const pr of pullRequests) {
    const filesChanged = pr.changed_files;
    const openDays = Math.floor((new Date() - new Date(pr.created_at)) / (1000 * 60 * 60 * 24));
    const reviewers = await getReviewers(owner, repo, pr.number);

    report += `| [#${pr.number}](${pr.html_url}) | ${pr.user.login} | ${pr.head.ref} | ${pr.base.ref} | ${filesChanged} | ${openDays} | ${reviewers.join(', ')} |\n`;
  }

  return report;
}

async function sendReportToSlack(report) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  await axios.post(webhookUrl, {
    text: report,
  });
}

(async () => {
  try {
    const report = await generateReport();
    await sendReportToSlack(report);
  } catch (error) {
    console.error('Error generating or sending the report:', error);
  }
})();
