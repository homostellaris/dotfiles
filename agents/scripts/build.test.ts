import { describe, expect, it } from "bun:test";
import path from "node:path";
import os from "node:os";
import { BuildOrchestrator } from "./build.ts";

describe("BuildOrchestrator (build.ts)", () => {
  const orchestrator = new BuildOrchestrator("dummy-query");

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
});
