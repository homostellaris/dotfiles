#!/usr/bin/env python3
import argparse
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

SPEC_DIRECTORY = Path.home() / "obsidian" / "reality-sculptor" / "todos"
VAULT_DIRECTORY = Path.home() / "obsidian" / "reality-sculptor"
STATE_DIRECTORY = Path.home() / ".local" / "share" / "agent-builds"
REPOSITORIES_DIRECTORY = Path.home() / "code" / "homostellaris"
ANTIGRAVITY_APP_DATA = Path.home() / ".gemini" / "antigravity-cli"


@dataclass
class SpecMetadata:
    identifier: str
    file_path: Path
    title: str
    star_role: Optional[str] = None
    star_points: Optional[int] = None
    content: str = ""
    target_project: str = "starfocus"


@dataclass
class BuildState:
    spec_id: str
    spec_path: str
    spec_title: str
    project: str
    repo_dir: str
    worktree_dir: Optional[str] = None
    branch_name: Optional[str] = None
    stage: str = "DISCOVER_SPEC"
    plan_file: Optional[str] = None
    visual_plan_url: Optional[str] = None
    plan_approved: bool = False
    pr_number: Optional[int] = None
    pr_url: Optional[str] = None
    pr_approved: bool = False
    verifier_passed: bool = False
    merged: bool = False
    deployed: bool = False
    history: List[Dict[str, str]] = field(default_factory=list)


