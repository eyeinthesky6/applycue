import type { ApplyRoute, ApplyRouteType } from "@applycue/core";
import { runLocalOrSampleBatch, type SampleBatchResult } from "@applycue/engine";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isMasterFormDataConfirmed, type MasterFormDataReport } from "./master-form-data.js";
import type { SetupApplyCueOptions } from "./setup.js";

export type ApplyRouteExecutionStatus = "handoff" | "drafted" | "blocked" | "fail";

export type ApplyRouteExecutionCheckStatus = "pass" | "warn" | "fail";

export interface ApplyRouteExecutionCheck {
  id: string;
  label: string;
  status: ApplyRouteExecutionCheckStatus;
  detail: string;
}

export interface ApplyRouteExecutionReport {
  id: string;
  status: ApplyRouteExecutionStatus;
  generatedAt: string;
  selectedRouteId?: string;
  selectedApplicationId?: string;
  selectedJobId?: string;
  routeType?: ApplyRouteType;
  routeStatus?: ApplyRoute["status"];
  canSubmit?: boolean;
  submitRequiresApproval?: boolean;
  checks: ApplyRouteExecutionCheck[];
  nextCommands: string[];
  paths: {
    dmDraft?: string;
    emailDraft?: string;
    masterFormData?: string;
    masterFormDataPreview?: string;
    markdownReport: string;
    report: string;
    route?: string;
  };
  summary: string;
}

export interface ApplyRouteExecutionOptions extends SetupApplyCueOptions {
  applicationId?: string;
  batch?: Pick<SampleBatchResult, "applyRoutes" | "drafts" | "outputRoot">;
  jobId?: string;
  routeId?: string;
  routeType?: ApplyRouteType;
}

interface ApplyRouteExecutionPaths {
  dmDraft?: string;
  emailDraft?: string;
  masterFormData?: string;
  masterFormDataPreview?: string;
  markdownReport: string;
  report: string;
  route?: string;
}

export async function runApplyRouteExecution(
  options: ApplyRouteExecutionOptions = {}
): Promise<ApplyRouteExecutionReport> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const batch = options.batch ?? await runLocalOrSampleBatch({
    workspaceRoot,
    ...(options.applyCueHome ? { applyCueHome: options.applyCueHome } : {}),
    ...(options.profileKey ? { profileKey: options.profileKey } : {}),
    writeFiles: true
  });
  const selectedRoute = selectApplyRoute(batch.applyRoutes, options);
  const outputDir = path.join(
    batch.outputRoot,
    "outputs",
    "apply-route-executions",
    safeFileSegment(selectedRoute?.id ?? "apply-route")
  );
  await mkdir(outputDir, { recursive: true });
  const paths = applyRouteExecutionPaths(batch.outputRoot, outputDir, selectedRoute);

  if (!selectedRoute) {
    return writeApplyRouteExecutionReport({
      id: "applycue-apply-route",
      status: "fail",
      generatedAt: new Date().toISOString(),
      checks: [{
        id: "apply-route-selected",
        label: "Apply Route Selected",
        status: "fail",
        detail: "No generated apply route matched the request."
      }],
      nextCommands: ["pnpm applycue:status"],
      paths,
      summary: "Apply route execution failed: no matching generated apply route was available."
    });
  }

  const report = await buildRouteExecutionReport(selectedRoute, paths, batch);
  return writeApplyRouteExecutionReport(report);
}

function selectApplyRoute(
  routes: ApplyRoute[],
  options: ApplyRouteExecutionOptions
): ApplyRoute | undefined {
  const matches = routes.filter((route) => {
    if (options.routeId && route.id !== options.routeId) return false;
    if (options.applicationId && route.applicationId !== options.applicationId) return false;
    if (options.jobId && route.jobId !== options.jobId) return false;
    if (options.routeType && route.type !== options.routeType) return false;
    return true;
  });
  return matches[0];
}

