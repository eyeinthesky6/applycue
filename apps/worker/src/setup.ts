import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { approveSourceSuggestions, runLocalOrSampleBatch } from "@applycue/engine";
import { getApplyCueHome, getApplyCueProfileConfigPath, getApplyCueProfileDir } from "@applycue/profile";

export interface SetupApplyCueOptions {
  autoApproveSources?: boolean;
  applyCueHome?: string;
  freshnessDays?: number;
  generatedSourceExpansion?: boolean;
  includeOlderPosts?: boolean;
  installTools?: boolean;
  profileKey?: string;
  targetRankingQueue?: number;
  workspaceRoot?: string;
}

export interface SetupApplyCueResult {
  approvedSourceCount: number;
  browserToolStatus: "ready" | "installed" | "skipped" | "failed";
  configPath: string;
  dashboardPath: string;
  jobSpyStatus: "ready" | "installed" | "skipped" | "failed";
  notes: string[];
  profileDir: string;
  runManifestPath: string;
  summaryPath: string;
}

export async function setupApplyCue(options: SetupApplyCueOptions = {}): Promise<SetupApplyCueResult> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const storageOptions = {
    env: process.env,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {})
  };
  const applyCueHome = getApplyCueHome(storageOptions);
  const profileDir = getApplyCueProfileDir(storageOptions);
  const configPath = getApplyCueProfileConfigPath(storageOptions);
  const notes: string[] = [];

  await createUserStore(profileDir);
  if (!(await fileExists(configPath))) {
    await writeStarterConfig(configPath);
    notes.push("Created starter profile config. The agent still needs the user's CV and target roles before a real batch.");
  }

  const jobSpyStatus = await ensureJobSpy({
    applyCueHome,
    installTools: options.installTools ?? true,
    notes
  });
  const browserToolStatus = await ensureBrowserTool({
    installTools: options.installTools ?? true,
    notes,
    workspaceRoot
  });

  const firstRun = await runLocalOrSampleBatch({
    workspaceRoot,
    applyCueHome,
    ...(typeof options.freshnessDays === "number" ? { freshnessDays: options.freshnessDays } : {}),
    ...(typeof options.generatedSourceExpansion === "boolean" ? { generatedSourceExpansion: options.generatedSourceExpansion } : {}),
    ...(typeof options.includeOlderPosts === "boolean" ? { includeOlderPosts: options.includeOlderPosts } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {}),
    ...(typeof options.targetRankingQueue === "number" ? { targetRankingQueue: options.targetRankingQueue } : {}),
    writeFiles: true
  });

  const safeSourceIds = firstRun.sourcePlan.suggestions
    .filter((suggestion) => isSafeNoLoginProvider(suggestion.provider))
    .filter((suggestion) => !suggestion.requiresLogin && !suggestion.requiresBrowser)
    .map((suggestion) => suggestion.id);
  const cleanStarterSourceIds = firstRun.sourcePlan.suggestions
    .filter((suggestion) => isCleanStarterSource(suggestion))
    .slice(0, 3)
    .map((suggestion) => suggestion.id);
  const sourceIdsToApprove = options.autoApproveSources === true ? safeSourceIds : cleanStarterSourceIds;

  let approvedSourceCount = 0;
  if (options.autoApproveSources !== true) {
    notes.push("Using clean starter source approval only. Bulk source approval waits until the user asks for more results.");
  }
  if (options.autoApproveSources === false) {
    notes.push("Skipped source approval by setup option.");
  } else if (sourceIdsToApprove.length > 0 && await hasTargetRoles(configPath)) {
    const approval = await approveSourceSuggestions({
      workspaceRoot,
      applyCueHome,
      ...(options.profileKey ? { profileKey: options.profileKey } : {}),
      suggestionIds: sourceIdsToApprove
    });
    approvedSourceCount = approval.addedCount;
    if (approval.addedCount > 0) {
      notes.push(
        options.autoApproveSources === true
          ? `Approved ${approval.addedCount} safe no-login source(s) for the user's config.`
          : `Approved ${approval.addedCount} clean starter source(s) for the user's config.`
      );
    }
  } else {
    notes.push("Skipped source auto-approval until target roles are present in the user profile.");
  }

  const finalRun = approvedSourceCount > 0
    ? await runLocalOrSampleBatch({
        workspaceRoot,
        applyCueHome,
        ...(typeof options.freshnessDays === "number" ? { freshnessDays: options.freshnessDays } : {}),
        ...(typeof options.generatedSourceExpansion === "boolean" ? { generatedSourceExpansion: options.generatedSourceExpansion } : {}),
        ...(typeof options.includeOlderPosts === "boolean" ? { includeOlderPosts: options.includeOlderPosts } : {}),
        ...(options.profileKey ? { profileKey: options.profileKey } : {}),
        ...(typeof options.targetRankingQueue === "number" ? { targetRankingQueue: options.targetRankingQueue } : {}),
        writeFiles: true
      })
    : firstRun;

  return {
    approvedSourceCount,
    browserToolStatus,
    configPath,
    dashboardPath: path.join(finalRun.outputRoot, "outputs", "dashboard", "latest.html"),
    jobSpyStatus,
    notes,
    profileDir,
    runManifestPath: path.join(finalRun.outputRoot, "outputs", "runs", `${finalRun.manifest.id}.json`),
    summaryPath: path.join(finalRun.outputRoot, "outputs", "runs", "latest-summary.md")
  };
}

