export {
  createApplicationReceipt,
  createBrowserApplyPlan,
  createInitialBrowserActionLog,
  describeBrowserPlan,
  recordBrowserAction,
  type CreateApplicationReceiptInput,
  type CreateBrowserApplyPlanInput
} from "@applycue/apply-assistant";
import {
  createApplicationReceipt,
  createInitialBrowserActionLog,
  recordBrowserAction
} from "@applycue/apply-assistant";
import type { ApplicationReceipt, BrowserActionLogEntry, BrowserApplyPlan } from "@applycue/core";
import { classifyJobLivenessFromText, type JobLivenessVerification } from "@applycue/discovery";

export interface LocalApplyFormFixture {
  fields: string[];
  finalUrl?: string;
  formFields?: BrowserApplyFormField[];
  uploadTargets: string[];
  pageText?: string;
  title?: string;
  visibleCompany?: string;
  visibleRole?: string;
  confirmationText?: string;
  confirmationUrl?: string;
}

export type BrowserApplyFormFieldType =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "number"
  | "file"
  | "unknown";

export interface BrowserApplyFormField {
  id?: string;
  label: string;
  limit?: string;
  name: string;
  options?: string[];
  required: boolean | "unknown";
  type: BrowserApplyFormFieldType;
}

export type BrowserApplyPreflightStatus = "pass" | "pause" | "fail";

export interface BrowserApplyPreflightInput {
  applyControls?: string[];
  expectedCompany?: string;
  expectedRole?: string;
  fields?: BrowserApplyFormField[];
  finalUrl?: string;
  pageText?: string;
  plan: BrowserApplyPlan;
  title?: string;
  visibleCompany?: string;
  visibleRole?: string;
}

export interface BrowserPageSnapshot {
  applyControls?: string[];
  fields?: BrowserApplyFormField[];
  finalUrl?: string;
  forms?: Array<{
    fields: BrowserApplyFormField[];
    id?: string;
    label?: string;
  }>;
  pageText?: string;
  title?: string;
  visibleCompany?: string;
  visibleRole?: string;
}

export interface BrowserApplyPreflightResult {
  liveness: JobLivenessVerification;
  missingRequiredFields: BrowserApplyFormField[];
  reasons: string[];
  sensitiveFields: BrowserApplyFormField[];
  status: BrowserApplyPreflightStatus;
}

export interface BrowserPlanDryRunResult {
  actionLog: BrowserActionLogEntry[];
  preflight: BrowserApplyPreflightResult;
  receipt: ApplicationReceipt;
  status: "paused" | "submitted" | "failed";
}

export interface BrowserApplyController {
  captureReceipt?(): Promise<{
    confirmationText?: string;
    confirmationUrl?: string;
  }>;
  fillField(target: string, value: string): Promise<void>;
  openUrl(url: string): Promise<BrowserPageSnapshot | void>;
  snapshot(): Promise<BrowserPageSnapshot>;
  submit(): Promise<void>;
  uploadFile(target: string, filePath: string): Promise<void>;
}

export interface BrowserPlanExecutionResult {
  actionLog: BrowserActionLogEntry[];
  preflight: BrowserApplyPreflightResult;
  receipt: ApplicationReceipt;
  status: "paused" | "submitted" | "failed";
}

export interface BrowserPlanExecutionOptions {
  expectedCompany?: string;
  expectedRole?: string;
  snapshot?: BrowserPageSnapshot;
}

export interface PlaywrightLikeLocator {
  click(options?: { timeout?: number }): Promise<unknown>;
  fill(value: string, options?: { timeout?: number }): Promise<unknown>;
  setInputFiles(filePath: string | string[], options?: { timeout?: number }): Promise<unknown>;
}

export interface PlaywrightLikePage {
  evaluate<T = unknown>(pageFunction: string): Promise<T>;
  goto(url: string, options?: { timeout?: number; waitUntil?: "commit" | "domcontentloaded" | "load" | "networkidle" }): Promise<unknown>;
  locator(selector: string): PlaywrightLikeLocator;
  title(): Promise<string>;
  url(): string;
}

export interface PlaywrightBrowserApplyControllerOptions {
  actionTimeoutMs?: number;
  navigationTimeoutMs?: number;
  waitUntil?: "commit" | "domcontentloaded" | "load" | "networkidle";
}

const DEFAULT_FIXTURE: LocalApplyFormFixture = {
  fields: ["name", "email"],
  uploadTargets: ["resume_or_cv"],
  pageText: "Apply now. Candidate name, email, and resume upload fields are visible.",
  title: "Application form",
  confirmationText: "Local dry-run receipt captured."
};

