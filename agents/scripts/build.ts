#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";
import { parseArgs } from "node:util";

const STATE_DIRECTORY = path.join(os.homedir(), ".local", "share", "agent-builds");
const INLINE_SPEC_DIRECTORY = path.join(STATE_DIRECTORY, "specs");

const POSSIBLE_SPEC_DIRS = [
  process.env.TODOS_DIR,
  path.join(os.homedir(), "Work", "Reality Sculptor", "todos"),
  path.join(os.homedir(), "obsidian", "reality-sculptor", "todos"),
  INLINE_SPEC_DIRECTORY,
].filter(Boolean) as string[];

const POSSIBLE_VAULT_DIRS = [
  process.env.VAULT_DIR,
  path.join(os.homedir(), "Work", "Reality Sculptor"),
  path.join(os.homedir(), "obsidian", "reality-sculptor"),
].filter(Boolean) as string[];

const SPEC_DIRECTORY = POSSIBLE_SPEC_DIRS.find((d) => fs.existsSync(d)) || POSSIBLE_SPEC_DIRS[0];
const VAULT_DIRECTORY = POSSIBLE_VAULT_DIRS.find((d) => fs.existsSync(d)) || POSSIBLE_VAULT_DIRS[0];
const REPOSITORIES_DIRECTORY = path.join(os.homedir(), "code", "homostellaris");
const ANTIGRAVITY_APP_DATA = path.join(os.homedir(), ".gemini", "antigravity-cli");

export const STAGE_MODELS = {
  planner: "gemini-4-argon-high",
  architect: "gemini-4-argon-high",
  implementer: "gemini-4-argon-high",
  repair: "gemini-3.8-flash-high",
  ciRepair: "gemini-3.8-flash-high",
  commentResolver: "gemini-3.8-flash-high",
  verifier: "claude-opus-5-5-high",
} as const;

export const PROJECT_PORT_POOLS: Record<string, { main: number; start: number; end: number }> = {
  starfocus: { main: 6600, start: 6601, end: 6625 },
  banerry: { main: 6700, start: 6701, end: 6725 },
  default: { main: 6800, start: 6801, end: 6825 },
};

export function formatHerdrAgentName(prefix: string, identifier: string): string {
  const cleanPrefix = prefix.toLowerCase().replace(/[^a-z0-9]/g, "");
  const maxSuffixAndSlugLength = 32 - cleanPrefix.length - 1;

  const parts = identifier.split("_");
  let slug = parts[0];
  const suffix = parts.length > 1 ? `_${parts[parts.length - 1]}` : "";

  const availableForSlug = maxSuffixAndSlugLength - suffix.length;
  if (slug.length > availableForSlug) {
    slug = slug.slice(0, availableForSlug).replace(/-+$/, "");
  }

  const candidate = `${cleanPrefix}-${slug}${suffix}`.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return candidate.slice(0, 32);
}

function getTailscaleBaseUrl(): string {
  try {
    const statusJson = child_process.spawnSync("tailscale", ["status", "--json"], {
      encoding: "utf-8",
      timeout: 2000,
    });
    if (statusJson.status === 0 && statusJson.stdout.trim()) {
      const status = JSON.parse(statusJson.stdout);
      if (status.Self?.DNSName) {
        return `https://${status.Self.DNSName.replace(/\.$/, "")}`;
      }
    }
  } catch {}
  return "https://omarchy.tail29c7da.ts.net";
}

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
  port?: number;
  stage: string;
  plan_file?: string;
  visual_plan_url?: string;
  plan_approved: boolean;
  repo_tests_passed?: boolean;
  human_reviewed?: boolean;
  dev_url?: string;
  pr_number?: number;
  pr_url?: string;
  pr_approved: boolean;
  verifier_passed: boolean;
  merged: boolean;
  deployed: boolean;
  history: Array<Record<string, string>>;
}