async function ensureBrowserTool(input: {
  installTools: boolean;
  notes: string[];
  workspaceRoot: string;
}): Promise<SetupApplyCueResult["browserToolStatus"]> {
  if (await canImportPlaywright(input.workspaceRoot)) return "ready";
  if (!input.installTools) {
    input.notes.push("Skipped browser tool install by setup option.");
    return "skipped";
  }
  const install = await runPackageManager(
    ["exec", "playwright", "install", "chromium"],
    input.workspaceRoot,
    300_000
  );
  if (install.code !== 0) {
    input.notes.push(`Could not install Playwright Chromium for browser UAT: ${install.stderr || install.stdout}`);
    return "failed";
  }
  return (await canImportPlaywright(input.workspaceRoot)) ? "installed" : "failed";
}

async function canImportPlaywright(workspaceRoot: string): Promise<boolean> {
  const result = await runProcess(
    process.execPath,
    ["-e", "import('playwright').then(() => console.log('ok')).catch(() => process.exit(1))"],
    30_000,
    workspaceRoot
  );
  return result.code === 0;
}

function isSafeNoLoginProvider(provider: string | undefined): boolean {
  return provider === "jobspy" ||
    provider === "ats_directory" ||
    provider === "remotive" ||
    provider === "remoteok" ||
    provider === "workingnomads" ||
    provider === "jobicy" ||
    provider === "himalayas" ||
    provider === "themuse";
}

function isCleanStarterSource(suggestion: {
  kind?: string;
  label?: string;
  provider?: string;
  requiresBrowser?: boolean;
  requiresLogin?: boolean;
}): boolean {
  if (suggestion.provider !== "jobspy" || suggestion.kind !== "job_board") return false;
  if (suggestion.requiresBrowser || suggestion.requiresLogin) return false;
  const label = suggestion.label?.toLowerCase() ?? "";
  return label === "jobspy board search" || label.startsWith("jobspy targeted search - ");
}

async function createUserStore(profileDir: string): Promise<void> {
  await Promise.all([
    mkdir(path.join(profileDir, "assets", "base-cvs"), { recursive: true }),
    mkdir(path.join(profileDir, "assets", "images"), { recursive: true }),
    mkdir(path.join(profileDir, "assets", "jobs"), { recursive: true }),
    mkdir(path.join(profileDir, "data", "local"), { recursive: true }),
    mkdir(path.join(profileDir, "outputs", "cvs"), { recursive: true }),
    mkdir(path.join(profileDir, "outputs", "dashboard"), { recursive: true }),
    mkdir(path.join(profileDir, "outputs", "reconciliation"), { recursive: true }),
    mkdir(path.join(profileDir, "outputs", "runs"), { recursive: true })
  ]);
}

async function writeStarterConfig(configPath: string): Promise<void> {
  const starter = {
    profile: {
      id: "local-user",
      applyToPastEmployers: false
    },
    preferences: {
      targetRoleTerms: [],
      preferredLocations: [],
      acceptableWorkModes: ["remote", "hybrid", "onsite"],
      employmentTypes: ["full_time"]
    },
    searchSettings: {
      freshnessDays: 30,
      includeUnknownPostDates: true
    },
    applySettings: {
      mode: "review",
      applicationsPerDay: 5,
      minimumFitToApply: 0.72,
      messagePolicy: "draft_only",
      trackEmailReplies: false,
      allowRecruiterDmDrafts: true
    },
    sources: {
      localJobsPath: "assets/jobs/jobs.jsonl",
      jobBoards: [],
      companyPages: [],
      loggedInBrowserSources: []
    }
  };
  await writeFile(configPath, `${JSON.stringify(starter, null, 2)}\n`, "utf8");
}