const SENSITIVE_FIELD_PATTERNS = [
  /work\s*authori[sz]ation/i,
  /\bright\s+to\s+work\b/i,
  /\bvisa\b/i,
  /\bsponsorship\b/i,
  /\bsponsor\b/i,
  /\brelocat/i,
  /\bsalary\b/i,
  /\bcompensation\b/i,
  /\bctc\b/i,
  /\bexpected\s+pay\b/i,
  /\bnotice\s+period\b/i,
  /\bdisabilit/i,
  /\bveteran\b/i,
  /\bgender\b/i,
  /\brace\b/i,
  /\bethnic/i,
  /\bdemographic/i,
  /\bself[-\s]?identif/i,
  /\bbackground\s+check\b/i,
  /\bcriminal\b/i,
  /\bid\s*(number|proof|card)\b/i,
  /\bpassport\b/i,
  /\bsocial\s+security\b/i,
  /\bnational\s+id\b/i
];

const PLAYWRIGHT_SNAPSHOT_SCRIPT = `(() => {
  const text = (node) => (node && (node.innerText || node.textContent || "") || "").replace(/\\s+/g, " ").trim();
  const attr = (node, name) => (node && node.getAttribute && node.getAttribute(name) || "").trim();
  const labelFor = (field) => {
    const aria = attr(field, "aria-label");
    if (aria) return aria;
    const labelledBy = attr(field, "aria-labelledby");
    if (labelledBy) {
      const labelText = labelledBy.split(/\\s+/).map((id) => text(document.getElementById(id))).filter(Boolean).join(" ");
      if (labelText) return labelText;
    }
    if (field.id) {
      const explicit = document.querySelector('label[for="' + field.id.replace(/"/g, "\\\\\\"") + '"]');
      if (explicit) return text(explicit);
    }
    const wrapped = field.closest && field.closest("label");
    if (wrapped) return text(wrapped).replace(text(field), "").trim() || text(wrapped);
    return attr(field, "placeholder") || field.name || field.id || "Unlabeled field";
  };
  const fieldType = (field) => {
    const tag = field.tagName ? field.tagName.toLowerCase() : "";
    if (tag === "textarea") return "textarea";
    if (tag === "select") return "select";
    const type = (field.type || "").toLowerCase();
    if (["text", "email", "tel", "url", "search", "password"].includes(type)) return "text";
    if (["number"].includes(type)) return "number";
    if (["radio"].includes(type)) return "radio";
    if (["checkbox"].includes(type)) return "checkbox";
    if (["file"].includes(type)) return "file";
    return "unknown";
  };
  const fields = Array.from(document.querySelectorAll("input, textarea, select"))
    .filter((field) => {
      const type = (field.type || "").toLowerCase();
      return !["hidden", "submit", "button", "reset", "image"].includes(type);
    })
    .map((field) => {
      const item = {
        id: field.id || undefined,
        label: labelFor(field),
        name: field.name || field.id || attr(field, "aria-label") || labelFor(field),
        required: Boolean(field.required || attr(field, "aria-required") === "true"),
        type: fieldType(field)
      };
      if (field.maxLength && field.maxLength > 0) item.limit = String(field.maxLength);
      if (field.options) item.options = Array.from(field.options).map((option) => text(option)).filter(Boolean);
      return item;
    });
  const applyControls = Array.from(document.querySelectorAll("button, input[type=submit], a"))
    .map((node) => text(node) || attr(node, "value") || attr(node, "aria-label"))
    .filter((value) => /apply|submit|send application|continue/i.test(value))
    .slice(0, 10);
  const visibleRoleNode = document.querySelector('[data-applycue-role], [data-testid*="job-title" i], [class*="job-title" i], h1');
  const visibleCompanyNode = document.querySelector('[data-applycue-company], [data-testid*="company" i], [class*="company" i]');
  return {
    applyControls,
    fields,
    finalUrl: location.href,
    pageText: document.body ? text(document.body) : "",
    title: document.title,
    visibleCompany: text(visibleCompanyNode) || undefined,
    visibleRole: text(visibleRoleNode) || undefined
  };
})()`;

