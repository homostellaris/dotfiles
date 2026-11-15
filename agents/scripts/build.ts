#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";
import readline from "node:readline";
import { parseArgs } from "node:util";

const STATE_DIRECTORY = path.join(os.homedir(), ".local", "share", "agent-builds");

const POSSIBLE_SPEC_DIRS = [
  process.env.TODOS_DIR,
  path.join(os.homedir(), "Work", "Reality Sculptor", "todos"),
  path.join(os.homedir(), "obsidian", "reality-sculptor", "todos"),
].filter(Boolean) as string[];

const POSSIBLE_VAULT_DIRS = [
  process.env.VAULT_DIR,
  path.join(os.homedir(), "Work", "Reality Sculptor"),
  path.join(os.homedir(), "obsidian", "reality-sculptor"),
].filter(Boolean) as string[];

const SPEC_DIRECTORY = POSSIBLE_SPEC_DIRS.find((d) => fs.existsSync(d)) || POSSIBLE_SPEC_DIRS[0];
const VAULT_DIRECTORY = POSSIBLE_VAULT_DIRS.find((d) => fs.existsSync(d)) || POSSIBLE_VAULT_DIRS[0];
const REPOSITORIES_DIRECTORY = path.join(os.homedir(), "code", "homostellaris");

export type ApproveScope = "plan" | "review" | "any";
export type TerminalRole = "plan" | "impl" | "repair" | "ci" | "feedback" | "verify";
export type BuildEffort = 1 | 2 | 3;

export const MODEL_TIERS = {
  fast: "gemini-4-hydrogen-high",
  capable: "gemini-4-argon-high",
  reviewerFast: "claude-sonnet-5-5-high",
  reviewerCapable: "claude-opus-5-5-high",
} as const;

export type ModelTier = keyof typeof MODEL_TIERS;

export const STAGE_MODEL_TIERS = {
  planner: "capable",
  architect: "capable",
  implementer: "capable",
  repair: "fast",
  ciRepair: "fast",
  commentResolver: "fast",
  verifier: "reviewerCapable",
} as const satisfies Record<string, ModelTier>;

export const STAGE_MODELS = {
  planner: MODEL_TIERS[STAGE_MODEL_TIERS.planner],
  architect: MODEL_TIERS[STAGE_MODEL_TIERS.architect],
  implementer: MODEL_TIERS[STAGE_MODEL_TIERS.implementer],
  repair: MODEL_TIERS[STAGE_MODEL_TIERS.repair],
  ciRepair: MODEL_TIERS[STAGE_MODEL_TIERS.ciRepair],
  commentResolver: MODEL_TIERS[STAGE_MODEL_TIERS.commentResolver],
  verifier: MODEL_TIERS[STAGE_MODEL_TIERS.verifier],
} as const;

export function getStageModel(
  stage: keyof typeof STAGE_MODEL_TIERS,
  effort: BuildEffort = 3
): string {
  if (effort === 1) {
    return MODEL_TIERS.fast;
  }
  if (effort === 2) {
    return stage === "verifier" ? MODEL_TIERS.reviewerFast : MODEL_TIERS.fast;
  }
  return MODEL_TIERS[STAGE_MODEL_TIERS[stage]];
}

export const PROJECT_PORT_POOLS: Record<string, { main: number; start: number; end: number }> = {
  starfocus: { main: 6600, start: 6601, end: 6625 },
  banerry: { main: 6700, start: 6701, end: 6725 },
  default: { main: 6800, start: 6801, end: 6825 },
};

export function formatHerdrTerminalName(identifier: string, role: string): string {
  const cleanRole = role.toLowerCase().replace(/[^a-z0-9]/g, "") || "agent";
  const idMatch = identifier.match(/^(.+)_([a-z0-9]{8})$/i);

  if (idMatch) {
    const rawSlug = idMatch[1].toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    const suffix = `_${idMatch[2].toLowerCase()}_${cleanRole}`;
    const availableSlugLength = Math.max(1, 32 - suffix.length);
    const truncatedSlug = (rawSlug || "task").slice(0, availableSlugLength).replace(/-+$/, "") || "t";
    return `${truncatedSlug}${suffix}`.slice(0, 32);
  }

  const rawSlug = identifier.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const suffix = `_${cleanRole}`;
  const availableSlugLength = Math.max(1, 32 - suffix.length);
  const truncatedSlug = (rawSlug || "task").slice(0, availableSlugLength).replace(/-+$/, "") || "t";
  return `${truncatedSlug}${suffix}`.slice(0, 32);
}

export function generateShortId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let index = 0; index < 8; index++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

export function readActiveLockPid(specIdentifier: string): number | null {
  const lockPath = path.join(STATE_DIRECTORY, `${specIdentifier}.lock`);
  if (!fs.existsSync(lockPath)) return null;
  try {
    const parsedLock = JSON.parse(fs.readFileSync(lockPath, "utf-8").trim());
    if (typeof parsedLock.pid === "number") {
      process.kill(parsedLock.pid, 0);
      return parsedLock.pid;
    }
  } catch {}
  return null;
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
  prompt?: string;
  targetProject: string;
}

export interface BuildState {
  spec_id: string;
  spec_path: string;
  spec_title: string;
  effort?: BuildEffort;
  prompt?: string;
  pending_feedback?: string;
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
  human_review_requested_at?: string;
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
  public approveScope?: ApproveScope;
  public statusOnly: boolean;
  public feedbackText?: string;
  public effort?: BuildEffort;
  public lockPath?: string;
  public spec: SpecMetadata | null = null;
  public state: BuildState | null = null;

  constructor(
    specQuery: string = "",
    projectOverride?: string,
    dryRun: boolean = false,
    inlinePrompt?: string,
    approveScope: ApproveScope | boolean = false,
    statusOnly: boolean = false,
    feedbackText?: string,
    effort?: BuildEffort
  ) {
    this.specQuery = specQuery;
    this.projectOverride = projectOverride;
    this.dryRun = dryRun;
    this.inlinePrompt = inlinePrompt;
    this.approveScope =
      approveScope === true ? "any" : approveScope === false ? undefined : approveScope;
    this.statusOnly = statusOnly;
    this.feedbackText = feedbackText;
    this.effort = effort;
  }

