import type { ApplyRouteType, BrowserApplyPlan, JobRecord, OutcomeEvent, RankedJob, UserProfile } from "@applycue/core";
import {
  formatBrowserApplyPreflight,
  preflightBrowserApplyPlanFromSnapshot,
  type BrowserPageSnapshot
} from "@applycue/browser-agent";
import {
  approveApplicationAnswers,
  approveSourceSuggestions,
  applyTuningSignals,
  recordJobDecision,
  recordJobDecisions,
  recordOutcomeEvent,
  recordTuningSignal,
  type ApplicationAnswerInput,
  type ApplyTuningSignalsOptions,
  type ApproveApplicationAnswersOptions,
  type ApproveSourceSuggestionsOptions,
  type RecordOutcomeEventOptions,
  type RecordJobDecisionOptions,
  type RecordJobDecisionInput,
  type RecordJobDecisionsOptions,
  type RecordTuningSignalOptions,
  runLocalOrSampleBatch
} from "@applycue/engine";
import { getApplyCueProfileDir } from "@applycue/profile";
import { rankJobs } from "@applycue/ranker";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runApplyRouteExecution, type ApplyRouteExecutionOptions } from "./apply-route.js";
import { runBrowserApplyUat } from "./browser-uat.js";
import { runLiveBrowserApply, type LiveBrowserApplyOptions } from "./live-apply.js";
import { runLiveBrowserPreflight, type LiveBrowserPreflightOptions } from "./live-preflight.js";
import { runMasterFormData, type MasterFormDataOptions } from "./master-form-data.js";
import { setupApplyCue, type SetupApplyCueOptions } from "./setup.js";
import { runSourceCanary, type SourceCanaryOptions } from "./source-canary.js";
import { formatApplyCueStatus, readApplyCueStatus, type ApplyCueStatusOptions } from "./status.js";
import { runApplyCueUat } from "./uat.js";
import { extractEmailLeads, type ExtractEmailLeadsOptions } from "./email-lead-extractor.js";
import { importEmailLeads, type ImportEmailLeadsOptions } from "./email-leads.js";

export function rankDiscoveredJobs(jobs: JobRecord[], profile: UserProfile): RankedJob[] {
  return rankJobs(jobs, profile);
}

export async function runFirstBuild(args: string[] = process.argv.slice(3)): Promise<void> {
  const result = await runLocalOrSampleBatch({
    ...parseRunBatchArgs(args),
    requireRecordedJobDecisions: true
  });
  const prepared = result.applications.length;
  const cvCount = result.cvVariants.length;
  console.log(`ApplyCue first-build complete: ${prepared} application draft(s), ${cvCount} CV(s).`);
  console.log(`Decision queue: ${path.join(result.outputRoot, "outputs", "runs", "latest-job-decisions.json")}`);
  if (prepared === 0 && result.jobs.length > 0) {
    console.log("No clear or recorded apply candidates were prepared.");
    console.log("Next: review only the ambiguous rows, then run applycue:record-decisions -- --input <reviewed-decisions.json> --prepare.");
  } else if (result.manifest.decisionAuthority === "system_clear") {
    console.log("Preparation authority: clear rule-based shortlist with current hard gates.");
  } else if (result.manifest.decisionAuthority === "hybrid_system_external") {
    console.log("Preparation authority: clear rule-based matches plus recorded ambiguity decisions.");
  } else if (result.manifest.decisionAuthority === "recorded_external") {
    console.log("Preparation authority: recorded external-agent/user decisions with current hard gates.");
  }
  console.log(`Dashboard: ${path.join(result.outputRoot, "outputs", "dashboard", "latest.html")}`);
  console.log(`Summary: ${path.join(result.outputRoot, "outputs", "runs", "latest-summary.md")}`);
  console.log(`Run manifest: ${path.join(result.outputRoot, "outputs", "runs", `${result.manifest.id}.json`)}`);
}

export async function runApproveSources(args: string[] = process.argv.slice(3)): Promise<void> {
  const result = await approveSourceSuggestions(parseApproveSourcesArgs(args));
  const mode = result.dryRun ? "dry run" : "complete";
  console.log(`ApplyCue source approval ${mode}: ${result.addedCount} added, ${result.skippedCount} skipped.`);
  console.log(`Config: ${result.configPath}`);
  console.log(`Generated plan read only: ${result.sourcePlanPath}`);
  for (const update of result.updates) {
    const bucket = update.bucket ? ` -> ${update.bucket}` : "";
    console.log(`- ${update.status.toUpperCase()}: ${update.label}${bucket}. ${update.reason}`);
  }
}

export async function runApproveAnswers(args: string[] = process.argv.slice(3)): Promise<void> {
  const result = await approveApplicationAnswers(await parseApproveAnswersArgs(args));
  const mode = result.dryRun ? "dry run" : "complete";
  console.log(
    `ApplyCue application-answer approval ${mode}: ${result.addedCount} added, ${result.updatedCount} updated, ${result.skippedCount} skipped.`
  );
  console.log(`Config: ${result.configPath}`);
  for (const update of result.updates) {
    console.log(`- ${update.status.toUpperCase()}: ${update.field} (${update.id}). ${update.reason}`);
  }
}

export async function runSetupApplyCue(args: string[] = process.argv.slice(3)): Promise<void> {
  const result = await setupApplyCue(parseSetupArgs(args));
  console.log(result.setupStatus === "ready" ? "ApplyCue setup ready." : "ApplyCue setup needs profile input.");
  console.log(`Profile: ${result.profileDir}`);
  console.log(`Config: ${result.configPath}`);
  console.log(`JobSpy: ${result.jobSpyStatus}`);
  console.log(`Browser tool: ${result.browserToolStatus}`);
  console.log(`Approved safe sources: ${result.approvedSourceCount}`);
  if (result.missingProfileFields.length > 0) {
    console.log(`Missing profile fields: ${result.missingProfileFields.join(", ")}`);
  }
  if (result.dashboardPath) console.log(`Dashboard: ${result.dashboardPath}`);
  if (result.summaryPath) console.log(`Summary: ${result.summaryPath}`);
  if (result.runManifestPath) console.log(`Run manifest: ${result.runManifestPath}`);
  for (const note of result.notes) {
    console.log(`- ${note}`);
  }
}

export async function runUat(args: string[] = process.argv.slice(3)): Promise<void> {
  const report = await runApplyCueUat(parseSetupArgs(args));
  console.log(`ApplyCue UAT ${report.status.toUpperCase()}.`);
  console.log(report.summary);
  console.log(`Dashboard: ${report.paths.dashboard}`);
  console.log(`Summary: ${report.paths.summary}`);
  console.log(`Report: ${report.paths.markdownReport}`);
  for (const check of report.checks) {
    console.log(`- ${check.status.toUpperCase()}: ${check.label} - ${check.detail}`);
  }
}

export async function runSourceCanaryCommand(args: string[] = process.argv.slice(3)): Promise<void> {
  const { json, options } = parseSourceCanaryArgs(args);
  const report = await runSourceCanary(options);
  if (report.status === "fail") process.exitCode = 1;
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`ApplyCue source canary ${report.status.toUpperCase()}.`);
  console.log(report.summary);
  console.log(`Report: ${report.paths.markdownReport}`);
  console.log(`JSON: ${report.paths.jsonReport}`);
  for (const source of report.sources) {
    console.log(`- ${source.status.toUpperCase()}: ${source.label} (${source.provider}) - ${source.reason}`);
  }
}

export async function runBrowserUat(args: string[] = process.argv.slice(3)): Promise<void> {
  const report = await runBrowserApplyUat(parseSetupArgs(args));
  console.log(`ApplyCue browser UAT ${report.status.toUpperCase()}.`);
  console.log(report.summary);
  if (report.status !== "skipped") {
    console.log(`Local form: ${report.paths.form}`);
    console.log(`Safe plan: ${report.paths.plan}`);
    console.log(`Receipt: ${report.paths.receipt}`);
  }
  console.log(`Report: ${report.paths.markdownReport}`);
  for (const check of report.checks) {
    console.log(`- ${check.status.toUpperCase()}: ${check.label} - ${check.detail}`);
  }
}

