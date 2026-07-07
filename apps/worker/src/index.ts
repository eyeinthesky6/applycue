import type { BrowserApplyPlan, JobRecord, OutcomeEvent, RankedJob, UserProfile } from "@applycue/core";
import {
  formatBrowserApplyPreflight,
  preflightBrowserApplyPlanFromSnapshot,
  type BrowserPageSnapshot
} from "@applycue/browser-agent";
import {
  approveApplicationAnswers,
  approveSourceSuggestions,
  recordOutcomeEvent,
  type ApplicationAnswerInput,
  type ApproveApplicationAnswersOptions,
  type ApproveSourceSuggestionsOptions,
  type RecordOutcomeEventOptions,
  runLocalOrSampleBatch
} from "@applycue/engine";
import { getApplyCueProfileDir } from "@applycue/profile";
import { rankJob } from "@applycue/ranker";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runBrowserApplyUat } from "./browser-uat.js";
import { runLiveBrowserApply, type LiveBrowserApplyOptions } from "./live-apply.js";
import { runLiveBrowserPreflight, type LiveBrowserPreflightOptions } from "./live-preflight.js";
import { setupApplyCue, type SetupApplyCueOptions } from "./setup.js";
import { formatApplyCueStatus, readApplyCueStatus, type ApplyCueStatusOptions } from "./status.js";
import { runApplyCueUat } from "./uat.js";

export function rankDiscoveredJobs(jobs: JobRecord[], profile: UserProfile): RankedJob[] {
  return jobs
    .map((job) => rankJob(job, profile))
    .sort((a, b) => b.priority - a.priority);
}

export async function runFirstBuild(): Promise<void> {
  const result = await runLocalOrSampleBatch({ workspaceRoot: process.cwd(), writeFiles: true });
  const prepared = result.applications.length;
  const cvCount = result.cvVariants.length;
  console.log(`ApplyCue first-build complete: ${prepared} application draft(s), ${cvCount} CV(s).`);
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
  console.log("ApplyCue setup complete.");
  console.log(`Profile: ${result.profileDir}`);
  console.log(`Config: ${result.configPath}`);
  console.log(`JobSpy: ${result.jobSpyStatus}`);
  console.log(`Browser tool: ${result.browserToolStatus}`);
  console.log(`Approved safe sources: ${result.approvedSourceCount}`);
  console.log(`Dashboard: ${result.dashboardPath}`);
  console.log(`Summary: ${result.summaryPath}`);
  console.log(`Run manifest: ${result.runManifestPath}`);
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

export async function runStatus(args: string[] = process.argv.slice(3)): Promise<void> {
  const { json, options } = parseStatusArgs(args);
  const report = await readApplyCueStatus(options);
  console.log(json ? JSON.stringify(report, null, 2) : formatApplyCueStatus(report));
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
  } else if (command === "browser-uat") {
    await runBrowserUat();
  } else if (command === "browser-live-preflight" || command === "live-preflight") {
    await runBrowserLivePreflight();
  } else if (command === "browser-live-apply" || command === "live-apply") {
    await runBrowserLiveApply();
  } else if (command === "status") {
    await runStatus();
  } else if (command === "browser-preflight") {
    await runBrowserPreflight();
  } else if (command === "record-outcome") {
    await runRecordOutcome();
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

function printUsage(): void {
  console.log(`ApplyCue worker commands:
  first-build
  status [--json]
  approve-answers --field <field-or-question> --value <approved-answer> [--alias <label>] [--dry-run]
  approve-answers --from-file <live-answer-approval-template.json> [--dry-run]
  approve-answers --from-live --set field=value [--set field=value] [--dry-run]
  browser-preflight --plan <browser-plan.json> --snapshot <page-snapshot.json> [--out <report.json>]
  browser-uat [--skip-tools]
  browser-live-preflight [--plan-id <id> | --job-id <id>]
  browser-live-apply [--plan-id <id> | --job-id <id>] [--allow-submit]
  setup [--skip-tools]
  uat [--skip-tools]
  record-outcome --application <application-id> --type <type> [--note <text>]
  approve-sources --ids <suggestion-id[,suggestion-id]> [--dry-run]
  approve-sources --all [--dry-run]

Options:
  --config <path>          Use a specific editable applycue.json.
  --plan <path>            Use a specific source-plan.generated.json.
  --profile <key>          Use an ApplyCue profile key.
  --applycue-home <path>   Use a specific ApplyCue home directory.
`);
}
