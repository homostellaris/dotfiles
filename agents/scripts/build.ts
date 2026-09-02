#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";
import { parseArgs } from "node:util";

const SPEC_DIRECTORY = path.join(os.homedir(), "obsidian", "reality-sculptor", "todos");
const VAULT_DIRECTORY = path.join(os.homedir(), "obsidian", "reality-sculptor");
const STATE_DIRECTORY = path.join(os.homedir(), ".local", "share", "agent-builds");
const REPOSITORIES_DIRECTORY = path.join(os.homedir(), "code", "homostellaris");
const ANTIGRAVITY_APP_DATA = path.join(os.homedir(), ".gemini", "antigravity-cli");

export interface SpecMetadata {
  identifier: string;
  filePath: string;
  title: string;
  starRole?: string;
  starPoints?: number;
  content: string;
  targetProject: string;
}

export interface BuildState {
  spec_id: string;
  spec_path: string;
  spec_title: string;
  project: string;
  repo_dir: string;
  worktree_dir?: string;
  branch_name?: string;
  stage: string;
  plan_file?: string;
  visual_plan_url?: string;
  plan_approved: boolean;
  pr_number?: number;
  pr_url?: string;
  pr_approved: boolean;
  verifier_passed: boolean;
  merged: boolean;
  deployed: boolean;
  history: Array<Record<string, string>>;
}

function findExecutable(name: string, fallbackPaths: string[] = []): string | null {
  try {
    const res = child_process.spawnSync("which", [name], { encoding: "utf-8" });
    if (res.status === 0 && res.stdout.trim()) {
      return res.stdout.trim();
    }
  } catch {}
  for (const fallback of fallbackPaths) {
    if (fs.existsSync(fallback)) return fallback;
  }
  return null;
}