export async function runBrowserLivePreflight(args: string[] = process.argv.slice(3)): Promise<void> {
  const report = await runLiveBrowserPreflight(parseLivePreflightArgs(args));
  console.log(`ApplyCue live browser preflight ${report.status.toUpperCase()}.`);
  console.log(report.summary);
  console.log(`Snapshot: ${report.paths.snapshot}`);
  console.log(`Preflight: ${report.paths.preflight}`);
  console.log(`Report: ${report.paths.markdownReport}`);
  for (const check of report.checks) {
    console.log(`- ${check.status.toUpperCase()}: ${check.label} - ${check.detail}`);
  }
}

export async function runBrowserLiveApply(args: string[] = process.argv.slice(3)): Promise<void> {
  const report = await runLiveBrowserApply(parseLiveApplyArgs(args));
  console.log(`ApplyCue live browser apply ${report.status.toUpperCase()}.`);
  console.log(report.summary);
  console.log(`Execution plan: ${report.paths.plan}`);
  console.log(`Receipt: ${report.paths.receipt}`);
  console.log(`Report: ${report.paths.markdownReport}`);
  for (const check of report.checks) {
    console.log(`- ${check.status.toUpperCase()}: ${check.label} - ${check.detail}`);
  }
}

export async function runApplyRoute(args: string[] = process.argv.slice(3)): Promise<void> {
  const report = await runApplyRouteExecution(parseApplyRouteArgs(args));
  console.log(`ApplyCue apply route ${report.status.toUpperCase()}.`);
  console.log(report.summary);
  console.log(`Report: ${report.paths.markdownReport}`);
  if (report.paths.emailDraft) console.log(`Email draft: ${report.paths.emailDraft}`);
  if (report.paths.dmDraft) console.log(`DM draft: ${report.paths.dmDraft}`);
  for (const command of report.nextCommands) {
    console.log(`- Next: ${command}`);
  }
  for (const check of report.checks) {
    console.log(`- ${check.status.toUpperCase()}: ${check.label} - ${check.detail}`);
  }
}

export async function runFormData(args: string[] = process.argv.slice(3)): Promise<void> {
  const report = await runMasterFormData(parseMasterFormDataArgs(args));
  console.log(`ApplyCue master form data ${report.status.toUpperCase()}.`);
  console.log(report.summary);
  console.log(`Preview: ${report.paths.markdownPreview}`);
  console.log(`Master data: ${report.paths.canonicalJson}`);
  if (report.status !== "confirmed") console.log(`Confirm command: ${report.confirmationCommand}`);
}

export async function runStatus(args: string[] = process.argv.slice(3)): Promise<void> {
  const { json, options } = parseStatusArgs(args);
  const report = await readApplyCueStatus(options);
  console.log(json ? JSON.stringify(report, null, 2) : formatApplyCueStatus(report));
}

export async function runImportEmailLeads(args: string[] = process.argv.slice(3)): Promise<void> {
  const report = await importEmailLeads(parseImportEmailLeadsArgs(args));
  console.log(`ApplyCue email lead import complete: ${report.importedCount} imported, ${report.skippedCount} skipped.`);
  console.log(`Input jobs: ${report.outputPath}`);
  console.log(`Config: ${report.configPath}`);
  if (report.activatedLocalJobsPath) console.log("Activated local job imports for the profile.");
  for (const skipped of report.skipped.slice(0, 10)) {
    console.log(`- SKIPPED ${skipped.index}: ${skipped.reason}${skipped.subject ? ` (${skipped.subject})` : ""}`);
  }
}

export async function runScanEmailLeads(args: string[] = process.argv.slice(3)): Promise<void> {
  const report = await extractEmailLeads(parseScanEmailLeadsArgs(args));
  console.log(`ApplyCue email lead scan complete: ${report.extractedCount} extracted from ${report.inputMessageCount} message(s).`);
  console.log(`Extracted leads: ${report.outputPath}`);
  console.log(`Config: ${report.configPath}`);
  if (report.importReport) {
    console.log(
      `Imported jobs: ${report.importReport.importedCount} imported, ${report.importReport.skippedCount} skipped.`
    );
    console.log(`Input jobs: ${report.importReport.outputPath}`);
    if (report.importReport.activatedLocalJobsPath) console.log("Activated local job imports for the profile.");
  }
  for (const skipped of report.skipped.slice(0, 10)) {
    console.log(`- SKIPPED: ${skipped.reason}${skipped.subject ? ` (${skipped.subject})` : ""}${skipped.detail ? ` - ${skipped.detail}` : ""}`);
  }
}