export function createPlaywrightBrowserApplyController(
  page: PlaywrightLikePage,
  options: PlaywrightBrowserApplyControllerOptions = {}
): BrowserApplyController {
  const actionTimeoutMs = options.actionTimeoutMs ?? 15_000;
  const navigationTimeoutMs = options.navigationTimeoutMs ?? 45_000;
  const waitUntil = options.waitUntil ?? "domcontentloaded";
  return {
    async openUrl(url: string): Promise<BrowserPageSnapshot> {
      await page.goto(url, { timeout: navigationTimeoutMs, waitUntil });
      return snapshotPlaywrightPage(page);
    },
    async snapshot(): Promise<BrowserPageSnapshot> {
      return snapshotPlaywrightPage(page);
    },
    async fillField(target: string, value: string): Promise<void> {
      await page.locator(fieldSelectorForTarget(target)).fill(value, { timeout: actionTimeoutMs });
    },
    async uploadFile(target: string, filePath: string): Promise<void> {
      await page.locator(fileSelectorForTarget(target)).setInputFiles(filePath, { timeout: actionTimeoutMs });
    },
    async submit(): Promise<void> {
      await page.locator(submitSelector()).click({ timeout: actionTimeoutMs });
    },
    async captureReceipt(): Promise<{ confirmationText?: string; confirmationUrl?: string }> {
      const snapshot = await snapshotPlaywrightPage(page);
      const receipt: { confirmationText?: string; confirmationUrl?: string } = {};
      const confirmationText = firstMeaningfulLine(snapshot.pageText) ?? snapshot.title;
      if (confirmationText) receipt.confirmationText = confirmationText;
      if (snapshot.finalUrl) receipt.confirmationUrl = snapshot.finalUrl;
      return receipt;
    }
  };
}

async function snapshotPlaywrightPage(page: PlaywrightLikePage): Promise<BrowserPageSnapshot> {
  const snapshot = await page.evaluate<BrowserPageSnapshot>(PLAYWRIGHT_SNAPSHOT_SCRIPT);
  const title = await page.title().catch(() => snapshot.title ?? "");
  const output: BrowserPageSnapshot = { ...snapshot };
  const finalUrl = page.url() || snapshot.finalUrl;
  const resolvedTitle = title || snapshot.title;
  if (finalUrl) output.finalUrl = finalUrl;
  if (resolvedTitle) output.title = resolvedTitle;
  return output;
}

export function executeBrowserPlanDryRun(
  plan: BrowserApplyPlan,
  fixture?: LocalApplyFormFixture
): BrowserPlanDryRunResult {
  const effectiveFixture = fixture ?? createDefaultFixtureForPlan(plan);
  let actionLog = createInitialBrowserActionLog(plan);
  const fields = new Set(effectiveFixture.fields);
  const uploadTargets = new Set(effectiveFixture.uploadTargets);
  const openAction = plan.actions.find((action) => action.type === "open_url");
  if (openAction) {
    actionLog = recordBrowserAction(actionLog, plan, openAction.id, "done", `Opened ${effectiveFixture.finalUrl ?? plan.url}.`);
  }

  const preflightInput: BrowserApplyPreflightInput = {
    fields: effectiveFixture.formFields ?? legacyFixtureFields(effectiveFixture),
    plan
  };
  if (effectiveFixture.finalUrl) preflightInput.finalUrl = effectiveFixture.finalUrl;
  if (effectiveFixture.pageText) preflightInput.pageText = effectiveFixture.pageText;
  if (effectiveFixture.title) preflightInput.title = effectiveFixture.title;
  if (effectiveFixture.visibleCompany) preflightInput.visibleCompany = effectiveFixture.visibleCompany;
  if (effectiveFixture.visibleRole) preflightInput.visibleRole = effectiveFixture.visibleRole;
  const preflight = preflightBrowserApplyPlan(preflightInput);
  if (preflight.status !== "pass") {
    const status = preflight.status === "fail" ? "failed" : "paused";
    return {
      actionLog,
      preflight,
      receipt: createApplicationReceipt({
        actionLog,
        confirmationText: `Preflight ${status}: ${preflight.reasons.join("; ")}`,
        confirmationUrl: effectiveFixture.finalUrl ?? plan.url,
        plan,
        status
      }),
      status
    };
  }

  for (const action of plan.actions) {
    switch (action.type) {
      case "open_url":
        break;
      case "fill_field":
        if (!action.target || !fields.has(action.target)) {
          return createDryRunFailure(plan, actionLog, action.id, `Missing local form field: ${action.target ?? "unknown"}.`);
        }
        actionLog = recordBrowserAction(actionLog, plan, action.id, "done", `Filled ${action.target}.`);
        break;
      case "upload_file":
        if (!action.target || !uploadTargets.has(action.target)) {
          return createDryRunFailure(plan, actionLog, action.id, `Missing upload field: ${action.target ?? "unknown"}.`);
        }
        if (!action.value?.toLowerCase().endsWith(".docx")) {
          return createDryRunFailure(plan, actionLog, action.id, "Upload action did not point to a DOCX CV artifact.");
        }
        actionLog = recordBrowserAction(actionLog, plan, action.id, "done", `Uploaded ${action.value}.`);
        break;
      case "pause":
        actionLog = recordBrowserAction(actionLog, plan, action.id, "paused", action.value ?? "Paused before submit.");
        return {
          actionLog,
          preflight,
          receipt: createApplicationReceipt({
            actionLog,
            confirmationText: "Paused before submit in local dry run.",
            confirmationUrl: plan.url,
            plan,
            status: "paused"
          }),
          status: "paused"
        };
      case "submit":
        if (!plan.canSubmit) {
          return createDryRunFailure(plan, actionLog, action.id, "Plan policy does not allow submit.");
        }
        actionLog = recordBrowserAction(actionLog, plan, action.id, "done", "Submitted in local dry run.");
        break;
      case "capture_receipt":
        actionLog = recordBrowserAction(actionLog, plan, action.id, "done", "Captured local confirmation.");
        return {
          actionLog,
          preflight,
          receipt: createApplicationReceipt({
            actionLog,
            confirmationText: effectiveFixture.confirmationText ?? "Application received in local dry run.",
            confirmationUrl: effectiveFixture.confirmationUrl ?? `${plan.url}#applycue-local-receipt`,
            plan,
            status: "submitted"
          }),
          status: "submitted"
        };
    }
  }

  return createDryRunFailure(plan, actionLog, `${plan.id}-missing-terminal-action`, "Plan ended without pause or receipt capture.");
}

