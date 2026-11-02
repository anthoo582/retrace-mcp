#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSystemTools } from "./tools/system.js";
import { registerRomTools } from "./tools/rom.js";
import { registerElfTools } from "./tools/elf.js";
import { registerMipsTools } from "./tools/mips.js";
import { registerRepoTools } from "./tools/repo.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerGraphicsTools } from "./tools/graphics.js";
import { registerAudioTools } from "./tools/audio.js";
import { registerDecompTools } from "./tools/decomp.js";
import { registerGraphTools } from "./tools/graph.js";
import { registerReportTools } from "./tools/report.js";
import { registerBuildTools } from "./tools/build.js";
import { registerCompareTools } from "./tools/compare.js";
import { registerPortTools } from "./tools/port.js";
import { registerIntakeTools } from "./tools/intake.js";
import { registerAutomationTools } from "./tools/automation.js";
import { registerAutopilotTools } from "./tools/autopilot.js";
import { registerVariableTools } from "./tools/variables.js";
import { registerPipelineTools } from "./tools/pipeline.js";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { VERSION } from "./version.js";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "retrace-mcp",
    version: VERSION
  });

  // Register all engineering subsystems
  registerSystemTools(server);
  registerRomTools(server);
  registerElfTools(server);
  registerMipsTools(server);
  registerRepoTools(server);
  registerMemoryTools(server);
  registerGraphicsTools(server);
  registerAudioTools(server);
  registerDecompTools(server);
  registerGraphTools(server);
  registerReportTools(server);
  registerBuildTools(server);
  registerCompareTools(server);
  registerPortTools(server);
  registerIntakeTools(server);
  registerAutomationTools(server);
  registerAutopilotTools(server);
  registerVariableTools(server);
  registerPipelineTools(server);

  const transport = new StdioServerTransport();

  process.on("SIGINT", async () => {
    logger.info("Retrace MCP shutting down on SIGINT");
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("Retrace MCP shutting down on SIGTERM");
    await server.close();
    process.exit(0);
  });

  await server.connect(transport);
  logger.info(`Retrace MCP server started on stdio (workspace: ${config.workspaceRoots.join(", ")})`);
}

main().catch((error) => {
  console.error("Fatal error starting Retrace MCP:", error);
  process.exit(1);
});