export async function runBrowserPreflight(args: string[] = process.argv.slice(3)): Promise<void> {
  const options = parseBrowserPreflightArgs(args);
  const plan = await readJsonFile<BrowserApplyPlan>(options.planPath);
  const snapshot = await readJsonFile<BrowserPageSnapshot>(options.snapshotPath);
  const result = preflightBrowserApplyPlanFromSnapshot(plan, snapshot, {
    ...(options.expectedCompany ? { expectedCompany: options.expectedCompany } : {}),
    ...(options.expectedRole ? { expectedRole: options.expectedRole } : {})
  });
  if (options.outPath) {
    await mkdir(path.dirname(options.outPath), { recursive: true });
    await writeFile(options.outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  console.log(options.json ? JSON.stringify(result, null, 2) : formatBrowserApplyPreflight(result));
  if (options.outPath) console.log(`Preflight report: ${options.outPath}`);
}

export async function runRecordOutcome(args: string[] = process.argv.slice(3)): Promise<void> {
  const result = await recordOutcomeEvent(parseRecordOutcomeArgs(args));
  console.log(`ApplyCue outcome recorded: ${result.event.type} for ${result.event.applicationId}.`);
  console.log(`Outcomes: ${result.outcomesPath}`);
  console.log(`Config: ${result.configPath}`);
}

export async function runRecordDecision(args: string[] = process.argv.slice(3)): Promise<void> {
  const result = await recordJobDecision(parseRecordDecisionArgs(args));
  console.log(`ApplyCue job decision recorded: ${result.decision.decision} for ${result.decision.jobId}.`);
  console.log(`Actor: ${result.decision.actorKind}:${result.decision.actorName}`);
  console.log(`Backend suggestion: ${result.decision.backendDecision}`);
  console.log(`Decisions: ${result.decisionsPath}`);
  console.log(`Evidence queue: ${result.sourceQueuePath}`);
}

export async function runRecordDecisions(args: string[] = process.argv.slice(3)): Promise<void> {
  const command = parseRecordDecisionsArgs(args);
  const payload = parseRecordDecisionsFile(await readJsonFile<unknown>(command.inputPath));
  const result = await recordJobDecisions({
    actorName: payload.actorName,
    ...(payload.actorKind ? { actorKind: payload.actorKind } : {}),
    ...(command.applyCueHome ? { applyCueHome: command.applyCueHome } : {}),
    ...(command.configPath ? { configPath: command.configPath } : {}),
    decisions: payload.decisions,
    ...(command.profileKey ? { profileKey: command.profileKey } : {}),
    workspaceRoot: process.cwd()
  });
  console.log(`ApplyCue decision batch complete: ${result.recordedCount} recorded, ${result.skippedCount} unchanged.`);
  console.log(`Decisions: ${result.decisionsPath}`);
  console.log(`Evidence queue: ${result.sourceQueuePath}`);
  if (!command.prepare) return;

  const prepared = await runLocalOrSampleBatch({
    ...(command.applyCueHome ? { applyCueHome: command.applyCueHome } : {}),
    ...(command.configPath ? { configPath: command.configPath } : {}),
    ...(command.profileKey ? { profileKey: command.profileKey } : {}),
    requireRecordedJobDecisions: true,
    workspaceRoot: process.cwd(),
    writeFiles: true
  });
  console.log(`Preparation complete: ${prepared.applications.length} draft(s), ${prepared.cvVariants.length} CV(s), ${prepared.applyRoutes.length} route(s).`);
  console.log(`Summary: ${path.join(prepared.outputRoot, "outputs", "runs", "latest-summary.md")}`);
}

export async function runRecordTuning(args: string[] = process.argv.slice(3)): Promise<void> {
  const result = await recordTuningSignal(parseRecordTuningArgs(args));
  console.log(`ApplyCue tuning signal recorded: ${result.signal.origin} ${result.signal.action} ${result.signal.target}.`);
  console.log(`Value: ${result.signal.value}`);
  console.log(`Status: ${result.signal.status}`);
  console.log(`Tuning signals: ${result.tuningSignalsPath}`);
  console.log(`Config: ${result.configPath}`);
}

export async function runApplyTuning(args: string[] = process.argv.slice(3)): Promise<void> {
  const result = await applyTuningSignals(parseApplyTuningArgs(args));
  const mode = result.dryRun ? "dry run" : "complete";
  console.log(`ApplyCue tuning apply ${mode}: ${result.appliedCount} applied, ${result.skippedCount} skipped.`);
  console.log(`Config: ${result.configPath}`);
  console.log(`Tuning signals: ${result.tuningSignalsPath}`);
  for (const update of result.updates) {
    const route = update.configPath ? ` -> ${update.configPath}` : "";
    const value = update.value ? ` ${update.value}` : "";
    console.log(`- ${update.status.toUpperCase()}: ${update.signalId}${route}.${value} ${update.reason}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2] ?? "first-build";
  if (command === "first-build") {
    await runFirstBuild();
  } else if (command === "approve-answers" || command === "approve-application-answers") {
    await runApproveAnswers();
  } else if (command === "approve-sources") {
    await runApproveSources();
  } else if (command === "setup" || command === "setup-applycue") {
    await runSetupApplyCue();
  } else if (command === "uat") {
    await runUat();
  } else if (command === "source-canary" || command === "source-canaries") {
    await runSourceCanaryCommand();
  } else if (command === "browser-uat") {
    await runBrowserUat();
  } else if (command === "browser-live-preflight" || command === "live-preflight") {
    await runBrowserLivePreflight();
  } else if (command === "browser-live-apply" || command === "live-apply") {
    await runBrowserLiveApply();
  } else if (command === "apply-route" || command === "execute-route") {
    await runApplyRoute();
  } else if (command === "form-data" || command === "master-form-data") {
    await runFormData();
  } else if (command === "status") {
    await runStatus();
  } else if (command === "scan-email-leads" || command === "extract-email-leads" || command === "email-scan") {
    await runScanEmailLeads();
  } else if (command === "import-email-leads" || command === "email-import") {
    await runImportEmailLeads();
  } else if (command === "browser-preflight") {
    await runBrowserPreflight();
  } else if (command === "record-outcome") {
    await runRecordOutcome();
  } else if (command === "record-decision" || command === "record-job-decision") {
    await runRecordDecision();
  } else if (command === "record-decisions" || command === "record-job-decisions") {
    await runRecordDecisions();
  } else if (command === "record-tuning" || command === "record-tuning-signal") {
    await runRecordTuning();
  } else if (command === "apply-tuning" || command === "apply-tuning-signals") {
    await runApplyTuning();
  } else if (command === "--help" || command === "help") {
    printUsage();
  } else {
    printUsage();
    throw new Error(`Unknown ApplyCue worker command: ${command}`);
  }
}

interface BrowserPreflightCommandOptions {
  expectedCompany?: string;
  expectedRole?: string;
  json: boolean;
  outPath?: string;
  planPath: string;
  snapshotPath: string;
}

function parseBrowserPreflightArgs(args: string[]): BrowserPreflightCommandOptions {
  const options: Partial<BrowserPreflightCommandOptions> = { json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--plan") {
      const value = args[index + 1];
      if (!value) throw new Error("--plan needs a browser apply plan JSON path.");
      options.planPath = value;
      index += 1;
    } else if (arg.startsWith("--plan=")) {
      options.planPath = arg.slice("--plan=".length);
    } else if (arg === "--snapshot") {
      const value = args[index + 1];
      if (!value) throw new Error("--snapshot needs a browser page snapshot JSON path.");
      options.snapshotPath = value;
      index += 1;
    } else if (arg.startsWith("--snapshot=")) {
      options.snapshotPath = arg.slice("--snapshot=".length);
    } else if (arg === "--out") {
      const value = args[index + 1];
      if (!value) throw new Error("--out needs a report path.");
      options.outPath = value;
      index += 1;
    } else if (arg.startsWith("--out=")) {
      options.outPath = arg.slice("--out=".length);
    } else if (arg === "--expected-company") {
      const value = args[index + 1];
      if (!value) throw new Error("--expected-company needs text.");
      options.expectedCompany = value;
      index += 1;
    } else if (arg.startsWith("--expected-company=")) {
      options.expectedCompany = arg.slice("--expected-company=".length);
    } else if (arg === "--expected-role") {
      const value = args[index + 1];
      if (!value) throw new Error("--expected-role needs text.");
      options.expectedRole = value;
      index += 1;
    } else if (arg.startsWith("--expected-role=")) {
      options.expectedRole = arg.slice("--expected-role=".length);
    } else {
      throw new Error(`Unknown browser-preflight option: ${arg}`);
    }
  }
  if (!options.planPath) throw new Error("browser-preflight needs --plan <browser-plan.json>.");
  if (!options.snapshotPath) throw new Error("browser-preflight needs --snapshot <page-snapshot.json>.");
  return options as BrowserPreflightCommandOptions;
}

function parseStatusArgs(args: string[]): { json: boolean; options: ApplyCueStatusOptions } {
  const options: ApplyCueStatusOptions = {};
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--json") {
      json = true;
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown status option: ${arg}`);
    }
  }
  return { json, options };
}

function parseSourceCanaryArgs(args: string[]): { json: boolean; options: SourceCanaryOptions } {
  const options: SourceCanaryOptions = { workspaceRoot: process.cwd() };
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--json") {
      json = true;
    } else if (arg === "--include-disabled") {
      options.includeDisabled = true;
    } else if (arg === "--include-jobspy") {
      options.includeJobSpy = true;
    } else if (arg === "--jobspy-limit") {
      const value = args[index + 1];
      if (!value) throw new Error("--jobspy-limit needs a positive source count.");
      options.jobSpyLimit = parsePositiveInteger(value, "--jobspy-limit");
      options.includeJobSpy = true;
      index += 1;
    } else if (arg.startsWith("--jobspy-limit=")) {
      options.jobSpyLimit = parsePositiveInteger(arg.slice("--jobspy-limit=".length), "--jobspy-limit");
      options.includeJobSpy = true;
    } else if (arg === "--include-ats-directory" || arg === "--include-reverse-ats") {
      options.includeAtsDirectory = true;
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config needs a path.");
      options.configPath = value;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown source-canary option: ${arg}`);
    }
  }
  return { json, options };
}

function parseImportEmailLeadsArgs(args: string[]): ImportEmailLeadsOptions {
  const options: Partial<ImportEmailLeadsOptions> = { workspaceRoot: process.cwd(), activateLocalJobsPath: true };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-activate") {
      options.activateLocalJobsPath = false;
    } else if (arg === "--input" || arg === "--file") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs a JSON/JSONL path from the agent email connector.`);
      options.inputPath = value;
      index += 1;
    } else if (arg.startsWith("--input=")) {
      options.inputPath = arg.slice("--input=".length);
    } else if (arg.startsWith("--file=")) {
      options.inputPath = arg.slice("--file=".length);
    } else if (arg === "--out" || arg === "--output") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs an output JSONL path.`);
      options.outputPath = value;
      index += 1;
    } else if (arg.startsWith("--out=")) {
      options.outputPath = arg.slice("--out=".length);
    } else if (arg.startsWith("--output=")) {
      options.outputPath = arg.slice("--output=".length);
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config needs a path.");
      options.configPath = value;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown import-email-leads option: ${arg}`);
    }
  }
  if (!options.inputPath) throw new Error("import-email-leads needs --input <connector-export.json|jsonl>.");
  return options as ImportEmailLeadsOptions;
}

