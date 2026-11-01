import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerTool } from "./helpers.js";
import { buildRepoIndex, searchCode, findDependencies, fileHistory } from "../repo/intel.js";
import { config } from "../config.js";
import { ok } from "../core/evidence.js";

export function registerRepoTools(server: McpServer): void {
  registerTool(
    server,
    "repo_inspect",
    "Inspect the workspace repository: file tree, detected languages, build tools, binary assets and architecture summary.",
    {
      root: z.string().optional().describe("Root directory to scan (default workspace root)"),
      maxFiles: z.number().optional().describe("Max files to scan (default 5000)")
    },
    async ({ root, maxFiles }) => {
      const scanRoot = root ?? config.workspaceRoots[0] ?? ".";
      const index = await buildRepoIndex(scanRoot, { maxFiles });
      return ok({
        root: index.root,
        fileCount: index.fileCount,
        totalBytes: index.totalBytes,
        languages: index.languages,
        buildSystems: index.buildSystems,
        binaries: index.binaries,
        configFiles: index.configFiles
      });
    }
  );

  registerTool(
    server,
    "repo_search_code",
    "Search repository code files for symbol names, function signatures, or string patterns.",
    {
      query: z.string().describe("Search text or regex pattern"),
      root: z.string().optional().describe("Root directory to search (default workspace root)"),
      maxResults: z.number().optional().describe("Max results (default 50)")
    },
    async ({ query, root, maxResults }) => {
      const searchRoot = root ?? config.workspaceRoots[0] ?? ".";
      const result = await searchCode(searchRoot, query, { maxResults });
      return ok({ query, count: result.hits.length, hits: result.hits, truncated: result.truncated });
    }
  );

  registerTool(
    server,
    "repo_find_dependencies",
    "Analyze dependencies declared in build files (Make, CMake, Cargo, npm) in the repository.",
    {
      root: z.string().optional().describe("Root directory (default workspace root)")
    },
    async ({ root }) => {
      const targetRoot = root ?? config.workspaceRoots[0] ?? ".";
      const deps = await findDependencies(targetRoot);
      return ok({ root: targetRoot, dependencies: deps.sources });
    }
  );

  registerTool(
    server,
    "repo_get_file_history",
    "Get git commit history for a file in the repository.",
    {
      path: z.string().describe("Relative path to file in workspace"),
      maxCommits: z.number().optional().describe("Max commits to retrieve (default 20)")
    },
    async ({ path: filePath, maxCommits }) => {
      const targetRoot = config.workspaceRoots[0] ?? ".";
      const history = await fileHistory(targetRoot, filePath, maxCommits ?? 20);
      return ok({ file: filePath, commits: history.commits, available: history.available });
    }
  );
}