function createDefaultFixtureForPlan(plan: BrowserApplyPlan): LocalApplyFormFixture {
  const fillTargets = plan.actions
    .filter((action) => action.type === "fill_field" && action.target)
    .map((action) => action.target!);
  const uploadTargets = plan.actions
    .filter((action) => action.type === "upload_file" && action.target)
    .map((action) => action.target!);

  return {
    ...DEFAULT_FIXTURE,
    fields: uniqueValues([...DEFAULT_FIXTURE.fields, ...fillTargets]),
    uploadTargets: uniqueValues([...DEFAULT_FIXTURE.uploadTargets, ...uploadTargets]),
    pageText: `Apply now. ${uniqueValues([...fillTargets, ...uploadTargets]).join(", ")} fields are visible.`
  };
}

export async function executeBrowserApplyPlan(
  plan: BrowserApplyPlan,
  controller: BrowserApplyController,
  options: BrowserPlanExecutionOptions = {}
): Promise<BrowserPlanExecutionResult> {
  let actionLog = createInitialBrowserActionLog(plan);
  const openAction = plan.actions.find((action) => action.type === "open_url");
  let openedSnapshot: BrowserPageSnapshot | void = undefined;

  if (openAction) {
    try {
      openedSnapshot = await controller.openUrl(openAction.value ?? plan.url);
      actionLog = recordBrowserAction(actionLog, plan, openAction.id, "done", `Opened ${openAction.value ?? plan.url}.`);
    } catch (error) {
      return createExecutionFailure(
        plan,
        actionLog,
        openAction.id,
        `Could not open application page: ${errorMessage(error)}`
      );
    }
  }

  let snapshot: BrowserPageSnapshot;
  try {
    snapshot = options.snapshot ?? openedSnapshot ?? await controller.snapshot();
  } catch (error) {
    return createExecutionFailure(
      plan,
      actionLog,
      `${plan.id}-snapshot`,
      `Could not inspect application page: ${errorMessage(error)}`
    );
  }
  const preflight = preflightBrowserApplyPlanFromSnapshot(plan, snapshot, {
    ...(options.expectedCompany ? { expectedCompany: options.expectedCompany } : {}),
    ...(options.expectedRole ? { expectedRole: options.expectedRole } : {})
  });
  if (preflight.status !== "pass") {
    const status = preflight.status === "fail" ? "failed" : "paused";
    return {
      actionLog,
      preflight,
      receipt: createApplicationReceipt({
        actionLog,
        confirmationText: `Preflight ${status}: ${preflight.reasons.join("; ")}`,
        confirmationUrl: snapshot.finalUrl ?? plan.url,
        plan,
        status
      }),
      status
    };
  }

  for (const action of plan.actions) {
    try {
      switch (action.type) {
        case "open_url":
          break;
        case "fill_field":
          if (!action.target) {
            return createExecutionFailure(plan, actionLog, action.id, "Fill action is missing a target field.");
          }
          await controller.fillField(action.target, action.value ?? "");
          actionLog = recordBrowserAction(actionLog, plan, action.id, "done", `Filled ${action.target}.`);
          break;
        case "upload_file":
          if (!action.target) {
            return createExecutionFailure(plan, actionLog, action.id, "Upload action is missing a target field.");
          }
          if (!action.value?.toLowerCase().endsWith(".docx")) {
            return createExecutionFailure(plan, actionLog, action.id, "Upload action did not point to a DOCX CV artifact.");
          }
          await controller.uploadFile(action.target, action.value);
          actionLog = recordBrowserAction(actionLog, plan, action.id, "done", `Uploaded ${action.value}.`);
          break;
        case "pause":
          actionLog = recordBrowserAction(actionLog, plan, action.id, "paused", action.value ?? "Paused before submit.");
          return {
            actionLog,
            preflight,
            receipt: createApplicationReceipt({
              actionLog,
              confirmationText: "Paused before submit by ApplyCue policy.",
              confirmationUrl: snapshot.finalUrl ?? plan.url,
              plan,
              status: "paused"
            }),
            status: "paused"
          };
        case "submit":
          if (!plan.canSubmit) {
            return createExecutionFailure(plan, actionLog, action.id, "Plan policy does not allow submit.");
          }
          await controller.submit();
          actionLog = recordBrowserAction(actionLog, plan, action.id, "done", "Submitted in browser.");
          break;
        case "capture_receipt": {
          const captured = await controller.captureReceipt?.();
          actionLog = recordBrowserAction(actionLog, plan, action.id, "done", "Captured browser confirmation.");
          return {
            actionLog,
            preflight,
            receipt: createApplicationReceipt({
              actionLog,
              confirmationText: captured?.confirmationText ?? "Application submitted; browser receipt captured.",
              confirmationUrl: captured?.confirmationUrl ?? snapshot.finalUrl ?? plan.url,
              plan,
              status: "submitted"
            }),
            status: "submitted"
          };
        }
      }
    } catch (error) {
      return createExecutionFailure(
        plan,
        actionLog,
        action.id,
        `Browser action failed (${action.type}): ${errorMessage(error)}`
      );
    }
  }

  return createExecutionFailure(plan, actionLog, `${plan.id}-missing-terminal-action`, "Plan ended without pause or receipt capture.");
}

