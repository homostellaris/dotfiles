#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import child_process from "node:child_process";

const STATE_DIRECTORY = path.join(os.homedir(), ".local", "share", "agent-builds");
const PORTS_REGISTRY_FILE = path.join(STATE_DIRECTORY, "ports.json");

interface PortAssignment {
  project: string;
  worktreeName: string;
  worktreeDirectory: string;
  branchName: string;
  port: number;
  allocatedAt: string;
}

interface PortsRegistry {
  assignments: Record<string, PortAssignment>;
}

const PROJECT_PORT_POOLS: Record<string, { main: number; start: number; end: number }> = {
  starfocus: { main: 6600, start: 6601, end: 6625 },
  banerry: { main: 6700, start: 6701, end: 6725 },
  default: { main: 6800, start: 6801, end: 6825 },
};

function runCommand(command: string[], options: { cwd?: string; capture?: boolean } = {}): { status: number; stdout: string; stderr: string } {
  const result = child_process.spawnSync(command[0], command.slice(1), {
    cwd: options.cwd,
    encoding: "utf-8",
    stdio: options.capture === false ? "inherit" : ["pipe", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function loadRegistry(): PortsRegistry {
  if (!fs.existsSync(STATE_DIRECTORY)) {
    fs.mkdirSync(STATE_DIRECTORY, { recursive: true });
  }
  if (!fs.existsSync(PORTS_REGISTRY_FILE)) {
    return { assignments: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(PORTS_REGISTRY_FILE, "utf-8"));
  } catch {
    return { assignments: {} };
  }
}

function saveRegistry(registry: PortsRegistry): void {
  if (!fs.existsSync(STATE_DIRECTORY)) {
    fs.mkdirSync(STATE_DIRECTORY, { recursive: true });
  }
  fs.writeFileSync(PORTS_REGISTRY_FILE, JSON.stringify(registry, null, 2), "utf-8");
}

function detectProject(directory: string): string {
  const normalized = path.resolve(directory).toLowerCase();
  if (normalized.includes("starfocus")) return "starfocus";
  if (normalized.includes("banerry")) return "banerry";
  return "default";
}

function getRepositoryRoot(directory: string = process.cwd()): string | null {
  const result = runCommand(["git", "rev-parse", "--show-toplevel"], { cwd: directory });
  if (result.status === 0 && result.stdout.trim()) {
    const gitRoot = result.stdout.trim();
    // If inside a nested worktree, resolve up to main repository
    if (gitRoot.includes(".worktrees")) {
      return path.resolve(gitRoot.split("/.worktrees/")[0]);
    }
    return gitRoot;
  }
  return null;
}

function allocatePort(project: string, worktreeName: string): number {
  const registry = loadRegistry();
  const pool = PROJECT_PORT_POOLS[project] || PROJECT_PORT_POOLS.default;
  const usedPorts = new Set<number>();

  for (const item of Object.values(registry.assignments)) {
    if (item.project === project) {
      usedPorts.add(item.port);
    }
  }

  for (let candidatePort = pool.start; candidatePort <= pool.end; candidatePort++) {
    if (!usedPorts.has(candidatePort)) {
      return candidatePort;
    }
  }

  // Fallback if all pool ports taken
  return pool.end + 1;
}

function addWorktree(branchOrSpec: string, baseCommit: string = "HEAD"): number {
  const repositoryRoot = getRepositoryRoot();
  if (!repositoryRoot) {
    console.error("❌ Error: Must be inside a git repository.");
    return 1;
  }

  const project = detectProject(repositoryRoot);
  const worktreeDirectory = path.join(repositoryRoot, ".worktrees", branchOrSpec);
  const branchName = branchOrSpec;

  console.log(`🌿 Adding worktree '${branchOrSpec}' for ${project}...`);
  fs.mkdirSync(path.dirname(worktreeDirectory), { recursive: true });

  // Clean stale worktree state if needed
  runCommand(["git", "worktree", "prune"], { cwd: repositoryRoot });

  const branchCheck = runCommand(["git", "rev-parse", "--verify", branchName], { cwd: repositoryRoot });
  const branchExists = branchCheck.status === 0;

  const command = branchExists
    ? ["git", "worktree", "add", worktreeDirectory, branchName]
    : ["git", "worktree", "add", "-b", branchName, worktreeDirectory, baseCommit];

  const worktreeResult = runCommand(command, { cwd: repositoryRoot });
  if (worktreeResult.status !== 0) {
    console.error(`❌ Failed to create git worktree: ${worktreeResult.stderr}`);
    return 1;
  }

  // Copy .worktreeinclude files
  for (const environmentFile of [".env", ".env.local"]) {
    const sourcePath = path.join(repositoryRoot, environmentFile);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, path.join(worktreeDirectory, environmentFile));
    }
  }

  // Allocate port
  const allocatedPort = allocatePort(project, branchOrSpec);
  const targetEnvironmentLocal = path.join(worktreeDirectory, ".env.local");

  let existingEnvironmentContent = "";
  if (fs.existsSync(targetEnvironmentLocal)) {
    existingEnvironmentContent = fs.readFileSync(targetEnvironmentLocal, "utf-8");
  }

  // Replace or append PORT
  let updatedEnvironmentContent: string;
  if (/^PORT=.*$/m.test(existingEnvironmentContent)) {
    updatedEnvironmentContent = existingEnvironmentContent.replace(/^PORT=.*$/m, `PORT=${allocatedPort}`);
  } else {
    updatedEnvironmentContent = existingEnvironmentContent
      ? `${existingEnvironmentContent.trim()}\nPORT=${allocatedPort}\n`
      : `PORT=${allocatedPort}\n`;
  }
  fs.writeFileSync(targetEnvironmentLocal, updatedEnvironmentContent, "utf-8");

  // Save to registry
  const registry = loadRegistry();
  registry.assignments[`${project}:${branchOrSpec}`] = {
    project,
    worktreeName: branchOrSpec,
    worktreeDirectory,
    branchName,
    port: allocatedPort,
    allocatedAt: new Date().toISOString(),
  };
  saveRegistry(registry);

  console.log(`✅ Worktree ready at: ${worktreeDirectory}`);
  console.log(`🔌 Assigned Port: ${allocatedPort}`);
  console.log(`💡 Run 'bun run dev' inside worktree to start on port ${allocatedPort}`);
  return 0;
}

function removeWorktree(branchOrSpec: string): number {
  const repositoryRoot = getRepositoryRoot();
  if (!repositoryRoot) {
    console.error("❌ Error: Must be inside a git repository.");
    return 1;
  }

  const project = detectProject(repositoryRoot);
  const worktreeDirectory = path.join(repositoryRoot, ".worktrees", branchOrSpec);

  console.log(`🧹 Removing worktree '${branchOrSpec}'...`);

  if (fs.existsSync(worktreeDirectory)) {
    runCommand(["git", "worktree", "remove", "--force", worktreeDirectory], { cwd: repositoryRoot });
    if (fs.existsSync(worktreeDirectory)) {
      fs.rmSync(worktreeDirectory, { recursive: true, force: true });
    }
  }
  runCommand(["git", "worktree", "prune"], { cwd: repositoryRoot });

  const registry = loadRegistry();
  delete registry.assignments[`${project}:${branchOrSpec}`];
  saveRegistry(registry);

  console.log(`✅ Worktree '${branchOrSpec}' removed and port released.`);
  return 0;
}

function listWorktrees(): number {
  const registry = loadRegistry();
  const assignments = Object.values(registry.assignments);

  if (assignments.length === 0) {
    console.log("No registered worktree port assignments found.");
    return 0;
  }

  console.log("\n📋 Active Worktree Port Registry:\n");
  console.log(
    "PROJECT".padEnd(12) +
    "WORKTREE".padEnd(32) +
    "PORT".padEnd(8) +
    "DIRECTORY"
  );
  console.log("-".repeat(80));

  for (const item of assignments) {
    console.log(
      item.project.padEnd(12) +
      item.worktreeName.padEnd(32) +
      String(item.port).padEnd(8) +
      item.worktreeDirectory
    );
  }
  console.log("");
  return 0;
}

function ensurePort(): number {
  const currentDirectory = process.cwd();
  if (!currentDirectory.includes("/.worktrees/")) {
    return 0; // Not inside a nested worktree
  }

  const parts = currentDirectory.split("/.worktrees/");
  const repositoryRoot = parts[0];
  const worktreeSubpath = parts[1].split("/")[0];
  const project = detectProject(repositoryRoot);

  const environmentLocalPath = path.join(repositoryRoot, ".worktrees", worktreeSubpath, ".env.local");
  let environmentContent = "";
  if (fs.existsSync(environmentLocalPath)) {
    environmentContent = fs.readFileSync(environmentLocalPath, "utf-8");
  }

  if (/^PORT=\d+/m.test(environmentContent)) {
    return 0; // Already has a port
  }

  const allocatedPort = allocatePort(project, worktreeSubpath);
  const updatedContent = environmentContent
    ? `${environmentContent.trim()}\nPORT=${allocatedPort}\n`
    : `PORT=${allocatedPort}\n`;

  fs.writeFileSync(environmentLocalPath, updatedContent, "utf-8");

  const registry = loadRegistry();
  registry.assignments[`${project}:${worktreeSubpath}`] = {
    project,
    worktreeName: worktreeSubpath,
    worktreeDirectory: path.join(repositoryRoot, ".worktrees", worktreeSubpath),
    branchName: worktreeSubpath,
    port: allocatedPort,
    allocatedAt: new Date().toISOString(),
  };
  saveRegistry(registry);

  console.log(`🔌 [worktree] Assigned port ${allocatedPort} to worktree '${worktreeSubpath}'`);
  return 0;
}

function showWorktreeStatus(targetBranch?: string): number {
  const repositoryRoot = getRepositoryRoot();
  if (!repositoryRoot) {
    console.error("❌ Error: Must be inside a git repository.");
    return 1;
  }

  const project = detectProject(repositoryRoot);
  const currentBranchResult = runCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd: repositoryRoot });
  const currentBranch = currentBranchResult.status === 0 ? currentBranchResult.stdout.trim() : null;
  const branch = targetBranch || (currentBranch !== "master" && currentBranch !== "main" ? currentBranch : null);

  if (!branch) {
    console.log("uninitialized");
    return 0;
  }

  const worktreeDirectory = path.join(repositoryRoot, ".worktrees", branch);
  const isInsideWorktreeDirectory = process.cwd().startsWith(path.join(repositoryRoot, ".worktrees"));

  if (!fs.existsSync(worktreeDirectory) && !isInsideWorktreeDirectory) {
    console.log("uninitialized");
    return 0;
  }

  const effectiveDirectory = fs.existsSync(worktreeDirectory) ? worktreeDirectory : process.cwd();
  let assignedPort: string | undefined;

  const environmentLocalPath = path.join(effectiveDirectory, ".env.local");
  if (fs.existsSync(environmentLocalPath)) {
    const environmentContent = fs.readFileSync(environmentLocalPath, "utf-8");
    const portMatch = environmentContent.match(/^PORT=(\d+)/m);
    if (portMatch) {
      assignedPort = portMatch[1];
    }
  }

  if (!assignedPort) {
    const registry = loadRegistry();
    const assignmentKey = `${project}:${branch}`;
    if (registry.assignments[assignmentKey]) {
      assignedPort = String(registry.assignments[assignmentKey].port);
    }
  }

  if (assignedPort) {
    console.log(`initialized (port ${assignedPort})`);
  } else {
    console.log("initialized");
  }
  return 0;
}