function parseScanEmailLeadsArgs(args: string[]): ExtractEmailLeadsOptions {
  const options: Partial<ExtractEmailLeadsOptions> = { workspaceRoot: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--import") {
      options.importLeads = true;
    } else if (arg === "--import-dry-run") {
      options.importLeads = true;
      options.importDryRun = true;
    } else if (arg === "--input" || arg === "--file") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs a raw email connector export JSON/JSONL path.`);
      options.inputPath = value;
      index += 1;
    } else if (arg.startsWith("--input=")) {
      options.inputPath = arg.slice("--input=".length);
    } else if (arg.startsWith("--file=")) {
      options.inputPath = arg.slice("--file=".length);
    } else if (arg === "--out" || arg === "--output") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs an extracted leads JSONL path.`);
      options.outputPath = value;
      index += 1;
    } else if (arg.startsWith("--out=")) {
      options.outputPath = arg.slice("--out=".length);
    } else if (arg.startsWith("--output=")) {
      options.outputPath = arg.slice("--output=".length);
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config needs a path.");
      options.configPath = value;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown scan-email-leads option: ${arg}`);
    }
  }
  if (!options.inputPath) throw new Error("scan-email-leads needs --input <raw-email-connector-export.json|jsonl>.");
  return options as ExtractEmailLeadsOptions;
}

function parseLivePreflightArgs(args: string[]): LiveBrowserPreflightOptions {
  const options: LiveBrowserPreflightOptions = { workspaceRoot: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else if (arg === "--plan-id") {
      const value = args[index + 1];
      if (!value) throw new Error("--plan-id needs a browser plan id.");
      options.planId = value;
      index += 1;
    } else if (arg.startsWith("--plan-id=")) {
      options.planId = arg.slice("--plan-id=".length);
    } else if (arg === "--job-id") {
      const value = args[index + 1];
      if (!value) throw new Error("--job-id needs a job id.");
      options.jobId = value;
      index += 1;
    } else if (arg.startsWith("--job-id=")) {
      options.jobId = arg.slice("--job-id=".length);
    } else {
      throw new Error(`Unknown browser-live-preflight option: ${arg}`);
    }
  }
  return options;
}

function parseLiveApplyArgs(args: string[]): LiveBrowserApplyOptions {
  const options: LiveBrowserApplyOptions = { workspaceRoot: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--allow-submit") {
      options.allowSubmit = true;
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else if (arg === "--plan-id") {
      const value = args[index + 1];
      if (!value) throw new Error("--plan-id needs a browser plan id.");
      options.planId = value;
      index += 1;
    } else if (arg.startsWith("--plan-id=")) {
      options.planId = arg.slice("--plan-id=".length);
    } else if (arg === "--job-id") {
      const value = args[index + 1];
      if (!value) throw new Error("--job-id needs a job id.");
      options.jobId = value;
      index += 1;
    } else if (arg.startsWith("--job-id=")) {
      options.jobId = arg.slice("--job-id=".length);
    } else {
      throw new Error(`Unknown browser-live-apply option: ${arg}`);
    }
  }
  return options;
}

function parseApplyRouteArgs(args: string[]): ApplyRouteExecutionOptions {
  const options: ApplyRouteExecutionOptions = { workspaceRoot: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else if (arg === "--route-id") {
      const value = args[index + 1];
      if (!value) throw new Error("--route-id needs an apply route id.");
      options.routeId = value;
      index += 1;
    } else if (arg.startsWith("--route-id=")) {
      options.routeId = arg.slice("--route-id=".length);
    } else if (arg === "--application-id" || arg === "--application") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs an application id.`);
      options.applicationId = value;
      index += 1;
    } else if (arg.startsWith("--application-id=")) {
      options.applicationId = arg.slice("--application-id=".length);
    } else if (arg.startsWith("--application=")) {
      options.applicationId = arg.slice("--application=".length);
    } else if (arg === "--job-id" || arg === "--job") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs a job id.`);
      options.jobId = value;
      index += 1;
    } else if (arg.startsWith("--job-id=")) {
      options.jobId = arg.slice("--job-id=".length);
    } else if (arg.startsWith("--job=")) {
      options.jobId = arg.slice("--job=".length);
    } else if (arg === "--type" || arg === "--route-type") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs an apply route type.`);
      options.routeType = parseApplyRouteType(value);
      index += 1;
    } else if (arg.startsWith("--type=")) {
      options.routeType = parseApplyRouteType(arg.slice("--type=".length));
    } else if (arg.startsWith("--route-type=")) {
      options.routeType = parseApplyRouteType(arg.slice("--route-type=".length));
    } else {
      throw new Error(`Unknown apply-route option: ${arg}`);
    }
  }
  return options;
}

function parseApplyRouteType(value: string): ApplyRouteType {
  const normalized = value.trim();
  if (["api", "browser", "email", "dm", "manual_review"].includes(normalized)) return normalized as ApplyRouteType;
  throw new Error(`Unknown apply route type: ${value}`);
}

