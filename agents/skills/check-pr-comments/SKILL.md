---
name: check-pr-comments
description: Check, summarize, and address comments and reviews on open pull requests
---

# check-pr-comments

Inspect open pull requests (or a specific PR) for review feedback, comments, and change requests, implement the requested updates, and reply to the comments.

## Core Directives

1. **Identify the Pull Request**:
   - Determine which pull request needs to be inspected.
   - If not specified, list all open pull requests for the repository using:
     - `gh pr list --state open --json number,title,headRefName,url`
   - Focus on the PR corresponding to your active branch or the target branch.

2. **Retrieve Reviews & Comments**:
   - Fetch general PR-level comments and reviews using:
     - `gh pr view <pr-number> --json comments,reviews,latestReviews`
   - Fetch inline code review comments (diff-level feedback) using the GitHub API:
     - `gh api /repos/{owner}/{repo}/pulls/<pr-number>/comments --jq '.[] | {id: .id, path: .path, line: .line, body: .body, user: .user.login, pull_request_review_id: .pull_request_review_id}'`
   - Filter out any comments or reviews created by yourself (the AI agent) to focus exclusively on feedback from human reviewers.

3. **Analyze & Map Feedback**:
   - Compile a list of actionable requests.
   - Map each inline code comment to the corresponding file, line range, and context in the active codebase.

4. **Implement Code Changes**:
   - Make the requested modifications in the codebase using file editing tools.
   - Run the project's tests, linters, or builders (e.g., `bun run test`, `npm run build`) to ensure the changes are correct and do not introduce regressions.

5. **Commit and Push Updates**:
   - Stage the changes: `git add <files>`
   - Commit using Gitmoji conventions (e.g., `🐛 fix review comment` or `♻️ address feedback on canvas`), adhering to the workspace's commit rules.
   - Push the commits to the remote PR branch.

6. **Reply to Feedback**:
   - Respond to the reviewer to let them know the feedback has been addressed:
     - For general feedback, post a PR-level comment:
       - `gh pr comment <pr-number> --body "Feedback addressed in <commit-hash>."`
     - For inline code review comments, reply directly to the comment thread to resolve it:
       - `gh api -X POST /repos/{owner}/{repo}/pulls/<pr-number>/comments/<comment-id>/replies -f body="Fixed in <commit-hash>."`
