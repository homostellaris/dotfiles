import { describe, expect, it } from "bun:test";
import path from "node:path";
import os from "node:os";
import { BuildOrchestrator, STAGE_MODELS, parseArguments } from "./build.ts";

describe("BuildOrchestrator (build.ts)", () => {
  const orchestrator = new BuildOrchestrator("dummy-query");

  it("configures stage models with Argon High for planning and implementation, Flash 3.8 for repairs, and Claude Opus for verification", () => {
    expect(STAGE_MODELS.planner).toBe("gemini-4-argon-high");
    expect(STAGE_MODELS.architect).toBe("gemini-4-argon-high");
    expect(STAGE_MODELS.implementer).toBe("gemini-4-argon-high");
    expect(STAGE_MODELS.repair).toBe("gemini-3.8-flash-high");
    expect(STAGE_MODELS.ciRepair).toBe("gemini-3.8-flash-high");
    expect(STAGE_MODELS.commentResolver).toBe("gemini-3.8-flash-high");
    expect(STAGE_MODELS.verifier).toBe("claude-opus-5-5-high");
  });

  it("parses positional argument as an inline prompt", () => {
    const parsed = parseArguments(["Add a dark mode toggle to settings", "--project", "banerry", "--dry-run"]);
    expect(parsed.prompt).toBe("Add a dark mode toggle to settings");
    expect(parsed.specId).toBe("");
    expect(parsed.project).toBe("banerry");
    expect(parsed.dryRun).toBe(true);
  });

  it("parses --spec-id for pre-written specs", () => {
    const parsed = parseArguments(["--spec-id", "canvas-section_y2vtpcom", "--status"]);
    expect(parsed.specId).toBe("canvas-section_y2vtpcom");
    expect(parsed.prompt).toBeUndefined();
    expect(parsed.dryRun).toBe(true);
  });

  it("creates an inline spec with deterministic slug and inferred project", () => {
    const inlineOrchestrator = new BuildOrchestrator(
      "",
      undefined,
      true,
      "Add Banerry OAuth callback handler for Google login"
    );
    const spec = inlineOrchestrator.createInlineSpec(
      "Add Banerry OAuth callback handler for Google login"
    );
    expect(spec.identifier).toBe("add-banerry-oauth-callback-handler-for-google");
    expect(spec.title).toBe("Add Banerry OAuth callback handler for Google login");
    expect(spec.targetProject).toBe("banerry");
    expect(spec.content).toBe("Add Banerry OAuth callback handler for Google login");
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

  it("infers target project accurately", () => {
    expect(orchestrator.inferTargetProject("banerry-login.md", "some spec", undefined)).toBe("banerry");
    expect(orchestrator.inferTargetProject("auth.md", "Need banerry OAuth fix", undefined)).toBe("banerry");
    expect(orchestrator.inferTargetProject("general-task.md", "normal task content", undefined)).toBe("starfocus");
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
    feedbackOrchestrator.runLocalTestGate = () => true;
    feedbackOrchestrator.runRepositoryTestGate = () => ({ success: true, output: "" });
    feedbackOrchestrator.checkHumanReviewStatus = () => "FEEDBACK_RECEIVED";

    expect(feedbackOrchestrator.determineExternalState()).toBe("RESOLVE_FEEDBACK");
  });
});