export function preflightBrowserApplyPlan(input: BrowserApplyPreflightInput): BrowserApplyPreflightResult {
  const livenessInput = {
    applyControls: input.applyControls ?? (hasSubmitOrApplyAction(input.plan) ? ["Apply now", "Submit application"] : []),
    finalUrl: input.finalUrl ?? input.plan.url
  } as {
    applyControls: string[];
    finalUrl: string;
    pageText?: string;
    title?: string;
  };
  if (input.pageText) livenessInput.pageText = input.pageText;
  if (input.title) livenessInput.title = input.title;
  const liveness = classifyJobLivenessFromText(livenessInput);
  const answeredTargets = new Set(
    input.plan.actions
      .filter((action) => action.type === "fill_field" || action.type === "upload_file")
      .flatMap((action) => [action.target ?? "", ...(action.targetAliases ?? [])])
      .map((target) => normalizeFieldKey(target))
      .filter(Boolean)
  );
  const fields = input.fields ?? [];
  const sensitiveFields = fields.filter((field) =>
    isSensitiveField(field) &&
    isRequiredOrUnknown(field) &&
    !isFieldAnsweredByPlan(field, answeredTargets)
  );
  const missingRequiredFields = fields.filter((field) =>
    isRequiredOrUnknown(field) &&
    !isSensitiveField(field) &&
    !isFieldAnsweredByPlan(field, answeredTargets)
  );
  const reasons: string[] = [];

  if (liveness.liveState === "closed") {
    reasons.push(`Posting appears closed: ${liveness.reason}`);
  } else if (liveness.liveState === "unknown") {
    reasons.push(`Posting liveness is unclear: ${liveness.reason}`);
  }

  const mismatchInput: BrowserApplyPreflightInput = { ...input };
  const expectedCompany = input.expectedCompany ?? input.plan.company;
  const expectedRole = input.expectedRole ?? input.plan.roleTitle;
  if (expectedCompany) mismatchInput.expectedCompany = expectedCompany;
  if (expectedRole) mismatchInput.expectedRole = expectedRole;
  reasons.push(...detectCompanyRoleMismatches(mismatchInput));
  if (sensitiveFields.length > 0) {
    reasons.push(`Sensitive required field(s) need user confirmation: ${formatFields(sensitiveFields)}.`);
  }
  if (missingRequiredFields.length > 0) {
    reasons.push(`Required field(s) are not answered by the current plan: ${formatFields(missingRequiredFields)}.`);
  }

  const status: BrowserApplyPreflightStatus = liveness.liveState === "closed"
    ? "fail"
    : reasons.length > 0
      ? "pause"
      : "pass";

  return {
    liveness,
    missingRequiredFields,
    reasons,
    sensitiveFields,
    status
  };
}