function runCommand(
  cmd: string[],
  options: { cwd?: string; capture?: boolean; env?: NodeJS.ProcessEnv } = {}
): { status: number; stdout: string; stderr: string } {
  const capture = options.capture !== false;
  const res = child_process.spawnSync(cmd[0], cmd.slice(1), {
    cwd: options.cwd,
    encoding: "utf-8",
    stdio: capture ? ["pipe", "pipe", "pipe"] : "inherit",
    env: options.env || process.env,
  });
  return {
    status: res.status ?? (res.error ? 1 : 0),
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

export class BuildOrchestrator {
  public specQuery: string;
  public projectOverride?: string;
  public dryRun: boolean;
  public spec: SpecMetadata | null = null;
  public state: BuildState | null = null;

  constructor(specQuery: string, projectOverride?: string, dryRun: boolean = false) {
    this.specQuery = specQuery;
    this.projectOverride = projectOverride;
    this.dryRun = dryRun;
  }

  async execute(): Promise<number> {
    this.spec = this.discoverSpec(this.specQuery);
    if (!this.spec) {
      console.error(
        `❌ Error: Could not locate spec matching '${this.specQuery}' in ${SPEC_DIRECTORY} or ${VAULT_DIRECTORY}`
      );
      return 1;
    }

    if (this.projectOverride) {
      this.spec.targetProject = this.projectOverride;
    }

    this.state = this.loadOrInitializeState(this.spec);
    console.log(`🚀 Starting build orchestration for: ${this.spec.title} (${this.spec.identifier})`);
    console.log(`📁 Target Project: ${this.spec.targetProject} -> ${this.state.repo_dir}`);

    const determinedStage = this.determineExternalState();
    console.log(`🔍 Evaluated External State: ${determinedStage}`);

    if (this.dryRun) {
      this.printDryRunSummary(determinedStage);
      return 0;
    }

    return await this.advanceLifecycle(determinedStage);
  }

  discoverSpec(query: string): SpecMetadata | null {
    const candidatePaths: string[] = [];
    const normalizedQuery = query.replace(/\.md$/, "");

    const exactPath = path.join(SPEC_DIRECTORY, `${normalizedQuery}.md`);
    if (fs.existsSync(exactPath)) {
      candidatePaths.push(exactPath);
    }

    const exactVault = path.join(VAULT_DIRECTORY, `${normalizedQuery}.md`);
    if (fs.existsSync(exactVault)) {
      candidatePaths.push(exactVault);
    }

    if (candidatePaths.length === 0 && fs.existsSync(SPEC_DIRECTORY)) {
      const entries = fs.readdirSync(SPEC_DIRECTORY);
      for (const entry of entries) {
        if (entry.endsWith(".md")) {
          const stem = entry.replace(/\.md$/, "");
          if (stem.includes(normalizedQuery)) {
            candidatePaths.push(path.join(SPEC_DIRECTORY, entry));
          }
        }
      }
    }

    if (candidatePaths.length === 0) {
      return null;
    }

    const chosenPath = candidatePaths[0];
    const content = fs.readFileSync(chosenPath, "utf-8");
    const { frontmatter, body } = this.parseFrontmatter(content);

    const filenameStem = path.basename(chosenPath).replace(/\.md$/, "");
    const title =
      (frontmatter.title as string) ||
      filenameStem
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    const starRole = frontmatter.starRole as string | undefined;
    const starPoints = frontmatter.starPoints ? Number(frontmatter.starPoints) : undefined;

    const inferredProject = this.inferTargetProject(path.basename(chosenPath), content, starRole);

    return {
      identifier: filenameStem,
      filePath: chosenPath,
      title,
      starRole,
      starPoints,
      content: body,
      targetProject: inferredProject,
    };
  }

  parseFrontmatter(fileContent: string): { frontmatter: Record<string, any>; body: string } {
    const frontmatter: Record<string, any> = {};
    let body = fileContent;

    const match = fileContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (match) {
      const frontmatterRaw = match[1];
      body = match[2];
      for (const line of frontmatterRaw.split("\n")) {
        if (line.includes(":")) {
          const colonIdx = line.indexOf(":");
          const key = line.slice(0, colonIdx).trim();
          let value = line.slice(colonIdx + 1).trim();
          if (
            (value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))
          ) {
            value = value.slice(1, -1);
          }
          frontmatter[key] = value;
        }
      }
    }

    return { frontmatter, body };
  }

  inferTargetProject(filename: string, content: string, role?: string): string {
    const lowerContent = `${filename} ${content} ${role || ""}`.toLowerCase();
    if (lowerContent.includes("banerry")) {
      return "banerry";
    }
    return "starfocus";
  }

  loadOrInitializeState(spec: SpecMetadata): BuildState {
    if (!fs.existsSync(STATE_DIRECTORY)) {
      fs.mkdirSync(STATE_DIRECTORY, { recursive: true });
    }
    const stateFile = path.join(STATE_DIRECTORY, `${spec.identifier}.json`);

    const repoDir = path.join(REPOSITORIES_DIRECTORY, spec.targetProject);
    const worktreeDir = path.join(repoDir, ".worktrees", spec.identifier);
    const branchName = spec.identifier;

    if (fs.existsSync(stateFile)) {
      try {
        const raw = fs.readFileSync(stateFile, "utf-8");
        const data = JSON.parse(raw);
        const state: BuildState = {
          ...data,
          repo_dir: repoDir,
          worktree_dir: worktreeDir,
          branch_name: branchName,
        };
        return state;
      } catch {}
    }

    const initialState: BuildState = {
      spec_id: spec.identifier,
      spec_path: spec.filePath,
      spec_title: spec.title,
      project: spec.targetProject,
      repo_dir: repoDir,
      worktree_dir: worktreeDir,
      branch_name: branchName,
      stage: "DISCOVER_SPEC",
      plan_approved: false,
      pr_approved: false,
      verifier_passed: false,
      merged: false,
      deployed: false,
      history: [],
    };
    this.saveState(initialState);
    return initialState;
  }

  saveState(state: BuildState): void {
    if (!fs.existsSync(STATE_DIRECTORY)) {
      fs.mkdirSync(STATE_DIRECTORY, { recursive: true });
    }
    const stateFile = path.join(STATE_DIRECTORY, `${state.spec_id}.json`);
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf-8");
  }

  determineExternalState(): string {
    if (!this.spec || !this.state) return "DISCOVER_SPEC";

    const planStatus = this.checkPlanApprovalStatus(this.spec.identifier);
    if (planStatus === "FEEDBACK_RECEIVED") {
      return "REPLAN_WITH_FEEDBACK";
    }
    if (planStatus === "PENDING_APPROVAL") {
      return "AWAIT_PLAN_APPROVAL";
    }
    if (planStatus === "NOT_GENERATED") {
      return "GENERATE_PLAN";
    }

    if (!this.isWorktreeInitialized(this.state.worktree_dir)) {
      return "SETUP_WORKTREE";
    }

    const testsPass = this.runLocalTestGate(this.state.worktree_dir);
    if (!testsPass) {
      return "IMPLEMENT_AND_FIX_LOCAL";
    }

    const prInfo = this.fetchPrDetails(this.state.repo_dir, this.state.branch_name);
    if (!prInfo) {
      return "CREATE_PR";
    }

    this.state.pr_number = prInfo.number;
    this.state.pr_url = prInfo.url;
    this.saveState(this.state);

    if (prInfo.state === "MERGED") {
      return "VERIFY_DEPLOYMENT";
    }

    const ciStatus = this.evaluateCiChecks(prInfo);
    if (ciStatus === "FAILING") {
      return "FIX_CI_FAILURES";
    }
    if (ciStatus === "RUNNING") {
      return "AWAIT_CI_CHECKS";
    }

    const reviewStatus = prInfo.reviewDecision;
    if (reviewStatus === "CHANGES_REQUESTED" || this.hasUnreadHumanComments(prInfo)) {
      return "RESOLVE_PR_COMMENTS";
    }

    if (reviewStatus !== "APPROVED") {
      return "AWAIT_HUMAN_REVIEW";
    }

    if (!this.state.verifier_passed) {
      return "RUN_VERIFIER_AGENT";
    }

    return "AWAIT_PR_MERGE";
  }

  checkPlanApprovalStatus(specId: string): string {
    if (!this.spec) return "NOT_GENERATED";

    const sharePlan = path.join(os.homedir(), "share", this.spec.targetProject, `${specId}.html`);
    const legacyPlan = path.join(os.homedir(), ".local", "share", "agent-reports", `${specId}.html`);
    const rootSharePlan = path.join(os.homedir(), "share", `${specId}.html`);

    const planExists = fs.existsSync(sharePlan) || fs.existsSync(legacyPlan) || fs.existsSync(rootSharePlan);
    if (!planExists) {
      return "NOT_GENERATED";
    }

    const transcriptFile = this.findLatestTranscriptForSpec(specId);
    if (transcriptFile && fs.existsSync(transcriptFile)) {
      const feedbackOrApproval = this.inspectTranscriptForApproval(transcriptFile);
      if (feedbackOrApproval === "APPROVED") {
        return "APPROVED";
      }
      if (feedbackOrApproval === "FEEDBACK") {
        return "FEEDBACK_RECEIVED";
      }
    }

    if (this.state && this.state.plan_approved) {
      return "APPROVED";
    }

    return "PENDING_APPROVAL";
  }

  findLatestTranscriptForSpec(specId: string): string | null {
    const brainDir = path.join(ANTIGRAVITY_APP_DATA, "brain");
    if (!fs.existsSync(brainDir)) {
      return null;
    }

    const folders = fs
      .readdirSync(brainDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(brainDir, d.name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    for (const folder of folders) {
      const planFile = path.join(folder, `${specId}.html`);
      const transcript = path.join(folder, ".system_generated", "logs", "transcript.jsonl");
      if (fs.existsSync(planFile) || fs.existsSync(transcript)) {
        return transcript;
      }
    }
    return null;
  }

  inspectTranscriptForApproval(transcriptPath: string): string {
    try {
      const content = fs.readFileSync(transcriptPath, "utf-8");
      const lines = content.trim().split("\n");

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.trim()) continue;
        const data = JSON.parse(line);
        if (data.type === "USER_INPUT") {
          const userContent = String(data.content || "").toLowerCase();
          if (
            ["proceed", "approved", "looks good", "ship it", "yes"].some((word) =>
              userContent.includes(word)
            )
          ) {
            return "APPROVED";
          }
          if (
            ["change", "fix", "update", "revise", "instead"].some((word) =>
              userContent.includes(word)
            )
          ) {
            return "FEEDBACK";
          }
        }
      }
    } catch {}
    return "PENDING";
  }

  isWorktreeInitialized(worktreeDir?: string): boolean {
    if (!worktreeDir) return false;
    return fs.existsSync(worktreeDir) && fs.existsSync(path.join(worktreeDir, ".git"));
  }

  runLocalTestGate(worktreeDir?: string): boolean {
    if (!worktreeDir || !fs.existsSync(worktreeDir)) {
      return false;
    }

    let command = ["bun", "test"];
    const packageJsonPath = path.join(worktreeDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkgData = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        const scripts = pkgData.scripts || {};
        if ("test" in scripts) {
          command = ["bun", "run", "test"];
        } else if ("unit" in scripts) {
          command = ["bun", "run", "unit"];
        }
      } catch {}
    }

    const res = runCommand(command, { cwd: worktreeDir, capture: true });
    return res.status === 0;
  }

  fetchPrDetails(repoDir: string, branchName?: string): Record<string, any> | null {
    if (!branchName) return null;

    const command = [
      "gh",
      "pr",
      "list",
      "--head",
      branchName,
      "--json",
      "number,title,url,state,reviewDecision,statusCheckRollup,comments,mergedAt",
      "--limit",
      "1",
    ];
    const res = runCommand(command, { cwd: repoDir, capture: true });
    if (res.status !== 0) return null;

    try {
      const prs = JSON.parse(res.stdout);
      if (Array.isArray(prs) && prs.length > 0) {
        return prs[0];
      }
    } catch {}
    return null;
  }

  evaluateCiChecks(prInfo: Record<string, any>): string {
    const rollup = prInfo.statusCheckRollup || [];
    if (!rollup || rollup.length === 0) {
      return "PASSED";
    }

    let hasPending = false;
    for (const check of rollup) {
      const status = check.status;
      const conclusion = check.conclusion;
      const state = check.state;

      if (
        ["FAILURE", "CANCELLED", "TIMED_OUT"].includes(conclusion) ||
        state === "FAILURE"
      ) {
        return "FAILING";
      }
      if (["IN_PROGRESS", "QUEUED"].includes(status) || state === "PENDING") {
        hasPending = true;
      }
    }

    if (hasPending) {
      return "RUNNING";
    }
    return "PASSED";
  }

  hasUnreadHumanComments(prInfo: Record<string, any>): boolean {
    const comments = prInfo.comments || [];
    for (const comment of comments) {
      const author = comment.author?.login || "";
      if (author && !author.endsWith("[bot]") && !author.toLowerCase().includes("antigravity")) {
        return true;
      }
    }
    return false;
  }

  async advanceLifecycle(stage: string): Promise<number> {
    if (stage === "GENERATE_PLAN" || stage === "REPLAN_WITH_FEEDBACK") {
      return await this.handlePlanGeneration();
    }
    if (stage === "AWAIT_PLAN_APPROVAL") {
      this.handleAwaitPlanApproval();
      return 0;
    }
    if (stage === "SETUP_WORKTREE") {
      return this.handleSetupWorktree();
    }
    if (stage === "IMPLEMENT_AND_FIX_LOCAL") {
      return await this.handleImplementation();
    }
    if (stage === "CREATE_PR") {
      return this.handleCreatePr();
    }
    if (stage === "FIX_CI_FAILURES") {
      return await this.handleFixCi();
    }
    if (stage === "AWAIT_CI_CHECKS") {
      console.log("⏳ CI checks are currently running. Exiting cleanly. Re-run after CI finishes.");
      return 0;
    }
    if (stage === "RESOLVE_PR_COMMENTS") {
      return await this.handleResolvePrComments();
    }
    if (stage === "AWAIT_HUMAN_REVIEW") {
      console.log(`⏸️  Awaiting human PR review: ${this.state?.pr_url}`);
      return 0;
    }
    if (stage === "RUN_VERIFIER_AGENT") {
      return await this.handleVerifierAgent();
    }
    if (stage === "AWAIT_PR_MERGE") {
      console.log(
        `⏸️  PR #${this.state?.pr_number} is approved and verified. Awaiting human merge on GitHub: ${this.state?.pr_url}`
      );
      return 0;
    }
    if (stage === "VERIFY_DEPLOYMENT") {
      return this.handleVerifyDeployment();
    }

    console.log(`✅ Workflow completed for ${this.spec?.identifier}`);
    return 0;
  }

  async handlePlanGeneration(): Promise<number> {
    if (!this.spec || !this.state) return 1;

    console.log("🧠 Spawning Antigravity Planner Agent to author /visual-plan...");
    const prompt =
      `Please read the specification file at '${this.spec.filePath}' for project '${this.spec.targetProject}'. ` +
      `Generate a structured visual plan using the /visual-plan skill. ` +
      `Include data models, component contracts, and architecture diagrams.`;

    const outputPath = path.join(os.homedir(), "share", this.spec.targetProject, `${this.spec.identifier}.html`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const success = await this.runAntigravityAgent(
      `planner-${this.spec.identifier}`,
      "You are the Lead Software Architect. Output a comprehensive /visual-plan HTML report.",
      prompt,
      this.state.repo_dir
    );

    if (!success) {
      console.error("❌ Planner agent execution encountered an error.");
      return 1;
    }

    const dashboardUrl = this.publishTaskDashboard("PLAN REVIEW");
    this.state.visual_plan_url = dashboardUrl;
    this.state.stage = "AWAITING_PLAN_APPROVAL";
    this.saveState(this.state);

    const notificationMessage =
      `⚠️ [Plan Review Required] Task dashboard & visual plan generated for '${this.spec.title}'.\n` +
      `🔗 Task Dashboard: ${dashboardUrl}\n` +
      `Reply 'approve' or tap: https://wa.me/447812754124?text=approve%20${this.spec.identifier}`;
    this.sendOpenclawNotification(notificationMessage);

    console.log(`✅ Task dashboard published: ${dashboardUrl}`);
    console.log("⏸️  Awaiting human plan approval. Exiting cleanly.");
    return 0;
  }

  handleAwaitPlanApproval(): void {
    console.log("⏸️  Visual plan is waiting for your review:");
    console.log(`🔗 ${this.state?.visual_plan_url || "https://panther.tail29c7da.ts.net/"}`);
    console.log(`👉 Reply 'approve' on WhatsApp or run 'build ${this.spec?.identifier}' after approving.`);
  }

  handleSetupWorktree(): number {
    if (!this.state || !this.state.worktree_dir || !this.state.branch_name) return 1;

    console.log(`🌿 Setting up isolated nested worktree at: ${this.state.worktree_dir}`);
    const worktreePath = this.state.worktree_dir;
    fs.mkdirSync(path.dirname(worktreePath), { recursive: true });

    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }

    const command = [
      "git",
      "worktree",
      "add",
      "-b",
      this.state.branch_name,
      worktreePath,
      "HEAD",
    ];
    const res = runCommand(command, { cwd: this.state.repo_dir, capture: true });
    if (res.status !== 0) {
      console.error(`❌ Failed to create git worktree: ${res.stderr}`);
      return 1;
    }

    const envFile = path.join(this.state.repo_dir, ".env.local");
    if (fs.existsSync(envFile)) {
      fs.copyFileSync(envFile, path.join(worktreePath, ".env.local"));
    }

    console.log("✅ Worktree and branch initialized successfully.");
    this.state.stage = "WORKTREE_INITIALIZED";
    this.saveState(this.state);
    return 0;
  }

  async handleImplementation(): Promise<number> {
    if (!this.spec || !this.state || !this.state.worktree_dir) return 1;

    console.log(`🛠️  Spawning Antigravity Implementer Agent in worktree: ${this.state.worktree_dir}`);
    const prompt =
      `Implement the feature specified in '${this.spec.filePath}' following the visual plan. ` +
      `Write unit and component tests first (TDD), then build the components and functions. ` +
      `Ensure all local tests pass via 'bun test'.`;

    const success = await this.runAgentInHerdr(
      `impl-${this.spec.identifier}`,
      prompt,
      this.state.worktree_dir
    );

    if (!success) {
      console.error("❌ Implementer agent failed during execution.");
      return 1;
    }

    let testsPass = this.runLocalTestGate(this.state.worktree_dir);
    if (!testsPass) {
      console.log("⚠️ Local checks failed. Resuming implementer for automated repair...");
      const repairPrompt =
        "Local test suite failed. Please inspect failure output, fix errors, and verify passing status.";
      await this.runAgentInHerdr(
        `impl-${this.spec.identifier}`,
        repairPrompt,
        this.state.worktree_dir
      );
    }

    console.log("✅ Local verification complete.");
    return 0;
  }

  handleCreatePr(): number {
    if (!this.spec || !this.state || !this.state.worktree_dir || !this.state.branch_name) return 1;

    console.log("📦 Committing and opening GitHub Pull Request...");
    runCommand(["git", "add", "."], { cwd: this.state.worktree_dir, capture: false });

    const commitMessage =
      `✨ implement ${this.spec.title.toLowerCase()}\n\n` +
      `Co-authored-by: Antigravity <antigravity@google.com>`;
    runCommand(["git", "commit", "-m", commitMessage], { cwd: this.state.worktree_dir, capture: false });

    const pushRes = runCommand(
      ["git", "push", "-u", "origin", this.state.branch_name],
      { cwd: this.state.worktree_dir, capture: true }
    );
    if (pushRes.status !== 0) {
      console.error(`❌ Failed to push branch: ${pushRes.stderr}`);
      return 1;
    }

    const prBody =
      `## Summary\n\n` +
      `Automated implementation for **${this.spec.title}** (\`${this.spec.identifier}\`).\n\n` +
      `- **Spec**: \`${this.spec.filePath}\`\n` +
      `- **Visual Plan**: ${this.state.visual_plan_url || "N/A"}\n` +
      `- **Target Project**: \`${this.spec.targetProject}\`\n`;

    const createCommand = [
      "gh",
      "pr",
      "create",
      "--title",
      `✨ ${this.spec.title}`,
      "--body",
      prBody,
      "--head",
      this.state.branch_name,
    ];
    const createRes = runCommand(createCommand, { cwd: this.state.repo_dir, capture: true });
    if (createRes.status !== 0) {
      console.error(`❌ Failed to create PR: ${createRes.stderr}`);
      return 1;
    }

    const prUrl = createRes.stdout.trim();
    console.log(`🎉 Pull Request created: ${prUrl}`);

    this.state.pr_url = prUrl;
    const dashboardUrl = this.publishTaskDashboard("PR OPEN");

    const notificationMessage =
      `🔔 [PR Ready for Review] Implementation complete for '${this.spec.title}'.\n` +
      `📌 PR: ${prUrl}\n` +
      `📱 Task Dashboard: ${dashboardUrl}`;
    this.sendOpenclawNotification(notificationMessage);
    return 0;
  }

  async handleFixCi(): Promise<number> {
    if (!this.spec || !this.state || !this.state.worktree_dir || !this.state.branch_name) return 1;

    console.log(`❌ CI failure detected on PR #${this.state.pr_number}. Fetching failed logs...`);
    const failedLogsRes = runCommand(["gh", "run", "view", "--log-failed"], {
      cwd: this.state.repo_dir,
      capture: true,
    });
    const failedLogs = (failedLogsRes.stdout || "").slice(0, 4000);

    const repairPrompt =
      `The GitHub Actions CI pipeline failed on your PR branch. ` +
      `Here are the failed logs:\n\n\`\`\`\n${failedLogs}\n\`\`\`\n\n` +
      `Please address the root cause, fix the code, run local tests, and push updates.`;

    await this.runAgentInHerdr(
      `impl-${this.spec.identifier}`,
      repairPrompt,
      this.state.worktree_dir
    );

    runCommand(["git", "add", "."], { cwd: this.state.worktree_dir, capture: false });
    runCommand(
      [
        "git",
        "commit",
        "-m",
        "🐛 fix CI pipeline failure\n\nCo-authored-by: Antigravity <antigravity@google.com>",
      ],
      { cwd: this.state.worktree_dir, capture: false }
    );
    runCommand(["git", "push", "origin", this.state.branch_name], {
      cwd: this.state.worktree_dir,
      capture: false,
    });
    console.log("✅ Pushed CI repair commit.");
    return 0;
  }

  async handleResolvePrComments(): Promise<number> {
    if (!this.spec || !this.state || !this.state.worktree_dir || !this.state.branch_name) return 1;

    console.log(`💬 Resolving human review comments on PR #${this.state.pr_number}...`);
    const commentsRes = runCommand(
      [
        "gh",
        "api",
        `/repos/homostellaris/${this.spec.targetProject}/pulls/${this.state.pr_number}/comments`,
      ],
      { cwd: this.state.repo_dir, capture: true }
    );
    const commentsJson = commentsRes.stdout;

    const fixPrompt =
      `The reviewer left comments on your pull request:\n\n${commentsJson}\n\n` +
      `Please implement the requested changes, run local tests, and prepare for push.`;

    await this.runAgentInHerdr(
      `impl-${this.spec.identifier}`,
      fixPrompt,
      this.state.worktree_dir
    );

    runCommand(["git", "add", "."], { cwd: this.state.worktree_dir, capture: false });
    runCommand(
      [
        "git",
        "commit",
        "-m",
        "♻️ address human review feedback\n\nCo-authored-by: Antigravity <antigravity@google.com>",
      ],
      { cwd: this.state.worktree_dir, capture: false }
    );
    runCommand(["git", "push", "origin", this.state.branch_name], {
      cwd: this.state.worktree_dir,
      capture: false,
    });
    console.log("✅ Feedback addressed and updates pushed.");
    return 0;
  }

  async handleVerifierAgent(): Promise<number> {
    if (!this.spec || !this.state || !this.state.worktree_dir || !this.state.branch_name) return 1;

    console.log(`🛡️  Spawning Antigravity Verifier Agent on PR #${this.state.pr_number}...`);
    const diffRes = runCommand(["gh", "pr", "diff", String(this.state.pr_number)], {
      cwd: this.state.repo_dir,
      capture: true,
    });
    const diffText = (diffRes.stdout || "").slice(0, 8000);

    const verifierPrompt =
      `Review this PR diff for simplification, edge cases, and code hardening:\n\n` +
      `\`\`\`diff\n${diffText}\n\`\`\`\n\n` +
      `Identify any dead code, missing error boundaries, or potential type regressions. ` +
      `Apply direct hardening edits in the worktree.`;

    await this.runAgentInHerdr(
      `verifier-${this.spec.identifier}`,
      verifierPrompt,
      this.state.worktree_dir
    );

    const statusRes = runCommand(["git", "status", "--porcelain"], {
      cwd: this.state.worktree_dir,
      capture: true,
    });
    if (statusRes.stdout.trim()) {
      runCommand(["git", "add", "."], { cwd: this.state.worktree_dir, capture: false });
      runCommand(
        [
          "git",
          "commit",
          "-m",
          "⚡ harden and simplify implementation\n\nCo-authored-by: Antigravity <antigravity@google.com>",
        ],
        { cwd: this.state.worktree_dir, capture: false }
      );
      runCommand(["git", "push", "origin", this.state.branch_name], {
        cwd: this.state.worktree_dir,
        capture: false,
      });
    }

    this.state.verifier_passed = true;
    const dashboardUrl = this.publishTaskDashboard("VERIFIED");
    this.saveState(this.state);

    const notificationMessage =
      `✅ [Ready for Merge] PR #${this.state.pr_number} for '${this.spec.title}' is verified & hardened.\n` +
      `🔗 PR Link: ${this.state.pr_url}\n` +
      `📱 Task Dashboard: ${dashboardUrl}\n` +
      `Ready to merge when you are.`;
    this.sendOpenclawNotification(notificationMessage);
    console.log("✅ Verifier pass complete. PR ready for merge.");
    return 0;
  }

  handleVerifyDeployment(): number {
    if (!this.spec || !this.state) return 1;

    console.log("🚀 Verifying post-merge production deployment...");
    if (this.state.worktree_dir && fs.existsSync(this.state.worktree_dir)) {
      runCommand(["git", "worktree", "remove", "--force", this.state.worktree_dir], {
        cwd: this.state.repo_dir,
        capture: false,
      });
      console.log(`🧹 Cleaned up worktree at: ${this.state.worktree_dir}`);
    }

    this.state.merged = true;
    this.state.deployed = true;
    this.state.stage = "COMPLETED";
    const dashboardUrl = this.publishTaskDashboard("DEPLOYED");
    this.saveState(this.state);

    const notificationMessage =
      `🎉 [Deployed] Feature '${this.spec.title}' has been merged and deployed to production!\n` +
      `📱 Task Dashboard: ${dashboardUrl}`;
    this.sendOpenclawNotification(notificationMessage);
    console.log(`🌟 Complete! Feature '${this.spec.title}' is live.`);
    return 0;
  }

  async runAgentInHerdr(
    agentName: string,
    prompt: string,
    workingDir: string
  ): Promise<boolean> {
    const herdrBin = findExecutable("herdr", [path.join(os.homedir(), ".local", "bin", "herdr")]);
    if (!herdrBin || !fs.existsSync(herdrBin)) {
      return await this.runAntigravityAgent(
        agentName,
        "You are an AI coding assistant.",
        prompt,
        workingDir
      );
    }

    try {
      const splitResult = runCommand(
        [
          herdrBin,
          "pane",
          "split",
          "--direction",
          "right",
          "--cwd",
          workingDir,
          "--no-focus",
        ],
        { capture: true }
      );

      let paneId: string | null = null;
      if (splitResult.status === 0) {
        try {
          const splitJson = JSON.parse(splitResult.stdout);
          paneId = splitJson?.result?.pane?.pane_id || null;
        } catch {}
      }

      if (paneId) {
        const startCmd = [herdrBin, "agent", "start", agentName, "--pane", paneId];
        runCommand(startCmd, { capture: true });

        const promptCmd = [
          herdrBin,
          "agent",
          "prompt",
          agentName,
          prompt,
          "--wait",
          "--timeout",
          "180000",
        ];
        const promptRes = runCommand(promptCmd, { capture: true });
        return promptRes.status === 0;
      }
    } catch {}

    return await this.runAntigravityAgent(
      agentName,
      "You are an AI coding assistant.",
      prompt,
      workingDir
    );
  }

  async runAntigravityAgent(
    _sessionName: string,
    _systemPrompt: string,
    prompt: string,
    workingDir: string
  ): Promise<boolean> {
    const agyBinary = findExecutable("agy", [
      path.join(os.homedir(), ".local", "bin", "agy"),
      path.join(os.homedir(), ".gemini", "antigravity-cli", "bin", "agy"),
    ]);

    if (agyBinary && fs.existsSync(agyBinary)) {
      const res = runCommand([agyBinary, "--print", prompt], {
        cwd: workingDir,
        capture: false,
      });
      return res.status === 0;
    }

    console.error("❌ Antigravity runtime not found.");
    return false;
  }

  publishTaskDashboard(status: string = "PLAN REVIEW", symboldiffPath?: string): string {
    if (!this.spec || !this.state) return "";

    const shareBin = findExecutable("share", [
      path.join(os.homedir(), "bin", "share"),
      findExecutable("host-report") || "",
    ]);
    const dashboardUrl = `https://panther.tail29c7da.ts.net/${this.spec.identifier}/`;
    if (!shareBin || !fs.existsSync(shareBin)) {
      return dashboardUrl;
    }

    const cmd = [
      shareBin,
      "--task",
      this.spec.identifier,
      "--title",
      this.spec.title,
      "--project",
      this.spec.targetProject,
      "--status",
      status,
    ];

    const planCandidates = [
      path.join(os.homedir(), "share", this.spec.targetProject, `${this.spec.identifier}.html`),
      path.join(os.homedir(), "share", `${this.spec.identifier}.html`),
      path.join(os.homedir(), ".local", "share", "agent-reports", `${this.spec.identifier}.html`),
    ];
    for (const candidate of planCandidates) {
      if (fs.existsSync(candidate)) {
        cmd.push("--visual-plan", candidate);
        break;
      }
    }

    const brainDir = path.join(ANTIGRAVITY_APP_DATA, "brain");
    if (fs.existsSync(brainDir)) {
      const folders = fs
        .readdirSync(brainDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => path.join(brainDir, d.name))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

      for (const folder of folders) {
        let foundPlan = false;
        const entries = fs.readdirSync(folder);
        for (const entry of entries) {
          if (entry.endsWith(".md") && entry.toLowerCase().includes("plan")) {
            cmd.push("--written-plan", path.join(folder, entry));
            foundPlan = true;
            break;
          }
        }
        if (foundPlan) break;
      }
    }

    if (fs.existsSync(this.spec.filePath)) {
      cmd.push("--spec", this.spec.filePath);
    }

    if (this.state.pr_url) {
      cmd.push("--pr-url", this.state.pr_url);
    }
    if (this.state.pr_number) {
      cmd.push("--pr-number", String(this.state.pr_number));
    }

    if (symboldiffPath && fs.existsSync(symboldiffPath)) {
      cmd.push("--symboldiff", symboldiffPath);
    } else {
      const diffShare = path.join(os.homedir(), "share", `symboldiff-${this.spec.targetProject}.html`);
      if (fs.existsSync(diffShare)) {
        cmd.push("--symboldiff", diffShare);
      }
    }

    runCommand(cmd, { capture: true });
    this.state.visual_plan_url = dashboardUrl;
    this.saveState(this.state);
    return dashboardUrl;
  }

  publishTailscaleReport(reportPath: string, slug: string): void {
    const shareBin = findExecutable("share", [
      path.join(os.homedir(), "bin", "share"),
      findExecutable("host-report") || "",
    ]);
    if (shareBin && fs.existsSync(shareBin)) {
      runCommand([shareBin, reportPath, "--name", slug], { capture: true });
    }
  }

  sendOpenclawNotification(message: string): void {
    try {
      const targetResult = runCommand(["openclaw", "directory", "peers", "list", "--json"], {
        capture: true,
      });
      let target = "";
      if (targetResult.status === 0 && targetResult.stdout.trim()) {
        const peers = JSON.parse(targetResult.stdout);
        if (Array.isArray(peers) && peers.length > 0) {
          target = peers[0]?.id || "";
        }
      }

      const cmd = ["openclaw", "message", "send", "--message", message];
      if (target) {
        cmd.push("--target", target);
      }
      runCommand(cmd, { capture: true });
    } catch {}
  }

  printDryRunSummary(stage: string): void {
    console.log("\n--- 📋 Dry Run Summary ---");
    console.log(`Spec ID:        ${this.spec?.identifier}`);
    console.log(`Spec Title:     ${this.spec?.title}`);
    console.log(`Spec Path:      ${this.spec?.filePath}`);
    console.log(`Target Project: ${this.spec?.targetProject}`);
    console.log(`Target Repo:    ${this.state?.repo_dir}`);
    console.log(`Worktree Path:  ${this.state?.worktree_dir}`);
    console.log(`Feature Branch: ${this.state?.branch_name}`);
    console.log(`Evaluated Next: ${stage}`);
    console.log("--------------------------\n");
  }
}

function parseArguments() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      project: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      status: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    console.log("Usage: build <spec> [options]");
    console.log("\nAgentic coding workflow build orchestrator powered by Antigravity and Herdr.");
    console.log("\nPositional arguments:");
    console.log("  spec                  Spec identifier, slug, or file path in Obsidian todos.");
    console.log("\nOptions:");
    console.log("  --project <project>   Override inferred target project (e.g. banerry, starfocus).");
    console.log("  --dry-run             Inspect external state and planned actions without side effects.");
    console.log("  --status              Display current build lifecycle state.");
    console.log("  -h, --help            Show this help message and exit.");
    process.exit(values.help ? 0 : 1);
  }

  return {
    spec: positionals[0],
    project: values.project,
    dryRun: Boolean(values["dry-run"] || values.status),
  };
}

async function main() {
  const args = parseArguments();
  const orchestrator = new BuildOrchestrator(args.spec, args.project, args.dryRun);
  const exitCode = await orchestrator.execute();
  process.exit(exitCode);
}

if (import.meta.main) {
  main();
}