const action = process.argv[2];
const argumentOne = process.argv[3];
const argumentTwo = process.argv[4];

switch (action) {
  case "add":
    if (!argumentOne) {
      console.error("Usage: worktree add <branch-or-spec-id> [base-commit]");
      process.exit(1);
    }
    process.exit(addWorktree(argumentOne, argumentTwo || "HEAD"));
    break;

  case "rm":
  case "remove":
    if (!argumentOne) {
      console.error("Usage: worktree remove <branch-or-spec-id>");
      process.exit(1);
    }
    process.exit(removeWorktree(argumentOne));
    break;

  case "status":
    process.exit(showWorktreeStatus(argumentOne));
    break;

  case "list":
  case "ls":
    process.exit(listWorktrees());
    break;

  case "ensure-port":
    process.exit(ensurePort());
    break;

  default:
    console.log("Usage: worktree <add|remove|list|status|ensure-port>");
    console.log("  worktree add <branch> [base-commit]  Create worktree with assigned port");
    console.log("  worktree remove <branch>             Remove worktree and release port");
    console.log("  worktree list                        List registered worktree ports");
    console.log("  worktree status [branch]             Report worktree status (e.g. uninitialized)");
    console.log("  worktree ensure-port                 Ensure current worktree has PORT in .env.local");
    process.exit(0);
}