function parseMasterFormDataArgs(args: string[]): MasterFormDataOptions {
  const options: MasterFormDataOptions = { workspaceRoot: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--confirm") {
      options.confirm = true;
    } else if (arg === "--more-results" || arg === "--expand-sources") {
      options.generatedSourceExpansion = true;
    } else if (arg === "--include-older-posts" || arg === "--include-older") {
      options.includeOlderPosts = true;
    } else if (arg === "--freshness-days") {
      const value = args[index + 1];
      if (!value) throw new Error("--freshness-days needs a positive day count.");
      options.freshnessDays = parsePositiveInteger(value, "--freshness-days");
      index += 1;
    } else if (arg.startsWith("--freshness-days=")) {
      options.freshnessDays = parsePositiveInteger(arg.slice("--freshness-days=".length), "--freshness-days");
    } else if (arg === "--target-ranking-queue") {
      const value = args[index + 1];
      if (!value) throw new Error("--target-ranking-queue needs a positive job count.");
      options.targetRankingQueue = parsePositiveInteger(value, "--target-ranking-queue");
      index += 1;
    } else if (arg.startsWith("--target-ranking-queue=")) {
      options.targetRankingQueue = parsePositiveInteger(arg.slice("--target-ranking-queue=".length), "--target-ranking-queue");
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown form-data option: ${arg}`);
    }
  }
  return options;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8")) as T;
}

function parseRecordOutcomeArgs(args: string[]): RecordOutcomeEventOptions {
  const options: Partial<RecordOutcomeEventOptions> = { workspaceRoot: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--application" || arg === "--application-id") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs an application id.`);
      options.applicationId = value;
      index += 1;
    } else if (arg.startsWith("--application=")) {
      options.applicationId = arg.slice("--application=".length);
    } else if (arg.startsWith("--application-id=")) {
      options.applicationId = arg.slice("--application-id=".length);
    } else if (arg === "--type") {
      const value = args[index + 1];
      if (!value) throw new Error("--type needs an outcome type.");
      options.type = parseOutcomeType(value);
      index += 1;
    } else if (arg.startsWith("--type=")) {
      options.type = parseOutcomeType(arg.slice("--type=".length));
    } else if (arg === "--note") {
      const value = args[index + 1];
      if (!value) throw new Error("--note needs text.");
      options.note = value;
      index += 1;
    } else if (arg.startsWith("--note=")) {
      options.note = arg.slice("--note=".length);
    } else if (arg === "--occurred-at") {
      const value = args[index + 1];
      if (!value) throw new Error("--occurred-at needs an ISO date/time.");
      options.occurredAt = value;
      index += 1;
    } else if (arg.startsWith("--occurred-at=")) {
      options.occurredAt = arg.slice("--occurred-at=".length);
    } else if (arg === "--id") {
      const value = args[index + 1];
      if (!value) throw new Error("--id needs an event id.");
      options.id = value;
      index += 1;
    } else if (arg.startsWith("--id=")) {
      options.id = arg.slice("--id=".length);
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config needs a path.");
      options.configPath = value;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown record-outcome option: ${arg}`);
    }
  }
  if (!options.applicationId) throw new Error("record-outcome needs --application <id>.");
  if (!options.type) throw new Error("record-outcome needs --type <submitted|confirmation|reply|interview|offer|rejection|withdrawn|user_feedback>.");
  return options as RecordOutcomeEventOptions;
}

function parseOutcomeType(value: string): OutcomeEvent["type"] {
  const normalized = value.trim();
  const allowed: OutcomeEvent["type"][] = [
    "submitted",
    "confirmation",
    "reply",
    "interview",
    "offer",
    "rejection",
    "withdrawn",
    "user_feedback"
  ];
  if (allowed.includes(normalized as OutcomeEvent["type"])) return normalized as OutcomeEvent["type"];
  throw new Error(`Unknown outcome type: ${value}`);
}

function parseRecordDecisionArgs(args: string[]): RecordJobDecisionOptions {
  const options: Partial<RecordJobDecisionOptions> = {
    workspaceRoot: process.cwd(),
    actorKind: "agent",
    evidenceRefs: [],
    reasons: []
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--job" || arg === "--job-id") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs a job id.`);
      options.jobId = value;
      index += 1;
    } else if (arg.startsWith("--job=")) {
      options.jobId = arg.slice("--job=".length);
    } else if (arg.startsWith("--job-id=")) {
      options.jobId = arg.slice("--job-id=".length);
    } else if (arg === "--decision") {
      const value = args[index + 1];
      if (!value) throw new Error("--decision needs apply, review, watch, or skip.");
      options.decision = parseAllowedValue(value, ["apply", "review", "watch", "skip"] as const, "job decision");
      index += 1;
    } else if (arg.startsWith("--decision=")) {
      options.decision = parseAllowedValue(arg.slice("--decision=".length), ["apply", "review", "watch", "skip"] as const, "job decision");
    } else if (arg === "--reason") {
      const value = args[index + 1];
      if (!value) throw new Error("--reason needs text.");
      options.reasons = [...(options.reasons ?? []), value];
      index += 1;
    } else if (arg.startsWith("--reason=")) {
      options.reasons = [...(options.reasons ?? []), arg.slice("--reason=".length)];
    } else if (arg === "--evidence" || arg === "--evidence-ref") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs text.`);
      options.evidenceRefs = [...(options.evidenceRefs ?? []), value];
      index += 1;
    } else if (arg.startsWith("--evidence=")) {
      options.evidenceRefs = [...(options.evidenceRefs ?? []), arg.slice("--evidence=".length)];
    } else if (arg.startsWith("--evidence-ref=")) {
      options.evidenceRefs = [...(options.evidenceRefs ?? []), arg.slice("--evidence-ref=".length)];
    } else if (arg === "--actor") {
      const value = args[index + 1];
      if (!value) throw new Error("--actor needs a name such as codex, claude, or user.");
      options.actorName = value;
      index += 1;
    } else if (arg.startsWith("--actor=")) {
      options.actorName = arg.slice("--actor=".length);
    } else if (arg === "--actor-kind") {
      const value = args[index + 1];
      if (!value) throw new Error("--actor-kind needs agent or user.");
      options.actorKind = parseAllowedValue(value, ["agent", "user"] as const, "job decision actor kind");
      index += 1;
    } else if (arg.startsWith("--actor-kind=")) {
      options.actorKind = parseAllowedValue(arg.slice("--actor-kind=".length), ["agent", "user"] as const, "job decision actor kind");
    } else if (arg === "--decided-at") {
      const value = args[index + 1];
      if (!value) throw new Error("--decided-at needs an ISO date/time.");
      options.decidedAt = value;
      index += 1;
    } else if (arg.startsWith("--decided-at=")) {
      options.decidedAt = arg.slice("--decided-at=".length);
    } else if (arg === "--id") {
      const value = args[index + 1];
      if (!value) throw new Error("--id needs a decision id.");
      options.id = value;
      index += 1;
    } else if (arg.startsWith("--id=")) {
      options.id = arg.slice("--id=".length);
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config needs a path.");
      options.configPath = value;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown record-decision option: ${arg}`);
    }
  }
  if (!options.jobId) throw new Error("record-decision needs --job <id>.");
  if (!options.decision) throw new Error("record-decision needs --decision <apply|review|watch|skip>.");
  if (!options.actorName) throw new Error("record-decision needs --actor <codex|claude|user|name>.");
  if (!options.reasons?.length) throw new Error("record-decision needs at least one --reason <text>.");
  return options as RecordJobDecisionOptions;
}

interface RecordDecisionsCommandOptions {
  applyCueHome?: string;
  configPath?: string;
  inputPath: string;
  prepare: boolean;
  profileKey?: string;
}

