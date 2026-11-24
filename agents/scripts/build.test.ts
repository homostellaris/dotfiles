import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";
import {
  BuildOrchestrator,
  MODEL_TIERS,
  STAGE_MODELS,
  getStageModel,
  parseArguments,
  formatGitmojiCommitMessage,
  formatHerdrTerminalName,
  listBuildsSnapshot,
  validateGitmojiCommitMessage,
} from "./build.ts";

describe("BuildOrchestrator (build.ts)", () => {
  const orchestrator = new BuildOrchestrator("dummy-query");

  it("configures stage models with Argon High for planning and implementation, Hydrogen High for repairs, and Claude Opus for verification", () => {
    expect(STAGE_MODELS.planner).toBe("gemini-4-argon-high");
    expect(STAGE_MODELS.architect).toBe("gemini-4-argon-high");
    expect(STAGE_MODELS.implementer).toBe("gemini-4-argon-high");
    expect(STAGE_MODELS.repair).toBe("gemini-4-hydrogen-high");
    expect(STAGE_MODELS.ciRepair).toBe("gemini-4-hydrogen-high");
    expect(STAGE_MODELS.commentResolver).toBe("gemini-4-hydrogen-high");
    expect(STAGE_MODELS.verifier).toBe("claude-opus-5-5-high");
  });

  it("parses -p argument as an inline prompt", () => {
    const parsed = parseArguments(["-p", "Add a dark mode toggle to settings", "--project", "banerry", "--dry-run"]);
    expect(parsed.prompt).toBe("Add a dark mode toggle to settings");
    expect(parsed.specId).toBe("");
    expect(parsed.project).toBe("banerry");
    expect(parsed.dryRun).toBe(true);
  });

  it("parses build ls command with --all and --json", () => {
    const parsed = parseArguments(["ls", "--all", "--json"]);
    expect(parsed.command).toBe("ls");
    expect(parsed.includeAll).toBe(true);
    expect(parsed.jsonOutput).toBe(true);
  });

  it("parses scoped approval and feedback flags", () => {
    const planApproval = parseArguments(["--spec", "canvas-section_y2vtpcom", "--approve-plan"]);
    expect(planApproval.approveScope).toBe("plan");

    const reviewApproval = parseArguments(["--spec", "canvas-section_y2vtpcom", "--approve-review"]);
    expect(reviewApproval.approveScope).toBe("review");

    const feedbackRun = parseArguments(["--spec", "canvas-section_y2vtpcom", "--feedback", "Make buttons larger"]);
    expect(feedbackRun.feedback).toBe("Make buttons larger");
  });

  it("parses --spec for pre-written specs", () => {
    const parsed = parseArguments(["--spec", "canvas-section_y2vtpcom", "--status"]);
    expect(parsed.specId).toBe("canvas-section_y2vtpcom");
    expect(parsed.prompt).toBeUndefined();
    expect(parsed.dryRun).toBe(true);
  });

  it("creates an inline spec with slug_id format, no spec file, and working-directory project", () => {
    const inlineOrchestrator = new BuildOrchestrator(
      "",
      undefined,
      true,
      "Add OAuth callback handler for Google login"
    );
    const spec = inlineOrchestrator.createInlineSpec(
      "Add OAuth callback handler for Google login"
    );
    expect(spec.identifier).toMatch(/^add-oauth-callback-handler-for-google-login_[a-z0-9]{8}$/);
    expect(spec.filePath).toBe("");
    expect(spec.title).toBe("Add OAuth callback handler for Google login");
    expect(spec.targetProject).toBe("dotfiles");
    expect(spec.prompt).toBe("Add OAuth callback handler for Google login");
    const state = inlineOrchestrator.loadOrInitializeState(spec);
    expect(state.prompt).toBe("Add OAuth callback handler for Google login");
  });

  it("parses YAML frontmatter and body accurately", () => {
    const markdown = `---
title: "Canvas Section Customization"
starRole: 'Developer'
starPoints: 5
id: 12345
---

# Feature Spec
Here is the specification details.
`;
    const { frontmatter, body } = orchestrator.parseFrontmatter(markdown);
    expect(frontmatter.title).toBe("Canvas Section Customization");
    expect(frontmatter.starRole).toBe("Developer");
    expect(frontmatter.starPoints).toBe("5");
    expect(frontmatter.id).toBe("12345");
    expect(body.trim()).toBe("# Feature Spec\nHere is the specification details.");
  });

  it("handles markdown without frontmatter", () => {
    const rawMarkdown = "Just a raw task description without YAML frontmatter.";
    const { frontmatter, body } = orchestrator.parseFrontmatter(rawMarkdown);
    expect(Object.keys(frontmatter).length).toBe(0);
    expect(body).toBe(rawMarkdown);
  });

  it("resolves project and repo root from working directory and --cwd override", () => {
    const resolved = orchestrator.resolveProjectFromWorkingDirectory(process.cwd());
    expect(resolved.project).toBe("dotfiles");
    expect(resolved.repoDir).toBe(path.join(os.homedir(), "code", "homostellaris", "dotfiles"));

    const parsedCwd = parseArguments(["-p", "Add widget", "--cwd", "/tmp"]);
    expect(parsedCwd.cwd).toBe("/tmp");

    const cwdOrchestrator = new BuildOrchestrator("", undefined, true, "Add widget", false, false, undefined, 1, "/tmp");
    const spec = cwdOrchestrator.createInlineSpec("Add widget");
    expect(spec.targetProject).toBe("tmp");
  });

  it("discovers existing spec in obsidian todos", () => {
    const testOrchestrator = new BuildOrchestrator("use-next-dev-loop-skill_9dxlucom");
    const spec = testOrchestrator.discoverSpec("use-next-dev-loop-skill_9dxlucom");
    expect(spec).not.toBeNull();
    expect(spec?.identifier).toBe("use-next-dev-loop-skill_9dxlucom");
    expect(spec?.title.toLowerCase()).toContain("use next dev loop skill");
  });

  it("discovers spec by direct file path", () => {
    const testOrchestrator = new BuildOrchestrator("dummy");
    const samplePath = path.join(
      os.homedir(),
      "Work",
      "Reality Sculptor",
      "todos",
      "use-next-dev-loop-skill_9dxlucom.md"
    );
    const spec = testOrchestrator.discoverSpec(samplePath);
    expect(spec).not.toBeNull();
    expect(spec?.identifier).toBe("use-next-dev-loop-skill_9dxlucom");
  });

  it("evaluates CI rollup checks properly", () => {
    expect(orchestrator.evaluateCiChecks({ statusCheckRollup: [] })).toBe("PASSED");

    expect(
      orchestrator.evaluateCiChecks({
        statusCheckRollup: [
          { status: "COMPLETED", conclusion: "SUCCESS" },
          { status: "COMPLETED", conclusion: "SUCCESS" },
        ],
      })
    ).toBe("PASSED");

    expect(
      orchestrator.evaluateCiChecks({
        statusCheckRollup: [
          { status: "COMPLETED", conclusion: "FAILURE" },
          { status: "COMPLETED", conclusion: "SUCCESS" },
        ],
      })
    ).toBe("FAILING");

    expect(
      orchestrator.evaluateCiChecks({
        statusCheckRollup: [
          { status: "IN_PROGRESS", conclusion: null },
          { status: "COMPLETED", conclusion: "SUCCESS" },
        ],
      })
    ).toBe("RUNNING");
  });

  it("distinguishes human comments from bot and antigravity comments", () => {
    expect(
      orchestrator.hasUnreadHumanComments({
        comments: [
          { author: { login: "github-actions[bot]" } },
          { author: { login: "antigravity-bot" } },
        ],
      })
    ).toBe(false);

    expect(
      orchestrator.hasUnreadHumanComments({
        comments: [
          { author: { login: "github-actions[bot]" } },
          { author: { login: "homostellaris" } },
        ],
      })
    ).toBe(true);
  });

  it("parses --approve flag correctly", () => {
    const parsedArguments = parseArguments(["--spec-id", "canvas-section_y2vtpcom", "--approve"]);
    expect(parsedArguments.approve).toBe(true);
    expect(parsedArguments.specId).toBe("canvas-section_y2vtpcom");
  });

  it("approves human review when approveFlag is set", () => {
    const reviewOrchestrator = new BuildOrchestrator(
      "canvas-section_y2vtpcom",
      undefined,
      false,
      undefined,
      true
    );
    expect(reviewOrchestrator.checkHumanReviewStatus()).toBe("APPROVED");
  });

  it("returns pending for human review when not yet approved", () => {
    const unapprovedOrchestrator = new BuildOrchestrator(
      "canvas-section_y2vtpcom",
      undefined,
      false,
      undefined,
      false
    );
    expect(unapprovedOrchestrator.checkHumanReviewStatus()).toBe("PENDING");
  });

  it("fails repository test gate when worktree directory does not exist", () => {
    const testResult = orchestrator.runRepositoryTestGate("/nonexistent/directory/path");
    expect(testResult.success).toBe(false);
    expect(testResult.output).toContain("does not exist");
  });

  it("returns zero toolbar comments when branch name is undefined", () => {
    const commentsResult = orchestrator.fetchVercelToolbarComments(process.cwd(), undefined);
    expect(commentsResult.count).toBe(0);
    expect(commentsResult.rawOutput).toBe("");
  });

  it("detects feedback when unresolved vercel toolbar comments exist", () => {
    const feedbackOrchestrator = new BuildOrchestrator(
      "canvas-section_y2vtpcom",
      undefined,
      false,
      undefined,
      false
    );
    feedbackOrchestrator.state = {
      spec_id: "canvas-section_y2vtpcom",
      title: "Canvas Section",
      effort: 3,
      repo_dir: process.cwd(),
      stage: "AWAIT_HUMAN_REVIEW",
      branch_name: "canvas-section_y2vtpcom",
    };
    feedbackOrchestrator.fetchVercelToolbarComments = () => ({
      count: 2,
      rawOutput: "2 unresolved comments on branch canvas-section_y2vtpcom",
    });
    expect(feedbackOrchestrator.checkHumanReviewStatus()).toBe("FEEDBACK_RECEIVED");
  });

  it("evaluates external state as RESOLVE_FEEDBACK when human review has unresolved feedback", () => {
    const feedbackOrchestrator = new BuildOrchestrator(
      "canvas-section_y2vtpcom",
      undefined,
      false,
      undefined,
      false
    );
    feedbackOrchestrator.state = {
      spec_id: "canvas-section_y2vtpcom",
      title: "Canvas Section",
      effort: 3,
      repo_dir: process.cwd(),
      stage: "AWAIT_HUMAN_REVIEW",
      branch_name: "canvas-section_y2vtpcom",
      worktree_dir: process.cwd(),
    };
    feedbackOrchestrator.spec = {
      identifier: "canvas-section_y2vtpcom",
      title: "Canvas Section",
      filePath: "/fake/path.md",
      content: "",
      project: "starfocus",
      metadata: {},
    };
    feedbackOrchestrator.checkPlanApprovalStatus = () => "APPROVED";
    feedbackOrchestrator.isWorktreeInitialized = () => true;
    feedbackOrchestrator.hasUncommittedChanges = () => false;
    feedbackOrchestrator.getCommitsAheadCount = () => 1;
    feedbackOrchestrator.runLocalTestGate = () => true;
    feedbackOrchestrator.runRepositoryTestGate = () => ({ success: true, output: "" });
    feedbackOrchestrator.checkHumanReviewStatus = () => "FEEDBACK_RECEIVED";

    expect(feedbackOrchestrator.determineExternalState()).toBe("RESOLVE_FEEDBACK");
  });

  it("predicts port for uninitialized worktree from pool or registry", () => {
    const starfocusOrchestrator = new BuildOrchestrator("canvas-section_y2vtpcom");
    starfocusOrchestrator.spec = {
      identifier: "canvas-section_y2vtpcom",
      title: "Canvas Section",
      filePath: "/fake/path.md",
      content: "",
      project: "starfocus",
      metadata: {},
      targetProject: "starfocus",
    };
    const predictedPort = starfocusOrchestrator.getWorktreePort("/fake/uninitialized/worktree");
    expect(predictedPort).toBeGreaterThanOrEqual(6601);
    expect(predictedPort).toBeLessThanOrEqual(6625);
  });

  it("parses status command with --spec and flags statusOnly", () => {
    const parsed = parseArguments(["status", "--spec", "canvas-section_y2vtpcom"]);
    expect(parsed.specId).toBe("canvas-section_y2vtpcom");
    expect(parsed.statusOnly).toBe(true);
    expect(parsed.dryRun).toBe(true);
  });

  it("prevents duplicate executions with process lock and releases cleanly", () => {
    const lockOrchestrator = new BuildOrchestrator("canvas-section_y2vtpcom");
    lockOrchestrator.spec = {
      identifier: "canvas-section_y2vtpcom",
      title: "Canvas Section",
      filePath: "/fake/path.md",
      content: "",
      project: "starfocus",
      metadata: {},
      targetProject: "starfocus",
    };

    const firstAcquire = lockOrchestrator.acquireLock();
    expect(firstAcquire).toBe(true);
    expect(lockOrchestrator.lockPath).toBeDefined();

    const secondOrchestrator = new BuildOrchestrator("canvas-section_y2vtpcom");
    secondOrchestrator.spec = lockOrchestrator.spec;
    const secondAcquire = secondOrchestrator.acquireLock();
    expect(secondAcquire).toBe(false);

    lockOrchestrator.releaseLock();
    expect(lockOrchestrator.lockPath).toBeUndefined();
  });

  it("formats herdr-core terminal names as <slug>_<id>_<role> within 32 characters", () => {
    const terminalName = formatHerdrTerminalName(
      "procedural-game-friendly-visual-assets_bp2zucom",
      "impl"
    );
    expect(terminalName.length).toBeLessThanOrEqual(32);
    expect(terminalName).toBe("procedural-game-fr_bp2zucom_impl");
    expect(/^[a-z0-9][a-z0-9_-]{0,31}$/.test(terminalName)).toBe(true);

    const noIdName = formatHerdrTerminalName("custom-feature-spec", "plan");
    expect(noIdName).toBe("custom-feature-spec_plan");
  });

  it("scopes --approve to one gate without auto-approving human review", () => {
    const scopedOrchestrator = new BuildOrchestrator(
      "canvas-section_y2vtpcom",
      undefined,
      true,
      undefined,
      "any"
    );
    scopedOrchestrator.spec = {
      identifier: "canvas-section_y2vtpcom",
      title: "Canvas Section",
      filePath: "/fake/path.md",
      content: "",
      targetProject: "starfocus",
    };
    const temporaryPlanPath = path.join(os.homedir(), ".local", "share", "agent-builds", "plans", "canvas-section_y2vtpcom.md");
    const planDir = path.dirname(temporaryPlanPath);
    const existed = fs.existsSync(temporaryPlanPath);
    if (!existed) {
      fs.mkdirSync(planDir, { recursive: true });
      fs.writeFileSync(temporaryPlanPath, "# Plan", "utf-8");
    }
    try {
      expect(scopedOrchestrator.checkPlanApprovalStatus("canvas-section_y2vtpcom")).toBe("APPROVED");
      expect(scopedOrchestrator.checkHumanReviewStatus()).toBe("PENDING");
    } finally {
      if (!existed && fs.existsSync(temporaryPlanPath)) {
        fs.unlinkSync(temporaryPlanPath);
      }
    }
  });

  it("lists outstanding builds read-only via listBuildsSnapshot", () => {
    const snapshot = listBuildsSnapshot(false);
    expect(Array.isArray(snapshot)).toBe(true);
  });

  it("parses --effort flag and routes stages by effort 1, 2, and 3", () => {
    const effortTwoArgs = parseArguments(["-p", "Fix typo in header", "--effort", "2"]);
    expect(effortTwoArgs.effort).toBe(2);

    const effortOneArgs = parseArguments(["-p", "Fix typo in header", "-e", "1"]);
    expect(effortOneArgs.effort).toBe(1);

    const effortTwoOrchestrator = new BuildOrchestrator(
      "",
      "starfocus",
      true,
      "Fix typo in header",
      false,
      false,
      undefined,
      2
    );
    const specTwo = effortTwoOrchestrator.createInlineSpec("Fix typo in header");
    effortTwoOrchestrator.spec = specTwo;
    effortTwoOrchestrator.state = effortTwoOrchestrator.loadOrInitializeState(specTwo);
    effortTwoOrchestrator.isWorktreeInitialized = () => false;

    expect(effortTwoOrchestrator.state.effort).toBe(2);
    expect(effortTwoOrchestrator.determineExternalState()).toBe("SETUP_WORKTREE");

    const effortOneOrchestrator = new BuildOrchestrator(
      "",
      "starfocus",
      true,
      "Fix typo in header",
      false,
      false,
      undefined,
      1
    );
    const specOne = effortOneOrchestrator.createInlineSpec("Fix typo in header");
    effortOneOrchestrator.spec = specOne;
    effortOneOrchestrator.state = effortOneOrchestrator.loadOrInitializeState(specOne);
    effortOneOrchestrator.isWorktreeInitialized = () => true;
    effortOneOrchestrator.getCommitsAheadCount = () => 1;
    effortOneOrchestrator.hasUncommittedChanges = () => false;
    effortOneOrchestrator.runLocalTestGate = () => true;

    expect(effortOneOrchestrator.determineExternalState()).toBe("AWAIT_HUMAN_REVIEW");

    effortOneOrchestrator.state.human_reviewed = true;
    expect(effortOneOrchestrator.determineExternalState()).toBe("MERGE_AND_PUSH");

    const defaultEffortOrchestrator = new BuildOrchestrator("", "starfocus", true, "Quick fix");
    expect(defaultEffortOrchestrator.getActiveEffort()).toBe(1);
  });

  it("resolves stage models via MODEL_TIERS across effort levels 1, 2, and 3", () => {
    expect(getStageModel("planner", 3)).toBe(MODEL_TIERS.capable);
    expect(getStageModel("implementer", 3)).toBe(MODEL_TIERS.capable);
    expect(getStageModel("repair", 3)).toBe(MODEL_TIERS.fast);
    expect(getStageModel("verifier", 3)).toBe(MODEL_TIERS.reviewerCapable);

    expect(getStageModel("implementer", 2)).toBe(MODEL_TIERS.fast);
    expect(getStageModel("repair", 2)).toBe(MODEL_TIERS.fast);
    expect(getStageModel("commentResolver", 2)).toBe(MODEL_TIERS.fast);
    expect(getStageModel("verifier", 2)).toBe(MODEL_TIERS.reviewerFast);

    expect(getStageModel("implementer", 1)).toBe(MODEL_TIERS.fast);
    expect(getStageModel("verifier", 1)).toBe(MODEL_TIERS.fast);
  });

  it("generates https Tailscale dev URL and http local dev URL", () => {
    const developmentUrls = orchestrator.getDevUrls(6601);
    expect(developmentUrls.localUrl).toBe("http://localhost:6601");
    if (developmentUrls.tailscaleUrl !== developmentUrls.localUrl) {
      expect(developmentUrls.tailscaleUrl.startsWith("https://")).toBe(true);
      expect(developmentUrls.tailscaleUrl.endsWith(":6601")).toBe(true);
    }
  });

  it("returns 1 from handleImplementation when tests still fail after repair", async () => {
    const implementationOrchestrator = new BuildOrchestrator("test-spec", "dotfiles", true);
    implementationOrchestrator.spec = {
      identifier: "test-spec",
      filePath: "",
      title: "Test Spec",
      content: "Test Spec",
      targetProject: "dotfiles",
    };
    implementationOrchestrator.state = {
      spec_id: "test-spec",
      spec_path: "",
      spec_title: "Test Spec",
      project: "dotfiles",
      repo_dir: "/tmp/repo",
      worktree_dir: "/tmp/worktree",
      stage: "IMPLEMENT_AND_FIX_LOCAL",
      plan_approved: true,
      pr_approved: false,
      verifier_passed: false,
      merged: false,
      deployed: false,
      history: [],
    };
    const spawnedRoles: string[] = [];
    implementationOrchestrator.runAgentInHerdrCore = async (role) => {
      spawnedRoles.push(role);
      return true;
    };

    implementationOrchestrator.runLocalTestGate = () => spawnedRoles.includes("repair");
    expect(await implementationOrchestrator.handleImplementation()).toBe(0);
    expect(spawnedRoles).toEqual(["impl", "repair"]);

    spawnedRoles.length = 0;
    implementationOrchestrator.runLocalTestGate = () => false;
    expect(await implementationOrchestrator.handleImplementation()).toBe(1);
    expect(spawnedRoles).toEqual(["impl", "repair"]);
  });

  it("times out waitForHerdrCoreTurn when maxWaitMilliseconds is exceeded", () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-wait-timeout-"));
    const fakeHerdrBinary = path.join(temporaryDirectory, "hc");
    fs.writeFileSync(
      fakeHerdrBinary,
      "#!/bin/sh\necho '{\"reason\":\"timeout\",\"status\":\"working\"}'\n",
      { mode: 0o755 }
    );
    try {
      const waitOutcome = orchestrator.waitForHerdrCoreTurn(fakeHerdrBinary, "term-1", 0);
      expect(waitOutcome.completed).toBe(false);
      expect(waitOutcome.status).toBe("timed_out");
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("continues waiting via waitForHerdrCoreTurn when hc send returns nested wait.reason timeout", async () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-send-nested-"));
    const fakeHerdrBinary = path.join(temporaryDirectory, "hc");
    const invocationLog = path.join(temporaryDirectory, "calls.log");
    fs.writeFileSync(
      fakeHerdrBinary,
      `#!/bin/sh
echo "$1" >> "${invocationLog}"
case "$1" in
  get)
    exit 3
    ;;
  run)
    echo '{"id":"term-nested-1"}'
    ;;
  wait)
    echo '{"reason":"done","status":"idle","exit_code":0}'
    ;;
  send)
    echo '{"started":null,"status":null,"turn":0,"wait":{"reason":"timeout","status":null,"exit_code":null}}'
    ;;
  kill|rm)
    exit 0
    ;;
esac
`,
      { mode: 0o755 }
    );

    const testOrchestrator = new BuildOrchestrator(undefined, temporaryDirectory) as any;
    testOrchestrator.findHerdrCoreBinary = () => fakeHerdrBinary;
    testOrchestrator.ensureHerdrCore = () => true;

    try {
      const succeeded = await testOrchestrator.runAgentInHerdrCore("impl", "hello", temporaryDirectory, "gemini-flash");
      expect(succeeded).toBe(true);
      const recordedCalls = fs.readFileSync(invocationLog, "utf-8").trim().split("\n");
      expect(recordedCalls.filter((command) => command === "wait").length).toBe(2);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("does not re-poll Vercel toolbar comments immediately after RESOLVE_FEEDBACK", () => {
    const feedbackOrchestrator = new BuildOrchestrator("canvas-section_y2vtpcom") as any;
    let fetchCalls = 0;
    feedbackOrchestrator.spec = { identifier: "canvas-section_y2vtpcom", title: "Canvas Section" };
    feedbackOrchestrator.state = {
      spec_id: "canvas-section_y2vtpcom",
      stage: "RESOLVE_FEEDBACK",
      branch_name: "canvas-section_y2vtpcom",
      repo_dir: "/tmp/repo",
      worktree_dir: "/tmp/worktree",
    };
    feedbackOrchestrator.fetchVercelToolbarComments = () => {
      fetchCalls += 1;
      return { count: 1, summary: "- unresolved comment" };
    };

    expect(feedbackOrchestrator.checkHumanReviewStatus()).toBe("PENDING");
    expect(fetchCalls).toBe(0);
  });

  it("generates and publishes symboldiff during handleAwaitHumanReview", () => {
    const reviewOrchestrator = new BuildOrchestrator("canvas-section_y2vtpcom") as any;
    let publishedStatus = "";
    let publishedSymboldiff: string | undefined;

    reviewOrchestrator.spec = { identifier: "canvas-section_y2vtpcom", title: "Canvas Section" };
    reviewOrchestrator.state = {
      spec_id: "canvas-section_y2vtpcom",
      stage: "IMPLEMENT_AND_FIX_LOCAL",
      branch_name: "canvas-section_y2vtpcom",
      repo_dir: "/tmp/repo",
      worktree_dir: "/tmp/worktree",
    };
    reviewOrchestrator.getWorktreePort = () => 6602;
    reviewOrchestrator.ensureDevServerRunning = () => {};
    reviewOrchestrator.generateWorktreeSymboldiff = () => "/tmp/canvas-section_y2vtpcom-symboldiff.html";
    reviewOrchestrator.publishTaskDashboard = (status: string, symboldiffPath?: string) => {
      publishedStatus = status;
      publishedSymboldiff = symboldiffPath;
      return "https://omarchy.tail29c7da.ts.net/canvas-section_y2vtpcom/";
    };
    reviewOrchestrator.saveState = () => {};
    reviewOrchestrator.sendOpenclawNotification = () => {};

    reviewOrchestrator.handleAwaitHumanReview();
    expect(publishedStatus).toBe("HUMAN REVIEW");
    expect(publishedSymboldiff).toBe("/tmp/canvas-section_y2vtpcom-symboldiff.html");
  });

  it("ignores already-addressed Vercel toolbar comments with matching hash", () => {
    const reviewOrchestrator = new BuildOrchestrator("canvas-section_y2vtpcom") as any;
    const rawComments = "1 unresolved comment on canvas-section_y2vtpcom\n- fix spacing";
    reviewOrchestrator.spec = { identifier: "canvas-section_y2vtpcom", title: "Canvas Section" };
    reviewOrchestrator.state = {
      spec_id: "canvas-section_y2vtpcom",
      stage: "AWAIT_HUMAN_REVIEW",
      branch_name: "canvas-section_y2vtpcom",
      repo_dir: "/tmp/repo",
      worktree_dir: "/tmp/worktree",
      addressed_toolbar_hash: reviewOrchestrator.hashToolbarComments(rawComments),
    };
    reviewOrchestrator.fetchVercelToolbarComments = () => ({
      count: 1,
      rawOutput: rawComments,
    });

    expect(reviewOrchestrator.checkHumanReviewStatus()).toBe("PENDING");
  });

  it("returns COMPLETED from determineExternalState when deployed even after worktree removal", () => {
    const completedOrchestrator = new BuildOrchestrator("canvas-section_y2vtpcom") as any;
    completedOrchestrator.spec = { identifier: "canvas-section_y2vtpcom", title: "Canvas Section" };
    completedOrchestrator.state = {
      spec_id: "canvas-section_y2vtpcom",
      stage: "COMPLETED",
      deployed: true,
      repo_dir: "/tmp/repo",
      worktree_dir: "/tmp/nonexistent-worktree-dir",
    };

    expect(completedOrchestrator.determineExternalState()).toBe("COMPLETED");
  });

  it("stops dev server and removes leftover worktree directory during cleanupWorktreeResources", () => {
    const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-repo-"));
    const tempWorktree = path.join(tempRepo, ".worktrees", "test-spec");
    fs.mkdirSync(path.join(tempWorktree, ".next"), { recursive: true });

    const cleanupOrchestrator = new BuildOrchestrator("test-spec") as any;
    let stoppedPort = 0;
    cleanupOrchestrator.spec = { identifier: "test-spec", title: "Test Spec" };
    cleanupOrchestrator.state = {
      spec_id: "test-spec",
      port: 6699,
      repo_dir: tempRepo,
      worktree_dir: tempWorktree,
    };
    cleanupOrchestrator.stopDevServer = (port: number) => {
      stoppedPort = port;
    };

    try {
      cleanupOrchestrator.cleanupWorktreeResources(tempRepo, tempWorktree, "test-spec");
      expect(stoppedPort).toBe(6699);
      expect(fs.existsSync(tempWorktree)).toBe(false);
    } finally {
      fs.rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it("consolidates multiple feedback commits into a single clean commit before pushing", async () => {
    const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "squash-merge-"));
    const bareRemote = path.join(tempBase, "origin.git");
    const repoDir = path.join(tempBase, "repo");
    const worktreeDir = path.join(repoDir, ".worktrees", "feature-x");

    try {
      child_process.execFileSync("git", ["init", "--bare", "-b", "master", bareRemote]);
      child_process.execFileSync("git", ["clone", bareRemote, repoDir]);
      child_process.execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
      child_process.execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoDir });
      fs.writeFileSync(path.join(repoDir, "README.md"), "init\n");
      child_process.execFileSync("git", ["add", "."], { cwd: repoDir });
      child_process.execFileSync("git", ["commit", "--no-gpg-sign", "-m", "initial"], { cwd: repoDir });
      child_process.execFileSync("git", ["push", "-u", "origin", "master"], { cwd: repoDir });

      child_process.execFileSync("git", ["worktree", "add", "-b", "feature-x", worktreeDir, "master"], { cwd: repoDir });
      child_process.execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: worktreeDir });
      child_process.execFileSync("git", ["config", "user.name", "Test User"], { cwd: worktreeDir });

      fs.writeFileSync(path.join(worktreeDir, "a.ts"), "export const a = 1;\n");
      child_process.execFileSync("git", ["add", "."], { cwd: worktreeDir });
      child_process.execFileSync("git", ["commit", "--no-gpg-sign", "-m", "✨ initial impl"], { cwd: worktreeDir });

      fs.writeFileSync(path.join(worktreeDir, "a.ts"), "export const a = 2;\n");
      child_process.execFileSync("git", ["add", "."], { cwd: worktreeDir });
      child_process.execFileSync("git", ["commit", "--no-gpg-sign", "-m", "♻️ address human review feedback"], {
        cwd: worktreeDir,
      });

      fs.writeFileSync(path.join(worktreeDir, "b.ts"), "export const b = 3;\n");

      const mergeOrchestrator = new BuildOrchestrator("feature-x") as any;
      mergeOrchestrator.spec = { identifier: "feature-x", title: "Add feature X", targetProject: "default" };
      mergeOrchestrator.state = {
        spec_id: "feature-x",
        repo_dir: repoDir,
        worktree_dir: worktreeDir,
        branch_name: "feature-x",
      };
      mergeOrchestrator.cleanupWorktreeResources = () => {};
      mergeOrchestrator.publishTaskDashboard = () => "https://example.test/feature-x/";
      mergeOrchestrator.saveState = () => {};
      mergeOrchestrator.sendOpenclawNotification = () => {};

      const exitCode = await mergeOrchestrator.handleMergeAndPush();
      expect(exitCode).toBe(0);

      const logOutput = child_process
        .execFileSync("git", ["-C", bareRemote, "log", "master", "--oneline"], { encoding: "utf-8" })
        .trim()
        .split("\n");
      expect(logOutput.length).toBe(2);
      expect(logOutput[0]).toContain("✨ Add feature X");
    } finally {
      fs.rmSync(tempBase, { recursive: true, force: true });
    }
  });

  it("formats and validates Gitmoji commit subjects across commit types", () => {
    expect(formatGitmojiCommitMessage("Fix starship trajectory scroll")).toBe("🐛 Fix starship trajectory scroll");
    expect(formatGitmojiCommitMessage("Refactor build orchestrator")).toBe("♻️ Refactor build orchestrator");
    expect(formatGitmojiCommitMessage("🔥 Remove legacy runner")).toBe("🔥 Remove legacy runner");
    expect(validateGitmojiCommitMessage("🐛 Fix starship trajectory scroll")).toEqual({ valid: true });

    expect(validateGitmojiCommitMessage("fix without emoji").valid).toBe(false);
    expect(validateGitmojiCommitMessage("✨").valid).toBe(false);
    expect(validateGitmojiCommitMessage("").valid).toBe(false);
  });

  it("stays in IMPLEMENT_AND_FIX_LOCAL until implementation_completed is true even with dirty worktree", async () => {
    const implOrchestrator = new BuildOrchestrator("test-dirty-worktree") as any;
    implOrchestrator.spec = { identifier: "test-dirty-worktree", title: "Dirty Worktree" };
    implOrchestrator.state = {
      spec_id: "test-dirty-worktree",
      stage: "WORKTREE_INITIALIZED",
      effort: 1,
      repo_dir: "/tmp/repo",
      worktree_dir: "/tmp/worktree",
      implementation_completed: false,
    };
    implOrchestrator.isWorktreeInitialized = () => true;
    implOrchestrator.getCommitsAheadCount = () => 0;
    implOrchestrator.hasUncommittedChanges = () => true;
    implOrchestrator.runLocalTestGate = () => true;

    expect(implOrchestrator.determineExternalState()).toBe("IMPLEMENT_AND_FIX_LOCAL");

    implOrchestrator.runAgentInHerdrCore = async () => true;
    implOrchestrator.saveState = () => {};
    expect(await implOrchestrator.handleImplementation()).toBe(0);
    expect(implOrchestrator.state.implementation_completed).toBe(true);
    expect(implOrchestrator.determineExternalState()).toBe("AWAIT_HUMAN_REVIEW");
  });
});
