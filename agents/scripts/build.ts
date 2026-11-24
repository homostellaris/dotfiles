#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";
import crypto from "node:crypto";
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
  effort: BuildEffort = 1
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

export interface AgentParticipationRecord {
  role: string;
  model: string;
  effort: BuildEffort;
  started_at: string;
  finished_at: string;
  status: "completed" | "failed";
  conversation_id?: string;
  transcript_path?: string;
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
  implementation_completed?: boolean;
  repo_tests_passed?: boolean;
  human_reviewed?: boolean;
  human_review_requested_at?: string;
  addressed_toolbar_hash?: string;
  dev_url?: string;
  verifier_passed: boolean;
  merged: boolean;
  deployed: boolean;
  history: AgentParticipationRecord[];
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

const GITMOJI_RULES: Array<{ pattern: RegExp; emoji: string }> = [
  { pattern: /\b(fix|bug|broken|error|crash|fail(?:s|ed|ing)?|no longer|regression)\b/i, emoji: "🐛" },
  { pattern: /\b(refactor|clean ?up|simplify|consolidate|extract)\b/i, emoji: "♻️" },
  { pattern: /\b(docs?|documentation|readme|comment)\b/i, emoji: "📝" },
  { pattern: /\b(test|spec|coverage|cypress)\b/i, emoji: "✅" },
  { pattern: /\b(perf|performance|optimi[sz]e|speed|fast)\b/i, emoji: "⚡" },
  { pattern: /\b(security|auth|permission|secret|token)\b/i, emoji: "🔒" },
  { pattern: /\b(remove|delete|drop|prune|deprecate)\b/i, emoji: "🔥" },
  { pattern: /\b(config|chore|build|ci|lint|setup|deps|dependency)\b/i, emoji: "🔧" },
];

const LEADING_EMOJI_PATTERN = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s+(.+)$/u;

export function validateGitmojiCommitMessage(message: string): { valid: boolean; reason?: string } {
  const subject = message.trim().split("\n")[0]?.trim() || "";
  if (!subject) {
    return { valid: false, reason: "Commit subject cannot be empty." };
  }
  const match = subject.match(LEADING_EMOJI_PATTERN);
  if (!match) {
    return { valid: false, reason: `Commit subject must start with a Gitmoji followed by a space and description: "${subject}"` };
  }
  if (match[2].trim().length < 3) {
    return { valid: false, reason: `Commit description after Gitmoji is too short: "${subject}"` };
  }
  return { valid: true };
}

export function formatGitmojiCommitMessage(rawTitle: string): string {
  const singleLine = rawTitle.trim().split("\n")[0]?.trim() || "update implementation";
  if (LEADING_EMOJI_PATTERN.test(singleLine)) {
    return singleLine;
  }
  const matchedRule = GITMOJI_RULES.find((rule) => rule.pattern.test(singleLine));
  const emoji = matchedRule ? matchedRule.emoji : "✨";
  return `${emoji} ${singleLine}`;
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
  public workingDirectory?: string;
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
    effort?: BuildEffort,
    workingDirectory?: string
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
    this.workingDirectory = workingDirectory ? path.resolve(workingDirectory) : undefined;
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

  resolveProjectFromWorkingDirectory(
    workingDirectory: string = this.workingDirectory || process.cwd()
  ): {
    project: string;
    repoDir: string;
  } {
    const commonDirResult = runCommand(["git", "rev-parse", "--git-common-dir"], {
      cwd: workingDirectory,
      capture: true,
    });
    if (commonDirResult.status === 0 && commonDirResult.stdout.trim()) {
      const resolvedCommonDir = path.resolve(workingDirectory, commonDirResult.stdout.trim());
      if (path.basename(resolvedCommonDir) === ".git") {
        const repoDir = path.dirname(resolvedCommonDir);
        return { project: path.basename(repoDir) || "default", repoDir };
      }
    }

    const toplevelResult = runCommand(["git", "rev-parse", "--show-toplevel"], {
      cwd: workingDirectory,
      capture: true,
    });
    if (toplevelResult.status === 0 && toplevelResult.stdout.trim()) {
      const repoDir = path.resolve(toplevelResult.stdout.trim());
      return { project: path.basename(repoDir) || "default", repoDir };
    }

    const resolvedCwd = path.resolve(workingDirectory);
    return { project: path.basename(resolvedCwd) || "default", repoDir: resolvedCwd };
  }

  createInlineSpec(promptText: string): SpecMetadata {
    const slug = this.slugifyPrompt(promptText);
    const identifier = `${slug}_${generateShortId()}`;
    const firstLine = promptText.trim().split("\n")[0].trim();
    const title = firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
    const project = this.projectOverride || this.resolveProjectFromWorkingDirectory().project;

    return {
      identifier,
      filePath: "",
      title,
      content: promptText.trim(),
      prompt: promptText.trim(),
      targetProject: project,
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
        targetProject: stateData.project || this.resolveProjectFromWorkingDirectory().project,
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

    const targetProject =
      this.projectOverride || this.resolveProjectFromWorkingDirectory().project;

    return {
      identifier: filenameStem,
      filePath: chosenPath,
      title,
      starRole,
      starPoints,
      content: body,
      targetProject,
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

  getActiveEffort(): BuildEffort {
    return this.effort || this.state?.effort || 1;
  }

  loadOrInitializeState(spec: SpecMetadata): BuildState {
    if (!fs.existsSync(STATE_DIRECTORY)) {
      fs.mkdirSync(STATE_DIRECTORY, { recursive: true });
    }
    const stateFile = path.join(STATE_DIRECTORY, `${spec.identifier}.json`);

    const resolvedFromCwd = this.resolveProjectFromWorkingDirectory();
    const defaultRepoDir = this.projectOverride
      ? path.join(REPOSITORIES_DIRECTORY, this.projectOverride)
      : resolvedFromCwd.repoDir;

    if (fs.existsSync(stateFile)) {
      try {
        const raw = fs.readFileSync(stateFile, "utf-8");
        const data = JSON.parse(raw);
        const repoDir = this.projectOverride
          ? path.join(REPOSITORIES_DIRECTORY, this.projectOverride)
          : data.repo_dir || defaultRepoDir;
        const worktreeDir = path.join(repoDir, ".worktrees", spec.identifier);
        const branchName = spec.identifier;
        const state: BuildState = {
          ...data,
          effort: this.effort || data.effort || 1,
          repo_dir: repoDir,
          worktree_dir: worktreeDir,
          branch_name: branchName,
        };
        return state;
      } catch {}
    }

    const worktreeDir = path.join(defaultRepoDir, ".worktrees", spec.identifier);
    const branchName = spec.identifier;

    const initialState: BuildState = {
      spec_id: spec.identifier,
      spec_path: spec.filePath,
      spec_title: spec.title,
      effort: this.effort || 1,
      prompt: spec.prompt,
      project: spec.targetProject,
      repo_dir: defaultRepoDir,
      worktree_dir: worktreeDir,
      branch_name: branchName,
      stage: "DISCOVER_SPEC",
      plan_approved: false,
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

    if (this.state.deployed || this.state.stage === "COMPLETED") {
      return "COMPLETED";
    }

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

    if (!this.state.implementation_completed && commitsAhead === 0) {
      return "IMPLEMENT_AND_FIX_LOCAL";
    }

    const unitTestsPass = this.runLocalTestGate(this.state.worktree_dir);
    if (!unitTestsPass) {
      return "IMPLEMENT_AND_FIX_LOCAL";
    }

    const humanReviewStatus = this.checkHumanReviewStatus();
    if (humanReviewStatus === "FEEDBACK_RECEIVED") {
      return "RESOLVE_FEEDBACK";
    }
    if (humanReviewStatus !== "APPROVED") {
      if (this.shouldRunVerifier()) {
        return "RUN_VERIFIER_AGENT";
      }
      return "AWAIT_HUMAN_REVIEW";
    }

    if (this.state.deployed) {
      return "COMPLETED";
    }

    return "MERGE_AND_PUSH";
  }

  hasPlanFile(specId: string): boolean {
    const defaultPlanPath = path.join(STATE_DIRECTORY, "plans", `${specId}.md`);
    const statePlanPath = this.state?.plan_file;
    return Boolean((statePlanPath && fs.existsSync(statePlanPath)) || fs.existsSync(defaultPlanPath));
  }

  shouldRunVerifier(): boolean {
    if (!this.spec || !this.state) return false;
    const requiresReview = this.getActiveEffort() >= 2 || this.hasPlanFile(this.spec.identifier);
    return requiresReview && !this.state.verifier_passed;
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

  hashToolbarComments(rawOutput: string): string {
    return crypto.createHash("sha256").update(rawOutput).digest("hex");
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
      this.state?.human_reviewed
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
        const currentHash = this.hashToolbarComments(toolbarComments.rawOutput);
        if (this.state?.addressed_toolbar_hash && this.state.addressed_toolbar_hash === currentHash) {
          return "PENDING";
        }
        console.log(`💬 Found ${toolbarComments.count} unresolved Vercel toolbar comment(s) on branch '${branchName}'`);
        return "FEEDBACK_RECEIVED";
      }
    }

    return "PENDING";
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
      stage === "COMMIT_AND_PUSH"
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
    if (stage === "RESOLVE_FEEDBACK") {
      return await this.handleResolveFeedback();
    }
    if (stage === "AWAIT_HUMAN_REVIEW") {
      this.handleAwaitHumanReview();
      return 0;
    }
    if (stage === "RUN_VERIFIER_AGENT") {
      return await this.handleVerifierAgent();
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
      `Run 'build --spec ${this.spec.identifier} --approve-plan' or 'build ls' to approve/revise.`;
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
    console.log(`👉 Approve:  build --spec ${this.spec?.identifier} --approve-plan`);
    console.log(`👉 Feedback: build --spec ${this.spec?.identifier} --feedback "<comments>" (or run 'build ls')`);
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
      const frozenInstall = runCommand(["bun", "install", "--frozen-lockfile"], {
        cwd: this.state.worktree_dir,
        capture: false,
      });
      if (frozenInstall.status !== 0) {
        runCommand(["bun", "install"], { cwd: this.state.worktree_dir, capture: false });
      }
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
      const repairSuccess = await this.runAgentInHerdrCore(
        "repair",
        repairPrompt,
        this.state.worktree_dir,
        getStageModel("repair", this.getActiveEffort())
      );
      if (!repairSuccess || !this.runLocalTestGate(this.state.worktree_dir)) {
        console.error("❌ Local tests still failing after repair pass.");
        return 1;
      }
    }

    this.state.implementation_completed = true;
    this.saveState(this.state);
    console.log("✅ Local verification complete.");
    return 0;
  }

  stopDevServer(portNumber: number): void {
    const pidResult = runCommand(["lsof", "-t", "-i", `TCP@127.0.0.1:${portNumber}`, "-sTCP:LISTEN"], {
      capture: true,
    });
    if (pidResult.status === 0 && pidResult.stdout.trim()) {
      for (const line of pidResult.stdout.trim().split("\n")) {
        const pid = parseInt(line.trim(), 10);
        if (!Number.isNaN(pid) && pid > 0) {
          try {
            process.kill(pid, "SIGTERM");
          } catch {}
        }
      }
    }

    try {
      runCommand(["tailscale", "serve", `--https=${portNumber}`, "off"], { capture: true });
    } catch {}
  }

  cleanupWorktreeResources(repoDir: string, worktreeDir?: string, branchName?: string): void {
    const portToStop =
      this.state?.port || (worktreeDir && fs.existsSync(worktreeDir) ? this.getWorktreePort(worktreeDir) : 0);
    if (portToStop) {
      this.stopDevServer(portToStop);
    }

    if (worktreeDir && worktreeDir !== repoDir && fs.existsSync(worktreeDir)) {
      console.log(`🧹 Cleaning up worktree at: ${worktreeDir}`);
      const worktreeHelper = findExecutable("worktree", [
        path.join(os.homedir(), ".local", "bin", "worktree"),
        path.join(os.homedir(), "code", "homostellaris", "dotfiles", "agents", "scripts", "worktree.ts"),
      ]);
      if (worktreeHelper && branchName) {
        runCommand([worktreeHelper, "remove", branchName], { cwd: repoDir, capture: true });
      } else {
        runCommand(["git", "worktree", "remove", "--force", worktreeDir], { cwd: repoDir, capture: true });
        if (branchName) {
          runCommand(["git", "branch", "-D", branchName], { cwd: repoDir, capture: true });
        }
      }

      if (fs.existsSync(worktreeDir)) {
        fs.rmSync(worktreeDir, { recursive: true, force: true });
        runCommand(["git", "worktree", "prune"], { cwd: repoDir, capture: true });
      }
    }

    if (this.spec?.identifier) {
      const symboldiffFile = path.join(STATE_DIRECTORY, `${this.spec.identifier}-symboldiff.html`);
      if (fs.existsSync(symboldiffFile)) {
        fs.rmSync(symboldiffFile, { force: true });
      }
    }
  }

  consolidateBranchCommits(worktreeDir: string, defaultBranch: string, commitMessage: string): boolean {
    if (this.hasUncommittedChanges(worktreeDir)) {
      runCommand(["git", "add", "."], { cwd: worktreeDir, capture: false });
      const wipCommit = runCommand(["git", "commit", "--no-gpg-sign", "-m", "chore: wip"], {
        cwd: worktreeDir,
        capture: true,
      });
      if (wipCommit.status !== 0) {
        console.error(`❌ Failed to stage uncommitted changes before squash: ${wipCommit.stderr}`);
        return false;
      }
    }

    const fetchRes = runCommand(["git", "fetch", "origin", defaultBranch], { cwd: worktreeDir, capture: true });
    if (fetchRes.status === 0) {
      const rebaseRes = runCommand(["git", "rebase", `origin/${defaultBranch}`], {
        cwd: worktreeDir,
        capture: true,
      });
      if (rebaseRes.status !== 0) {
        runCommand(["git", "rebase", "--abort"], { cwd: worktreeDir, capture: true });
        console.error(`❌ Failed to rebase onto origin/${defaultBranch}: ${rebaseRes.stderr}`);
        return false;
      }

      const resetRes = runCommand(["git", "reset", "--soft", `origin/${defaultBranch}`], {
        cwd: worktreeDir,
        capture: true,
      });
      if (resetRes.status !== 0) {
        console.error(`❌ Failed to squash commits onto origin/${defaultBranch}: ${resetRes.stderr}`);
        return false;
      }
    }

    if (this.hasUncommittedChanges(worktreeDir)) {
      const lintResult = validateGitmojiCommitMessage(commitMessage);
      if (!lintResult.valid) {
        console.error(`❌ Gitmoji commit lint failed: ${lintResult.reason}`);
        return false;
      }
      runCommand(["git", "add", "."], { cwd: worktreeDir, capture: false });
      const finalCommit = runCommand(["git", "commit", "--no-gpg-sign", "-m", commitMessage], {
        cwd: worktreeDir,
        capture: true,
      });
      if (finalCommit.status !== 0) {
        console.error(`❌ Failed to create consolidated commit: ${finalCommit.stderr}`);
        return false;
      }
    }

    return true;
  }

  async handleMergeAndPush(): Promise<number> {
    if (!this.spec || !this.state) return 1;

    const worktreeDir = this.state.worktree_dir || this.state.repo_dir;
    const repoDir = this.state.repo_dir;
    const defaultBranch = getDefaultBranch(repoDir);
    const branchName = this.state.branch_name || this.spec.identifier;

    const subject = formatGitmojiCommitMessage(this.spec.title);
    const commitMessage =
      `${subject}\n\n` +
      `Co-authored-by: Antigravity <antigravity@google.com>`;

    if (!this.consolidateBranchCommits(worktreeDir, defaultBranch, commitMessage)) {
      return 1;
    }

    console.log(`🔀 Merging ${branchName} into ${defaultBranch} and pushing directly to origin...`);

    const pushRes = runCommand(
      ["git", "push", "origin", `${branchName}:${defaultBranch}`],
      { cwd: worktreeDir, capture: true }
    );

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

    // 4. Cleanup dev server, Tailscale serve, and worktree if isolated
    this.cleanupWorktreeResources(repoDir, worktreeDir, branchName);

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
    const symboldiffPath = this.generateWorktreeSymboldiff();
    const dashboardUrl = this.publishTaskDashboard("HUMAN REVIEW", symboldiffPath);
    this.saveState(this.state);

    console.log("\n==================================================");
    console.log(`⏸️  Awaiting Human Review: ${this.spec.title}`);
    console.log("==================================================");
    console.log(`🌐 Local Dev Server:   ${localUrl}`);
    console.log(`📱 Tailscale Dev URL:  ${tailscaleUrl}`);
    console.log(`📊 Task Dashboard:     ${dashboardUrl}`);
    console.log(`✨ Vercel Toolbar:     Active for visual comments and annotations in-browser`);
    console.log(`👉 Send feedback:      build --spec ${this.spec.identifier} --feedback "<your comments>"`);
    console.log(`👉 Or manage via:      build ls`);
    console.log(`\n✅ Once satisfied, approve via:`);
    console.log(`   - Run: build --spec ${this.spec.identifier} --approve-review`);
    console.log("==================================================\n");

    const notificationMessage =
      `⏸️ [Human Review Required] '${this.spec.title}' is ready for review!\n` +
      `🌐 Local: ${localUrl}\n` +
      `📱 Tailscale: ${tailscaleUrl}\n` +
      `📊 Dashboard: ${dashboardUrl}\n` +
      `✨ Use Vercel Toolbar for comments, 'build --spec ${this.spec.identifier} --feedback "..."', or 'build ls'.\n` +
      `Run 'build --spec ${this.spec.identifier} --approve-review' to merge.`;
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

    const feedbackSuccess = await this.runAgentInHerdrCore(
      "feedback",
      fixPrompt,
      this.state.worktree_dir,
      getStageModel("commentResolver", this.getActiveEffort())
    );
    if (!feedbackSuccess) {
      console.error("❌ Feedback agent failed during execution.");
      return 1;
    }

    if (this.state) {
      this.state.pending_feedback = undefined;
      this.state.stage = "RESOLVE_FEEDBACK";
      this.state.verifier_passed = false;
      this.state.human_review_requested_at = new Date().toISOString();
      if (toolbarComments.count > 0 && toolbarComments.rawOutput) {
        this.state.addressed_toolbar_hash = this.hashToolbarComments(toolbarComments.rawOutput);
      }
      this.saveState(this.state);
    }

    console.log("✅ Human feedback addressed. Returning to test and review cycle.");
    return 0;
  }

  async handleVerifierAgent(): Promise<number> {
    if (!this.spec || !this.state || !this.state.worktree_dir) return 1;

    const model = getStageModel("verifier", this.getActiveEffort());
    console.log(`🛡️  Spawning Verifier Agent (${model}) in worktree: ${this.state.worktree_dir}`);
    const defaultBranch = getDefaultBranch(this.state.repo_dir);
    const diffRes = runCommand(["git", "diff", defaultBranch], {
      cwd: this.state.worktree_dir,
      capture: true,
    });
    const diffText = (diffRes.stdout || "").slice(0, 8000);

    const verifierPrompt =
      `Review this diff against '${defaultBranch}' for '${this.spec.title}' for simplification, edge cases, and code hardening:\n\n` +
      `\`\`\`diff\n${diffText}\n\`\`\`\n\n` +
      `Identify any dead code, missing error boundaries, or potential type regressions. ` +
      `Apply direct hardening edits in the worktree and verify tests pass. Do not commit changes.`;

    const verified = await this.runAgentInHerdrCore(
      "verify",
      verifierPrompt,
      this.state.worktree_dir,
      model
    );
    if (!verified) {
      console.error("❌ Verifier agent failed during execution.");
      return 1;
    }

    this.state.verifier_passed = true;
    this.saveState(this.state);
    console.log("✅ Verifier pass complete.");
    return 0;
  }

  handleVerifyDeployment(): number {
    if (!this.spec || !this.state) return 1;

    console.log("🚀 Verifying production deployment...");
    this.cleanupWorktreeResources(this.state.repo_dir, this.state.worktree_dir, this.state.branch_name);

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
    terminalAddress: string,
    maxWaitMilliseconds: number = 30 * 60 * 1000
  ): { completed: boolean; status: string; exitCode: number | null } {
    const startedAtMilliseconds = Date.now();
    while (true) {
      const waitResult = runCommand([herdrCoreBinary, "wait", terminalAddress, "--json"], {
        capture: true,
      });
      const parsed = this.parseHerdrCoreJson(waitResult.stdout);
      const reason = parsed?.reason;
      const status = parsed?.status || parsed?.state || "";
      const exitCode = typeof parsed?.exit_code === "number" ? parsed.exit_code : null;

      if (reason === "timeout" || reason === "message") {
        if (Date.now() - startedAtMilliseconds >= maxWaitMilliseconds) {
          return { completed: false, status: "timed_out", exitCode };
        }
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

  snapshotBrainTranscripts(): Map<string, number> {
    const snapshots = new Map<string, number>();
    const brainRoot = path.join(os.homedir(), ".gemini", "antigravity-cli", "brain");
    if (!fs.existsSync(brainRoot)) return snapshots;

    try {
      for (const entry of fs.readdirSync(brainRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const transcriptPath = path.join(brainRoot, entry.name, ".system_generated", "logs", "transcript.jsonl");
        if (fs.existsSync(transcriptPath)) {
          snapshots.set(entry.name, fs.statSync(transcriptPath).mtimeMs);
        }
      }
    } catch {}
    return snapshots;
  }

  resolveRunTranscript(
    beforeSnapshots: Map<string, number>,
    promptSnippet: string
  ): { conversation_id?: string; transcript_path?: string } {
    const brainRoot = path.join(os.homedir(), ".gemini", "antigravity-cli", "brain");
    if (!fs.existsSync(brainRoot)) return {};

    const candidates: Array<{ id: string; path: string; mtimeMs: number; matchesPrompt: boolean }> = [];
    const needle = promptSnippet.slice(0, 80).trim();
    try {
      for (const entry of fs.readdirSync(brainRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const transcriptPath = path.join(brainRoot, entry.name, ".system_generated", "logs", "transcript.jsonl");
        if (!fs.existsSync(transcriptPath)) continue;
        const mtimeMs = fs.statSync(transcriptPath).mtimeMs;
        const previousMtime = beforeSnapshots.get(entry.name);
        if (previousMtime !== undefined && mtimeMs <= previousMtime) continue;

        let matchesPrompt = false;
        if (needle) {
          try {
            const head = fs.readFileSync(transcriptPath, "utf-8").slice(0, 8192);
            matchesPrompt = head.includes(needle);
          } catch {}
        }
        candidates.push({ id: entry.name, path: transcriptPath, mtimeMs, matchesPrompt });
      }
    } catch {}

    if (candidates.length === 0) return {};
    candidates.sort((a, b) => Number(b.matchesPrompt) - Number(a.matchesPrompt) || b.mtimeMs - a.mtimeMs);
    return { conversation_id: candidates[0].id, transcript_path: candidates[0].path };
  }

  recordAgentParticipation(
    role: string,
    model: string,
    startedAt: string,
    succeeded: boolean,
    beforeSnapshots: Map<string, number>,
    promptSnippet: string
  ): void {
    if (!this.state) return;
    const transcriptInfo = this.resolveRunTranscript(beforeSnapshots, promptSnippet);
    if (!Array.isArray(this.state.history)) {
      this.state.history = [];
    }
    this.state.history.push({
      role,
      model,
      effort: this.getActiveEffort(),
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: succeeded ? "completed" : "failed",
      ...transcriptInfo,
    });
    this.saveState(this.state);
  }

  async runAgentInHerdrCore(
    role: TerminalRole,
    prompt: string,
    workingDirectory: string,
    model: string = STAGE_MODELS.implementer
  ): Promise<boolean> {
    return await this.runAntigravityAgent(
      role,
      "You are an AI coding assistant.",
      prompt,
      workingDirectory,
      model
    );
  }

  async runAntigravityAgent(
    sessionName: string,
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
      const startedAt = new Date().toISOString();
      const beforeSnapshots = this.snapshotBrainTranscripts();
      const modeFlags = sessionName === "plan" ? ["--mode", "plan"] : ["--dangerously-skip-permissions"];
      const res = runCommand([agyBinary, "--model", model, ...modeFlags, "--print", prompt], {
        cwd: workingDir,
        capture: false,
      });
      const succeeded = res.status === 0;
      this.recordAgentParticipation(sessionName, model, startedAt, succeeded, beforeSnapshots, prompt);
      return succeeded;
    }

    console.error("❌ Antigravity runtime not found.");
    return false;
  }

  generateWorktreeSymboldiff(): string | undefined {
    if (!this.spec || !this.state || !this.state.worktree_dir || !this.state.repo_dir) {
      return undefined;
    }

    const symboldiffScript = findExecutable("symboldiff.mjs", [
      path.join(os.homedir(), ".agents", "skills", "symboldiff", "scripts", "symboldiff.mjs"),
      path.join(os.homedir(), ".gemini", "config", "skills", "symboldiff", "scripts", "symboldiff.mjs"),
      path.join(os.homedir(), "code", "homostellaris", "dotfiles", "agents", "skills", "symboldiff", "scripts", "symboldiff.mjs"),
    ]);
    if (!symboldiffScript || !fs.existsSync(symboldiffScript)) {
      return undefined;
    }

    if (!fs.existsSync(STATE_DIRECTORY)) {
      fs.mkdirSync(STATE_DIRECTORY, { recursive: true });
    }
    const outputPath = path.join(STATE_DIRECTORY, `${this.spec.identifier}-symboldiff.html`);
    const defaultBranch = getDefaultBranch(this.state.repo_dir);
    const result = runCommand(
      [symboldiffScript, "--no-open", "--out", outputPath, defaultBranch],
      { cwd: this.state.worktree_dir, capture: true }
    );
    if (result.status !== 0 || !fs.existsSync(outputPath)) {
      return undefined;
    }
    return outputPath;
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
    const agentCount = Array.isArray(this.state?.history) ? this.state.history.length : 0;
    console.log(
      `Agents:         ${agentCount} run(s)${agentCount > 0 && this.spec ? ` (inspect: build agents --spec ${this.spec.identifier})` : ""}`
    );
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
        effort: stateData.effort || 1,
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
    const action = await promptLine("Action: [a]pprove / [f]eedback / [r]esume / [q]uit: ");
    const normalizedAction = action.trim().toLowerCase();
    if (normalizedAction === "a") {
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
    if (normalizedAction === "f") {
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
    if (normalizedAction !== "r") {
      return 0;
    }
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

function loadBuildStateHistory(specQuery: string): { stateFile: string; state: BuildState } | null {
  const stateFile = path.join(STATE_DIRECTORY, `${specQuery}.json`);
  if (!fs.existsSync(stateFile)) return null;
  try {
    return { stateFile, state: JSON.parse(fs.readFileSync(stateFile, "utf-8")) as BuildState };
  } catch {
    return null;
  }
}

export function runBuildAgents(specQuery: string, jsonOutput: boolean = false): number {
  if (!specQuery) {
    console.error("❌ Usage: build agents --spec <spec-id>");
    return 1;
  }
  const loaded = loadBuildStateHistory(specQuery);
  if (!loaded) {
    console.error(`❌ No build state found for '${specQuery}'.`);
    return 1;
  }
  const agents = Array.isArray(loaded.state.history) ? loaded.state.history : [];
  if (jsonOutput) {
    console.log(JSON.stringify(agents, null, 2));
    return 0;
  }
  if (agents.length === 0) {
    console.log(`No recorded agent runs for '${specQuery}'.`);
    return 0;
  }
  console.log(`\n🤖 Agents for '${specQuery}' (${agents.length}):\n`);
  agents.forEach((entry, index) => {
    const cid = entry.conversation_id || "unknown";
    console.log(
      `  [${index + 1}] ${entry.role}  |  ${entry.model}  |  effort ${entry.effort}  |  ${entry.status}  |  ${entry.started_at}  |  ${cid}`
    );
    if (entry.transcript_path) {
      console.log(`      📄 ${entry.transcript_path}`);
    }
  });
  console.log(`\n👉 Inspect a transcript: build transcript --spec ${specQuery} [--agent <#|role|conversation-id>] [--full]\n`);
  return 0;
}

export function runBuildTranscript(
  specQuery: string,
  agentSelector?: string,
  fullOutput: boolean = false
): number {
  if (!specQuery) {
    console.error("❌ Usage: build transcript --spec <spec-id> [--agent <#|role|id>] [--full]");
    return 1;
  }
  const loaded = loadBuildStateHistory(specQuery);
  if (!loaded) {
    console.error(`❌ No build state found for '${specQuery}'.`);
    return 1;
  }
  const agents = Array.isArray(loaded.state.history) ? loaded.state.history : [];
  if (agents.length === 0) {
    console.error(`❌ No recorded agent runs for '${specQuery}'.`);
    return 1;
  }

  let selected = agents[agents.length - 1];
  if (agentSelector) {
    const numericIndex = /^\d+$/.test(agentSelector) ? parseInt(agentSelector, 10) - 1 : -1;
    if (numericIndex >= 0 && numericIndex < agents.length) {
      selected = agents[numericIndex];
    } else {
      const matched = [...agents]
        .reverse()
        .find((entry) => entry.role === agentSelector || entry.conversation_id === agentSelector);
      if (!matched) {
        console.error(`❌ No agent matching '${agentSelector}' in '${specQuery}'.`);
        return 1;
      }
      selected = matched;
    }
  }

  if (!selected.transcript_path || !fs.existsSync(selected.transcript_path)) {
    console.error(`❌ Transcript file not found for '${selected.role}' (${selected.conversation_id || "unknown"}).`);
    return 1;
  }

  const rawLines = fs.readFileSync(selected.transcript_path, "utf-8").trim().split("\n").filter(Boolean);
  if (fullOutput) {
    console.log(rawLines.join("\n"));
    return 0;
  }

  console.log(`\n📜 Transcript for ${selected.role} (${selected.model}, ${selected.conversation_id || "unknown"}):\n`);
  for (const line of rawLines) {
    try {
      const step = JSON.parse(line);
      if (step.type === "USER_INPUT" && step.content) {
        console.log(`[step ${step.step_index}] USER:\n${String(step.content).slice(0, 400)}\n`);
      } else if (step.type === "PLANNER_RESPONSE") {
        const tools = Array.isArray(step.tool_calls) ? step.tool_calls.map((t: any) => t.name).join(", ") : "";
        if (tools) {
          console.log(`[step ${step.step_index}] TOOL CALLS: ${tools}`);
        }
        if (step.content) {
          console.log(`[step ${step.step_index}] ASSISTANT:\n${String(step.content).slice(0, 800)}\n`);
        }
      }
    } catch {}
  }
  return 0;
}

export function parseArguments(rawArgs: string[] = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: rawArgs,
    options: {
      prompt: { type: "string", short: "p" },
      spec: { type: "string", short: "s" },
      effort: { type: "string", short: "e" },
      cwd: { type: "string", short: "C" },
      "spec-id": { type: "string" },
      project: { type: "string" },
      agent: { type: "string" },
      full: { type: "boolean", default: false },
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
  const isAgentsCommand = subcommand === "agents";
  const isTranscriptCommand = subcommand === "transcript";
  const isStatusCommand = positionals.includes("status") || Boolean(values.status);

  const remainingPositionals = positionals.filter(
    (arg) => arg !== "status" && arg !== "ls" && arg !== "rm" && arg !== "agents" && arg !== "transcript"
  );

  let specId = values.spec || values["spec-id"];
  const inlinePrompt = values.prompt?.trim() || undefined;

  if (inlinePrompt && (specId || remainingPositionals.length > 0)) {
    console.error("❌ Error: Cannot combine -p/--prompt with --spec or positional arguments.");
    process.exit(1);
  }

  if ((isRemoveCommand || isAgentsCommand || isTranscriptCommand) && !specId && remainingPositionals.length === 1) {
    specId = remainingPositionals[0];
  } else if (!isListCommand && !isRemoveCommand && !isAgentsCommand && !isTranscriptCommand && !isStatusCommand && remainingPositionals.length > 0) {
    console.error(
      "❌ Error: Positional arguments are not supported. Use --spec <id> or -p \"<prompt>\" instead."
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

  if (values.help || (!isListCommand && !isRemoveCommand && !isAgentsCommand && !isTranscriptCommand && !inlinePrompt && !specId)) {
    console.log('Usage: build -p "<prompt>" [options]');
    console.log("       build --spec <id> [options]");
    console.log("       build ls [--all] [--json]");
    console.log("       build agents --spec <id> [--json]");
    console.log("       build transcript --spec <id> [--agent <#|role|id>] [--full]");
    console.log("       build rm <spec-id>");
    console.log("       build status [--spec <id>]");
    console.log("\nAgentic coding workflow build orchestrator powered by Antigravity and herdr-core.");
    console.log("\nOptions:");
    console.log("  -p, --prompt <text>   Inline feature prompt to plan and build.");
    console.log("  -s, --spec <id>       Pre-written spec identifier, slug, or file path.");
    console.log("  -e, --effort <1|2|3>  Agent/model tier: 1 (fast single agent, default), 2 (fast + verifier), 3 (capable plan + impl + verifier). Always pauses for review.");
    console.log("  -C, --cwd <dir>       Override working directory for project/repo resolution.");
    console.log("  --project <project>   Override target project name.");
    console.log("  --approve-plan        Approve technical plan gate.");
    console.log("  --approve-review      Approve human review gate and merge/push.");
    console.log("  --approve             Approve current gate (plan or review).");
    console.log("  --feedback <text>     Provide feedback to replan or update implementation.");
    console.log("  --all                 Include completed builds in 'build ls'.");
    console.log("  --json                Output JSON in 'build ls'.");
    console.log("  --dry-run             Inspect external state and planned actions without side effects.");
    console.log("  --status              Display current build lifecycle state.");
    console.log("  -h, --help            Show this help message and exit.");
    process.exit(values.help || rawArgs.length === 0 ? 0 : 1);
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

  const resolvedCwd = values.cwd ? path.resolve(values.cwd) : undefined;
  if (resolvedCwd && !fs.existsSync(resolvedCwd)) {
    console.error(`❌ Error: Working directory does not exist: ${resolvedCwd}`);
    process.exit(1);
  }

  return {
    command: isListCommand
      ? ("ls" as const)
      : isRemoveCommand
        ? ("rm" as const)
        : isAgentsCommand
          ? ("agents" as const)
          : isTranscriptCommand
            ? ("transcript" as const)
            : ("run" as const),
    prompt: inlinePrompt,
    effort,
    cwd: resolvedCwd,
    specId: specId || "",
    project: values.project,
    agentSelector: values.agent,
    fullOutput: Boolean(values.full),
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

  if (parsedArguments.command === "agents") {
    const exitCode = runBuildAgents(parsedArguments.specId, parsedArguments.jsonOutput);
    process.exit(exitCode);
  }

  if (parsedArguments.command === "transcript") {
    const exitCode = runBuildTranscript(
      parsedArguments.specId,
      parsedArguments.agentSelector,
      parsedArguments.fullOutput
    );
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
    parsedArguments.effort,
    parsedArguments.cwd
  );
  const exitCode = await orchestrator.execute();
  process.exit(exitCode);
}

if (import.meta.main) {
  main();
}