function parseRecordDecisionsArgs(args: string[]): RecordDecisionsCommandOptions {
  const options: Partial<RecordDecisionsCommandOptions> = { prepare: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--input") {
      const value = args[index + 1];
      if (!value) throw new Error("--input needs a reviewed decision batch JSON path.");
      options.inputPath = value;
      index += 1;
    } else if (arg.startsWith("--input=")) {
      options.inputPath = arg.slice("--input=".length);
    } else if (arg === "--prepare") {
      options.prepare = true;
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config needs a path.");
      options.configPath = value;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown record-decisions option: ${arg}`);
    }
  }
  if (!options.inputPath) throw new Error("record-decisions needs --input <reviewed-decisions.json>.");
  return options as RecordDecisionsCommandOptions;
}

function parseRecordDecisionsFile(value: unknown): Pick<RecordJobDecisionsOptions, "actorKind" | "actorName" | "decisions"> {
  if (!value || typeof value !== "object") throw new Error("The reviewed decision batch must be a JSON object.");
  const record = value as Record<string, unknown>;
  const actorName = typeof record.actorName === "string" ? record.actorName.trim() : "";
  if (!actorName) throw new Error("The reviewed decision batch needs actorName such as codex, claude, or user.");
  const actorKind = record.actorKind === undefined
    ? "agent"
    : parseAllowedValue(String(record.actorKind), ["agent", "user"] as const, "job decision actor kind");
  if (!Array.isArray(record.decisions) || record.decisions.length === 0) {
    throw new Error("The reviewed decision batch needs a non-empty decisions array.");
  }
  const decisions = record.decisions.map((item, index): RecordJobDecisionInput => {
    if (!item || typeof item !== "object") throw new Error(`Decision ${index + 1} must be an object.`);
    const decision = item as Record<string, unknown>;
    const jobId = typeof decision.jobId === "string" ? decision.jobId.trim() : "";
    if (!jobId) throw new Error(`Decision ${index + 1} needs jobId.`);
    const reasons = Array.isArray(decision.reasons)
      ? decision.reasons.filter((reason): reason is string => typeof reason === "string")
      : [];
    const evidenceRefs = Array.isArray(decision.evidenceRefs)
      ? decision.evidenceRefs.filter((ref): ref is string => typeof ref === "string")
      : [];
    return {
      jobId,
      decision: parseAllowedValue(String(decision.decision ?? ""), ["apply", "review", "watch", "skip"] as const, `decision ${index + 1}`),
      reasons,
      ...(evidenceRefs.length > 0 ? { evidenceRefs } : {}),
      ...(typeof decision.decidedAt === "string" ? { decidedAt: decision.decidedAt } : {}),
      ...(typeof decision.id === "string" ? { id: decision.id } : {})
    };
  });
  return { actorKind, actorName, decisions };
}

function parseRecordTuningArgs(args: string[]): RecordTuningSignalOptions {
  const options: Partial<RecordTuningSignalOptions> = { workspaceRoot: process.cwd(), evidenceRefs: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--origin") {
      const value = args[index + 1];
      if (!value) throw new Error("--origin needs a value.");
      options.origin = parseTuningOrigin(value);
      index += 1;
    } else if (arg.startsWith("--origin=")) {
      options.origin = parseTuningOrigin(arg.slice("--origin=".length));
    } else if (arg === "--target") {
      const value = args[index + 1];
      if (!value) throw new Error("--target needs a value.");
      options.target = parseTuningTarget(value);
      index += 1;
    } else if (arg.startsWith("--target=")) {
      options.target = parseTuningTarget(arg.slice("--target=".length));
    } else if (arg === "--action") {
      const value = args[index + 1];
      if (!value) throw new Error("--action needs a value.");
      options.action = parseTuningAction(value);
      index += 1;
    } else if (arg.startsWith("--action=")) {
      options.action = parseTuningAction(arg.slice("--action=".length));
    } else if (arg === "--value") {
      const value = args[index + 1];
      if (!value) throw new Error("--value needs text.");
      options.value = value;
      index += 1;
    } else if (arg.startsWith("--value=")) {
      options.value = arg.slice("--value=".length);
    } else if (arg === "--reason") {
      const value = args[index + 1];
      if (!value) throw new Error("--reason needs text.");
      options.reason = value;
      index += 1;
    } else if (arg.startsWith("--reason=")) {
      options.reason = arg.slice("--reason=".length);
    } else if (arg === "--status") {
      const value = args[index + 1];
      if (!value) throw new Error("--status needs a value.");
      options.status = parseTuningStatus(value);
      index += 1;
    } else if (arg.startsWith("--status=")) {
      options.status = parseTuningStatus(arg.slice("--status=".length));
    } else if (arg === "--confidence") {
      const value = args[index + 1];
      if (!value) throw new Error("--confidence needs low, medium, or high.");
      options.confidence = parseTuningConfidence(value);
      index += 1;
    } else if (arg.startsWith("--confidence=")) {
      options.confidence = parseTuningConfidence(arg.slice("--confidence=".length));
    } else if (arg === "--application" || arg === "--application-id") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs an application id.`);
      options.applicationId = value;
      index += 1;
    } else if (arg.startsWith("--application=")) {
      options.applicationId = arg.slice("--application=".length);
    } else if (arg.startsWith("--application-id=")) {
      options.applicationId = arg.slice("--application-id=".length);
    } else if (arg === "--job" || arg === "--job-id") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs a job id.`);
      options.jobId = value;
      index += 1;
    } else if (arg.startsWith("--job=")) {
      options.jobId = arg.slice("--job=".length);
    } else if (arg.startsWith("--job-id=")) {
      options.jobId = arg.slice("--job-id=".length);
    } else if (arg === "--source-id") {
      const value = args[index + 1];
      if (!value) throw new Error("--source-id needs a source id.");
      options.sourceId = value;
      index += 1;
    } else if (arg.startsWith("--source-id=")) {
      options.sourceId = arg.slice("--source-id=".length);
    } else if (arg === "--source-name") {
      const value = args[index + 1];
      if (!value) throw new Error("--source-name needs text.");
      options.sourceName = value;
      index += 1;
    } else if (arg.startsWith("--source-name=")) {
      options.sourceName = arg.slice("--source-name=".length);
    } else if (arg === "--evidence" || arg === "--evidence-ref") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs text.`);
      options.evidenceRefs = [...(options.evidenceRefs ?? []), value];
      index += 1;
    } else if (arg.startsWith("--evidence=")) {
      options.evidenceRefs = [...(options.evidenceRefs ?? []), arg.slice("--evidence=".length)];
    } else if (arg.startsWith("--evidence-ref=")) {
      options.evidenceRefs = [...(options.evidenceRefs ?? []), arg.slice("--evidence-ref=".length)];
    } else if (arg === "--approved-by-user") {
      options.approvedByUser = true;
    } else if (arg === "--not-approved-by-user") {
      options.approvedByUser = false;
    } else if (arg === "--created-at") {
      const value = args[index + 1];
      if (!value) throw new Error("--created-at needs an ISO date/time.");
      options.createdAt = value;
      index += 1;
    } else if (arg.startsWith("--created-at=")) {
      options.createdAt = arg.slice("--created-at=".length);
    } else if (arg === "--id") {
      const value = args[index + 1];
      if (!value) throw new Error("--id needs a signal id.");
      options.id = value;
      index += 1;
    } else if (arg.startsWith("--id=")) {
      options.id = arg.slice("--id=".length);
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config needs a path.");
      options.configPath = value;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown record-tuning option: ${arg}`);
    }
  }
  if (!options.origin) throw new Error("record-tuning needs --origin <user_feedback|agent_analysis|outcome_learning|system_diagnostic>.");
  if (!options.target) throw new Error("record-tuning needs --target <role_term|title_variant|industry|location|source|seniority|company|keyword|work_mode|cv_fact|apply_policy>.");
  if (!options.action) throw new Error("record-tuning needs --action <promote|demote|block|watch|ask_user|keep>.");
  if (!options.value) throw new Error("record-tuning needs --value <text>.");
  if (!options.reason) throw new Error("record-tuning needs --reason <text>.");
  return options as RecordTuningSignalOptions;
}

function parseApplyTuningArgs(args: string[]): ApplyTuningSignalsOptions {
  const options: ApplyTuningSignalsOptions = { workspaceRoot: process.cwd() };
  const signalIds: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--") {
      continue;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--all") {
      options.applyAll = true;
    } else if (arg === "--ids" || arg === "--id") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs a comma-separated tuning signal id list.`);
      signalIds.push(...splitIds(value));
      index += 1;
    } else if (arg.startsWith("--ids=")) {
      signalIds.push(...splitIds(arg.slice("--ids=".length)));
    } else if (arg.startsWith("--id=")) {
      signalIds.push(...splitIds(arg.slice("--id=".length)));
    } else if (arg === "--signals" || arg === "--tuning-signals" || arg === "--tuning-signals-path") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs a tuning-signals.jsonl path.`);
      options.tuningSignalsPath = value;
      index += 1;
    } else if (arg.startsWith("--signals=")) {
      options.tuningSignalsPath = arg.slice("--signals=".length);
    } else if (arg.startsWith("--tuning-signals=")) {
      options.tuningSignalsPath = arg.slice("--tuning-signals=".length);
    } else if (arg.startsWith("--tuning-signals-path=")) {
      options.tuningSignalsPath = arg.slice("--tuning-signals-path=".length);
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config needs a path.");
      options.configPath = value;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown apply-tuning option: ${arg}`);
    }
  }
  if (signalIds.length > 0) options.signalIds = [...new Set(signalIds)];
  return options;
}

function parseTuningOrigin(value: string): RecordTuningSignalOptions["origin"] {
  return parseAllowedValue(value, ["user_feedback", "agent_analysis", "outcome_learning", "system_diagnostic"] as const, "tuning origin");
}

function parseTuningTarget(value: string): RecordTuningSignalOptions["target"] {
  return parseAllowedValue(value, [
    "role_term",
    "title_variant",
    "industry",
    "location",
    "source",
    "seniority",
    "company",
    "keyword",
    "work_mode",
    "cv_fact",
    "apply_policy"
  ] as const, "tuning target");
}

function parseTuningAction(value: string): RecordTuningSignalOptions["action"] {
  return parseAllowedValue(value, ["promote", "demote", "block", "watch", "ask_user", "keep"] as const, "tuning action");
}

function parseTuningStatus(value: string): NonNullable<RecordTuningSignalOptions["status"]> {
  return parseAllowedValue(value, ["proposed", "approved", "rejected", "applied", "archived"] as const, "tuning status");
}

function parseTuningConfidence(value: string): NonNullable<RecordTuningSignalOptions["confidence"]> {
  return parseAllowedValue(value, ["low", "medium", "high"] as const, "tuning confidence");
}

function parseAllowedValue<TValue extends string>(value: string, allowed: readonly TValue[], label: string): TValue {
  const normalized = value.trim();
  if (allowed.includes(normalized as TValue)) return normalized as TValue;
  throw new Error(`Unknown ${label}: ${value}`);
}

