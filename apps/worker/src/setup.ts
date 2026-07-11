import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SourceSuggestion } from "@applycue/core";
import { approveSourceSuggestions, runLocalOrSampleBatch } from "@applycue/engine";
import {
  getApplyCueHome,
  getApplyCueProfileConfigPath,
  getApplyCueProfileDir,
  readBaseCvText,
  type ApplyCueConfig
} from "@applycue/profile";

export interface SetupApplyCueOptions {
  autoApproveSources?: boolean;
  applyCueHome?: string;
  baseCvPath?: string;
  freshnessDays?: number;
  generatedSourceExpansion?: boolean;
  includeOlderPosts?: boolean;
  installTools?: boolean;
  profileInputPath?: string;
  profileKey?: string;
  runFirstBatch?: boolean;
  targetRankingQueue?: number;
  workspaceRoot?: string;
}

export interface SetupApplyCueResult {
  approvedSourceCount: number;
  browserToolStatus: "ready" | "installed" | "skipped" | "failed";
  configPath: string;
  dashboardPath?: string;
  jobSpyStatus: "ready" | "installed" | "skipped" | "failed";
  missingProfileFields: string[];
  notes: string[];
  profileDir: string;
  runManifestPath?: string;
  setupStatus: "needs_profile" | "ready";
  summaryPath?: string;
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
    notes.push("Created starter profile config.");
  }

  if (options.profileInputPath) {
    await mergeProfileInput(configPath, options.profileInputPath);
    notes.push(`Imported approved setup fields from ${path.resolve(options.profileInputPath)}.`);
  }
  if (options.baseCvPath) {
    const importedCvPath = await importBaseCv(configPath, profileDir, options.baseCvPath);
    notes.push(`Imported the base CV into ${importedCvPath}.`);
  }

  const missingProfileFields = await findMissingSetupFields(configPath, profileDir);
  if (missingProfileFields.length > 0) {
    notes.push(`Setup still needs: ${missingProfileFields.join(", ")}.`);
    notes.push("Deferred tool installation, source approval, and the first batch until the blocking profile fields are present.");
    return {
      approvedSourceCount: 0,
      browserToolStatus: "skipped",
      configPath,
      jobSpyStatus: "skipped",
      missingProfileFields,
      notes,
      profileDir,
      setupStatus: "needs_profile"
    };
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

  if (options.runFirstBatch === false) {
    notes.push("Validated profile and local tools without running or refreshing the normal preparation batch.");
    return {
      approvedSourceCount: 0,
      browserToolStatus,
      configPath,
      jobSpyStatus,
      missingProfileFields,
      notes,
      profileDir,
      setupStatus: "ready"
    };
  }

  const firstRun = await runLocalOrSampleBatch({
    workspaceRoot,
    requireRecordedJobDecisions: true,
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
  const cleanStarterSourceIds = selectCleanStarterSourceIds(firstRun.sourcePlan.suggestions, jobSpyStatus);
  const sourceIdsToApprove = options.autoApproveSources === true ? safeSourceIds : cleanStarterSourceIds;

  let approvedSourceCount = 0;
  if (options.autoApproveSources !== true) {
    notes.push("Using clean starter source approval only. Bulk source approval waits until the user asks for more results.");
  }
  if (options.autoApproveSources !== false && !isJobSpyReady(jobSpyStatus) && cleanStarterSourceIds.length > 0) {
    notes.push("JobSpy is unavailable or skipped, so setup selected structured no-key starter source(s) instead.");
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
        requireRecordedJobDecisions: true,
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
    missingProfileFields,
    notes,
    profileDir,
    runManifestPath: path.join(finalRun.outputRoot, "outputs", "runs", `${finalRun.manifest.id}.json`),
    setupStatus: "ready",
    summaryPath: path.join(finalRun.outputRoot, "outputs", "runs", "latest-summary.md")
  };
}

async function mergeProfileInput(configPath: string, inputPath: string): Promise<void> {
  const resolvedInputPath = path.resolve(inputPath);
  const input = parseConfigObject(await readFile(resolvedInputPath, "utf8"), `setup input ${resolvedInputPath}`);
  const current = parseConfigObject(await readFile(configPath, "utf8"), `profile config ${configPath}`);
  const merged: ApplyCueConfig = {
    ...current,
    ...input,
    profile: { ...(current.profile ?? {}), ...(input.profile ?? {}) },
    preferences: { ...(current.preferences ?? {}), ...(input.preferences ?? {}) },
    matchSettings: { ...(current.matchSettings ?? {}), ...(input.matchSettings ?? {}) },
    searchSettings: { ...(current.searchSettings ?? {}), ...(input.searchSettings ?? {}) },
    sourceSettings: { ...(current.sourceSettings ?? {}), ...(input.sourceSettings ?? {}) },
    applySettings: { ...(current.applySettings ?? {}), ...(input.applySettings ?? {}) },
    sources: { ...(current.sources ?? {}), ...(input.sources ?? {}) }
  };
  await writeFile(configPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
}

function parseConfigObject(content: string, label: string): ApplyCueConfig {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in ${label}.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must contain one ApplyCue config object.`);
  }
  return value as ApplyCueConfig;
}

async function importBaseCv(configPath: string, profileDir: string, sourcePath: string): Promise<string> {
  const resolvedSourcePath = path.resolve(sourcePath);
  if (!(await fileExists(resolvedSourcePath))) {
    throw new Error(`Base CV file was not found: ${resolvedSourcePath}`);
  }
  const extension = path.extname(resolvedSourcePath).toLowerCase();
  if (![".docx", ".pdf", ".md", ".markdown", ".txt"].includes(extension)) {
    throw new Error("ApplyCue setup accepts DOCX, PDF, Markdown, or plain-text base CVs.");
  }
  await readBaseCvText(resolvedSourcePath);
  const safeName = path.basename(resolvedSourcePath).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const targetPath = path.join(profileDir, "assets", "base-cvs", safeName);
  if (path.resolve(resolvedSourcePath).toLowerCase() !== path.resolve(targetPath).toLowerCase()) {
    await copyFile(resolvedSourcePath, targetPath);
  }
  const config = parseConfigObject(await readFile(configPath, "utf8"), `profile config ${configPath}`);
  config.profile = {
    ...(config.profile ?? {}),
    baseCvPath: path.relative(profileDir, targetPath).replaceAll("\\", "/")
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return targetPath;
}

async function findMissingSetupFields(configPath: string, profileDir: string): Promise<string[]> {
  const config = parseConfigObject(await readFile(configPath, "utf8"), `profile config ${configPath}`);
  const missing: string[] = [];
  const hasName = typeof config.profile?.name === "string" && config.profile.name.trim().length > 0;
  const hasContact = [config.profile?.email, config.profile?.phone]
    .some((value) => typeof value === "string" && value.trim().length > 0);
  if (!hasName || !hasContact) missing.push("user identity/contact");

  const configuredBaseCvPaths = [
    typeof config.profile?.baseCvPath === "string" ? config.profile.baseCvPath.trim() : "",
    ...(config.baseCvs ?? []).map((item) => typeof item.path === "string" ? item.path.trim() : "")
  ].filter(Boolean);
  const hasBaseCv = (await Promise.all(
    configuredBaseCvPaths.map((item) => fileExists(path.resolve(profileDir, item)))
  )).some(Boolean);
  if (!hasBaseCv) missing.push("base CV");

  const hasTargetRoles = Array.isArray(config.preferences?.targetRoleTerms) &&
    config.preferences.targetRoleTerms.some((item) => typeof item === "string" && item.trim().length > 0);
  if (!hasTargetRoles) missing.push("target roles");
  return missing;
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
    provider === "remotive" ||
    provider === "remoteok" ||
    provider === "workingnomads" ||
    provider === "jobicy" ||
    provider === "himalayas";
}

type StarterSourceSuggestion = Pick<
  SourceSuggestion,
  "id" | "kind" | "label" | "provider" | "requiresBrowser" | "requiresLogin"
>;

export function selectCleanStarterSourceIds(
  suggestions: StarterSourceSuggestion[],
  jobSpyStatus: SetupApplyCueResult["jobSpyStatus"]
): string[] {
  const eligible = suggestions.filter((suggestion) =>
    suggestion.kind === "job_board" && !suggestion.requiresBrowser && !suggestion.requiresLogin
  );
  const directFallbacks = ["remotive", "remoteok", "workingnomads", "jobicy", "himalayas"]
    .flatMap((provider) => eligible.filter((suggestion) => suggestion.provider === provider).slice(0, 1));

  if (!isJobSpyReady(jobSpyStatus)) {
    return directFallbacks.slice(0, 2).map((suggestion) => suggestion.id);
  }

  const jobSpySources = eligible.filter((suggestion) => isCleanJobSpyStarter(suggestion)).slice(0, 2);
  return [...jobSpySources, ...directFallbacks.slice(0, 1)].map((suggestion) => suggestion.id);
}

function isJobSpyReady(status: SetupApplyCueResult["jobSpyStatus"]): boolean {
  return status === "ready" || status === "installed";
}

function isCleanJobSpyStarter(suggestion: StarterSourceSuggestion): boolean {
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
  const jobSpyReady = await canImportJobSpy(pythonPath);
  if (jobSpyReady && await canImportDuckDb(pythonPath)) return "ready";
  if (!input.installTools) {
    input.notes.push(jobSpyReady
      ? "JobSpy is ready; skipped optional DuckDB install for JobHive by setup option."
      : "Skipped JobSpy and JobHive tool install by setup option.");
    return jobSpyReady ? "ready" : "skipped";
  }

  if (!jobSpyReady) {
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
  }

  if (!(await canImportDuckDb(pythonPath))) {
    const installDuckDb = await runProcess(pythonPath, ["-m", "pip", "install", "--upgrade", "duckdb"], 300_000);
    if (installDuckDb.code !== 0 || !(await canImportDuckDb(pythonPath))) {
      input.notes.push(`JobSpy is ready, but optional JobHive DuckDB support could not be installed: ${installDuckDb.stderr || installDuckDb.stdout}`);
    } else {
      input.notes.push("Installed DuckDB in ApplyCue's local tool environment for optional JobHive searches.");
    }
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

async function canImportDuckDb(pythonPath: string): Promise<boolean> {
  if (!(await fileExists(pythonPath))) return false;
  const result = await runProcess(pythonPath, ["-c", "import duckdb; print('ok')"], 30_000);
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