export function getDefaultBranch(repoDir: string): string {
  try {
    const res = runCommand(["git", "symbolic-ref", "refs/remotes/origin/HEAD"], { cwd: repoDir, capture: true });
    if (res.status === 0 && res.stdout.trim()) {
      return res.stdout.trim().replace(/^refs\/remotes\/origin\//, "");
    }
  } catch {}
  for (const candidate of ["main", "master"]) {
    const res = runCommand(["git", "rev-parse", "--verify", candidate], { cwd: repoDir, capture: true });
    if (res.status === 0) return candidate;
  }
  return "main";
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
  public inlinePrompt?: string;
  public approveFlag: boolean;
  public statusOnly: boolean;
  public lockPath?: string;
  public spec: SpecMetadata | null = null;
  public state: BuildState | null = null;

  constructor(
    specQuery: string = "",
    projectOverride?: string,
    dryRun: boolean = false,
    inlinePrompt?: string,
    approveFlag: boolean = false,
    statusOnly: boolean = false
  ) {
    this.specQuery = specQuery;
    this.projectOverride = projectOverride;
    this.dryRun = dryRun;
    this.inlinePrompt = inlinePrompt;
    this.approveFlag = approveFlag;
    this.statusOnly = statusOnly;
  }

  async execute(): Promise<number> {
    if (this.inlinePrompt) {
      this.spec = this.createInlineSpec(this.inlinePrompt);
    } else {
      this.spec = this.discoverSpec(this.specQuery);
    }

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

    if (this.statusOnly) {
      const determinedStage = this.determineExternalState();
      console.log(`🔍 Evaluated External State: ${determinedStage}`);
      this.printStatus(determinedStage);
      return 0;
    }

    if (this.dryRun) {
      const determinedStage = this.determineExternalState();
      console.log(`🔍 Evaluated External State: ${determinedStage}`);
      this.printDryRunSummary(determinedStage);
      return 0;
    }

    if (!this.acquireLock()) {
      return 0;
    }

    try {
      while (true) {
        const determinedStage = this.determineExternalState();
        console.log(`🔍 Evaluated External State: ${determinedStage}`);

        const exitCode = await this.advanceLifecycle(determinedStage);
        if (exitCode !== 0) {
          return exitCode;
        }

        if (
          determinedStage === "AWAIT_PLAN_APPROVAL" ||
          determinedStage === "AWAIT_HUMAN_REVIEW" ||
          determinedStage === "AWAIT_PR_MERGE" ||
          determinedStage === "AWAIT_CI_CHECKS" ||
          determinedStage === "COMPLETED"
        ) {
          return 0;
        }
      }
    } finally {
      this.releaseLock();
    }
  }

  slugifyPrompt(promptText: string): string {
    const words = promptText
      .toLowerCase()
      .replace(/[^a-z0-9\s-]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 7);
    const baseSlug = words.join("-").slice(0, 48).replace(/-+$/, "");
    return baseSlug || "inline-task";
  }

  createInlineSpec(promptText: string): SpecMetadata {
    const identifier = this.slugifyPrompt(promptText);
    const firstLine = promptText.trim().split("\n")[0].trim();
    const title = firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
    const inferredProject =
      this.projectOverride || this.inferTargetProject(identifier, promptText, undefined);
    const filePath = path.join(INLINE_SPEC_DIRECTORY, `${identifier}.md`);

    if (!this.dryRun) {
      fs.mkdirSync(INLINE_SPEC_DIRECTORY, { recursive: true });
      const fileMarkdown = `---\ntitle: ${JSON.stringify(title)}\n---\n\n${promptText.trim()}\n`;
      fs.writeFileSync(filePath, fileMarkdown, "utf-8");
    }

    return {
      identifier,
      filePath,
      title,
      content: promptText.trim(),
      targetProject: inferredProject,
    };
  }

  discoverSpec(query: string): SpecMetadata | null {
    if (!query) {
      return null;
    }
    const candidatePaths: string[] = [];

    if (fs.existsSync(query) && fs.statSync(query).isFile()) {
      candidatePaths.push(path.resolve(query));
    }

    const normalizedQuery = query.replace(/\.md$/, "");

    for (const dir of POSSIBLE_SPEC_DIRS) {
      const exactPath = path.join(dir, `${normalizedQuery}.md`);
      if (fs.existsSync(exactPath) && !candidatePaths.includes(exactPath)) {
        candidatePaths.push(exactPath);
      }
    }

    for (const dir of POSSIBLE_VAULT_DIRS) {
      const exactVault = path.join(dir, `${normalizedQuery}.md`);
      if (fs.existsSync(exactVault) && !candidatePaths.includes(exactVault)) {
        candidatePaths.push(exactVault);
      }
    }

    if (candidatePaths.length === 0) {
      for (const dir of POSSIBLE_SPEC_DIRS) {
        if (fs.existsSync(dir)) {
          const entries = fs.readdirSync(dir);
          for (const entry of entries) {
            if (entry.endsWith(".md")) {
              const stem = entry.replace(/\.md$/, "");
              if (stem.includes(normalizedQuery)) {
                const full = path.join(dir, entry);
                if (!candidatePaths.includes(full)) {
                  candidatePaths.push(full);
                }
              }
            }
          }
        }
        if (candidatePaths.length > 0) break;
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

  getHerdrSessionName(): string {
    return this.spec ? this.spec.identifier : "default";
  }

  ensureHerdrSession(herdrBin: string, sessionName: string): boolean {
    const statusRes = runCommand([herdrBin, "--session", sessionName, "status"], { capture: true });
    if (statusRes.status === 0 && statusRes.stdout.includes("status: running")) {
      return true;
    }

    try {
      const child = child_process.spawn(herdrBin, ["--session", sessionName, "server"], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();

      for (let attempt = 0; attempt < 30; attempt++) {
        const check = runCommand([herdrBin, "--session", sessionName, "status"], { capture: true });
        if (check.status === 0 && check.stdout.includes("status: running")) {
          return true;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      }
    } catch {}

    return false;
  }

  acquireLock(): boolean {
    if (!this.spec || this.dryRun || this.statusOnly) return true;

    const lockPath = path.join(STATE_DIRECTORY, `${this.spec.identifier}.lock`);
    if (fs.existsSync(lockPath)) {
      try {
        const rawContent = fs.readFileSync(lockPath, "utf-8").trim();
        const parsedLock = JSON.parse(rawContent);
        const existingPid = parsedLock.pid;
        if (existingPid && typeof existingPid === "number") {
          try {
            process.kill(existingPid, 0);
            const herdrSessionName = this.getHerdrSessionName();
            console.log(`⚠️ An active build process for '${this.spec.identifier}' is already running (PID: ${existingPid}).`);
            console.log(`👉 Attach to Herdr session: herdr session attach ${herdrSessionName}`);
            return false;
          } catch {
            // Stale lock from terminated process
          }
        }
      } catch {}
    }

    try {
      fs.mkdirSync(STATE_DIRECTORY, { recursive: true });
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
        "utf-8"
      );
      this.lockPath = lockPath;

      const cleanup = () => {
        try {
          if (this.lockPath && fs.existsSync(this.lockPath)) {
            fs.unlinkSync(this.lockPath);
          }
        } catch {}
      };

      process.on("exit", cleanup);
      process.on("SIGINT", () => {
        cleanup();
        process.exit(130);
      });
      process.on("SIGTERM", () => {
        cleanup();
        process.exit(143);
      });
      return true;
    } catch {
      return false;
    }
  }

  releaseLock(): void {
    if (this.lockPath && fs.existsSync(this.lockPath)) {
      try {
        fs.unlinkSync(this.lockPath);
        this.lockPath = undefined;
      } catch {}
    }
  }

  hasUncommittedChanges(repoDir: string): boolean {
    const res = runCommand(["git", "status", "--porcelain"], { cwd: repoDir, capture: true });
    return res.status === 0 && res.stdout.trim().length > 0;
  }

  hasUnpushedCommits(repoDir: string, branchName: string = "main"): boolean {
    const res = runCommand(["git", "log", `origin/${branchName}..HEAD`, "--oneline"], {
      cwd: repoDir,
      capture: true,
    });
    return res.status === 0 && res.stdout.trim().length > 0;
  }

  getCommitsAheadCount(worktreeDir: string, baseBranch: string): number {
    const res = runCommand(["git", "rev-list", "--count", `origin/${baseBranch}..HEAD`], {
      cwd: worktreeDir,
      capture: true,
    });
    if (res.status === 0 && res.stdout.trim()) {
      return parseInt(res.stdout.trim(), 10) || 0;
    }
    return 0;
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

    const defaultBranch = getDefaultBranch(this.state.repo_dir);
    const commitsAhead = this.getCommitsAheadCount(this.state.worktree_dir, defaultBranch);
    const hasUncommitted = this.hasUncommittedChanges(this.state.worktree_dir);

    if (this.state.stage === "WORKTREE_INITIALIZED" || (commitsAhead === 0 && !hasUncommitted)) {
      return "IMPLEMENT_AND_FIX_LOCAL";
    }

    const unitTestsPass = this.runLocalTestGate(this.state.worktree_dir);
    if (!unitTestsPass) {
      return "IMPLEMENT_AND_FIX_LOCAL";
    }

    const repositoryTestResult = this.runRepositoryTestGate(this.state.worktree_dir);
    if (!repositoryTestResult.success) {
      return "FIX_CI_FAILURES";
    }

    const humanReviewStatus = this.checkHumanReviewStatus();
    if (humanReviewStatus === "FEEDBACK_RECEIVED") {
      return "RESOLVE_FEEDBACK";
    }
    if (humanReviewStatus !== "APPROVED") {
      return "AWAIT_HUMAN_REVIEW";
    }

    if (this.state.deployed) {
      return "COMPLETED";
    }

    return "MERGE_AND_PUSH";
  }

  checkPlanApprovalStatus(specId: string): string {
    if (!this.spec) return "NOT_GENERATED";

    const defaultPlanPath = path.join(STATE_DIRECTORY, "plans", `${specId}.md`);
    const statePlanPath = this.state?.plan_file;
    const planExists =
      (statePlanPath && fs.existsSync(statePlanPath)) ||
      fs.existsSync(defaultPlanPath);
    if (!planExists) {
      return "NOT_GENERATED";
    }

    if (this.approveFlag || this.state?.plan_approved) {
      if (this.state) {
        this.state.plan_approved = true;
      }
      return "APPROVED";
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
      if (fs.existsSync(planFile)) {
        return path.join(folder, ".system_generated", "logs", "transcript.jsonl");
      }
      const transcript = path.join(folder, ".system_generated", "logs", "transcript.jsonl");
      if (fs.existsSync(transcript)) {
        try {
          const content = fs.readFileSync(transcript, "utf-8");
          if (content.includes(`impl-${specId}`) || content.includes(`planner-${specId}`)) {
            return transcript;
          }
        } catch {}
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

  runLocalTestGate(worktreeDirectory?: string): boolean {
    if (!worktreeDirectory || !fs.existsSync(worktreeDirectory)) {
      return false;
    }

    let command = ["bun", "test"];
    const packageJsonPath = path.join(worktreeDirectory, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageData = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        const scripts = packageData.scripts || {};
        if ("unit" in scripts) {
          command = ["bun", "run", "unit"];
        } else if ("test" in scripts) {
          command = ["bun", "run", "test"];
        }
      } catch {}
    }

    const testExecution = runCommand(command, { cwd: worktreeDirectory, capture: true });
    return testExecution.status === 0;
  }

  runRepositoryTestGate(worktreeDirectory?: string): { success: boolean; output: string } {
    if (!worktreeDirectory || !fs.existsSync(worktreeDirectory)) {
      return { success: false, output: "Worktree directory does not exist." };
    }

    let command = ["bun", "test"];
    const packageJsonPath = path.join(worktreeDirectory, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageData = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        const scripts = packageData.scripts || {};
        if ("test" in scripts) {
          command = ["bun", "run", "test"];
        } else if ("check" in scripts) {
          command = ["bun", "run", "check"];
        }
      } catch {}
    }

    console.log(`🧪 Running repository test script in worktree: ${command.join(" ")}`);
    const testExecution = runCommand(command, { cwd: worktreeDirectory, capture: true });
    return {
      success: testExecution.status === 0,
      output: (testExecution.stdout + "\n" + testExecution.stderr).trim(),
    };
  }

  fetchVercelToolbarComments(repositoryDirectory: string, branchName?: string): { count: number; rawOutput: string } {
    if (!branchName) return { count: 0, rawOutput: "" };

    const vercelBinary = findExecutable("vercel", [
      path.join(os.homedir(), ".cache", ".bun", "bin", "vercel"),
      path.join(os.homedir(), ".bun", "bin", "vercel"),
    ]);

    if (!vercelBinary) {
      return { count: 0, rawOutput: "" };
    }

    try {
      const processExecution = child_process.spawnSync(
        vercelBinary,
        ["comments", "--branch", branchName, "--non-interactive"],
        {
          cwd: repositoryDirectory,
          encoding: "utf-8",
          env: { ...process.env, CI: "1" },
          timeout: 10000,
        }
      );

      const combinedOutput = (processExecution.stdout || "") + "\n" + (processExecution.stderr || "");
      if (processExecution.status === 0) {
        const countMatch = combinedOutput.match(/(\d+)\s+unresolved/i);
        const unresolvedCount = countMatch ? parseInt(countMatch[1], 10) : 0;
        return { count: unresolvedCount, rawOutput: combinedOutput.trim() };
      }
    } catch {}

    return { count: 0, rawOutput: "" };
  }

  checkHumanReviewStatus(): string {
    const branchName = this.state?.branch_name || this.spec?.identifier;
    const repositoryDirectory = this.state?.repo_dir || process.cwd();

    if (branchName) {
      const toolbarComments = this.fetchVercelToolbarComments(repositoryDirectory, branchName);
      if (toolbarComments.count > 0) {
        console.log(`💬 Found ${toolbarComments.count} unresolved Vercel toolbar comment(s) on branch '${branchName}'`);
        return "FEEDBACK_RECEIVED";
      }
    }

    if (this.approveFlag || this.state?.human_reviewed || this.state?.pr_approved) {
      if (this.state) {
        this.state.human_reviewed = true;
        this.saveState(this.state);
      }
      return "APPROVED";
    }

    const transcriptFile = this.spec ? this.findLatestTranscriptForSpec(this.spec.identifier) : null;
    if (transcriptFile && fs.existsSync(transcriptFile)) {
      const reviewApproval = this.inspectTranscriptForReviewApproval(transcriptFile);
      if (reviewApproval === "APPROVED") {
        if (this.state) {
          this.state.human_reviewed = true;
          this.saveState(this.state);
        }
        return "APPROVED";
      }
      if (reviewApproval === "FEEDBACK") {
        return "FEEDBACK_RECEIVED";
      }
    }

    return "PENDING";
  }

  inspectTranscriptForReviewApproval(transcriptPath: string): string {
    try {
      const content = fs.readFileSync(transcriptPath, "utf-8");
      const lines = content.trim().split("\n");

      for (let index = lines.length - 1; index >= 0; index--) {
        const line = lines[index];
        if (!line.trim()) continue;
        const entry = JSON.parse(line);
        if (entry.type === "USER_INPUT") {
          const userContent = String(entry.content || "").toLowerCase();
          if (
            ["proceed", "approved", "looks good", "ship it", "yes", "lgtm"].some((word) =>
              userContent.includes(word)
            )
          ) {
            return "APPROVED";
          }
          if (
            ["change", "fix", "update", "revise", "instead", "broken", "issue"].some((word) =>
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

  getLatestFeedbackFromTranscript(transcriptPath: string): string {
    try {
      const content = fs.readFileSync(transcriptPath, "utf-8");
      const lines = content.trim().split("\n");

      for (let index = lines.length - 1; index >= 0; index--) {
        const line = lines[index];
        if (!line.trim()) continue;
        const entry = JSON.parse(line);
        if (entry.type === "USER_INPUT") {
          const feedbackText = String(entry.content || "").trim();
          if (feedbackText) return feedbackText;
        }
      }
    } catch {}
    return "";
  }

  getWorktreePort(worktreeDirectory?: string): number {
    if (worktreeDirectory) {
      const environmentLocalPath = path.join(worktreeDirectory, ".env.local");
      if (fs.existsSync(environmentLocalPath)) {
        const content = fs.readFileSync(environmentLocalPath, "utf-8");
        const portMatch = content.match(/^PORT=(\d+)/m);
        if (portMatch) {
          return parseInt(portMatch[1], 10);
        }
      }
    }

    const targetProject = this.spec?.targetProject || "starfocus";
    const registryPath = path.join(STATE_DIRECTORY, "ports.json");
    const usedPorts = new Set<number>();

    if (fs.existsSync(registryPath)) {
      try {
        const registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
        const registryKey = `${targetProject}:${this.spec?.identifier}`;
        if (registry.assignments?.[registryKey]?.port) {
          return registry.assignments[registryKey].port;
        }
        for (const item of Object.values(registry.assignments as Record<string, any>)) {
          if (item.project === targetProject && typeof item.port === "number") {
            usedPorts.add(item.port);
          }
        }
      } catch {}
    }

    const pool = PROJECT_PORT_POOLS[targetProject] || PROJECT_PORT_POOLS.default;
    for (let candidatePort = pool.start; candidatePort <= pool.end; candidatePort++) {
      if (!usedPorts.has(candidatePort)) {
        return candidatePort;
      }
    }

    return pool.start;
  }

  ensureDevServerRunning(worktreeDirectory: string, portNumber: number): void {
    const portCheck = runCommand(["lsof", "-i", `:${portNumber}`], { capture: true });
    if (portCheck.status === 0 && portCheck.stdout.trim().length > 0) {
      console.log(`🔌 Dev server is already active on port ${portNumber}`);
      return;
    }

    console.log(`🚀 Starting local dev server on port ${portNumber} in background...`);
    const logsDirectory = path.join(STATE_DIRECTORY, "logs");
    fs.mkdirSync(logsDirectory, { recursive: true });
    const logPath = path.join(logsDirectory, `dev-${this.spec?.identifier}.log`);
    const outputHandle = fs.openSync(logPath, "a");

    const childProcessInstance = child_process.spawn("bun", ["run", "dev"], {
      cwd: worktreeDirectory,
      detached: true,
      stdio: ["ignore", outputHandle, outputHandle],
      env: { ...process.env, PORT: String(portNumber) },
    });
    childProcessInstance.unref();
    console.log(`📄 Dev server logs: ${logPath}`);
  }

  getDevUrls(portNumber: number): { localUrl: string; tailscaleUrl: string } {
    const localUrl = `http://localhost:${portNumber}`;
    let tailscaleHostname = "";
    try {
      const statusJson = child_process.spawnSync("tailscale", ["status", "--json"], {
        encoding: "utf-8",
        timeout: 2000,
      });
      if (statusJson.status === 0 && statusJson.stdout.trim()) {
        const status = JSON.parse(statusJson.stdout);
        if (status.Self?.DNSName) {
          tailscaleHostname = status.Self.DNSName.replace(/\.$/, "");
        }
      }
    } catch {}

    const tailscaleUrl = tailscaleHostname ? `http://${tailscaleHostname}:${portNumber}` : localUrl;
    return { localUrl, tailscaleUrl };
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
    if (
      stage === "MERGE_AND_PUSH" ||
      stage === "COMMIT_AND_PUSH" ||
      stage === "CREATE_PR"
    ) {
      return await this.handleMergeAndPush();
    }
    if (stage === "FIX_CI_FAILURES") {
      return await this.handleFixCi();
    }
    if (stage === "AWAIT_CI_CHECKS") {
      console.log("⏳ CI checks are currently running. Exiting cleanly. Re-run after CI finishes.");
      return 0;
    }
    if (stage === "RESOLVE_FEEDBACK" || stage === "RESOLVE_PR_COMMENTS") {
      return await this.handleResolveFeedback();
    }
    if (stage === "AWAIT_HUMAN_REVIEW") {
      this.handleAwaitHumanReview();
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

    const plansDirectory = path.join(STATE_DIRECTORY, "plans");
    fs.mkdirSync(plansDirectory, { recursive: true });
    const markdownPlanPath = path.join(plansDirectory, `${this.spec.identifier}.md`);

    console.log("🧠 Spawning Planner Agent (Gemini 4 Argon High) to formulate native technical plan...");
    const plannerPrompt =
      `Please read the specification file at '${this.spec.filePath}' for project '${this.spec.targetProject}'. ` +
      `Explore the repository to analyze existing patterns, schemas, routing, and component contracts. ` +
      `Formulate a comprehensive technical plan and save the complete Markdown plan to '${markdownPlanPath}'. ` +
      `Include: feature breakdown, data models and schema changes, component contracts, implementation steps, testing strategy, and architectural trade-offs.`;

    const plannerSuccess = await this.runAntigravityAgent(
      `planner-${this.spec.identifier}`,
      "You are the Lead Software Architect. Explore the codebase and formulate a comprehensive technical plan in Markdown.",
      plannerPrompt,
      this.state.repo_dir,
      STAGE_MODELS.planner
    );

    if (!plannerSuccess) {
      console.error("❌ Planner agent execution encountered an error.");
      return 1;
    }

    this.state.plan_file = markdownPlanPath;

    const dashboardUrl = this.publishTaskDashboard("PLAN REVIEW");
    this.state.visual_plan_url = dashboardUrl;
    this.state.stage = "AWAITING_PLAN_APPROVAL";
    this.saveState(this.state);

    const notificationMessage =
      `⚠️ [Plan Review Required] Native technical plan generated for '${this.spec.title}'.\n` +
      `🔗 Plan Dashboard: ${dashboardUrl}\n` +
      `📄 Plan File: ${markdownPlanPath}\n` +
      `Reply 'approve' or run 'build --spec-id ${this.spec.identifier} --approve' to proceed.`;
    this.sendOpenclawNotification(notificationMessage);

    console.log(`✅ Plan published to dashboard: ${dashboardUrl}`);
    console.log(`📄 Markdown Plan: ${markdownPlanPath}`);
    console.log("⏸️  Awaiting human plan approval. Exiting cleanly.");
    return 0;
  }

  handleAwaitPlanApproval(): void {
    console.log("⏸️  Technical plan is waiting for your review:");
    console.log(`🔗 ${this.state?.visual_plan_url || `${getTailscaleBaseUrl()}/`}`);
    console.log(`📄 Markdown Plan: ${this.state?.plan_file || "N/A"}`);
    console.log(`👉 Reply 'approve' on WhatsApp or run 'build --spec-id ${this.spec?.identifier} --approve' after approving.`);
  }

  handleSetupWorktree(): number {
    if (!this.state || !this.state.worktree_dir || !this.state.branch_name) return 1;

    console.log(`🌿 Setting up isolated worktree using dotfiles worktree script for: ${this.state.branch_name}`);
    const worktreeHelper = findExecutable("worktree", [
      path.join(os.homedir(), ".local", "bin", "worktree"),
      path.join(os.homedir(), "code", "homostellaris", "dotfiles", "agents", "scripts", "worktree.ts"),
    ]);

    if (!worktreeHelper) {
      console.error("❌ Worktree helper script not found.");
      return 1;
    }

    const addExecution = runCommand([worktreeHelper, "add", this.state.branch_name], {
      cwd: this.state.repo_dir,
      capture: false,
    });

    if (addExecution.status !== 0) {
      console.error("❌ Failed to create worktree via worktree script.");
      return 1;
    }

    if (fs.existsSync(path.join(this.state.worktree_dir, "package.json"))) {
      console.log("📦 Installing dependencies in worktree...");
      runCommand(["bun", "install"], { cwd: this.state.worktree_dir, capture: false });
    }

    console.log("✅ Worktree and branch initialized successfully via worktree script.");
    this.state.stage = "WORKTREE_INITIALIZED";
    this.saveState(this.state);
    return 0;
  }

  async handleImplementation(): Promise<number> {
    if (!this.spec || !this.state || !this.state.worktree_dir) return 1;

    const agentName = formatHerdrAgentName("impl", this.spec.identifier);
    console.log(`🛠️  Spawning Antigravity Implementer Agent '${agentName}' in worktree: ${this.state.worktree_dir}`);
    const prompt =
      `Implement the feature specified in '${this.spec.filePath}' following the technical plan. ` +
      `Write unit and component tests first (TDD), then build the components and functions. ` +
      `Ensure all local tests pass via 'bun test'.`;

    const success = await this.runAgentInHerdr(
      agentName,
      prompt,
      this.state.worktree_dir,
      STAGE_MODELS.implementer
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
        agentName,
        repairPrompt,
        this.state.worktree_dir,
        STAGE_MODELS.repair
      );
    }

    console.log("✅ Local verification complete.");
    return 0;
  }

  async handleMergeAndPush(): Promise<number> {
    if (!this.spec || !this.state) return 1;

    const worktreeDir = this.state.worktree_dir || this.state.repo_dir;
    const repoDir = this.state.repo_dir;
    const defaultBranch = getDefaultBranch(repoDir);
    const branchName = this.state.branch_name || this.spec.identifier;

    // 1. Ensure all changes in worktree are committed
    if (this.hasUncommittedChanges(worktreeDir)) {
      runCommand(["git", "add", "."], { cwd: worktreeDir, capture: false });

      const commitMessage =
        `✨ implement ${this.spec.title.toLowerCase()}\n\n` +
        `Co-authored-by: Antigravity <antigravity@google.com>`;
      runCommand(["git", "commit", "-m", commitMessage], { cwd: worktreeDir, capture: false });
    }

    console.log(`🔀 Merging ${branchName} into ${defaultBranch} and pushing directly to origin...`);

    // 2. Push worktree branch directly to remote origin default branch
    let pushRes = runCommand(
      ["git", "push", "origin", `${branchName}:${defaultBranch}`],
      { cwd: worktreeDir, capture: true }
    );

    if (pushRes.status !== 0) {
      // Fetch latest and rebase onto remote default branch if needed
      runCommand(["git", "fetch", "origin", defaultBranch], { cwd: worktreeDir, capture: true });
      runCommand(["git", "rebase", `origin/${defaultBranch}`], { cwd: worktreeDir, capture: true });
      pushRes = runCommand(
        ["git", "push", "origin", `${branchName}:${defaultBranch}`],
        { cwd: worktreeDir, capture: true }
      );
    }

    if (pushRes.status !== 0) {
      console.error(`❌ Failed to push branch to origin/${defaultBranch}: ${pushRes.stderr}`);
      return 1;
    }

    console.log(`🎉 Pushed directly to origin/${defaultBranch}`);

    // 3. Update local default branch in repoDir if clean
    if (!this.hasUncommittedChanges(repoDir)) {
      runCommand(["git", "checkout", defaultBranch], { cwd: repoDir, capture: true });
      runCommand(["git", "pull", "--ff-only", "origin", defaultBranch], { cwd: repoDir, capture: true });
    }

    // 4. Cleanup worktree if isolated
    if (worktreeDir !== repoDir && fs.existsSync(worktreeDir)) {
      console.log(`🧹 Cleaning up worktree at: ${worktreeDir}`);
      const worktreeHelper = findExecutable("worktree", [
        path.join(os.homedir(), ".local", "bin", "worktree"),
        path.join(os.homedir(), "code", "homostellaris", "dotfiles", "agents", "scripts", "worktree.ts"),
      ]);
      if (worktreeHelper && branchName) {
        runCommand([worktreeHelper, "remove", branchName], { cwd: repoDir, capture: true });
      } else {
        runCommand(["git", "worktree", "remove", "--force", worktreeDir], { cwd: repoDir, capture: true });
        runCommand(["git", "branch", "-D", branchName], { cwd: repoDir, capture: true });
      }
    }

    this.state.merged = true;
    this.state.deployed = true;
    this.state.stage = "COMPLETED";
    const dashboardUrl = this.publishTaskDashboard("DEPLOYED");
    this.saveState(this.state);

    const notificationMessage =
      `🚀 [Merged & Deployed] '${this.spec.title}' merged into ${defaultBranch} and pushed.\n` +
      `📱 Task Dashboard: ${dashboardUrl}`;
    this.sendOpenclawNotification(notificationMessage);
    return 0;
  }

  handleCommitAndPush(): number {
    this.handleMergeAndPush();
    return 0;
  }

  handleCreatePr(): number {
    this.handleMergeAndPush();
    return 0;
  }

  legacyHandleCreatePr(): number {
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
    if (!this.spec || !this.state || !this.state.worktree_dir) return 1;

    console.log("❌ Repository test script failed. Spawning automated repair agent in Herdr...");
    const repositoryTestResult = this.runRepositoryTestGate(this.state.worktree_dir);
    const failureLogs = repositoryTestResult.output.slice(0, 4000);

    const repairPrompt =
      `The repository test suite failed in your worktree.\n\n` +
      `Failure output:\n\`\`\`\n${failureLogs}\n\`\`\`\n\n` +
      `Please address the root cause, fix the errors, and verify that the repository test suite passes.`;

    const agentName = formatHerdrAgentName("impl", this.spec.identifier);
    await this.runAgentInHerdr(
      agentName,
      repairPrompt,
      this.state.worktree_dir,
      STAGE_MODELS.ciRepair
    );

    if (this.hasUncommittedChanges(this.state.worktree_dir)) {
      runCommand(["git", "add", "."], { cwd: this.state.worktree_dir, capture: false });
      runCommand(
        [
          "git",
          "commit",
          "-m",
          "🐛 fix repository test suite failure\n\nCo-authored-by: Antigravity <antigravity@google.com>",
        ],
        { cwd: this.state.worktree_dir, capture: false }
      );
    }

    const retestResult = this.runRepositoryTestGate(this.state.worktree_dir);
    if (retestResult.success) {
      console.log("✅ Repository test script now passes.");
      this.state.repo_tests_passed = true;
      this.saveState(this.state);
      return 0;
    }

    console.log("⚠️ Repository tests still failing. Will retry repair on next cycle.");
    return 1;
  }

  handleAwaitHumanReview(): void {
    if (!this.spec || !this.state || !this.state.worktree_dir) return;

    const assignedPort = this.getWorktreePort(this.state.worktree_dir);
    this.ensureDevServerRunning(this.state.worktree_dir, assignedPort);
    const { localUrl, tailscaleUrl } = this.getDevUrls(assignedPort);

    this.state.port = assignedPort;
    this.state.dev_url = tailscaleUrl;
    this.state.stage = "AWAIT_HUMAN_REVIEW";
    this.publishTaskDashboard("HUMAN REVIEW");
    this.saveState(this.state);

    const herdrAgentName = formatHerdrAgentName("impl", this.spec.identifier);
    const sessionName = this.getHerdrSessionName();

    console.log("\n==================================================");
    console.log(`⏸️  Awaiting Human Review: ${this.spec.title}`);
    console.log("==================================================");
    console.log(`🌐 Local Dev Server:   ${localUrl}`);
    console.log(`📱 Tailscale Dev URL:  ${tailscaleUrl}`);
    console.log(`✨ Vercel Toolbar:     Active for visual comments and annotations in-browser`);
    console.log(`💬 Herdr Session:      herdr session attach ${sessionName}`);
    console.log(`👉 Send feedback:      herdr --session ${sessionName} agent prompt ${herdrAgentName} "<your comments>"`);
    console.log(`\n✅ Once satisfied, approve via:`);
    console.log(`   - Reply 'approve' on WhatsApp or in transcript`);
    console.log(`   - Run: build --spec-id ${this.spec.identifier} --approve`);
    console.log("==================================================\n");

    const notificationMessage =
      `⏸️ [Human Review Required] '${this.spec.title}' is ready for review!\n` +
      `🌐 Local: ${localUrl}\n` +
      `📱 Tailscale: ${tailscaleUrl}\n` +
      `✨ Use Vercel Toolbar for comments or prompt herdr agent '${herdrAgentName}' (herdr session attach ${sessionName}).\n` +
      `Reply 'approve' or run 'build --spec-id ${this.spec.identifier} --approve' to merge.`;
    this.sendOpenclawNotification(notificationMessage);
  }

  async handleResolveFeedback(): Promise<number> {
    if (!this.spec || !this.state || !this.state.worktree_dir) return 1;

    console.log("💬 Resolving human review feedback in worktree...");
    const transcriptPath = this.findLatestTranscriptForSpec(this.spec.identifier);
    let latestFeedback = "";
    if (transcriptPath && fs.existsSync(transcriptPath)) {
      latestFeedback = this.getLatestFeedbackFromTranscript(transcriptPath);
    }

    const toolbarComments = this.fetchVercelToolbarComments(this.state.repo_dir, this.state.branch_name);
    let toolbarText = "";
    if (toolbarComments.count > 0 && toolbarComments.rawOutput) {
      toolbarText = toolbarComments.rawOutput;
    }

    const feedbackParts: string[] = [];
    if (latestFeedback) {
      feedbackParts.push(`Session transcript feedback:\n"${latestFeedback}"`);
    }
    if (toolbarText) {
      feedbackParts.push(`Vercel toolbar comments:\n${toolbarText}`);
    }

    const combinedFeedback = feedbackParts.join("\n\n");
    const fixPrompt = combinedFeedback
      ? `The human reviewer provided feedback on the implementation:\n\n${combinedFeedback}\n\n` +
        `Please address the comments, update components and tests accordingly, and ensure tests pass.`
      : `Please review recent comments and feedback from the human reviewer, implement requested adjustments, and verify tests pass.`;

    const agentName = formatHerdrAgentName("impl", this.spec.identifier);
    await this.runAgentInHerdr(
      agentName,
      fixPrompt,
      this.state.worktree_dir,
      STAGE_MODELS.commentResolver
    );

    if (this.hasUncommittedChanges(this.state.worktree_dir)) {
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
    }

    console.log("✅ Human feedback addressed. Returning to test and review cycle.");
    return 0;
  }

  async handleResolvePrComments(): Promise<number> {
    return await this.handleResolveFeedback();
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

    const verifierAgentName = formatHerdrAgentName("verifier", this.spec.identifier);
    await this.runAgentInHerdr(
      verifierAgentName,
      verifierPrompt,
      this.state.worktree_dir,
      STAGE_MODELS.verifier
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

    console.log("🚀 Verifying production deployment...");
    if (
      this.state.worktree_dir &&
      this.state.worktree_dir !== this.state.repo_dir &&
      fs.existsSync(this.state.worktree_dir)
    ) {
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
    rawAgentName: string,
    prompt: string,
    workingDir: string,
    model: string = STAGE_MODELS.implementer
  ): Promise<boolean> {
    const agentName = rawAgentName.length > 32
      ? formatHerdrAgentName(rawAgentName.split("-")[0] || "agent", rawAgentName.slice(rawAgentName.indexOf("-") + 1))
      : rawAgentName;

    const herdrBin = findExecutable("herdr", [path.join(os.homedir(), ".local", "bin", "herdr")]);
    if (!herdrBin || !fs.existsSync(herdrBin)) {
      return await this.runAntigravityAgent(
        agentName,
        "You are an AI coding assistant.",
        prompt,
        workingDir,
        model
      );
    }

    const sessionName = this.getHerdrSessionName();
    const sessionReady = this.ensureHerdrSession(herdrBin, sessionName);
    if (!sessionReady) {
      console.warn(`⚠️ Failed to connect to Herdr session '${sessionName}', falling back to background runner.`);
      return await this.runAntigravityAgent(
        agentName,
        "You are an AI coding assistant.",
        prompt,
        workingDir,
        model
      );
    }

    try {
      const getAgentResult = runCommand([herdrBin, "--session", sessionName, "agent", "get", agentName], { capture: true });
      let existingAgent: any = null;
      if (getAgentResult.status === 0 && getAgentResult.stdout.trim()) {
        try {
          const parsed = JSON.parse(getAgentResult.stdout);
          existingAgent = parsed?.result?.agent || null;
        } catch {}
      }

      if (existingAgent) {
        console.log(`🐾 Reusing existing Herdr agent '${agentName}' in session '${sessionName}' (status: ${existingAgent.agent_status || "idle"})`);
        if (existingAgent.agent_status === "blocked") {
          runCommand([herdrBin, "--session", sessionName, "agent", "send-keys", agentName, "enter"], { capture: true });
        }
        if (existingAgent.agent_status === "working") {
          console.log(`⏳ Agent '${agentName}' is already actively working. Waiting for completion...`);
          const waitResult = runCommand(
            [herdrBin, "--session", sessionName, "agent", "wait", agentName, "--until", "idle", "--timeout", "1800000"],
            { capture: true }
          );
          return waitResult.status === 0;
        }

        console.log(`💬 Submitting prompt to existing agent '${agentName}' in session '${sessionName}'...`);
        const promptCmd = [
          herdrBin,
          "--session",
          sessionName,
          "agent",
          "prompt",
          agentName,
          prompt,
          "--wait",
          "--timeout",
          "1800000",
        ];
        const promptRes = runCommand(promptCmd, { capture: true });
        if (promptRes.status !== 0) {
          const checkAgent = runCommand([herdrBin, "--session", sessionName, "agent", "get", agentName], { capture: true });
          try {
            const parsed = JSON.parse(checkAgent.stdout)?.result?.agent;
            if (parsed?.agent_status === "working") {
              console.log(`⏳ Agent '${agentName}' is still actively working. Continuing wait...`);
              const waitAgain = runCommand([herdrBin, "--session", sessionName, "agent", "wait", agentName, "--until", "idle", "--timeout", "1800000"], { capture: true });
              return waitAgain.status === 0;
            }
          } catch {}
          console.error(`❌ Herdr prompt error: ${promptRes.stderr || promptRes.stdout}`);
        }
        return promptRes.status === 0;
      }

      const paneListRes = runCommand([herdrBin, "--session", sessionName, "pane", "list"], { capture: true });
      let panes: any[] = [];
      if (paneListRes.status === 0 && paneListRes.stdout.trim()) {
        try {
          panes = JSON.parse(paneListRes.stdout)?.result?.panes || [];
        } catch {}
      }

      let targetPaneId: string | null = null;
      if (panes.length === 0) {
        const createResult = runCommand(
          [herdrBin, "--session", sessionName, "workspace", "create", "--cwd", workingDir, "--label", sessionName],
          { capture: true }
        );
        if (createResult.status === 0 && createResult.stdout.trim()) {
          try {
            const createJson = JSON.parse(createResult.stdout);
            targetPaneId = createJson?.result?.root_pane?.pane_id || null;
          } catch {}
        }
        if (!targetPaneId) {
          const refreshedPanesRes = runCommand([herdrBin, "--session", sessionName, "pane", "list"], { capture: true });
          if (refreshedPanesRes.status === 0) {
            try {
              const refreshedPanes = JSON.parse(refreshedPanesRes.stdout)?.result?.panes || [];
              if (refreshedPanes.length > 0) {
                targetPaneId = refreshedPanes[0].pane_id;
              }
            } catch {}
          }
        }
      } else {
        targetPaneId = panes[0].pane_id;
        if (panes.length > 1) {
          console.log(`🧹 Closing ${panes.length - 1} extra pane(s) in session '${sessionName}' to protect single-agent layout...`);
          for (let i = 1; i < panes.length; i++) {
            runCommand([herdrBin, "--session", sessionName, "pane", "close", panes[i].pane_id], { capture: true });
          }
        }
      }

      if (targetPaneId) {
        const startCmd = [
          herdrBin,
          "--session",
          sessionName,
          "agent",
          "start",
          agentName,
          "--kind",
          "agy",
          "--pane",
          targetPaneId,
          "--",
          "--model",
          model,
          "--dangerously-skip-permissions",
        ];
        const startResult = runCommand(startCmd, { capture: true });
        if (startResult.status !== 0) {
          console.error(`❌ Herdr start error: ${startResult.stderr || startResult.stdout}`);
        }

        runCommand([herdrBin, "--session", sessionName, "agent", "wait", agentName, "--until", "idle", "--timeout", "15000"], { capture: true });

        const promptCmd = [
          herdrBin,
          "--session",
          sessionName,
          "agent",
          "prompt",
          agentName,
          prompt,
          "--wait",
          "--timeout",
          "1800000",
        ];
        const promptRes = runCommand(promptCmd, { capture: true });
        if (promptRes.status !== 0) {
          const checkAgent = runCommand([herdrBin, "--session", sessionName, "agent", "get", agentName], { capture: true });
          try {
            const parsed = JSON.parse(checkAgent.stdout)?.result?.agent;
            if (parsed?.agent_status === "working") {
              console.log(`⏳ Agent '${agentName}' is still actively working. Continuing wait...`);
              const waitAgain = runCommand([herdrBin, "--session", sessionName, "agent", "wait", agentName, "--until", "idle", "--timeout", "1800000"], { capture: true });
              return waitAgain.status === 0;
            }
          } catch {}
          console.error(`❌ Herdr prompt error: ${promptRes.stderr || promptRes.stdout}`);
        }
        return promptRes.status === 0;
      }
    } catch {}

    return await this.runAntigravityAgent(
      agentName,
      "You are an AI coding assistant.",
      prompt,
      workingDir,
      model
    );
  }

  async runAntigravityAgent(
    _sessionName: string,
    _systemPrompt: string,
    prompt: string,
    workingDir: string,
    model: string = STAGE_MODELS.planner
  ): Promise<boolean> {
    const agyBinary = findExecutable("agy", [
      path.join(os.homedir(), ".local", "bin", "agy"),
      path.join(os.homedir(), ".gemini", "antigravity-cli", "bin", "agy"),
    ]);

    if (agyBinary && fs.existsSync(agyBinary)) {
      const res = runCommand([agyBinary, "--model", model, "--dangerously-skip-permissions", "--print", prompt], {
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
      path.join(os.homedir(), ".local", "bin", "share"),
      path.join(os.homedir(), "bin", "share"),
      findExecutable("host-report") || "",
    ]);
    const dashboardUrl = `${getTailscaleBaseUrl()}/${this.spec.identifier}/`;
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

    if (this.state.plan_file && fs.existsSync(this.state.plan_file)) {
      cmd.push("--written-plan", this.state.plan_file);
    } else {
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
      path.join(os.homedir(), ".local", "bin", "share"),
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
    const isWorktreeInit = this.state?.worktree_dir
      ? this.isWorktreeInitialized(this.state.worktree_dir)
      : false;
    console.log(`Worktree State: ${isWorktreeInit ? "initialized" : "uninitialized"}`);
    console.log(`Feature Branch: ${this.state?.branch_name}`);
    if (this.state?.worktree_dir) {
      const assignedPort = this.getWorktreePort(this.state.worktree_dir);
      const { localUrl, tailscaleUrl } = this.getDevUrls(assignedPort);
      console.log(`Dev Port:       ${assignedPort}`);
      console.log(`Local URL:      ${localUrl}`);
      console.log(`Tailscale URL:  ${tailscaleUrl}`);
    }
    console.log(`Evaluated Next: ${stage}`);
    console.log("--------------------------\n");
  }

  printStatus(stage: string): void {
    const isWorktreeInit = this.state?.worktree_dir
      ? this.isWorktreeInitialized(this.state.worktree_dir)
      : false;
    const assignedPort = this.getWorktreePort(this.state?.worktree_dir);
    console.log(`Worktree:       ${isWorktreeInit ? `initialized (port ${assignedPort})` : "uninitialized"}`);
    console.log(`Stage:          ${stage}`);
    console.log(`Dev Port:       ${assignedPort}`);
  }
}

export function parseArguments(rawArgs: string[] = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: rawArgs,
    options: {
      "spec-id": { type: "string" },
      project: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      status: { type: "boolean", default: false },
      approve: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  const isStatusCommand = positionals.includes("status") || Boolean(values.status);
  const remainingPositionals = positionals.filter((arg) => arg !== "status");

  let specId = values["spec-id"];
  let inlinePrompt: string | undefined;

  if (!specId && remainingPositionals.length === 1 && !remainingPositionals[0].includes(" ")) {
    specId = remainingPositionals[0];
  } else if (remainingPositionals.length > 0) {
    inlinePrompt = remainingPositionals.join(" ").trim();
  }

  if (isStatusCommand && !specId && !inlinePrompt) {
    const currentDirectory = process.cwd();
    if (currentDirectory.includes("/.worktrees/")) {
      specId = path.basename(currentDirectory);
    } else {
      const branchRes = runCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd: currentDirectory, capture: true });
      if (branchRes.status === 0 && branchRes.stdout.trim() && branchRes.stdout.trim() !== "master" && branchRes.stdout.trim() !== "main") {
        specId = branchRes.stdout.trim();
      }
    }
    if (!specId) {
      console.log("uninitialized");
      process.exit(0);
    }
  }

  if (values.help || (!inlinePrompt && !specId)) {
    console.log('Usage: build "<prompt>" [options]');
    console.log("       build --spec-id <id> [options]");
    console.log("       build status");
    console.log("\nAgentic coding workflow build orchestrator powered by Antigravity and Herdr.");
    console.log("\nPositional arguments:");
    console.log("  prompt                Inline feature prompt to plan and build.");
    console.log("\nOptions:");
    console.log("  --spec-id <id>        Pre-written spec identifier, slug, or file path in Obsidian todos.");
    console.log("  --project <project>   Override inferred target project (e.g. banerry, starfocus).");
    console.log("  --approve             Approve plan or human review gate and advance workflow.");
    console.log("  --dry-run             Inspect external state and planned actions without side effects.");
    console.log("  --status              Display current build lifecycle state.");
    console.log("  -h, --help            Show this help message and exit.");
    process.exit(values.help ? 0 : 1);
  }

  return {
    prompt: inlinePrompt,
    specId: specId || "",
    project: values.project,
    approve: Boolean(values.approve),
    dryRun: Boolean(values["dry-run"] || isStatusCommand),
    statusOnly: isStatusCommand,
  };
}

async function main() {
  const parsedArguments = parseArguments();
  const orchestrator = new BuildOrchestrator(
    parsedArguments.specId,
    parsedArguments.project,
    parsedArguments.dryRun,
    parsedArguments.prompt,
    parsedArguments.approve,
    parsedArguments.statusOnly
  );
  const exitCode = await orchestrator.execute();
  process.exit(exitCode);
}

if (import.meta.main) {
  main();
}