export function preflightBrowserApplyPlanFromSnapshot(
  plan: BrowserApplyPlan,
  snapshot: BrowserPageSnapshot,
  overrides: {
    expectedCompany?: string;
    expectedRole?: string;
  } = {}
): BrowserApplyPreflightResult {
  const input: BrowserApplyPreflightInput = {
    fields: snapshot.fields ?? snapshot.forms?.flatMap((form) => form.fields) ?? [],
    plan
  };
  if (snapshot.applyControls) input.applyControls = snapshot.applyControls;
  if (overrides.expectedCompany) input.expectedCompany = overrides.expectedCompany;
  if (overrides.expectedRole) input.expectedRole = overrides.expectedRole;
  if (snapshot.finalUrl) input.finalUrl = snapshot.finalUrl;
  if (snapshot.pageText) input.pageText = snapshot.pageText;
  if (snapshot.title) input.title = snapshot.title;
  if (snapshot.visibleCompany) input.visibleCompany = snapshot.visibleCompany;
  if (snapshot.visibleRole) input.visibleRole = snapshot.visibleRole;
  return preflightBrowserApplyPlan(input);
}

export function formatBrowserApplyPreflight(result: BrowserApplyPreflightResult): string {
  const lines = [
    `Browser apply preflight: ${result.status.toUpperCase()}`,
    `Liveness: ${result.liveness.liveState} (${result.liveness.code}) - ${result.liveness.reason}`
  ];
  if (result.sensitiveFields.length > 0) {
    lines.push(`Sensitive fields needing user confirmation: ${formatFields(result.sensitiveFields)}.`);
  }
  if (result.missingRequiredFields.length > 0) {
    lines.push(`Missing required fields: ${formatFields(result.missingRequiredFields)}.`);
  }
  if (result.reasons.length > 0) {
    lines.push("Reasons:", ...result.reasons.map((reason) => `- ${reason}`));
  } else {
    lines.push("No preflight blockers found.");
  }
  return lines.join("\n");
}

function createDryRunFailure(
  plan: BrowserApplyPlan,
  actionLog: BrowserActionLogEntry[],
  actionId: string,
  note: string
): BrowserPlanDryRunResult {
  const nextLog = plan.actions.some((action) => action.id === actionId)
    ? recordBrowserAction(actionLog, plan, actionId, "failed", note)
    : actionLog;
  return {
    actionLog: nextLog,
    preflight: {
      liveness: {
        code: "local_dry_run_failure",
        liveState: "unknown",
        reason: note
      },
      missingRequiredFields: [],
      reasons: [note],
      sensitiveFields: [],
      status: "fail"
    },
    receipt: createApplicationReceipt({
      actionLog: nextLog,
      confirmationText: note,
      confirmationUrl: plan.url,
      plan,
      status: "failed"
    }),
    status: "failed"
  };
}