async function buildRouteExecutionReport(
  route: ApplyRoute,
  paths: ApplyRouteExecutionPaths,
  batch: Pick<SampleBatchResult, "drafts" | "outputRoot">
): Promise<ApplyRouteExecutionReport> {
  const base = {
    id: `${route.id}-execution`,
    generatedAt: new Date().toISOString(),
    selectedRouteId: route.id,
    selectedApplicationId: route.applicationId,
    selectedJobId: route.jobId,
    routeType: route.type,
    routeStatus: route.status,
    canSubmit: route.canSubmit,
    submitRequiresApproval: route.submitRequiresApproval,
    paths
  };

  if (route.type === "browser") {
    const browser = route.execution.browser;
    if (!browser) return missingExecutionReport(route, paths, "browser");
    const formDataGate = await isMasterFormDataConfirmed(batch);
    if (!formDataGate.confirmed) {
      return masterFormDataBlockedReport(route, paths, formDataGate.report, browser);
    }
    return {
      ...base,
      status: "handoff",
      checks: [
        routeSelectedCheck(route),
        {
          id: "browser-route",
          label: "Browser Route",
          status: "pass",
          detail: `Use browser plan ${browser.planId}; live preflight is required before fill/upload/submit.`
        }
      ],
      nextCommands: [browser.preflightCommand, browser.applyCommand],
      summary: `Browser route ready for ${route.jobId}: run live preflight before filling the application page.`
    };
  }

  if (route.type === "email") {
    const email = route.execution.email;
    if (!email) return missingExecutionReport(route, paths, "email");
    if (!paths.emailDraft) return missingExecutionReport(route, paths, "email");
    await writeFile(paths.emailDraft, renderEmailDraft(route), "utf8");
    return {
      ...base,
      status: "drafted",
      checks: [
        routeSelectedCheck(route),
        {
          id: "email-draft",
          label: "Email Draft",
          status: "pass",
          detail: `Drafted email to ${(email.to ?? []).join(", ") || "unspecified recipient"}.`
        }
      ],
      nextCommands: ["Review the generated email draft in chat. Use a native agent email connector when available, use browser control only with user permission, and send only after explicit user confirmation."],
      summary: `Email apply draft created for ${route.jobId}. User approval is required before sending.`
    };
  }

  if (route.type === "dm") {
    const dm = route.execution.dm;
    if (!dm) return missingExecutionReport(route, paths, "dm");
    if (!paths.dmDraft) return missingExecutionReport(route, paths, "dm");
    await writeFile(paths.dmDraft, renderDmDraft(route), "utf8");
    return {
      ...base,
      status: "drafted",
      checks: [
        routeSelectedCheck(route),
        {
          id: "dm-draft",
          label: "DM Draft",
          status: "pass",
          detail: `Drafted ${dm.platform} message.`
        }
      ],
      nextCommands: ["Review the generated DM draft in chat. Use a native agent/social connector when available, use browser control only with user permission, and send only after explicit user confirmation."],
      summary: `DM draft created for ${route.jobId}. User approval is required before sending.`
    };
  }

  if (route.type === "api") {
    const api = route.execution.api;
    if (!api) return missingExecutionReport(route, paths, "api");
    const browserFallback = route.artifacts.browserPlanId
      ? [
          `pnpm applycue:browser-live-preflight -- --plan-id ${route.artifacts.browserPlanId}`,
          `pnpm applycue:browser-live-apply -- --plan-id ${route.artifacts.browserPlanId}`
        ]
      : ["pnpm applycue:status"];
    return {
      ...base,
      status: "blocked",
      checks: [
        routeSelectedCheck(route),
        {
          id: "api-adapter",
          label: "API Adapter Executor",
          status: "fail",
          detail: `Route names adapter ${api.adapterId}, but no local API submit executor is registered in this build.`
        }
      ],
      nextCommands: browserFallback,
      summary: `API route paused for ${route.jobId}: use browser fallback or implement a safe adapter executor first.`
    };
  }

  const manual = route.execution.manualReview;
  return {
    ...base,
    status: "blocked",
    checks: [
      routeSelectedCheck(route),
      {
        id: "manual-review",
        label: "Manual Review",
        status: route.status === "blocked" ? "fail" : "warn",
        detail: (manual?.questions ?? ["Manual review is required before applying."]).join(" ")
      }
    ],
    nextCommands: ["Resolve the manual-review blocker in chat, then regenerate the batch."],
    summary: `Manual review required for ${route.jobId}: ${route.reason}`
  };
}

function masterFormDataBlockedReport(
  route: ApplyRoute,
  paths: ApplyRouteExecutionPaths,
  formData: MasterFormDataReport,
  browser: NonNullable<ApplyRoute["execution"]["browser"]>
): ApplyRouteExecutionReport {
  return {
    id: `${route.id}-execution`,
    status: "blocked",
    generatedAt: new Date().toISOString(),
    selectedRouteId: route.id,
    selectedApplicationId: route.applicationId,
    selectedJobId: route.jobId,
    routeType: route.type,
    routeStatus: route.status,
    canSubmit: route.canSubmit,
    submitRequiresApproval: route.submitRequiresApproval,
    checks: [
      routeSelectedCheck(route),
      {
        id: "master-form-data",
        label: "Master Form Data Confirmed",
        status: "fail",
        detail: `Master form data is ${formData.status}; show ${formData.fieldCount} field(s) to the user and confirm before portal fill.`
      }
    ],
    nextCommands: [
      formData.confirmationCommand,
      browser.preflightCommand,
      browser.applyCommand
    ],
    paths: {
      ...paths,
      masterFormData: formData.paths.canonicalJson,
      masterFormDataPreview: formData.paths.markdownPreview
    },
    summary: `Browser route blocked for ${route.jobId}: confirm master form data before live portal preflight and fill.`
  };
}

function routeSelectedCheck(route: ApplyRoute): ApplyRouteExecutionCheck {
  return {
    id: "apply-route-selected",
    label: "Apply Route Selected",
    status: "pass",
    detail: `Selected ${route.id} (${route.type} / ${route.status}).`
  };
}