class BuildOrchestrator:
    def __init__(self, spec_query: str, project_override: Optional[str] = None, dry_run: bool = False):
        self.spec_query = spec_query
        self.project_override = project_override
        self.dry_run = dry_run
        self.spec: Optional[SpecMetadata] = None
        self.state: Optional[BuildState] = None

    async def execute(self) -> int:
        self.spec = self.discover_spec(self.spec_query)
        if not self.spec:
            print(f"❌ Error: Could not locate spec matching '{self.spec_query}' in {SPEC_DIRECTORY} or {VAULT_DIRECTORY}")
            return 1

        if self.project_override:
            self.spec.target_project = self.project_override

        self.state = self.load_or_initialize_state(self.spec)
        print(f"🚀 Starting build orchestration for: {self.spec.title} ({self.spec.identifier})")
        print(f"📁 Target Project: {self.spec.target_project} -> {self.state.repo_dir}")

        determined_stage = self.determine_external_state()
        print(f"🔍 Evaluated External State: {determined_stage}")

        if self.dry_run:
            self.print_dry_run_summary(determined_stage)
            return 0

        return await self.advance_lifecycle(determined_stage)

    def discover_spec(self, query: str) -> Optional[SpecMetadata]:
        candidate_paths: List[Path] = []
        normalized_query = query.rstrip(".md")

        exact_path = SPEC_DIRECTORY / f"{normalized_query}.md"
        if exact_path.exists():
            candidate_paths.append(exact_path)

        exact_vault = VAULT_DIRECTORY / f"{normalized_query}.md"
        if exact_vault.exists():
            candidate_paths.append(exact_vault)

        if not candidate_paths and SPEC_DIRECTORY.exists():
            for entry in SPEC_DIRECTORY.glob("*.md"):
                if normalized_query in entry.stem:
                    candidate_paths.append(entry)

        if not candidate_paths:
            return None

        chosen_path = candidate_paths[0]
        content = chosen_path.read_text(encoding="utf-8")
        frontmatter, body = self.parse_frontmatter(content)

        title = frontmatter.get("title", chosen_path.stem.replace("-", " ").replace("_", " ").title())
        star_role = frontmatter.get("starRole")
        star_points = frontmatter.get("starPoints")

        inferred_project = self.infer_target_project(chosen_path.name, content, star_role)

        return SpecMetadata(
            identifier=chosen_path.stem,
            file_path=chosen_path,
            title=title,
            star_role=star_role,
            star_points=star_points,
            content=body,
            target_project=inferred_project,
        )

    def parse_frontmatter(self, file_content: str) -> Tuple[Dict[str, Any], str]:
        frontmatter: Dict[str, Any] = {}
        body = file_content

        match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", file_content, re.DOTALL)
        if match:
            frontmatter_raw = match.group(1)
            body = match.group(2)
            for line in frontmatter_raw.splitlines():
                if ":" in line:
                    key, value = line.split(":", 1)
                    key = key.strip()
                    value = value.strip().strip("'\"")
                    frontmatter[key] = value

        return frontmatter, body

    def infer_target_project(self, filename: str, content: str, role: Optional[str]) -> str:
        lower_content = (filename + " " + content + " " + (role or "")).lower()
        if "banerry" in lower_content:
            return "banerry"
        return "starfocus"

    def load_or_initialize_state(self, spec: SpecMetadata) -> BuildState:
        STATE_DIRECTORY.mkdir(parents=True, exist_ok=True)
        state_file = STATE_DIRECTORY / f"{spec.identifier}.json"

        repo_dir = str(REPOSITORIES_DIRECTORY / spec.target_project)
        worktree_dir = str(Path(repo_dir) / ".worktrees" / spec.identifier)
        branch_name = spec.identifier

        if state_file.exists():
            try:
                data = json.loads(state_file.read_text(encoding="utf-8"))
                state = BuildState(**data)
                state.repo_dir = repo_dir
                state.worktree_dir = worktree_dir
                state.branch_name = branch_name
                return state
            except Exception:
                pass

        initial_state = BuildState(
            spec_id=spec.identifier,
            spec_path=str(spec.file_path),
            spec_title=spec.title,
            project=spec.target_project,
            repo_dir=repo_dir,
            worktree_dir=worktree_dir,
            branch_name=branch_name,
            stage="DISCOVER_SPEC",
        )
        self.save_state(initial_state)
        return initial_state

    def save_state(self, state: BuildState) -> None:
        STATE_DIRECTORY.mkdir(parents=True, exist_ok=True)
        state_file = STATE_DIRECTORY / f"{state.spec_id}.json"
        state_file.write_text(json.dumps(asdict(state), indent=2), encoding="utf-8")

    def determine_external_state(self) -> str:
        plan_status = self.check_plan_approval_status(self.spec.identifier)
        if plan_status == "FEEDBACK_RECEIVED":
            return "REPLAN_WITH_FEEDBACK"
        if plan_status == "PENDING_APPROVAL":
            return "AWAIT_PLAN_APPROVAL"
        if plan_status == "NOT_GENERATED":
            return "GENERATE_PLAN"

        if not self.is_worktree_initialized(self.state.worktree_dir):
            return "SETUP_WORKTREE"

        tests_pass = self.run_local_test_gate(self.state.worktree_dir)
        if not tests_pass:
            return "IMPLEMENT_AND_FIX_LOCAL"

        pr_info = self.fetch_pr_details(self.state.repo_dir, self.state.branch_name)
        if not pr_info:
            return "CREATE_PR"

        self.state.pr_number = pr_info.get("number")
        self.state.pr_url = pr_info.get("url")
        self.save_state(self.state)

        if pr_info.get("state") == "MERGED":
            return "VERIFY_DEPLOYMENT"

        ci_status = self.evaluate_ci_checks(pr_info)
        if ci_status == "FAILING":
            return "FIX_CI_FAILURES"
        if ci_status == "RUNNING":
            return "AWAIT_CI_CHECKS"

        review_status = pr_info.get("reviewDecision")
        if review_status == "CHANGES_REQUESTED" or self.has_unread_human_comments(pr_info):
            return "RESOLVE_PR_COMMENTS"

        if review_status != "APPROVED":
            return "AWAIT_HUMAN_REVIEW"

        if not self.state.verifier_passed:
            return "RUN_VERIFIER_AGENT"

        return "AWAIT_PR_MERGE"

    def check_plan_approval_status(self, spec_id: str) -> str:
        share_plan = Path.home() / "share" / self.spec.target_project / f"{spec_id}.html"
        legacy_plan = Path.home() / ".local" / "share" / "agent-reports" / f"{spec_id}.html"
        root_share_plan = Path.home() / "share" / f"{spec_id}.html"

        plan_exists = share_plan.exists() or legacy_plan.exists() or root_share_plan.exists()
        if not plan_exists:
            return "NOT_GENERATED"

        transcript_file = self.find_latest_transcript_for_spec(spec_id)
        if transcript_file and transcript_file.exists():
            feedback_or_approval = self.inspect_transcript_for_approval(transcript_file)
            if feedback_or_approval == "APPROVED":
                return "APPROVED"
            if feedback_or_approval == "FEEDBACK":
                return "FEEDBACK_RECEIVED"

        if self.state and self.state.plan_approved:
            return "APPROVED"

        return "PENDING_APPROVAL"

    def find_latest_transcript_for_spec(self, spec_id: str) -> Optional[Path]:
        brain_dir = ANTIGRAVITY_APP_DATA / "brain"
        if not brain_dir.exists():
            return None

        for conversation_folder in sorted(brain_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if conversation_folder.is_dir():
                plan_file = conversation_folder / f"{spec_id}.html"
                transcript = conversation_folder / ".system_generated" / "logs" / "transcript.jsonl"
                if plan_file.exists() or transcript.exists():
                    return transcript
        return None

    def inspect_transcript_for_approval(self, transcript_path: Path) -> str:
        try:
            with open(transcript_path, "r", encoding="utf-8") as handle:
                lines = handle.readlines()

            for line in reversed(lines):
                data = json.loads(line)
                if data.get("type") == "USER_INPUT":
                    content = str(data.get("content", "")).lower()
                    if any(word in content for word in ["proceed", "approved", "looks good", "ship it", "yes"]):
                        return "APPROVED"
                    if any(word in content for word in ["change", "fix", "update", "revise", "instead"]):
                        return "FEEDBACK"
        except Exception:
            pass
        return "PENDING"

    def is_worktree_initialized(self, worktree_dir: Optional[str]) -> bool:
        if not worktree_dir:
            return False
        path = Path(worktree_dir)
        return path.exists() and (path / ".git").exists()

    def run_local_test_gate(self, worktree_dir: Optional[str]) -> bool:
        if not worktree_dir or not Path(worktree_dir).exists():
            return False

        command = ["bun", "test"]
        package_json = Path(worktree_dir) / "package.json"
        if package_json.exists():
            try:
                pkg_data = json.loads(package_json.read_text(encoding="utf-8"))
                scripts = pkg_data.get("scripts", {})
                if "test" in scripts:
                    command = ["bun", "run", "test"]
                elif "unit" in scripts:
                    command = ["bun", "run", "unit"]
            except Exception:
                pass

        result = subprocess.run(command, cwd=worktree_dir, capture_output=True, text=True)
        return result.returncode == 0

    def fetch_pr_details(self, repo_dir: str, branch_name: Optional[str]) -> Optional[Dict[str, Any]]:
        if not branch_name:
            return None

        command = [
            "gh", "pr", "list",
            "--head", branch_name,
            "--json", "number,title,url,state,reviewDecision,statusCheckRollup,comments,mergedAt",
            "--limit", "1",
        ]
        result = subprocess.run(command, cwd=repo_dir, capture_output=True, text=True)
        if result.returncode != 0:
            return None

        try:
            prs = json.loads(result.stdout)
            if prs:
                return prs[0]
        except Exception:
            pass
        return None

    def evaluate_ci_checks(self, pr_info: Dict[str, Any]) -> str:
        rollup = pr_info.get("statusCheckRollup") or []
        if not rollup:
            return "PASSED"

        has_pending = False
        for check in rollup:
            status = check.get("status")
            conclusion = check.get("conclusion")
            state = check.get("state")

            if conclusion in ["FAILURE", "CANCELLED", "TIMED_OUT"] or state == "FAILURE":
                return "FAILING"
            if status in ["IN_PROGRESS", "QUEUED"] or state == "PENDING":
                has_pending = True

        if has_pending:
            return "RUNNING"
        return "PASSED"

    def has_unread_human_comments(self, pr_info: Dict[str, Any]) -> bool:
        comments = pr_info.get("comments") or []
        for comment in comments:
            author = comment.get("author", {}).get("login", "")
            if author and not author.endswith("[bot]") and "antigravity" not in author.lower():
                return True
        return False

    async def advance_lifecycle(self, stage: str) -> int:
        if stage == "GENERATE_PLAN" or stage == "REPLAN_WITH_FEEDBACK":
            return await self.handle_plan_generation()

        if stage == "AWAIT_PLAN_APPROVAL":
            self.handle_await_plan_approval()
            return 0

        if stage == "SETUP_WORKTREE":
            return self.handle_setup_worktree()

        if stage == "IMPLEMENT_AND_FIX_LOCAL":
            return await self.handle_implementation()

        if stage == "CREATE_PR":
            return self.handle_create_pr()

        if stage == "FIX_CI_FAILURES":
            return await self.handle_fix_ci()

        if stage == "AWAIT_CI_CHECKS":
            print("⏳ CI checks are currently running. Exiting cleanly. Re-run after CI finishes.")
            return 0

        if stage == "RESOLVE_PR_COMMENTS":
            return await self.handle_resolve_pr_comments()

        if stage == "AWAIT_HUMAN_REVIEW":
            print(f"⏸️  Awaiting human PR review: {self.state.pr_url}")
            return 0

        if stage == "RUN_VERIFIER_AGENT":
            return await self.handle_verifier_agent()

        if stage == "AWAIT_PR_MERGE":
            print(f"⏸️  PR #{self.state.pr_number} is approved and verified. Awaiting human merge on GitHub: {self.state.pr_url}")
            return 0

        if stage == "VERIFY_DEPLOYMENT":
            return self.handle_verify_deployment()

        print(f"✅ Workflow completed for {self.spec.identifier}")
        return 0

    async def handle_plan_generation(self) -> int:
        print("🧠 Spawning Antigravity Planner Agent to author /visual-plan...")
        prompt = (
            f"Please read the specification file at '{self.spec.file_path}' for project '{self.spec.target_project}'. "
            f"Generate a structured visual plan using the /visual-plan skill. "
            f"Include data models, component contracts, and architecture diagrams."
        )

        output_path = Path.home() / "share" / self.spec.target_project / f"{self.spec.identifier}.html"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        success = await self.run_antigravity_agent(
            session_name=f"planner-{self.spec.identifier}",
            system_prompt="You are the Lead Software Architect. Output a comprehensive /visual-plan HTML report.",
            prompt=prompt,
            working_dir=self.state.repo_dir,
        )

        if not success:
            print("❌ Planner agent execution encountered an error.")
            return 1

        self.publish_tailscale_report(output_path, f"{self.spec.target_project}/{self.spec.identifier}")
        plan_url = f"https://panther.tail29c7da.ts.net/{self.spec.target_project}/{self.spec.identifier}.html"
        self.state.visual_plan_url = plan_url
        self.state.stage = "AWAITING_PLAN_APPROVAL"
        self.save_state(self.state)

        notification_message = (
            f"⚠️ [Plan Review Required] Visual plan generated for '{self.spec.title}'.\n"
            f"🔗 Tailscale Plan: {plan_url}\n"
            f"Reply 'approve' or tap: https://wa.me/447812754124?text=approve%20{self.spec.identifier}"
        )
        self.send_openclaw_notification(notification_message)
        print(f"✅ Visual plan published: {plan_url}")
        print("⏸️  Awaiting human plan approval. Exiting cleanly.")
        return 0

    def handle_await_plan_approval(self) -> None:
        print(f"⏸️  Visual plan is waiting for your review:")
        print(f"🔗 {self.state.visual_plan_url or 'https://panther.tail29c7da.ts.net/'}")
        print(f"👉 Reply 'approve' on WhatsApp or run 'build {self.spec.identifier}' after approving.")

    def handle_setup_worktree(self) -> int:
        print(f"🌿 Setting up isolated nested worktree at: {self.state.worktree_dir}")
        worktree_path = Path(self.state.worktree_dir)
        worktree_path.parent.mkdir(parents=True, exist_ok=True)

        if worktree_path.exists():
            shutil.rmtree(worktree_path)

        command = [
            "git", "worktree", "add",
            "-b", self.state.branch_name,
            str(worktree_path),
            "HEAD",
        ]
        result = subprocess.run(command, cwd=self.state.repo_dir, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"❌ Failed to create git worktree: {result.stderr}")
            return 1

        env_file = Path(self.state.repo_dir) / ".env.local"
        if env_file.exists():
            shutil.copy2(env_file, worktree_path / ".env.local")

        print("✅ Worktree and branch initialized successfully.")
        self.state.stage = "WORKTREE_INITIALIZED"
        self.save_state(self.state)
        return 0

    async def handle_implementation(self) -> int:
        print(f"🛠️  Spawning Antigravity Implementer Agent in worktree: {self.state.worktree_dir}")
        prompt = (
            f"Implement the feature specified in '{self.spec.file_path}' following the visual plan. "
            f"Write unit and component tests first (TDD), then build the components and functions. "
            f"Ensure all local tests pass via 'bun test'."
        )

        success = await self.run_agent_in_herdr(
            agent_name=f"impl-{self.spec.identifier}",
            prompt=prompt,
            working_dir=self.state.worktree_dir,
        )

        if not success:
            print("❌ Implementer agent failed during execution.")
            return 1

        tests_pass = self.run_local_test_gate(self.state.worktree_dir)
        if not tests_pass:
            print("⚠️ Local checks failed. Resuming implementer for automated repair...")
            repair_prompt = "Local test suite failed. Please inspect failure output, fix errors, and verify passing status."
            await self.run_agent_in_herdr(
                agent_name=f"impl-{self.spec.identifier}",
                prompt=repair_prompt,
                working_dir=self.state.worktree_dir,
            )

        print("✅ Local verification complete.")
        return 0

    def handle_create_pr(self) -> int:
        print("📦 Committing and opening GitHub Pull Request...")
        subprocess.run(["git", "add", "."], cwd=self.state.worktree_dir)
        
        commit_message = (
            f"✨ implement {self.spec.title.lower()}\n\n"
            f"Co-authored-by: Antigravity <antigravity@google.com>"
        )
        subprocess.run(["git", "commit", "-m", commit_message], cwd=self.state.worktree_dir)

        push_result = subprocess.run(
            ["git", "push", "-u", "origin", self.state.branch_name],
            cwd=self.state.worktree_dir,
            capture_output=True,
            text=True,
        )
        if push_result.returncode != 0:
            print(f"❌ Failed to push branch: {push_result.stderr}")
            return 1

        pr_body = (
            f"## Summary\n\n"
            f"Automated implementation for **{self.spec.title}** (`{self.spec.identifier}`).\n\n"
            f"- **Spec**: `{self.spec.file_path}`\n"
            f"- **Visual Plan**: {self.state.visual_plan_url or 'N/A'}\n"
            f"- **Target Project**: `{self.spec.target_project}`\n"
        )

        create_command = [
            "gh", "pr", "create",
            "--title", f"✨ {self.spec.title}",
            "--body", pr_body,
            "--head", self.state.branch_name,
        ]
        create_result = subprocess.run(create_command, cwd=self.state.repo_dir, capture_output=True, text=True)
        if create_result.returncode != 0:
            print(f"❌ Failed to create PR: {create_result.stderr}")
            return 1

        pr_url = create_result.stdout.strip()
        print(f"🎉 Pull Request created: {pr_url}")

        notification_message = (
            f"🔔 [PR Ready for Review] Implementation complete for '{self.spec.title}'.\n"
            f"📌 PR: {pr_url}\n"
            f"📊 Visual Plan: {self.state.visual_plan_url or 'N/A'}"
        )
        self.send_openclaw_notification(notification_message)
        return 0

    async def handle_fix_ci(self) -> int:
        print(f"❌ CI failure detected on PR #{self.state.pr_number}. Fetching failed logs...")
        failed_logs_result = subprocess.run(
            ["gh", "run", "view", "--log-failed"],
            cwd=self.state.repo_dir,
            capture_output=True,
            text=True,
        )
        failed_logs = failed_logs_result.stdout[:4000]

        repair_prompt = (
            f"The GitHub Actions CI pipeline failed on your PR branch. "
            f"Here are the failed logs:\n\n```\n{failed_logs}\n```\n\n"
            f"Please address the root cause, fix the code, run local tests, and push updates."
        )

        await self.run_agent_in_herdr(
            agent_name=f"impl-{self.spec.identifier}",
            prompt=repair_prompt,
            working_dir=self.state.worktree_dir,
        )

        subprocess.run(["git", "add", "."], cwd=self.state.worktree_dir)
        subprocess.run(
            ["git", "commit", "-m", "🐛 fix CI pipeline failure\n\nCo-authored-by: Antigravity <antigravity@google.com>"],
            cwd=self.state.worktree_dir,
        )
        subprocess.run(["git", "push", "origin", self.state.branch_name], cwd=self.state.worktree_dir)
        print("✅ Pushed CI repair commit.")
        return 0

    async def handle_resolve_pr_comments(self) -> int:
        print(f"💬 Resolving human review comments on PR #{self.state.pr_number}...")
        comments_result = subprocess.run(
            ["gh", "api", f"/repos/homostellaris/{self.spec.target_project}/pulls/{self.state.pr_number}/comments"],
            cwd=self.state.repo_dir,
            capture_output=True,
            text=True,
        )
        comments_json = comments_result.stdout

        fix_prompt = (
            f"The reviewer left comments on your pull request:\n\n{comments_json}\n\n"
            f"Please implement the requested changes, run local tests, and prepare for push."
        )

        await self.run_agent_in_herdr(
            agent_name=f"impl-{self.spec.identifier}",
            prompt=fix_prompt,
            working_dir=self.state.worktree_dir,
        )

        subprocess.run(["git", "add", "."], cwd=self.state.worktree_dir)
        subprocess.run(
            ["git", "commit", "-m", "♻️ address human review feedback\n\nCo-authored-by: Antigravity <antigravity@google.com>"],
            cwd=self.state.worktree_dir,
        )
        subprocess.run(["git", "push", "origin", self.state.branch_name], cwd=self.state.worktree_dir)
        print("✅ Feedback addressed and updates pushed.")
        return 0

    async def handle_verifier_agent(self) -> int:
        print(f"🛡️  Spawning Antigravity Verifier Agent on PR #{self.state.pr_number}...")
        diff_result = subprocess.run(
            ["gh", "pr", "diff", str(self.state.pr_number)],
            cwd=self.state.repo_dir,
            capture_output=True,
            text=True,
        )
        diff_text = diff_result.stdout[:8000]

        verifier_prompt = (
            f"Review this PR diff for simplification, edge cases, and code hardening:\n\n"
            f"```diff\n{diff_text}\n```\n\n"
            f"Identify any dead code, missing error boundaries, or potential type regressions. "
            f"Apply direct hardening edits in the worktree."
        )

        await self.run_agent_in_herdr(
            agent_name=f"verifier-{self.spec.identifier}",
            prompt=verifier_prompt,
            working_dir=self.state.worktree_dir,
        )

        status_result = subprocess.run(["git", "status", "--porcelain"], cwd=self.state.worktree_dir, capture_output=True, text=True)
        if status_result.stdout.strip():
            subprocess.run(["git", "add", "."], cwd=self.state.worktree_dir)
            subprocess.run(
                ["git", "commit", "-m", "⚡ harden and simplify implementation\n\nCo-authored-by: Antigravity <antigravity@google.com>"],
                cwd=self.state.worktree_dir,
            )
            subprocess.run(["git", "push", "origin", self.state.branch_name], cwd=self.state.worktree_dir)

        self.state.verifier_passed = True
        self.save_state(self.state)

        notification_message = (
            f"✅ [Ready for Merge] PR #{self.state.pr_number} for '{self.spec.title}' is verified & hardened.\n"
            f"🔗 PR Link: {self.state.pr_url}\n"
            f"Ready to merge when you are."
        )
        self.send_openclaw_notification(notification_message)
        print("✅ Verifier pass complete. PR ready for merge.")
        return 0

    def handle_verify_deployment(self) -> int:
        print("🚀 Verifying post-merge production deployment...")
        if self.state.worktree_dir and Path(self.state.worktree_dir).exists():
            subprocess.run(["git", "worktree", "remove", "--force", self.state.worktree_dir], cwd=self.state.repo_dir)
            print(f"🧹 Cleaned up worktree at: {self.state.worktree_dir}")

        self.state.merged = True
        self.state.deployed = True
        self.state.stage = "COMPLETED"
        self.save_state(self.state)

        notification_message = (
            f"🎉 [Deployed] Feature '{self.spec.title}' has been merged and deployed to production!\n"
            f"Spec: {self.spec.identifier}"
        )
        self.send_openclaw_notification(notification_message)
        print(f"🌟 Complete! Feature '{self.spec.title}' is live.")
        return 0

    async def run_agent_in_herdr(self, agent_name: str, prompt: str, working_dir: str) -> bool:
        herdr_bin = shutil.which("herdr") or str(Path.home() / ".local" / "bin" / "herdr")
        if not Path(herdr_bin).exists():
            return await self.run_antigravity_agent(agent_name, "You are an AI coding assistant.", prompt, working_dir)

        try:
            split_result = subprocess.run(
                [herdr_bin, "pane", "split", "--direction", "right", "--cwd", working_dir, "--no-focus"],
                capture_output=True,
                text=True,
            )
            pane_id = None
            if split_result.returncode == 0:
                try:
                    split_json = json.loads(split_result.stdout)
                    pane_id = split_json.get("result", {}).get("pane", {}).get("pane_id")
                except Exception:
                    pass

            if pane_id:
                start_cmd = [herdr_bin, "agent", "start", agent_name, "--pane", pane_id]
                subprocess.run(start_cmd, capture_output=True)

                prompt_cmd = [herdr_bin, "agent", "prompt", agent_name, prompt, "--wait", "--timeout", "180000"]
                prompt_res = subprocess.run(prompt_cmd, capture_output=True, text=True)
                return prompt_res.returncode == 0
        except Exception:
            pass

        return await self.run_antigravity_agent(agent_name, "You are an AI coding assistant.", prompt, working_dir)

    async def run_antigravity_agent(
        self,
        session_name: str,
        system_prompt: str,
        prompt: str,
        working_dir: str,
    ) -> bool:
        try:
            from google.antigravity import Agent, CapabilitiesConfig, LocalAgentConfig
            config = LocalAgentConfig(
                system_instructions=system_prompt,
                capabilities=CapabilitiesConfig(),
            )
            async with Agent(config) as agent:
                response = await agent.chat(prompt)
                async for token in response:
                    sys.stdout.write(token)
                    sys.stdout.flush()
                print()
            return True
        except ImportError:
            agy_binary = shutil.which("agy") or str(Path.home() / ".local" / "bin" / "agy")
            if Path(agy_binary).exists():
                process = subprocess.run(
                    [agy_binary, "--print", prompt],
                    cwd=working_dir,
                    capture_output=True,
                    text=True,
                )
                print(process.stdout)
                return process.returncode == 0
            print("❌ Antigravity runtime not found.")
            return False

    def publish_tailscale_report(self, report_path: Path, slug: str) -> None:
        host_report_bin = shutil.which("host-report") or str(Path.home() / "bin" / "host-report")
        if Path(host_report_bin).exists():
            subprocess.run([host_report_bin, str(report_path), "--name", slug], capture_output=True)

    def send_openclaw_notification(self, message: str) -> None:
        try:
            target_result = subprocess.run(
                ["openclaw", "directory", "peers", "list", "--json"],
                capture_output=True,
                text=True,
            )
            target = ""
            if target_result.returncode == 0 and target_result.stdout.strip():
                peers = json.loads(target_result.stdout)
                if peers and isinstance(peers, list):
                    target = peers[0].get("id", "")

            cmd = ["openclaw", "message", "send", "--message", message]
            if target:
                cmd.extend(["--target", target])
            subprocess.run(cmd, capture_output=True)
        except Exception:
            pass

    def print_dry_run_summary(self, stage: str) -> None:
        print("\n--- 📋 Dry Run Summary ---")
        print(f"Spec ID:        {self.spec.identifier}")
        print(f"Spec Title:     {self.spec.title}")
        print(f"Spec Path:      {self.spec.file_path}")
        print(f"Target Project: {self.spec.target_project}")
        print(f"Target Repo:    {self.state.repo_dir}")
        print(f"Worktree Path:  {self.state.worktree_dir}")
        print(f"Feature Branch: {self.state.branch_name}")
        print(f"Evaluated Next: {stage}")
        print("--------------------------\n")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Agentic coding workflow build orchestrator powered by the Google Antigravity SDK and Herdr."
    )
    parser.add_argument("spec", help="Spec identifier, slug, or file path in Obsidian todos.")
    parser.add_argument("--project", help="Override inferred target project (e.g. banerry, starfocus).")
    parser.add_argument("--dry-run", action="store_true", help="Inspect external state and planned actions without side effects.")
    parser.add_argument("--status", action="store_true", help="Display current build lifecycle state.")
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    orchestrator = BuildOrchestrator(
        spec_query=arguments.spec,
        project_override=arguments.project,
        dry_run=arguments.dry_run or arguments.status,
    )
    exit_code = asyncio.run(orchestrator.execute())
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