function createExecutionFailure(
  plan: BrowserApplyPlan,
  actionLog: BrowserActionLogEntry[],
  actionId: string,
  note: string
): BrowserPlanExecutionResult {
  const nextLog = plan.actions.some((action) => action.id === actionId)
    ? recordBrowserAction(actionLog, plan, actionId, "failed", note)
    : actionLog;
  return {
    actionLog: nextLog,
    preflight: {
      liveness: {
        code: "browser_execution_failure",
        liveState: "unknown",
        reason: note
      },
      missingRequiredFields: [],
      reasons: [note],
      sensitiveFields: [],
      status: "fail"
    },
    receipt: createApplicationReceipt({
      actionLog: nextLog,
      confirmationText: note,
      confirmationUrl: plan.url,
      plan,
      status: "failed"
    }),
    status: "failed"
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function legacyFixtureFields(fixture: LocalApplyFormFixture): BrowserApplyFormField[] {
  return [
    ...fixture.fields.map((field) => ({
      label: field,
      name: field,
      required: true as const,
      type: "text" as const
    })),
    ...fixture.uploadTargets.map((field) => ({
      label: field,
      name: field,
      required: true as const,
      type: "file" as const
    }))
  ];
}

function hasSubmitOrApplyAction(plan: BrowserApplyPlan): boolean {
  return plan.actions.some((action) => action.type === "submit" || action.type === "pause");
}

function isRequiredOrUnknown(field: BrowserApplyFormField): boolean {
  return field.required === true || field.required === "unknown";
}

function isSensitiveField(field: BrowserApplyFormField): boolean {
  const text = `${field.name} ${field.label} ${(field.options ?? []).join(" ")}`;
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(text));
}

function isFieldAnsweredByPlan(field: BrowserApplyFormField, answeredTargets: Set<string>): boolean {
  const keys = [field.name, field.label, field.id ?? ""].map(normalizeFieldKey).filter(Boolean);
  if (keys.some((key) => answeredTargets.has(key))) return true;
  if (keys.some((key) => [...answeredTargets].some((target) => fieldKeyMatchesAnswerTarget(key, target)))) return true;
  if (field.type === "file" && answeredTargets.has("resumeorcv")) {
    return /resume|cv|curriculum|coverletter|coverletter|attachment|document/i.test(`${field.name} ${field.label} ${field.id ?? ""}`);
  }
  return false;
}

function fieldKeyMatchesAnswerTarget(fieldKey: string, answerTarget: string): boolean {
  if (!fieldKey || !answerTarget || answerTarget.length < 8 || GENERIC_FIELD_KEYS.has(answerTarget)) return false;
  return fieldKey.includes(answerTarget) || answerTarget.includes(fieldKey);
}

const GENERIC_FIELD_KEYS = new Set([
  "name",
  "fullname",
  "email",
  "phone",
  "mobile",
  "country",
  "location",
  "resume",
  "cv",
  "resumeorcv",
  "attachment",
  "document"
]);

function fieldSelectorForTarget(target: string): string {
  const value = cssAttributeValue(target);
  const normalized = normalizeFieldKey(target);
  const selectors = [
    `[name="${value}"]`,
    `[id="${value}"]`,
    `[aria-label="${value}"]`,
    `[placeholder="${value}"]`
  ];
  if (!GENERIC_FIELD_KEYS.has(normalized)) addLabeledFieldSelectors(selectors, target);
  if (normalized === "name" || normalized === "fullname") {
    selectors.push(
      'input[autocomplete="name"]',
      'input[name="full_name" i]',
      'input[id="full_name" i]',
      'input[aria-label="Full name" i]',
      'textarea[aria-label="Full name" i]'
    );
  }
  if (normalized === "firstname" || normalized === "givenname") {
    selectors.push(
      'input[autocomplete="given-name"]',
      'input[name*="first" i]',
      'input[id*="first" i]',
      'input[aria-label*="first" i]'
    );
  }
  if (normalized === "lastname" || normalized === "familyname" || normalized === "surname") {
    selectors.push(
      'input[autocomplete="family-name"]',
      'input[name*="last" i]',
      'input[id*="last" i]',
      'input[aria-label*="last" i]'
    );
  }
  if (normalized === "email") {
    selectors.push('input[type="email"]', 'input[autocomplete="email"]', 'input[name*="email" i]');
  }
  if (normalized === "phone") {
    selectors.push('input[type="tel"]', 'input[autocomplete="tel"]', 'input[name*="phone" i]', 'input[name*="mobile" i]');
  }
  if (normalized === "country") {
    selectors.push(
      'select[name*="country" i]',
      'input[name*="country" i]',
      'select[id*="country" i]',
      'input[id*="country" i]',
      'select[aria-label*="country" i]',
      'input[aria-label*="country" i]'
    );
  }
  if (normalized === "noticeperiod" || normalized === "availabilitytojoin" || normalized === "joiningdate") {
    selectors.push(
      'input[name*="notice" i]',
      'textarea[name*="notice" i]',
      'select[name*="notice" i]',
      'input[id*="notice" i]',
      'textarea[id*="notice" i]',
      'select[id*="notice" i]',
      'input[aria-label*="notice" i]',
      'textarea[aria-label*="notice" i]'
    );
    addLabeledFieldSelectors(selectors, "notice period");
    addLabeledFieldSelectors(selectors, "When can you join?");
  }
  if (
    normalized === "expectedsalary" ||
    normalized === "desiredsalary" ||
    normalized === "expectedcompensation" ||
    normalized === "desiredcompensation"
  ) {
    selectors.push(
      'input[name*="expected" i]',
      'textarea[name*="expected" i]',
      'select[name*="expected" i]',
      'input[id*="expected" i]',
      'textarea[id*="expected" i]',
      'select[id*="expected" i]',
      'input[aria-label*="expected" i]',
      'textarea[aria-label*="expected" i]',
      'input[name*="desired" i]',
      'textarea[name*="desired" i]',
      'select[name*="desired" i]',
      'input[id*="desired" i]',
      'textarea[id*="desired" i]',
      'select[id*="desired" i]',
      'input[aria-label*="desired" i]',
      'textarea[aria-label*="desired" i]'
    );
    addLabeledFieldSelectors(selectors, "expected salary");
    addLabeledFieldSelectors(selectors, "desired salary");
    addLabeledFieldSelectors(selectors, "expected compensation");
    addLabeledFieldSelectors(selectors, "desired compensation");
  }
  if (normalized === "currentsalary" || normalized === "currentcompensation" || normalized === "currentctc") {
    selectors.push(
      'input[name*="current" i]',
      'textarea[name*="current" i]',
      'select[name*="current" i]',
      'input[id*="current" i]',
      'textarea[id*="current" i]',
      'select[id*="current" i]',
      'input[aria-label*="current" i]',
      'textarea[aria-label*="current" i]'
    );
    addLabeledFieldSelectors(selectors, "current salary");
    addLabeledFieldSelectors(selectors, "current compensation");
    addLabeledFieldSelectors(selectors, "current CTC");
  }
  return selectors.join(", ");
}

function addLabeledFieldSelectors(selectors: string[], labelText: string): void {
  const label = playwrightTextValue(labelText);
  if (!label) return;
  selectors.push(
    `label:has-text("${label}") input`,
    `label:has-text("${label}") textarea`,
    `label:has-text("${label}") select`,
    `label:has-text("${label}") + input`,
    `label:has-text("${label}") + textarea`,
    `label:has-text("${label}") + select`,
    `label:has-text("${label}") ~ input`,
    `label:has-text("${label}") ~ textarea`,
    `label:has-text("${label}") ~ select`
  );
}

function fileSelectorForTarget(target: string): string {
  const value = cssAttributeValue(target);
  const normalized = normalizeFieldKey(target);
  const selectors = [
    `input[type="file"][name="${value}"]`,
    `input[type="file"][id="${value}"]`,
    `input[type="file"][aria-label="${value}"]`
  ];
  if (normalized === "resumeorcv" || normalized === "resume" || normalized === "cv") {
    selectors.push(
      'input[type="file"][name*="resume" i]',
      'input[type="file"][name*="cv" i]',
      'input[type="file"][aria-label*="resume" i]',
      'input[type="file"][aria-label*="cv" i]',
      'input[type="file"]'
    );
  }
  return selectors.join(", ");
}

function submitSelector(): string {
  return [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit application")',
    'button:has-text("Submit")',
    'button:has-text("Apply")',
    'a:has-text("Submit application")',
    'a:has-text("Apply")'
  ].join(", ");
}

function cssAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function playwrightTextValue(value: string): string {
  return value.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function firstMeaningfulLine(value: string | undefined): string | undefined {
  return value
    ?.split(/\r?\n|(?<=\.)\s+/)
    .map((line) => line.trim())
    .find((line) => line.length >= 12)
    ?.slice(0, 500);
}

function detectCompanyRoleMismatches(input: BrowserApplyPreflightInput): string[] {
  const mismatches: string[] = [];
  const expectedCompany = normalizeText(input.expectedCompany);
  const visibleCompany = normalizeText(input.visibleCompany);
  if (expectedCompany && visibleCompany && !hasMeaningfulOverlap(expectedCompany, visibleCompany)) {
    mismatches.push(`Visible company "${input.visibleCompany}" does not match expected company "${input.expectedCompany}".`);
  }

  const expectedRole = normalizeText(input.expectedRole);
  const visibleRole = normalizeText(input.visibleRole);
  if (expectedRole && visibleRole && !hasMeaningfulOverlap(expectedRole, visibleRole) && !hasStrongerRoleMatch(input)) {
    mismatches.push(`Visible role "${input.visibleRole}" does not match expected role "${input.expectedRole}".`);
  }

  return mismatches;
}

function hasStrongerRoleMatch(input: BrowserApplyPreflightInput): boolean {
  const expectedRole = normalizeText(input.expectedRole);
  if (!expectedRole) return false;
  return roleEvidenceSignals(input)
    .map(normalizeText)
    .some((signal) => signal && hasMeaningfulOverlap(expectedRole, signal));
}

function roleEvidenceSignals(input: BrowserApplyPreflightInput): string[] {
  return [
    input.title ?? "",
    firstTextWindow(input.pageText)
  ];
}

function hasMeaningfulOverlap(left: string, right: string): boolean {
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const leftTokens = new Set(tokenizeComparableText(left));
  const rightTokens = tokenizeComparableText(right);
  if (leftTokens.size === 0 || rightTokens.length === 0) return false;
  return rightTokens.some((token) => leftTokens.has(token));
}

function tokenizeComparableText(value: string): string[] {
  const stopWords = new Set(["and", "the", "for", "of", "at", "in", "to", "a", "an", "role", "job"]);
  return value
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function formatFields(fields: BrowserApplyFormField[]): string {
  return fields.slice(0, 5).map((field) => field.label || field.name).join(", ");
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeFieldKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeText(value: string | undefined): string {
  return value?.toLowerCase().replace(/\s+/g, " ").trim() ?? "";
}

function firstTextWindow(value: string | undefined): string {
  return value?.replace(/\s+/g, " ").trim().slice(0, 900) ?? "";
}