function missingExecutionReport(
  route: ApplyRoute,
  paths: ApplyRouteExecutionPaths,
  type: ApplyRouteType
): ApplyRouteExecutionReport {
  return {
    id: `${route.id}-execution`,
    status: "fail",
    generatedAt: new Date().toISOString(),
    selectedRouteId: route.id,
    selectedApplicationId: route.applicationId,
    selectedJobId: route.jobId,
    routeType: route.type,
    routeStatus: route.status,
    canSubmit: route.canSubmit,
    submitRequiresApproval: route.submitRequiresApproval,
    checks: [
      routeSelectedCheck(route),
      {
        id: `${type}-execution`,
        label: `${humanizeIdentifier(type)} Execution`,
        status: "fail",
        detail: `Route type is ${type}, but the route artifact is missing the ${type} execution payload.`
      }
    ],
    nextCommands: ["pnpm applycue:status"],
    paths,
    summary: `Apply route execution failed: ${type} execution payload is missing.`
  };
}

function renderEmailDraft(route: ApplyRoute): string {
  const email = route.execution.email;
  if (!email) return "";
  const to = (email.to ?? []).join(", ") || "(missing recipient)";
  return `# ApplyCue Email Draft

Route: ${route.id}
Application: ${route.applicationId}
Job: ${route.jobId}
Status: ${route.status}

To: ${to}
Subject: ${email.subject}

## Attachments

${renderList(email.attachmentPaths)}

## Body

${email.body.trim()}

## Send Policy

Do not send until the user explicitly confirms sending. Prefer a native Codex/Claude/Hermes-style agent email connector; use browser control only when no connector is available and the user has approved that session.
`;
}

function renderDmDraft(route: ApplyRoute): string {
  const dm = route.execution.dm;
  if (!dm) return "";
  return `# ApplyCue DM Draft

Route: ${route.id}
Application: ${route.applicationId}
Job: ${route.jobId}
Status: ${route.status}

Platform: ${dm.platform}
Target: ${dm.targetUrl ?? "(missing target)"}

## Attachments

${renderList(dm.attachmentPaths)}

## Message

${dm.message.trim()}

## Send Policy

Do not send until the user explicitly confirms sending. Prefer a native Codex/Claude/Hermes-style agent social connector; use browser control only when no connector is available and the user has approved that session.
`;
}

function renderMarkdownReport(report: ApplyRouteExecutionReport): string {
  const lines = [
    `# ApplyCue Apply Route Execution`,
    "",
    `Status: ${report.status}`,
    `Summary: ${report.summary}`,
    "",
    "## Route",
    "",
    `- Route: ${report.selectedRouteId ?? "none"}`,
    `- Application: ${report.selectedApplicationId ?? "none"}`,
    `- Job: ${report.selectedJobId ?? "none"}`,
    `- Type: ${report.routeType ?? "none"}`,
    `- Route status: ${report.routeStatus ?? "none"}`,
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => `- ${check.status.toUpperCase()}: ${check.label} - ${check.detail}`),
    "",
    "## Next Commands",
    "",
    ...renderCommandList(report.nextCommands),
    "",
    "## Artifacts",
    "",
    ...Object.entries(report.paths).map(([label, value]) => `- ${humanizeIdentifier(label)}: ${value}`)
  ];
  return `${lines.join("\n")}\n`;
}

async function writeApplyRouteExecutionReport(
  report: ApplyRouteExecutionReport
): Promise<ApplyRouteExecutionReport> {
  await mkdir(path.dirname(report.paths.report), { recursive: true });
  await writeFile(report.paths.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(report.paths.markdownReport, renderMarkdownReport(report), "utf8");
  return report;
}

function applyRouteExecutionPaths(
  outputRoot: string,
  outputDir: string,
  route: ApplyRoute | undefined
): ApplyRouteExecutionPaths {
  return {
    markdownReport: path.join(outputDir, "apply-route-execution.md"),
    report: path.join(outputDir, "apply-route-execution.json"),
    ...(route ? { route: path.join(outputRoot, "outputs", "apply-routes", `${route.id}.json`) } : {}),
    ...(route?.type === "email" ? { emailDraft: path.join(outputDir, "email-draft.md") } : {}),
    ...(route?.type === "dm" ? { dmDraft: path.join(outputDir, "dm-draft.md") } : {}),
    ...(route?.type === "browser"
      ? {
          masterFormData: path.join(outputRoot, "data", "local", "master-form-data.json"),
          masterFormDataPreview: path.join(outputRoot, "outputs", "form-data", "master-form-data.md")
        }
      : {})
  };
}

function renderList(values: string[]): string {
  if (values.length === 0) return "- none";
  return values.map((value) => `- ${value}`).join("\n");
}

function renderCommandList(commands: string[]): string[] {
  if (commands.length === 0) return ["- none"];
  return commands.map((command) => `- \`${command}\``);
}

function humanizeIdentifier(value: string): string {
  return value.replace(/[-_]+/g, " ");
}

function safeFileSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "apply-route";
}