async function parseApproveAnswersArgs(args: string[]): Promise<ApproveApplicationAnswersOptions> {
  const options: Partial<ApproveApplicationAnswersOptions> = { workspaceRoot: process.cwd(), answers: [] };
  const answer: Partial<ApplicationAnswerInput> & { aliases: string[] } = { aliases: [] };
  const answerSets: Array<{ key: string; value: string }> = [];
  let answersFile: string | undefined;
  let useLatestLiveTemplate = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--replace") {
      options.replaceExisting = true;
    } else if (arg === "--needs-approval") {
      answer.needsApproval = true;
    } else if (arg === "--from-file" || arg === "--answers-file") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs a JSON answer file path.`);
      answersFile = value;
      index += 1;
    } else if (arg === "--from-live" || arg === "--from-latest-template") {
      useLatestLiveTemplate = true;
    } else if (arg.startsWith("--from-file=")) {
      answersFile = arg.slice("--from-file=".length);
    } else if (arg.startsWith("--answers-file=")) {
      answersFile = arg.slice("--answers-file=".length);
    } else if (arg === "--set" || arg === "--answer") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs field=value.`);
      answerSets.push(parseAnswerSet(value));
      index += 1;
    } else if (arg.startsWith("--set=")) {
      answerSets.push(parseAnswerSet(arg.slice("--set=".length)));
    } else if (arg.startsWith("--answer=")) {
      answerSets.push(parseAnswerSet(arg.slice("--answer=".length)));
    } else if (arg === "--field") {
      const value = args[index + 1];
      if (!value) throw new Error("--field needs a form field or question.");
      answer.field = value;
      index += 1;
    } else if (arg.startsWith("--field=")) {
      answer.field = arg.slice("--field=".length);
    } else if (arg === "--value") {
      const value = args[index + 1];
      if (!value) throw new Error("--value needs the approved answer text.");
      answer.value = value;
      index += 1;
    } else if (arg.startsWith("--value=")) {
      answer.value = arg.slice("--value=".length);
    } else if (arg === "--alias") {
      const value = args[index + 1];
      if (!value) throw new Error("--alias needs a form label or alternate question.");
      answer.aliases.push(value);
      index += 1;
    } else if (arg.startsWith("--alias=")) {
      answer.aliases.push(arg.slice("--alias=".length));
    } else if (arg === "--source-ref") {
      const value = args[index + 1];
      if (!value) throw new Error("--source-ref needs text.");
      answer.sourceRef = value;
      index += 1;
    } else if (arg.startsWith("--source-ref=")) {
      answer.sourceRef = arg.slice("--source-ref=".length);
    } else if (arg === "--id") {
      const value = args[index + 1];
      if (!value) throw new Error("--id needs an answer id.");
      answer.id = value;
      index += 1;
    } else if (arg.startsWith("--id=")) {
      answer.id = arg.slice("--id=".length);
    } else if (arg === "--approved-at") {
      const value = args[index + 1];
      if (!value) throw new Error("--approved-at needs an ISO date/time.");
      options.approvedAt = value;
      index += 1;
    } else if (arg.startsWith("--approved-at=")) {
      options.approvedAt = arg.slice("--approved-at=".length);
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config needs a path.");
      options.configPath = value;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown approve-answers option: ${arg}`);
    }
  }
  if (useLatestLiveTemplate) {
    answersFile = path.join(resolveApplyCueProfileDir(options), "outputs", "live-preflight", "live-answer-approval-template.json");
  }
  if (answersFile) {
    options.answers = await readApplicationAnswersFromFile(answersFile, answerSets);
    return options as ApproveApplicationAnswersOptions;
  }
  if (answerSets.length > 0) {
    throw new Error("--set needs --from-live or --from-file <live-answer-approval-template.json>.");
  }
  if (!answer.field) throw new Error("approve-answers needs --field <field-or-question>.");
  if (!answer.value) throw new Error("approve-answers needs --value <approved-answer>.");
  const approvedAnswer: ApplicationAnswerInput = {
    field: answer.field,
    value: answer.value
  };
  if (answer.id) approvedAnswer.id = answer.id;
  if (answer.aliases.length > 0) approvedAnswer.aliases = answer.aliases;
  if (answer.needsApproval === true) approvedAnswer.needsApproval = true;
  if (answer.sourceRef) approvedAnswer.sourceRef = answer.sourceRef;
  options.answers = [approvedAnswer];
  return options as ApproveApplicationAnswersOptions;
}

function resolveApplyCueProfileDir(options: Pick<ApproveApplicationAnswersOptions, "applyCueHome" | "profileKey">): string {
  return getApplyCueProfileDir({
    env: process.env,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {})
  });
}

function parseAnswerSet(value: string): { key: string; value: string } {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex === -1) {
    throw new Error("--set needs field=value.");
  }
  const key = value.slice(0, separatorIndex).trim();
  const answerValue = value.slice(separatorIndex + 1).trim();
  if (!key || !answerValue) {
    throw new Error("--set needs both field and value.");
  }
  return { key, value: answerValue };
}

async function readApplicationAnswersFromFile(
  filePath: string,
  answerSets: Array<{ key: string; value: string }> = []
): Promise<ApplicationAnswerInput[]> {
  const raw = JSON.parse(await readFile(path.resolve(filePath), "utf8")) as unknown;
  const answers = applicationAnswerInputsFromJson(raw, answerSets);
  if (answers.length === 0) {
    throw new Error(
      answerSets.length > 0
        ? "No reusable template answers matched the provided --set values."
        : "No reusable approved answers found in the answer file. Fill value and set approveForReuse to true first."
    );
  }
  return answers;
}

function applicationAnswerInputsFromJson(
  value: unknown,
  answerSets: Array<{ key: string; value: string }> = []
): ApplicationAnswerInput[] {
  if (Array.isArray(value)) {
    return value.map((item) => toApplicationAnswerInput(item)).filter(isApplicationAnswerInput);
  }
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.answers)) return record.answers.map((item) => toApplicationAnswerInput(item)).filter(isApplicationAnswerInput);
  const sourceRef = typeof record.sourceRef === "string" ? record.sourceRef : undefined;
  const reusable = Array.isArray(record.reusableAnswers) ? record.reusableAnswers : [];
  if (answerSets.length > 0) {
    return answerInputsFromTemplateSets(reusable, answerSets, sourceRef);
  }
  return reusable
    .filter((item) => isApprovedReusableAnswerTemplateItem(item))
    .map((item) => toApplicationAnswerInput(item, sourceRef))
    .filter(isApplicationAnswerInput);
}

function answerInputsFromTemplateSets(
  reusable: unknown[],
  answerSets: Array<{ key: string; value: string }>,
  sourceRef?: string
): ApplicationAnswerInput[] {
  const answers: ApplicationAnswerInput[] = [];
  const unmatched = new Set(answerSets.map((set) => set.key));
  for (const set of answerSets) {
    const match = reusable.find((item) => templateItemMatchesSet(item, set.key));
    if (!match || typeof match !== "object") continue;
    const input = toApplicationAnswerInput({
      ...(match as Record<string, unknown>),
      approveForReuse: true,
      value: set.value
    }, sourceRef);
    if (input) {
      answers.push(input);
      unmatched.delete(set.key);
    }
  }
  if (unmatched.size > 0) {
    throw new Error(`No reusable template answer matched: ${[...unmatched].join(", ")}.`);
  }
  return answers;
}

function templateItemMatchesSet(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const candidates = [
    record.id,
    record.field,
    record.question,
    ...(Array.isArray(record.aliases) ? record.aliases : [])
  ].filter((item): item is string => typeof item === "string");
  const normalizedKey = normalizeAnswerSetKey(key);
  return candidates.some((candidate) => normalizeAnswerSetKey(candidate) === normalizedKey);
}

function normalizeAnswerSetKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isApprovedReusableAnswerTemplateItem(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (record.approveForReuse === true || record.approvedByUser === true || record.saveForReuse === true) &&
    typeof record.value === "string" &&
    record.value.trim().length > 0;
}

function toApplicationAnswerInput(value: unknown, fallbackSourceRef?: string): ApplicationAnswerInput | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const field = typeof record.field === "string" ? record.field.trim() : "";
  const valueText = typeof record.value === "string" ? record.value.trim() : "";
  if (!field || !valueText) return undefined;
  const aliases = [
    ...(Array.isArray(record.aliases) ? record.aliases.filter((alias): alias is string => typeof alias === "string") : []),
    ...(typeof record.question === "string" ? [record.question] : [])
  ].map((alias) => alias.trim()).filter(Boolean);
  const input: ApplicationAnswerInput = {
    field,
    value: valueText
  };
  if (typeof record.id === "string" && record.id.trim()) input.id = record.id.trim();
  if (aliases.length > 0) input.aliases = [...new Set(aliases)];
  if (record.needsApproval === true) input.needsApproval = true;
  const sourceRef = typeof record.sourceRef === "string" && record.sourceRef.trim()
    ? record.sourceRef.trim()
    : fallbackSourceRef;
  if (sourceRef) input.sourceRef = sourceRef;
  return input;
}

function isApplicationAnswerInput(value: ApplicationAnswerInput | undefined): value is ApplicationAnswerInput {
  return Boolean(value);
}

function parseSetupArgs(args: string[]): SetupApplyCueOptions {
  const options: SetupApplyCueOptions = { workspaceRoot: process.cwd() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--skip-tools") {
      options.installTools = false;
    } else if (arg === "--skip-source-approval") {
      options.autoApproveSources = false;
    } else if (arg === "--more-results" || arg === "--expand-sources") {
      options.generatedSourceExpansion = true;
    } else if (arg === "--include-older-posts" || arg === "--include-older") {
      options.includeOlderPosts = true;
    } else if (arg === "--freshness-days") {
      const value = args[index + 1];
      if (!value) throw new Error("--freshness-days needs a positive day count.");
      options.freshnessDays = parsePositiveInteger(value, "--freshness-days");
      index += 1;
    } else if (arg.startsWith("--freshness-days=")) {
      options.freshnessDays = parsePositiveInteger(arg.slice("--freshness-days=".length), "--freshness-days");
    } else if (arg === "--target-ranking-queue") {
      const value = args[index + 1];
      if (!value) throw new Error("--target-ranking-queue needs a positive job count.");
      options.targetRankingQueue = parsePositiveInteger(value, "--target-ranking-queue");
      index += 1;
    } else if (arg.startsWith("--target-ranking-queue=")) {
      options.targetRankingQueue = parsePositiveInteger(arg.slice("--target-ranking-queue=".length), "--target-ranking-queue");
    } else if (arg === "--auto-approve-sources") {
      options.autoApproveSources = true;
    } else if (arg === "--input") {
      const value = args[index + 1];
      if (!value) throw new Error("--input needs an ApplyCue config JSON path.");
      options.profileInputPath = value;
      index += 1;
    } else if (arg.startsWith("--input=")) {
      options.profileInputPath = arg.slice("--input=".length);
    } else if (arg === "--base-cv") {
      const value = args[index + 1];
      if (!value) throw new Error("--base-cv needs a DOCX, text-based PDF, Markdown, or text CV path.");
      options.baseCvPath = value;
      index += 1;
    } else if (arg.startsWith("--base-cv=")) {
      options.baseCvPath = arg.slice("--base-cv=".length);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown setup option: ${arg}`);
    }
  }
  return options;
}