async function ensureJobSpy(input: {
  applyCueHome: string;
  installTools: boolean;
  notes: string[];
}): Promise<SetupApplyCueResult["jobSpyStatus"]> {
  const pythonPath = localJobSpyPython(input.applyCueHome);
  if (await canImportJobSpy(pythonPath)) return "ready";
  if (!input.installTools) {
    input.notes.push("Skipped JobSpy tool install by setup option.");
    return "skipped";
  }

  const basePython = await findPythonForVenv();
  if (!basePython) {
    input.notes.push("Could not find Python 3.10-3.12 for JobSpy. Job board search can still run through no-key APIs such as Remotive.");
    return "failed";
  }

  const venvDir = path.dirname(path.dirname(pythonPath));
  await mkdir(path.dirname(venvDir), { recursive: true });
  const venv = await runProcess(basePython, ["-m", "venv", venvDir]);
  if (venv.code !== 0) {
    input.notes.push(`Could not create JobSpy local Python environment: ${venv.stderr || venv.stdout}`);
    return "failed";
  }
  const install = await runProcess(pythonPath, ["-m", "pip", "install", "--upgrade", "pip", "python-jobspy"], 300_000);
  if (install.code !== 0) {
    input.notes.push(`Could not install python-jobspy: ${install.stderr || install.stdout}`);
    return "failed";
  }
  return (await canImportJobSpy(pythonPath)) ? "installed" : "failed";
}

function localJobSpyPython(applyCueHome: string): string {
  return process.platform === "win32"
    ? path.join(applyCueHome, "tools", "jobspy-venv", "Scripts", "python.exe")
    : path.join(applyCueHome, "tools", "jobspy-venv", "bin", "python");
}

async function canImportJobSpy(pythonPath: string): Promise<boolean> {
  if (!(await fileExists(pythonPath))) return false;
  const result = await runProcess(pythonPath, ["-c", "from jobspy import scrape_jobs; print('ok')"], 30_000);
  return result.code === 0;
}

async function findPythonForVenv(): Promise<string | undefined> {
  const candidates: Array<[string, string[]]> = process.platform === "win32"
    ? [
        ["py", ["-3.11", "-c", "import sys; print(sys.executable)"]],
        ["py", ["-3.12", "-c", "import sys; print(sys.executable)"]],
        ["py", ["-3.10", "-c", "import sys; print(sys.executable)"]],
        ["python", ["-c", "import sys; print(sys.executable if sys.version_info < (3, 13) else '')"]]
      ]
    : [
        ["python3.11", ["-c", "import sys; print(sys.executable)"]],
        ["python3.12", ["-c", "import sys; print(sys.executable)"]],
        ["python3.10", ["-c", "import sys; print(sys.executable)"]],
        ["python3", ["-c", "import sys; print(sys.executable if sys.version_info < (3, 13) else '')"]]
      ];
  for (const [command, args] of candidates) {
    const result = await runProcess(command, args, 30_000);
    const executable = result.stdout.trim();
    if (result.code === 0 && executable) return executable;
  }
  const uvPython = path.join(os.homedir(), "AppData", "Roaming", "uv", "python", "cpython-3.11.15-windows-x86_64-none", "python.exe");
  return (await fileExists(uvPython)) ? uvPython : undefined;
}

async function hasTargetRoles(configPath: string): Promise<boolean> {
  try {
    const config = JSON.parse(await readFile(configPath, "utf8")) as { preferences?: { targetRoleTerms?: unknown } };
    return Array.isArray(config.preferences?.targetRoleTerms) && config.preferences.targetRoleTerms.some((item) => typeof item === "string" && item.trim());
  } catch {
    return false;
  }
}

function runPackageManager(
  args: string[],
  cwd: string,
  timeoutMs = 120_000
): Promise<{ code: number; stdout: string; stderr: string }> {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return runProcess(process.execPath, [npmExecPath, ...args], timeoutMs, cwd);
  }
  return runProcess("pnpm", args, timeoutMs, cwd);
}

function runProcess(
  command: string,
  args: string[],
  timeoutMs = 120_000,
  cwd?: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ code: 1, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
