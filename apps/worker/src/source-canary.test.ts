import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runSourceCanary } from "./source-canary.js";

describe("runSourceCanary", () => {
  it("reports healthy, empty, failed, skipped, and interactive-excluded sources independently", async () => {
    const configPath = await writeConfig({
      companyPages: [
        {
          id: "greenhouse-example",
          company: "Greenhouse Example",
          provider: "greenhouse",
          careersUrl: "https://job-boards.greenhouse.io/example"
        }
      ],
      jobBoards: [
        { id: "jobspy-product", label: "JobSpy product", provider: "jobspy", query: "product" },
        { id: "remotive-product", label: "Remotive product", provider: "remotive", query: "product" },
        { id: "themuse-empty", label: "The Muse empty", provider: "themuse", query: "product" },
        { id: "remoteok-broken", label: "RemoteOK broken", provider: "remoteok", query: "product" }
      ],
      loggedInBrowserSources: [
        { id: "linkedin", label: "LinkedIn", enabled: true }
      ],
      searches: [
        { id: "reverse-ats", label: "Reverse ATS", provider: "ats_directory", enabled: true }
      ]
    });

    const report = await runSourceCanary({
      configPath,
      generatedAt: "2026-07-10T12:00:00.000Z",
      includeJobSpy: true,
      writeFiles: false,
      companyPageFetchJson: async (url) => {
        expect(url).toBe("https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true");
        return {
          jobs: [
            {
              title: "Head of Product",
              absolute_url: "https://job-boards.greenhouse.io/example/jobs/123",
              location: { name: "Remote India" },
              content: "Lead product strategy.",
              updated_at: "2026-07-09T00:00:00.000Z"
            }
          ]
        };
      },
      jobSpyRunner: async () => [
        {
          site: "indeed",
          title: "Director Product",
          company: "JobSpy Co",
          job_url: "https://example.org/jobspy-product",
          location: "India",
          description: "Own product strategy.",
          date_posted: "2026-07-09"
        }
      ],
      jobBoardFetchJson: async (url) => {
        if (url.includes("remotive.com")) {
          return {
            jobs: [
              {
                id: 1,
                url: "https://remotive.com/remote-jobs/product/example-1",
                title: "Product Lead",
                company_name: "Remotive Co",
                candidate_required_location: "Worldwide",
                description: "Lead product delivery."
              }
            ]
          };
        }
        if (url.includes("themuse.com")) return { page_count: 0, results: [] };
        if (url.includes("remoteok.com")) throw new Error("HTTP 503");
        throw new Error(`Unexpected URL: ${url}`);
      }
    });

    expect(report.status).toBe("fail");
    expect(report.counts).toMatchObject({
      configuredPublicSources: 6,
      excludedInteractiveSources: 1,
      failed: 1,
      healthy: 3,
      parsedPublicSources: 6,
      skipped: 1,
      unparsedPublicSources: 0,
      warned: 1
    });
    expect(report.sources.find((source) => source.id === "greenhouse-example")?.status).toBe("pass");
    expect(report.sources.find((source) => source.id === "jobspy-product")?.status).toBe("pass");
    expect(report.sources.find((source) => source.id === "remotive-product")?.status).toBe("pass");
    expect(report.sources.find((source) => source.id === "themuse-empty")?.status).toBe("warn");
    expect(report.sources.find((source) => source.id === "remoteok-broken")?.reason).toContain("HTTP 503");
    expect(report.sources.find((source) => source.id === "reverse-ats")?.reason).toContain("fan out");
  });

  it("proves the JobHive ATS directory runs when explicitly included", async () => {
    const configPath = await writeConfig({
      searches: [
        {
          id: "reverse-ats",
          label: "JobHive ATS directory",
          provider: "ats_directory",
          enabled: true,
          options: { providers: ["greenhouse"], limitPerProvider: 1, batchSize: 1, sample: "prefix" }
        }
      ]
    });

    const report = await runSourceCanary({
      configPath,
      generatedAt: "2026-07-10T12:00:00.000Z",
      includeAtsDirectory: true,
      writeFiles: false,
      atsDirectoryFetchText: async (url) => {
        expect(url).toBe("https://storage.stapply.ai/jobhive/v1/greenhouse/companies.csv");
        return "name,slug,url\nReverse Example,reverse-example,https://job-boards.greenhouse.io/reverse-example\n";
      },
      atsDirectoryFetchJson: async (url) => {
        if (url === "https://boards-api.greenhouse.io/v1/boards/reverse-example/jobs?content=true") {
          return {
            jobs: [
              {
                title: "VP Product",
                absolute_url: "https://job-boards.greenhouse.io/reverse-example/jobs/1",
                location: { name: "Remote" },
                content: "Lead product."
              }
            ]
          };
        }
        throw new Error(`Unexpected URL: ${url}`);
      }
    });

    expect(report.status).toBe("pass");
    expect(report.sources).toHaveLength(1);
    expect(report.sources[0]).toMatchObject({
      fetchedJobs: 1,
      provider: "ats_directory",
      status: "pass"
    });
  });

  it("writes timestamped and latest JSON and Markdown evidence", async () => {
    const configPath = await writeConfig({
      jobBoards: [
        { id: "remotive-product", label: "Remotive product", provider: "remotive", query: "product" }
      ]
    });
    const report = await runSourceCanary({
      configPath,
      generatedAt: "2026-07-10T12:00:00.000Z",
      jobBoardFetchJson: async () => ({
        jobs: [
          {
            id: 1,
            url: "https://remotive.com/remote-jobs/product/example-1",
            title: "Product Lead",
            company_name: "Remotive Co",
            candidate_required_location: "Worldwide",
            description: "Lead product delivery."
          }
        ]
      })
    });

    expect(JSON.parse(await readFile(report.paths.jsonReport, "utf8"))).toMatchObject({ status: "pass" });
    expect(JSON.parse(await readFile(report.paths.latestJson, "utf8"))).toMatchObject({ id: report.id });
    expect(await readFile(report.paths.markdownReport, "utf8")).toContain("# ApplyCue Source Canary");
    expect(await readFile(report.paths.latestMarkdown, "utf8")).toContain("Remotive product");
  });

  it("can probe a disabled source without changing its configured state", async () => {
    const configPath = await writeConfig({
      jobBoards: [
        { id: "disabled-remotive", label: "Disabled Remotive", provider: "remotive", query: "product", enabled: false }
      ]
    });
    const report = await runSourceCanary({
      configPath,
      generatedAt: "2026-07-10T12:00:00.000Z",
      includeDisabled: true,
      writeFiles: false,
      jobBoardFetchJson: async () => ({
        jobs: [
          {
            id: 1,
            url: "https://remotive.com/remote-jobs/product/example-1",
            title: "Product Lead",
            company_name: "Remotive Co",
            candidate_required_location: "Worldwide",
            description: "Lead product delivery."
          }
        ]
      })
    });

    expect(report.status).toBe("pass");
    expect(report.sources[0]).toMatchObject({ enabled: false, fetchedJobs: 1, status: "pass" });
    expect(report.notes).toContain(
      "Disabled configured sources were probed for health only; their saved enabled state was not changed."
    );
  });
});

async function writeConfig(sources: Record<string, unknown>): Promise<string> {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "applycue-source-canary-"));
  const configPath = path.join(profileDir, "applycue.json");
  await writeFile(configPath, JSON.stringify({
    profile: { id: "canary-profile", name: "Canary Profile" },
    preferences: { targetRoleTerms: ["product"], acceptableWorkModes: ["remote"] },
    searchSettings: { freshnessDays: 30 },
    sources
  }), "utf8");
  return configPath;
}
