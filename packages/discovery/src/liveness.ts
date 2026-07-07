import type { JobLiveState, JobRecord } from "@applycue/core";

export interface LivenessTextInput {
  applyControls?: string[];
  bodyText?: string;
  description?: string;
  finalUrl?: string;
  pageText?: string;
  status?: number;
  title?: string;
}

export interface JobLivenessVerification {
  code: string;
  liveState: JobLiveState;
  reason: string;
}

export type JobLivenessVerifier = (
  job: JobRecord
) => JobLiveState | JobLivenessVerification | undefined | Promise<JobLiveState | JobLivenessVerification | undefined>;

export type JobLivenessPageFetcher = (
  job: JobRecord
) => Promise<string | LivenessTextInput | undefined> | string | LivenessTextInput | undefined;

const HARD_CLOSED_PATTERNS = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i,
  /applications?\s+(?:(?:have|are|is)\s+)?closed/i,
  /closed on \d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  /closed on (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/i,
  /application deadline has passed/i,
  /not accepting applications/i,
  /diese stelle (ist )?(nicht mehr|bereits) besetzt/i,
  /offre (expirée|n'est plus disponible)/i
];

const LISTING_PAGE_PATTERNS = [
  /\d+\s+jobs?\s+found/i,
  /search for jobs page is loaded/i
];

const BOT_CHALLENGE_PATTERNS = [
  /just a moment/i,
  /performing security verification/i,
  /checking your browser before/i,
  /verify you are (a |not a )?human/i,
  /enable javascript and cookies to continue/i,
  /attention required.*cloudflare/i,
  /\bray id\b/i,
  /\bcf-ray\b/i,
  /please complete the security check/i
];

const CLOSED_URL_PATTERNS = [
  /[?&]error=true/i
];

const APPLY_PATTERNS = [
  /\bapply\b/i,
  /\bsolicitar\b/i,
  /\bbewerben\b/i,
  /\bpostuler\b/i,
  /submit application/i,
  /easy apply/i,
  /start application/i,
  /ich bewerbe mich/i,
  /\baplikuj\b/i,
  /panelu aplikowania/i,
  /wyślij (cv|aplikacj)/i
];

const MIN_PAGE_TEXT_CHARS = 300;

export function classifyJobLivenessFromText(input: LivenessTextInput): JobLivenessVerification {
  if (input.status === 404 || input.status === 410) {
    return {
      code: "http_gone",
      liveState: "closed",
      reason: `HTTP ${input.status}`
    };
  }

  const pageText = normalizeWhitespace(input.pageText ?? input.bodyText ?? "");
  const combinedText = normalizeWhitespace([input.title, input.description, pageText].filter(Boolean).join(" "));

  const botChallenge = firstMatch(BOT_CHALLENGE_PATTERNS, pageText);
  if (botChallenge) {
    return {
      code: "bot_challenge",
      liveState: "unknown",
      reason: `Anti-bot challenge matched: ${botChallenge.source}`
    };
  }

  if (input.status === 403 || input.status === 503) {
    return {
      code: "access_blocked",
      liveState: "unknown",
      reason: `HTTP ${input.status} access blocked`
    };
  }

  const closedUrl = firstMatch(CLOSED_URL_PATTERNS, input.finalUrl ?? "");
  if (closedUrl) {
    return {
      code: "closed_url",
      liveState: "closed",
      reason: `Final URL matched: ${closedUrl.source}`
    };
  }

  const closedText = firstMatch(HARD_CLOSED_PATTERNS, combinedText);
  if (closedText) {
    return {
      code: "closed_text",
      liveState: "closed",
      reason: `Text matched: ${closedText.source}`
    };
  }

  if (hasApplyControl([...(input.applyControls ?? []), pageText])) {
    return {
      code: "apply_control",
      liveState: "live",
      reason: "Apply control is visible and no closed signal was found."
    };
  }

  const listingPage = firstMatch(LISTING_PAGE_PATTERNS, pageText);
  if (listingPage) {
    return {
      code: "listing_page",
      liveState: "closed",
      reason: `Job URL appears to have landed on a listing page: ${listingPage.source}`
    };
  }

  if ((input.pageText !== undefined || input.bodyText !== undefined) && pageText.length < MIN_PAGE_TEXT_CHARS) {
    return {
      code: "insufficient_page_text",
      liveState: "closed",
      reason: "Verified page text is too short to be a usable job posting."
    };
  }

  return {
    code: "unknown",
    liveState: "unknown",
    reason: "No reliable live or closed signal found."
  };
}

export function createTextLivenessVerifier(fetchPage: JobLivenessPageFetcher): JobLivenessVerifier {
  return async (job) => {
    const page = await fetchPage(job);
    if (page === undefined) return undefined;
    const input = typeof page === "string" ? { pageText: page } : page;
    return classifyJobLivenessFromText({
      title: job.title,
      description: job.description,
      ...input
    });
  };
}

export function getVerifiedLiveState(
  verification: JobLiveState | JobLivenessVerification | undefined
): JobLiveState | undefined {
  if (!verification) return undefined;
  if (verification === "live" || verification === "closed" || verification === "unknown") return verification;
  return verification.liveState;
}

function firstMatch(patterns: RegExp[], text: string): RegExp | undefined {
  return patterns.find((pattern) => pattern.test(text));
}

function hasApplyControl(values: string[]): boolean {
  return values.some((value) => APPLY_PATTERNS.some((pattern) => pattern.test(value)));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