function parseRunBatchArgs(args: string[]): Parameters<typeof runLocalOrSampleBatch>[0] {
  const options: Parameters<typeof runLocalOrSampleBatch>[0] = {
    workspaceRoot: process.cwd(),
    writeFiles: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") continue;
    if (arg === "--more-results" || arg === "--expand-sources") {
      options.generatedSourceExpansion = true;
    } else if (arg === "--include-older-posts" || arg === "--include-older") {
      options.includeOlderPosts = true;
    } else if (arg === "--freshness-days") {
      const value = args[index + 1];
      if (!value) throw new Error("--freshness-days needs a positive day count.");
      options.freshnessDays = parsePositiveInteger(value, "--freshness-days");
      index += 1;
    } else if (arg.startsWith("--freshness-days=")) {
      options.freshnessDays = parsePositiveInteger(arg.slice("--freshness-days=".length), "--freshness-days");
    } else if (arg === "--target-ranking-queue") {
      const value = args[index + 1];
      if (!value) throw new Error("--target-ranking-queue needs a positive job count.");
      options.targetRankingQueue = parsePositiveInteger(value, "--target-ranking-queue");
      index += 1;
    } else if (arg.startsWith("--target-ranking-queue=")) {
      options.targetRankingQueue = parsePositiveInteger(arg.slice("--target-ranking-queue=".length), "--target-ranking-queue");
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown first-build option: ${arg}`);
    }
  }
  return options;
}

function parseApproveSourcesArgs(args: string[]): ApproveSourceSuggestionsOptions {
  const options: ApproveSourceSuggestionsOptions = { workspaceRoot: process.cwd() };
  const suggestionIds: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg === "--") {
      continue;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--all") {
      options.approveAll = true;
    } else if (arg === "--ids" || arg === "--id") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} needs a comma-separated id list.`);
      suggestionIds.push(...splitIds(value));
      index += 1;
    } else if (arg.startsWith("--ids=")) {
      suggestionIds.push(...splitIds(arg.slice("--ids=".length)));
    } else if (arg.startsWith("--id=")) {
      suggestionIds.push(...splitIds(arg.slice("--id=".length)));
    } else if (arg === "--config") {
      const value = args[index + 1];
      if (!value) throw new Error("--config needs a path.");
      options.configPath = value;
      index += 1;
    } else if (arg.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if (arg === "--plan") {
      const value = args[index + 1];
      if (!value) throw new Error("--plan needs a path.");
      options.sourcePlanPath = value;
      index += 1;
    } else if (arg.startsWith("--plan=")) {
      options.sourcePlanPath = arg.slice("--plan=".length);
    } else if (arg === "--profile") {
      const value = args[index + 1];
      if (!value) throw new Error("--profile needs a profile key.");
      options.profileKey = value;
      index += 1;
    } else if (arg.startsWith("--profile=")) {
      options.profileKey = arg.slice("--profile=".length);
    } else if (arg === "--applycue-home") {
      const value = args[index + 1];
      if (!value) throw new Error("--applycue-home needs a path.");
      options.applyCueHome = value;
      index += 1;
    } else if (arg.startsWith("--applycue-home=")) {
      options.applyCueHome = arg.slice("--applycue-home=".length);
    } else {
      throw new Error(`Unknown approve-sources option: ${arg}`);
    }
  }
  if (suggestionIds.length > 0) options.suggestionIds = [...new Set(suggestionIds)];
  return options;
}

function splitIds(value: string): string[] {
  return value.split(",").map((id) => id.trim()).filter(Boolean);
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} needs a positive whole number.`);
  return parsed;
}

function printUsage(): void {
  console.log(`ApplyCue worker commands:
  first-build [--more-results] [--target-ranking-queue <count>] [--freshness-days <days>] [--include-older-posts]
  status [--json]
  source-canary [--json] [--include-disabled] [--include-jobspy] [--jobspy-limit <count>] [--include-ats-directory]
  approve-answers --field <field-or-question> --value <approved-answer> [--alias <label>] [--dry-run]
  approve-answers --from-file <live-answer-approval-template.json> [--dry-run]
  approve-answers --from-live --set field=value [--set field=value] [--dry-run]
  browser-preflight --plan <browser-plan.json> --snapshot <page-snapshot.json> [--out <report.json>]
  browser-uat [--skip-tools] [--more-results] [--target-ranking-queue <count>] [--freshness-days <days>] [--include-older-posts]
  browser-live-preflight [--plan-id <id> | --job-id <id>]
  browser-live-apply [--plan-id <id> | --job-id <id>] [--allow-submit]
  apply-route [--route-id <id> | --application-id <id> | --job-id <id> | --type <api|browser|email|dm|manual_review>]
  form-data [--confirm] [--more-results] [--target-ranking-queue <count>] [--freshness-days <days>] [--include-older-posts]
  scan-email-leads --input <raw-email-connector-export.json|jsonl> [--import] [--import-dry-run]
  import-email-leads --input <connector-export.json|jsonl> [--dry-run]
  setup [--input <applycue-config.json>] [--base-cv <cv.docx|cv.pdf|cv.md|cv.txt>] [--profile <key>] [--skip-tools] [--skip-source-approval] [--auto-approve-sources] [--more-results] [--target-ranking-queue <count>] [--freshness-days <days>] [--include-older-posts]
  uat [--skip-tools] [--skip-source-approval] [--auto-approve-sources] [--more-results] [--target-ranking-queue <count>] [--freshness-days <days>] [--include-older-posts]
  record-outcome --application <application-id> --type <type> [--note <text>]
  record-decision --job <job-id> --decision <apply|review|watch|skip> --actor <name> --reason <text> [--evidence <ref>]
  record-decisions --input <reviewed-decisions.json> [--prepare]
  record-tuning --origin <origin> --target <target> --action <action> --value <text> --reason <text>
  apply-tuning --ids <signal-id[,signal-id]> [--dry-run]
  apply-tuning --all [--dry-run]
  approve-sources --ids <suggestion-id[,suggestion-id]> [--dry-run]
  approve-sources --all [--dry-run]

Options:
  --config <path>          Use a specific editable applycue.json.
  --plan <path>            Use a specific source-plan.generated.json.
  --signals <path>         Use a specific tuning-signals.jsonl file.
  --profile <key>          Use an ApplyCue profile key.
  --applycue-home <path>   Use a specific ApplyCue home directory.
`);
}