  async execute(): Promise<number> {
    if (this.inlinePrompt) {
      this.spec = this.createInlineSpec(this.inlinePrompt);
    } else {
      this.spec = this.discoverSpec(this.specQuery);
    }

    if (!this.spec) {
      console.error(
        `❌ Error: Could not locate spec matching '${this.specQuery}' in ${SPEC_DIRECTORY}, ${VAULT_DIRECTORY}, or ${STATE_DIRECTORY}`
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
      if (this.feedbackText && this.state) {
        this.state.pending_feedback = this.feedbackText;
        this.saveState(this.state);
      }

      const stageAttempts: Record<string, number> = {};
      const maxStageAttempts = 2;

      while (true) {
        const determinedStage = this.determineExternalState();
        console.log(`🔍 Evaluated External State: ${determinedStage}`);

        const isTerminalPause =
          determinedStage === "AWAIT_PLAN_APPROVAL" ||
          determinedStage === "AWAIT_HUMAN_REVIEW" ||
          determinedStage === "AWAIT_PR_MERGE" ||
          determinedStage === "AWAIT_CI_CHECKS" ||
          determinedStage === "COMPLETED";

        if (!isTerminalPause) {
          stageAttempts[determinedStage] = (stageAttempts[determinedStage] || 0) + 1;
          if (stageAttempts[determinedStage] > maxStageAttempts) {
            const message = `⚠️ Stage '${determinedStage}' exceeded ${maxStageAttempts} attempts without advancing for '${this.spec.identifier}'. Stopping so you can inspect.`;
            console.error(message);
            this.sendOpenclawNotification(message);
            return 1;
          }
        }

        const exitCode = await this.advanceLifecycle(determinedStage);
        if (exitCode !== 0) {
          return exitCode;
        }

        if (isTerminalPause) {
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

  inferTargetProjectFromCwd(): string | null {
    const toplevel = runCommand(["git", "rev-parse", "--show-toplevel"], {
      cwd: process.cwd(),
      capture: true,
    });
    if (toplevel.status === 0 && toplevel.stdout.trim()) {
      const resolvedRoot = path.resolve(toplevel.stdout.trim());
      if (resolvedRoot.startsWith(REPOSITORIES_DIRECTORY + path.sep)) {
        const relative = resolvedRoot.slice(REPOSITORIES_DIRECTORY.length + 1);
        const projectName = relative.split(path.sep)[0];
        if (projectName) {
          return projectName;
        }
      }
    }
    return null;
  }

  createInlineSpec(promptText: string): SpecMetadata {
    const slug = this.slugifyPrompt(promptText);
    const identifier = `${slug}_${generateShortId()}`;
    const firstLine = promptText.trim().split("\n")[0].trim();
    const title = firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
    const lowerPrompt = promptText.toLowerCase();
    const inferredProject =
      this.projectOverride ||
      (lowerPrompt.includes("banerry") ? "banerry" : this.inferTargetProjectFromCwd()) ||
      this.inferTargetProject(identifier, promptText, undefined);

    return {
      identifier,
      filePath: "",
      title,
      content: promptText.trim(),
      prompt: promptText.trim(),
      targetProject: inferredProject,
    };
  }

  discoverSpecFromState(query: string): SpecMetadata | null {
    if (!fs.existsSync(STATE_DIRECTORY)) return null;

    const exactStatePath = path.join(STATE_DIRECTORY, `${query}.json`);
    let stateFilePath: string | null = fs.existsSync(exactStatePath) ? exactStatePath : null;

    if (!stateFilePath) {
      const candidates = fs
        .readdirSync(STATE_DIRECTORY)
        .filter((entry) => entry.endsWith(".json") && entry.replace(/\.json$/, "").includes(query))
        .sort();
      if (candidates.length > 0) {
        stateFilePath = path.join(STATE_DIRECTORY, candidates[0]);
      }
    }

    if (!stateFilePath) return null;

    try {
      const stateData = JSON.parse(fs.readFileSync(stateFilePath, "utf-8")) as BuildState;
      if (stateData.spec_path && fs.existsSync(stateData.spec_path)) {
        return this.discoverSpec(stateData.spec_path);
      }
      return {
        identifier: stateData.spec_id,
        filePath: stateData.spec_path || "",
        title: stateData.spec_title || stateData.spec_id,
        content: stateData.prompt || "",
        prompt: stateData.prompt,
        targetProject: stateData.project || "starfocus",
      };
    } catch {
      return null;
    }
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
      return this.discoverSpecFromState(normalizedQuery);
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

  getActiveEffort(): BuildEffort {
    return this.effort || this.state?.effort || 3;
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
          effort: this.effort || data.effort || 3,
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
      effort: this.effort || 3,
      prompt: spec.prompt,
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
    if (!this.dryRun && !this.statusOnly) {
      this.saveState(initialState);
    }
    return initialState;
  }

  saveState(state: BuildState): void {
    if (!fs.existsSync(STATE_DIRECTORY)) {
      fs.mkdirSync(STATE_DIRECTORY, { recursive: true });
    }
    const stateFile = path.join(STATE_DIRECTORY, `${state.spec_id}.json`);
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf-8");
  }

  findHerdrCoreBinary(): string | null {
    return findExecutable("hc", [
      "/usr/bin/herdr-core",
      path.join(os.homedir(), ".local", "bin", "hc"),
      path.join(os.homedir(), ".local", "bin", "herdr-core"),
    ]);
  }

  ensureHerdrCore(herdrCoreBinary: string): boolean {
    const statusResult = runCommand([herdrCoreBinary, "server", "status"], { capture: true });
    if (statusResult.status === 0) {
      return true;
    }

    const startResult = runCommand([herdrCoreBinary, "server", "start"], { capture: true });
    if (startResult.status === 0) {
      return true;
    }

    const recheckResult = runCommand([herdrCoreBinary, "server", "status"], { capture: true });
    return recheckResult.status === 0;
  }

  acquireLock(): boolean {
    if (!this.spec || this.dryRun || this.statusOnly) return true;

    const lockPath = path.join(STATE_DIRECTORY, `${this.spec.identifier}.lock`);
    fs.mkdirSync(STATE_DIRECTORY, { recursive: true });

    const lockPayload = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fileDescriptor = fs.openSync(lockPath, "wx");
        try {
          fs.writeFileSync(fileDescriptor, lockPayload, "utf-8");
        } finally {
          fs.closeSync(fileDescriptor);
        }
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
      } catch (error: any) {
        if (error?.code !== "EEXIST") {
          return false;
        }
        const activePid = readActiveLockPid(this.spec.identifier);
        if (activePid !== null) {
          console.log(`⚠️ An active build process for '${this.spec.identifier}' is already running (PID: ${activePid}).`);
          console.log(`👉 Inspect live terminals: hc ls --label spec=${this.spec.identifier}`);
          return false;
        }
        try {
          fs.unlinkSync(lockPath);
        } catch {}
      }
    }

    return false;
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

    const activeEffort = this.getActiveEffort();
    if (activeEffort >= 3) {
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
    }

    if (!this.isWorktreeInitialized(this.state.worktree_dir)) {
      return "SETUP_WORKTREE";
    }

    const defaultBranch = getDefaultBranch(this.state.repo_dir);
    const commitsAhead = this.getCommitsAheadCount(this.state.worktree_dir, defaultBranch);
    const hasUncommitted = this.hasUncommittedChanges(this.state.worktree_dir);

    if (commitsAhead === 0 && !hasUncommitted) {
      return "IMPLEMENT_AND_FIX_LOCAL";
    }

    const unitTestsPass = this.runLocalTestGate(this.state.worktree_dir);
    if (!unitTestsPass) {
      return "IMPLEMENT_AND_FIX_LOCAL";
    }

    if (activeEffort >= 2) {
      const humanReviewStatus = this.checkHumanReviewStatus();
      if (humanReviewStatus === "FEEDBACK_RECEIVED") {
        return "RESOLVE_FEEDBACK";
      }
      if (humanReviewStatus !== "APPROVED") {
        return "AWAIT_HUMAN_REVIEW";
      }
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

    if (this.state?.pending_feedback) {
      return "FEEDBACK_RECEIVED";
    }

    if (this.approveScope === "plan" || this.approveScope === "any" || this.state?.plan_approved) {
      if (this.state) {
        this.state.plan_approved = true;
        if (!this.dryRun && !this.statusOnly) {
          this.saveState(this.state);
        }
      }
      if (this.approveScope === "plan" || this.approveScope === "any") {
        this.approveScope = undefined;
      }
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
          if (/\b(proceed|approve|approved|looks good|ship it|yes|lgtm)\b/i.test(userContent)) {
            return "APPROVED";
          }
          if (/\b(change|fix|update|revise|instead)\b/i.test(userContent)) {
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
        if (combinedOutput.includes(`No unresolved comments on ${branchName}`)) {
          return { count: 0, rawOutput: combinedOutput.trim() };
        }
        const branchPattern = new RegExp(`(\\d+)\\s+unresolved(?:\\s+comments?)?\\s+on\\s+${branchName}`, "i");
        const branchMatch = combinedOutput.match(branchPattern);
        if (branchMatch) {
          return { count: parseInt(branchMatch[1], 10), rawOutput: combinedOutput.trim() };
        }
        const countMatch = combinedOutput.match(/(\d+)\s+unresolved/i);
        const unresolvedCount = countMatch ? parseInt(countMatch[1], 10) : 0;
        return { count: unresolvedCount, rawOutput: combinedOutput.trim() };
      }
    } catch {}

    return { count: 0, rawOutput: "" };
  }

  checkHumanReviewStatus(): string {
    if (this.state?.pending_feedback) {
      return "FEEDBACK_RECEIVED";
    }

    if (
      this.approveScope === "review" ||
      this.approveScope === "any" ||
      this.state?.human_reviewed ||
      this.state?.pr_approved
    ) {
      if (this.state) {
        this.state.human_reviewed = true;
        if (!this.dryRun && !this.statusOnly) {
          this.saveState(this.state);
        }
      }
      if (this.approveScope === "review" || this.approveScope === "any") {
        this.approveScope = undefined;
      }
      return "APPROVED";
    }

    if (this.state && this.state.stage !== "AWAIT_HUMAN_REVIEW") {
      return "PENDING";
    }

    const branchName = this.state?.branch_name || this.spec?.identifier;
    const repositoryDirectory = this.state?.repo_dir || process.cwd();

    if (branchName) {
      const toolbarComments = this.fetchVercelToolbarComments(repositoryDirectory, branchName);
      if (toolbarComments.count > 0) {
        console.log(`💬 Found ${toolbarComments.count} unresolved Vercel toolbar comment(s) on branch '${branchName}'`);
        return "FEEDBACK_RECEIVED";
      }
    }

    return "PENDING";
  }

  inspectTranscriptForReviewApproval(transcriptPath: string, sinceIso?: string): string {
    try {
      const content = fs.readFileSync(transcriptPath, "utf-8");
      const lines = content.trim().split("\n");

      for (let index = lines.length - 1; index >= 0; index--) {
        const line = lines[index];
        if (!line.trim()) continue;
        const entry = JSON.parse(line);
        if (sinceIso && entry.created_at && entry.created_at <= sinceIso) {
          break;
        }
        if (entry.type === "USER_INPUT") {
          const userContent = String(entry.content || "").toLowerCase();
          if (/\b(proceed|approve|approved|looks good|ship it|yes|lgtm)\b/i.test(userContent)) {
            return "APPROVED";
          }
          if (/\b(change|fix|update|revise|instead|broken|issue)\b/i.test(userContent)) {
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
    const portCheck = runCommand(["lsof", "-i", `TCP@127.0.0.1:${portNumber}`], { capture: true });
    if (portCheck.status === 0 && portCheck.stdout.trim().length > 0) {
      console.log(`🔌 Dev server is already active on port ${portNumber}`);
    } else {
      console.log(`🚀 Starting local dev server on port ${portNumber} in background...`);
      const logsDirectory = path.join(STATE_DIRECTORY, "logs");
      fs.mkdirSync(logsDirectory, { recursive: true });
      const logPath = path.join(logsDirectory, `dev-${this.spec?.identifier}.log`);
      const outputHandle = fs.openSync(logPath, "a");

      const devArguments = ["run", "dev"];
      if (fs.existsSync(path.join(worktreeDirectory, "package.json"))) {
        try {
          const packageJsonData = JSON.parse(fs.readFileSync(path.join(worktreeDirectory, "package.json"), "utf-8"));
          if (packageJsonData.scripts?.dev?.includes("next")) {
            devArguments.push("--", "-H", "127.0.0.1");
          }
        } catch {}
      }

      const childProcessInstance = child_process.spawn("bun", devArguments, {
        cwd: worktreeDirectory,
        detached: true,
        stdio: ["ignore", outputHandle, outputHandle],
        env: { ...process.env, PORT: String(portNumber), HOSTNAME: "127.0.0.1" },
      });
      childProcessInstance.unref();
      console.log(`📄 Dev server logs: ${logPath}`);
    }

    try {
      runCommand(["tailscale", "serve", `--https=${portNumber}`, "--bg", `http://127.0.0.1:${portNumber}`], {
        capture: true,
      });
    } catch {}
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

    const tailscaleUrl = tailscaleHostname ? `https://${tailscaleHostname}:${portNumber}` : localUrl;
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

    const specInstruction =
      this.spec.filePath && fs.existsSync(this.spec.filePath)
        ? `Please read the specification file at '${this.spec.filePath}' for project '${this.spec.targetProject}'. `
        : `Feature specification for project '${this.spec.targetProject}':\n\n${this.spec.content || this.spec.title}\n\n`;

    const feedbackInstruction = this.state.pending_feedback
      ? `\n\nHuman feedback to address in this revised plan:\n${this.state.pending_feedback}\n`
      : "";

    console.log("🧠 Spawning Planner Agent in herdr-core to formulate technical plan...");
    const plannerPrompt =
      specInstruction +
      `Explore the repository to analyze existing patterns, schemas, routing, and component contracts. ` +
      `Formulate a comprehensive technical plan and save the complete Markdown plan to '${markdownPlanPath}'. ` +
      `Include: feature breakdown, data models and schema changes, component contracts, implementation steps, testing strategy, and architectural trade-offs.` +
      feedbackInstruction;

    const plannerSuccess = await this.runAgentInHerdrCore(
      "plan",
      plannerPrompt,
      this.state.repo_dir,
      getStageModel("planner", this.getActiveEffort())
    );

    if (!plannerSuccess || !fs.existsSync(markdownPlanPath)) {
      console.error("❌ Planner agent did not produce the technical plan.");
      return 1;
    }

    this.state.plan_file = markdownPlanPath;
    this.state.pending_feedback = undefined;

    const dashboardUrl = this.publishTaskDashboard("PLAN REVIEW");
    this.state.visual_plan_url = dashboardUrl;
    this.state.stage = "AWAITING_PLAN_APPROVAL";
    this.saveState(this.state);

    const notificationMessage =
      `⚠️ [Plan Review Required] Technical plan generated for '${this.spec.title}'.\n` +
      `🔗 Plan Dashboard: ${dashboardUrl}\n` +
      `📄 Plan File: ${markdownPlanPath}\n` +
      `Run 'build ${this.spec.identifier} --approve-plan' or 'build ls' to approve/revise.`;
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
    console.log(`👉 Approve:  build ${this.spec?.identifier} --approve-plan`);
    console.log(`👉 Feedback: build ${this.spec?.identifier} --feedback "<comments>" (or run 'build ls')`);
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

    const terminalName = formatHerdrTerminalName(this.spec.identifier, "impl");
    const planPath =
      this.state.plan_file || path.join(STATE_DIRECTORY, "plans", `${this.spec.identifier}.md`);
    const hasPlan = fs.existsSync(planPath);
    const specInstruction =
      this.spec.filePath && fs.existsSync(this.spec.filePath)
        ? `Implement the feature specified in '${this.spec.filePath}'`
        : `Implement the task:\n\n${this.spec.content || this.spec.title}\n\n`;
    const planInstruction = hasPlan ? ` following the technical plan at '${planPath}'.` : ".";

    console.log(`🛠️  Spawning Implementer Agent '${terminalName}' in worktree: ${this.state.worktree_dir}`);
    const prompt =
      `${specInstruction}${planInstruction} ` +
      `Write unit and component tests first (TDD), then build the components and functions. ` +
      `Ensure all local tests pass via 'bun test'.`;

    const success = await this.runAgentInHerdrCore(
      "impl",
      prompt,
      this.state.worktree_dir,
      getStageModel("implementer", this.getActiveEffort())
    );

    if (!success) {
      console.error("❌ Implementer agent failed during execution.");
      return 1;
    }

    const testsPass = this.runLocalTestGate(this.state.worktree_dir);
    if (!testsPass) {
      console.log("⚠️ Local checks failed. Spawning repair agent in herdr-core...");
      const repairPrompt =
        `Local test suite failed in '${this.state.worktree_dir}' for plan '${planPath}'. ` +
        `Please inspect failure output, fix errors, and verify passing status.`;
      await this.runAgentInHerdrCore(
        "repair",
        repairPrompt,
        this.state.worktree_dir,
        getStageModel("repair", this.getActiveEffort())
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
      runCommand(["git", "commit", "--no-gpg-sign", "-m", commitMessage], { cwd: worktreeDir, capture: false });
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
      const assignedPort = this.getWorktreePort(worktreeDir);
      if (assignedPort) {
        try {
          runCommand(["tailscale", "serve", `--https=${assignedPort}`, "off"], { capture: true });
        } catch {}
      }
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
    runCommand(["git", "commit", "--no-gpg-sign", "-m", commitMessage], { cwd: this.state.worktree_dir, capture: false });

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

    await this.runAgentInHerdrCore(
      "ci",
      repairPrompt,
      this.state.worktree_dir,
      getStageModel("ciRepair", this.getActiveEffort())
    );

    if (this.hasUncommittedChanges(this.state.worktree_dir)) {
      runCommand(["git", "add", "."], { cwd: this.state.worktree_dir, capture: false });
      runCommand(
        [
          "git",
          "commit",
          "--no-gpg-sign",
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
    this.state.human_review_requested_at = new Date().toISOString();
    this.publishTaskDashboard("HUMAN REVIEW");
    this.saveState(this.state);

    console.log("\n==================================================");
    console.log(`⏸️  Awaiting Human Review: ${this.spec.title}`);
    console.log("==================================================");
    console.log(`🌐 Local Dev Server:   ${localUrl}`);
    console.log(`📱 Tailscale Dev URL:  ${tailscaleUrl}`);
    console.log(`✨ Vercel Toolbar:     Active for visual comments and annotations in-browser`);
    console.log(`👉 Send feedback:      build ${this.spec.identifier} --feedback "<your comments>"`);
    console.log(`👉 Or manage via:      build ls`);
    console.log(`\n✅ Once satisfied, approve via:`);
    console.log(`   - Run: build ${this.spec.identifier} --approve-review`);
    console.log("==================================================\n");

    const notificationMessage =
      `⏸️ [Human Review Required] '${this.spec.title}' is ready for review!\n` +
      `🌐 Local: ${localUrl}\n` +
      `📱 Tailscale: ${tailscaleUrl}\n` +
      `✨ Use Vercel Toolbar for comments, 'build ${this.spec.identifier} --feedback "..."', or 'build ls'.\n` +
      `Run 'build ${this.spec.identifier} --approve-review' to merge.`;
    this.sendOpenclawNotification(notificationMessage);
  }

  async handleResolveFeedback(): Promise<number> {
    if (!this.spec || !this.state || !this.state.worktree_dir) return 1;

    console.log("💬 Resolving human review feedback in worktree...");

    const toolbarComments = this.fetchVercelToolbarComments(this.state.repo_dir, this.state.branch_name);
    let toolbarText = "";
    if (toolbarComments.count > 0 && toolbarComments.rawOutput) {
      toolbarText = toolbarComments.rawOutput;
    }

    const feedbackParts: string[] = [];
    if (this.state.pending_feedback) {
      feedbackParts.push(`Human feedback:\n${this.state.pending_feedback}`);
    }
    if (toolbarText) {
      feedbackParts.push(`Vercel toolbar comments:\n${toolbarText}`);
    }

    const planPath =
      this.state.plan_file || path.join(STATE_DIRECTORY, "plans", `${this.spec.identifier}.md`);
    const planReference = fs.existsSync(planPath) ? ` (plan at '${planPath}')` : "";
    const combinedFeedback = feedbackParts.join("\n\n");
    const fixPrompt = combinedFeedback
      ? `The human reviewer provided feedback on '${this.spec.title}'${planReference}:\n\n${combinedFeedback}\n\n` +
        `Please address the comments, update components and tests accordingly, and ensure tests pass.`
      : `Please review recent comments and feedback from the human reviewer for '${this.spec.title}'${planReference}, implement requested adjustments, and verify tests pass.`;

    await this.runAgentInHerdrCore(
      "feedback",
      fixPrompt,
      this.state.worktree_dir,
      getStageModel("commentResolver", this.getActiveEffort())
    );

    if (this.hasUncommittedChanges(this.state.worktree_dir)) {
      runCommand(["git", "add", "."], { cwd: this.state.worktree_dir, capture: false });
      runCommand(
        [
          "git",
          "commit",
          "--no-gpg-sign",
          "-m",
          "♻️ address human review feedback\n\nCo-authored-by: Antigravity <antigravity@google.com>",
        ],
        { cwd: this.state.worktree_dir, capture: false }
      );
    }

    if (this.state) {
      this.state.pending_feedback = undefined;
      this.state.human_review_requested_at = new Date().toISOString();
      this.saveState(this.state);
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

    await this.runAgentInHerdrCore(
      "verify",
      verifierPrompt,
      this.state.worktree_dir,
      getStageModel("verifier", this.getActiveEffort())
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
          "--no-gpg-sign",
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

  parseHerdrCoreJson(rawOutput: string): Record<string, any> | null {
    const trimmed = rawOutput.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      const lastLine = trimmed.split("\n").pop()?.trim();
      if (!lastLine) return null;
      try {
        return JSON.parse(lastLine);
      } catch {
        return null;
      }
    }
  }

  waitForHerdrCoreTurn(
    herdrCoreBinary: string,
    terminalAddress: string
  ): { completed: boolean; status: string; exitCode: number | null } {
    while (true) {
      const waitResult = runCommand([herdrCoreBinary, "wait", terminalAddress, "--json"], {
        capture: true,
      });
      const parsed = this.parseHerdrCoreJson(waitResult.stdout);
      const reason = parsed?.reason;
      const status = parsed?.status || parsed?.state || "";
      const exitCode = typeof parsed?.exit_code === "number" ? parsed.exit_code : null;

      if (reason === "timeout" || reason === "message") {
        continue;
      }

      if (status === "blocked") {
        return { completed: false, status: "blocked", exitCode };
      }

      if (status === "error" || (exitCode !== null && exitCode !== 0)) {
        return { completed: false, status: status || "error", exitCode };
      }

      return { completed: waitResult.status === 0, status: status || "done", exitCode };
    }
  }

  cleanupHerdrCoreTerminal(herdrCoreBinary: string, terminalAddress: string): void {
    runCommand([herdrCoreBinary, "kill", terminalAddress], { capture: true });
    runCommand([herdrCoreBinary, "rm", terminalAddress], { capture: true });
  }

  async runAgentInHerdrCore(
    role: TerminalRole,
    prompt: string,
    workingDirectory: string,
    model: string = STAGE_MODELS.implementer
  ): Promise<boolean> {
    const specIdentifier = this.spec?.identifier || "default";
    const terminalName = formatHerdrTerminalName(specIdentifier, role);
    const herdrCoreBinary = this.findHerdrCoreBinary();

    if (!herdrCoreBinary || !fs.existsSync(herdrCoreBinary) || !this.ensureHerdrCore(herdrCoreBinary)) {
      return await this.runAntigravityAgent(
        terminalName,
        "You are an AI coding assistant.",
        prompt,
        workingDirectory,
        model
      );
    }

    let terminalAddress = terminalName;
    let shouldCleanup = true;

    try {
      const getResult = runCommand([herdrCoreBinary, "get", terminalName, "--json"], { capture: true });
      let reuseLiveTerminal = false;

      if (getResult.status === 0) {
        const terminalInfo = this.parseHerdrCoreJson(getResult.stdout);
        const ownerSpec = terminalInfo?.labels?.spec;
        const isAlive = terminalInfo?.alive !== false && !terminalInfo?.exited_at;

        if (!isAlive) {
          runCommand([herdrCoreBinary, "rm", terminalName], { capture: true });
        } else if (ownerSpec === specIdentifier) {
          reuseLiveTerminal = true;
          terminalAddress = terminalInfo?.id || terminalName;
          const currentState = terminalInfo?.state || terminalInfo?.status || "";
          if (currentState === "working") {
            console.log(`⏳ Terminal '${terminalName}' (${terminalAddress}) is still working. Waiting for turn...`);
            const preWait = this.waitForHerdrCoreTurn(herdrCoreBinary, terminalAddress);
            if (!preWait.completed) {
              if (preWait.status === "blocked") {
                shouldCleanup = false;
                console.warn(`⚠️ Terminal '${terminalName}' (${terminalAddress}) is blocked. Attach with: hc attach ${terminalAddress}`);
              }
              return false;
            }
          }
        } else {
          console.error(`❌ Live terminal '${terminalName}' belongs to spec '${ownerSpec || "unknown"}', not '${specIdentifier}'.`);
          return false;
        }
      } else if (getResult.status !== 3) {
        console.warn(`⚠️ herdr-core get failed (exit ${getResult.status}), falling back to direct runner.`);
        return await this.runAntigravityAgent(
          terminalName,
          "You are an AI coding assistant.",
          prompt,
          workingDirectory,
          model
        );
      }

      if (!reuseLiveTerminal) {
        const agyFlags =
          role === "plan" ? ["--mode", "plan"] : ["--dangerously-skip-permissions"];
        const runCommandArgs = [
          herdrCoreBinary,
          "run",
          "--bg",
          "--json",
          "--no-parent",
          "--no-notify",
          "--name",
          terminalName,
          "--cwd",
          workingDirectory,
          "--label",
          `spec=${specIdentifier}`,
          "--label",
          `project=${this.spec?.targetProject || "default"}`,
          "--label",
          `role=${role}`,
          "--",
          "agy",
          "--model",
          model,
          ...agyFlags,
        ];

        const launchResult = runCommand(runCommandArgs, { capture: true });
        if (launchResult.status !== 0) {
          console.error(`❌ herdr-core run error: ${launchResult.stderr || launchResult.stdout}`);
          return false;
        }

        const launchJson = this.parseHerdrCoreJson(launchResult.stdout);
        terminalAddress = launchJson?.id || terminalName;
        console.log(`👉 Watch/steer in herdr-core: hc attach ${terminalAddress} (${terminalName})`);

        const readyWait = this.waitForHerdrCoreTurn(herdrCoreBinary, terminalAddress);
        if (!readyWait.completed) {
          if (readyWait.status === "blocked") {
            shouldCleanup = false;
            console.warn(`⚠️ Terminal '${terminalName}' (${terminalAddress}) is blocked during startup. Attach with: hc attach ${terminalAddress}`);
          }
          return false;
        }
      }

      const sendResult = runCommand(
        [herdrCoreBinary, "send", "--wait", terminalAddress, "--json", "--", prompt],
        { capture: true }
      );
      const sendJson = this.parseHerdrCoreJson(sendResult.stdout);
      const sendReason = sendJson?.reason;
      const sendStatus = sendJson?.status || sendJson?.state || "";

      if (sendResult.status !== 0 && sendReason !== "timeout" && sendReason !== "message") {
        console.error(`❌ herdr-core send error: ${sendResult.stderr || sendResult.stdout}`);
        return false;
      }

      if (sendReason === "timeout" || sendReason === "message") {
        const turnResult = this.waitForHerdrCoreTurn(herdrCoreBinary, terminalAddress);
        if (!turnResult.completed) {
          if (turnResult.status === "blocked") {
            shouldCleanup = false;
            console.warn(`⚠️ Terminal '${terminalName}' (${terminalAddress}) is blocked. Attach with: hc attach ${terminalAddress}`);
            this.sendOpenclawNotification(
              `⚠️ Terminal '${terminalName}' (${terminalAddress}) is blocked for '${specIdentifier}'. Run: hc attach ${terminalAddress}`
            );
          }
          return false;
        }
        return true;
      }

      if (sendStatus === "blocked") {
        shouldCleanup = false;
        console.warn(`⚠️ Terminal '${terminalName}' (${terminalAddress}) is blocked. Attach with: hc attach ${terminalAddress}`);
        this.sendOpenclawNotification(
          `⚠️ Terminal '${terminalName}' (${terminalAddress}) is blocked for '${specIdentifier}'. Run: hc attach ${terminalAddress}`
        );
        return false;
      }

      if (sendStatus === "error" || (typeof sendJson?.exit_code === "number" && sendJson.exit_code !== 0)) {
        return false;
      }

      return true;
    } finally {
      if (shouldCleanup) {
        this.cleanupHerdrCoreTerminal(herdrCoreBinary, terminalAddress);
      }
    }
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
    }

    if (this.spec.filePath && fs.existsSync(this.spec.filePath)) {
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
    console.log(`Effort:         ${this.getActiveEffort()}`);
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

export interface BuildListEntry {
  spec_id: string;
  spec_title: string;
  project: string;
  effort: BuildEffort;
  stage: string;
  running_pid: number | null;
  live_terminals: Array<{ id: string; name?: string; state?: string }>;
}

export function listBuildsSnapshot(includeAll: boolean = false): BuildListEntry[] {
  if (!fs.existsSync(STATE_DIRECTORY)) {
    return [];
  }

  const herdrCoreBinary = findExecutable("hc", [
    "/usr/bin/herdr-core",
    path.join(os.homedir(), ".local", "bin", "hc"),
    path.join(os.homedir(), ".local", "bin", "herdr-core"),
  ]);

  const entries: BuildListEntry[] = [];
  const stateFiles = fs
    .readdirSync(STATE_DIRECTORY)
    .filter((entry) => entry.endsWith(".json"))
    .sort();

  for (const stateFile of stateFiles) {
    try {
      const stateData = JSON.parse(
        fs.readFileSync(path.join(STATE_DIRECTORY, stateFile), "utf-8")
      ) as BuildState;

      if (!includeAll && (stateData.deployed || stateData.stage === "COMPLETED")) {
        continue;
      }

      const runningPid = readActiveLockPid(stateData.spec_id);
      const liveTerminals: Array<{ id: string; name?: string; state?: string }> = [];

      if (herdrCoreBinary && fs.existsSync(herdrCoreBinary)) {
        const listResult = runCommand(
          [herdrCoreBinary, "ls", "--label", `spec=${stateData.spec_id}`, "--json"],
          { capture: true }
        );
        if (listResult.status === 0 && listResult.stdout.trim()) {
          try {
            const parsed = JSON.parse(listResult.stdout);
            const terminals = Array.isArray(parsed) ? parsed : parsed?.terminals || [];
            for (const terminal of terminals) {
              if (terminal?.id) {
                liveTerminals.push({
                  id: terminal.id,
                  name: terminal.name,
                  state: terminal.state || terminal.status,
                });
              }
            }
          } catch {}
        }
      }

      entries.push({
        spec_id: stateData.spec_id,
        spec_title: stateData.spec_title || stateData.spec_id,
        project: stateData.project || "starfocus",
        effort: stateData.effort || 3,
        stage: stateData.stage || "DISCOVER_SPEC",
        running_pid: runningPid,
        live_terminals: liveTerminals,
      });
    } catch {}
  }

  return entries;
}

function promptLine(questionText: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(questionText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runBuildList(includeAll: boolean, jsonOutput: boolean): Promise<number> {
  const builds = listBuildsSnapshot(includeAll);

  if (jsonOutput) {
    console.log(JSON.stringify(builds, null, 2));
    return 0;
  }

  if (builds.length === 0) {
    console.log("No outstanding builds found.");
    return 0;
  }

  console.log("\n📋 Outstanding Builds:");
  builds.forEach((entry, index) => {
    const liveSummary =
      entry.live_terminals.length > 0
        ? `hc: ${entry.live_terminals.map((t) => `${t.id}(${t.state || "live"})`).join(", ")}`
        : entry.running_pid
          ? `running (PID ${entry.running_pid})`
          : "idle";
    console.log(
      `  [${index + 1}] ${entry.spec_id}  |  ${entry.project}  |  effort ${entry.effort}  |  ${entry.stage}  |  ${liveSummary}`
    );
  });
  console.log("");

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return 0;
  }

  const choice = await promptLine("Select build number to act on (or 'q' to quit): ");
  if (!choice || choice.toLowerCase() === "q") {
    return 0;
  }

  const selectedIndex = parseInt(choice, 10) - 1;
  const selected = builds[selectedIndex];
  if (!selected) {
    console.error("❌ Invalid selection.");
    return 1;
  }

  if (selected.live_terminals.length > 0) {
    const targetTerminal = selected.live_terminals[0];
    const herdrCoreBinary = findExecutable("hc", ["/usr/bin/herdr-core"]);
    if (herdrCoreBinary) {
      const attachAnswer = await promptLine(
        `Live terminal ${targetTerminal.id} (${targetTerminal.name || "agent"}) found. Attach? [Y/n]: `
      );
      if (!attachAnswer || attachAnswer.toLowerCase().startsWith("y")) {
        runCommand([herdrCoreBinary, "attach", targetTerminal.id], { capture: false });
        return 0;
      }
    }
  }

  if (selected.running_pid !== null) {
    console.log(`⚠️ Build '${selected.spec_id}' is already running (PID ${selected.running_pid}).`);
    return 0;
  }

  if (
    selected.stage === "AWAITING_PLAN_APPROVAL" ||
    selected.stage === "AWAIT_PLAN_APPROVAL" ||
    selected.stage === "AWAIT_HUMAN_REVIEW"
  ) {
    const isPlanGate =
      selected.stage === "AWAITING_PLAN_APPROVAL" || selected.stage === "AWAIT_PLAN_APPROVAL";
    const action = await promptLine("Action: [a]pprove / [f]eedback / [q]uit: ");
    if (action.toLowerCase() === "a") {
      const orchestrator = new BuildOrchestrator(
        selected.spec_id,
        undefined,
        false,
        undefined,
        isPlanGate ? "plan" : "review",
        false
      );
      return await orchestrator.execute();
    }
    if (action.toLowerCase() === "f") {
      const feedback = await promptLine("Enter feedback: ");
      if (!feedback) {
        console.log("No feedback entered.");
        return 0;
      }
      const orchestrator = new BuildOrchestrator(
        selected.spec_id,
        undefined,
        false,
        undefined,
        false,
        false,
        feedback
      );
      return await orchestrator.execute();
    }
    return 0;
  }

  const orchestrator = new BuildOrchestrator(selected.spec_id);
  return await orchestrator.execute();
}

function removeBuildState(specQuery: string): number {
  if (!specQuery) {
    console.error("❌ Usage: build rm <spec-id>");
    return 1;
  }

  const stateFile = path.join(STATE_DIRECTORY, `${specQuery}.json`);
  const lockFile = path.join(STATE_DIRECTORY, `${specQuery}.lock`);
  const planFile = path.join(STATE_DIRECTORY, "plans", `${specQuery}.md`);

  let removedAny = false;
  for (const filePath of [stateFile, lockFile, planFile]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      removedAny = true;
    }
  }

  if (!removedAny) {
    console.error(`❌ No build state found for '${specQuery}'.`);
    return 1;
  }

  console.log(`🗑️  Removed build state for '${specQuery}'.`);
  return 0;
}

export function parseArguments(rawArgs: string[] = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: rawArgs,
    options: {
      prompt: { type: "string", short: "p" },
      effort: { type: "string", short: "e" },
      "spec-id": { type: "string" },
      project: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      status: { type: "boolean", default: false },
      approve: { type: "boolean", default: false },
      "approve-plan": { type: "boolean", default: false },
      "approve-review": { type: "boolean", default: false },
      feedback: { type: "string" },
      all: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  const subcommand = positionals[0];
  const isListCommand = subcommand === "ls";
  const isRemoveCommand = subcommand === "rm";
  const isStatusCommand = positionals.includes("status") || Boolean(values.status);

  const remainingPositionals = positionals.filter(
    (arg) => arg !== "status" && arg !== "ls" && arg !== "rm"
  );

  let specId = values["spec-id"];
  const inlinePrompt = values.prompt?.trim() || undefined;

  if (inlinePrompt && (specId || remainingPositionals.length > 0)) {
    console.error("❌ Error: Cannot combine -p/--prompt with --spec-id or positional spec ID.");
    process.exit(1);
  }

  if (!specId && !inlinePrompt && remainingPositionals.length === 1) {
    specId = remainingPositionals[0];
  } else if (!inlinePrompt && remainingPositionals.length > 1) {
    console.error(
      "❌ Error: Positional prompt arguments are no longer supported. Use -p \"<prompt>\" instead."
    );
    process.exit(1);
  }

  if (isStatusCommand && !specId && !inlinePrompt) {
    const currentDirectory = process.cwd();
    if (currentDirectory.includes("/.worktrees/")) {
      specId = path.basename(currentDirectory);
    } else {
      const branchRes = runCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: currentDirectory,
        capture: true,
      });
      if (
        branchRes.status === 0 &&
        branchRes.stdout.trim() &&
        branchRes.stdout.trim() !== "master" &&
        branchRes.stdout.trim() !== "main"
      ) {
        specId = branchRes.stdout.trim();
      }
    }
    if (!specId) {
      console.log("uninitialized");
      process.exit(0);
    }
  }

  if (values.help || (!isListCommand && !isRemoveCommand && !inlinePrompt && !specId)) {
    console.log('Usage: build -p "<prompt>" [options]');
    console.log("       build <spec-id> [options]");
    console.log("       build ls [--all] [--json]");
    console.log("       build rm <spec-id>");
    console.log("       build status");
    console.log("\nAgentic coding workflow build orchestrator powered by Antigravity and herdr-core.");
    console.log("\nOptions:");
    console.log("  -p, --prompt <text>   Inline feature prompt to plan and build.");
    console.log("  -e, --effort <1|2|3>  Workflow effort: 1 (single agent), 2 (impl + review), 3 (plan + impl + review, default).");
    console.log("  --spec-id <id>        Pre-written spec identifier, slug, or file path.");
    console.log("  --project <project>   Override inferred target project (e.g. banerry, starfocus).");
    console.log("  --approve-plan        Approve technical plan gate.");
    console.log("  --approve-review      Approve human review gate and merge/push.");
    console.log("  --approve             Approve current gate (plan or review).");
    console.log("  --feedback <text>     Provide feedback to replan or update implementation.");
    console.log("  --all                 Include completed builds in 'build ls'.");
    console.log("  --json                Output JSON in 'build ls'.");
    console.log("  --dry-run             Inspect external state and planned actions without side effects.");
    console.log("  --status              Display current build lifecycle state.");
    console.log("  -h, --help            Show this help message and exit.");
    process.exit(values.help ? 0 : 1);
  }

  let approveScope: ApproveScope | undefined;
  if (values["approve-plan"]) {
    approveScope = "plan";
  } else if (values["approve-review"]) {
    approveScope = "review";
  } else if (values.approve) {
    approveScope = "any";
  }

  let effort: BuildEffort | undefined;
  if (values.effort !== undefined) {
    if (values.effort !== "1" && values.effort !== "2" && values.effort !== "3") {
      console.error(
        `❌ Error: Invalid effort '${values.effort}'. Expected 1, 2, or 3.`
      );
      process.exit(1);
    }
    effort = Number(values.effort) as BuildEffort;
  }

  return {
    command: isListCommand ? ("ls" as const) : isRemoveCommand ? ("rm" as const) : ("run" as const),
    prompt: inlinePrompt,
    effort,
    specId: specId || "",
    project: values.project,
    approve: Boolean(approveScope),
    approveScope,
    feedback: values.feedback?.trim() || undefined,
    includeAll: Boolean(values.all),
    jsonOutput: Boolean(values.json),
    dryRun: Boolean(values["dry-run"] || isStatusCommand),
    statusOnly: isStatusCommand,
  };
}

async function main() {
  const parsedArguments = parseArguments();

  if (parsedArguments.command === "ls") {
    const exitCode = await runBuildList(parsedArguments.includeAll, parsedArguments.jsonOutput);
    process.exit(exitCode);
  }

  if (parsedArguments.command === "rm") {
    const exitCode = removeBuildState(parsedArguments.specId);
    process.exit(exitCode);
  }

  const orchestrator = new BuildOrchestrator(
    parsedArguments.specId,
    parsedArguments.project,
    parsedArguments.dryRun,
    parsedArguments.prompt,
    parsedArguments.approveScope ?? false,
    parsedArguments.statusOnly,
    parsedArguments.feedback,
    parsedArguments.effort
  );
  const exitCode = await orchestrator.execute();
  process.exit(exitCode);
}

if (import.meta.main) {
  main();
}
