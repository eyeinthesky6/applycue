import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = process.cwd();

describe("agent instruction discovery", () => {
  it("routes Codex, Claude, and OpenCode through the same repo bootloader", async () => {
    const agents = await readFile(path.join(workspaceRoot, "AGENTS.md"), "utf8");
    expect(agents).toContain("skills/applycue/SKILL.md");
    expect(agents).toContain("docs/PRODUCT_DECISION.md");

    for (const fileName of ["CLAUDE.md", "CODEX.md", "OPENCODE.md"]) {
      const wrapper = await readFile(path.join(workspaceRoot, fileName), "utf8");
      expect(wrapper, fileName).toContain("@AGENTS.md");
    }
  });

  it("keeps supported agent bridges thin and pointed at the canonical skill", async () => {
    const bridgePaths = [
      ".agents/skills/applycue/SKILL.md",
      ".claude/skills/applycue/SKILL.md",
      ".opencode/skills/applycue/SKILL.md",
      ".qwen/skills/applycue/SKILL.md",
      ".grok/skills/applycue/SKILL.md",
      ".kimi/skills/applycue/SKILL.md",
      ".antigravitycli/skills/applycue/SKILL.md"
    ];

    for (const bridgePath of bridgePaths) {
      const bridge = await readFile(path.join(workspaceRoot, bridgePath), "utf8");
      expect(bridge, bridgePath).toContain("skills/applycue/SKILL.md");
      expect(bridge.split(/\r?\n/).length, bridgePath).toBeLessThan(25);
    }
  });
});
