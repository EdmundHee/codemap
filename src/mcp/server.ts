#!/usr/bin/env node
/**
 * Codemap MCP Server
 *
 * Exposes codemap data as MCP tools so Claude Code (and other MCP clients)
 * can query project structure, call graphs, and relationships on demand.
 *
 * Usage:
 *   claude mcp add codemap -- npx codemap-mcp
 *   claude mcp add codemap -- node ./dist/mcp/server.js
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { CodemapData } from '../output/json-generator';
import {
  getOverview,
  getModule,
  search,
  getCallers,
  getCalls,
  getFunction,
  getClass,
  getFile,
  getType,
} from '../core/query-engine';

// Determine project root: use env var, CLI arg, or cwd
const projectRoot = resolve(process.env.CODEMAP_ROOT || process.argv[2] || process.cwd());

function loadCodemapData(): CodemapData | null {
  const codemapPath = join(projectRoot, '.codemap', 'codemap.json');
  if (!existsSync(codemapPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(codemapPath, 'utf-8'));
  } catch {
    return null;
  }
}

async function main() {
  const server = new McpServer({
    name: 'codemap',
    version: '0.1.0',
  });

  // --- Tool: codemap_overview ---
  server.tool(
    'codemap_overview',
    'Get a high-level overview of the project: modules, frameworks, languages, file counts, and dependencies. Use this first to understand project structure.',
    {},
    async () => {
      const data = loadCodemapData();
      if (!data) {
        return {
          content: [{ type: 'text', text: 'No codemap found. Run `codemap generate` first.' }],
          isError: true,
        };
      }
      const overview = getOverview(data);
      return {
        content: [{ type: 'text', text: JSON.stringify(overview, null, 2) }],
      };
    }
  );

  // --- Tool: codemap_module ---
  server.tool(
    'codemap_module',
    'Get detailed information about a specific directory/module: its classes, functions, types, and imports.',
    { directory: z.string().describe('Directory path to query (e.g. "src/core", "backend/api")') },
    async ({ directory }) => {
      const data = loadCodemapData();
      if (!data) {
        return {
          content: [{ type: 'text', text: 'No codemap found. Run `codemap generate` first.' }],
          isError: true,
        };
      }
      const result = getModule(data, directory);
      if (!result) {
        return {
          content: [{ type: 'text', text: `Module "${directory}" not found.` }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // --- Tool: codemap_query ---
  server.tool(
    'codemap_query',
    'Search for a function, class, method, type, or file by name. Returns matching entries with their details.',
    { name: z.string().describe('Name to search for (partial matching supported)') },
    async ({ name }) => {
      const data = loadCodemapData();
      if (!data) {
        return {
          content: [{ type: 'text', text: 'No codemap found. Run `codemap generate` first.' }],
          isError: true,
        };
      }

      // First try exact lookups, then fall back to search
      const funcResult = getFunction(data, name);
      if (funcResult) {
        return {
          content: [{ type: 'text', text: JSON.stringify(funcResult, null, 2) }],
        };
      }

      const clsResult = getClass(data, name);
      if (clsResult) {
        return {
          content: [{ type: 'text', text: JSON.stringify(clsResult, null, 2) }],
        };
      }

      const typeResult = getType(data, name);
      if (typeResult) {
        return {
          content: [{ type: 'text', text: JSON.stringify(typeResult, null, 2) }],
        };
      }

      const fileResult = getFile(data, name);
      if (fileResult) {
        return {
          content: [{ type: 'text', text: JSON.stringify(fileResult, null, 2) }],
        };
      }

      // Fall back to fuzzy search
      const results = search(data, name);
      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: `No results found for "${name}".` }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(
            results.map((r) => ({ type: r.type, name: r.name, file: r.file })),
            null,
            2
          ),
        }],
      };
    }
  );

  // --- Tool: codemap_callers ---
  server.tool(
    'codemap_callers',
    'Find all functions/methods that call a given function. Useful for understanding impact before modifying code.',
    { name: z.string().describe('Function or method name (e.g. "createOrder", "UserService.validate")') },
    async ({ name }) => {
      const data = loadCodemapData();
      if (!data) {
        return {
          content: [{ type: 'text', text: 'No codemap found. Run `codemap generate` first.' }],
          isError: true,
        };
      }
      const result = getCallers(data, name);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // --- Tool: codemap_calls ---
  server.tool(
    'codemap_calls',
    'Find all functions/methods that a given function calls. Useful for understanding dependencies before refactoring.',
    { name: z.string().describe('Function or method name (e.g. "createOrder", "UserService.validate")') },
    async ({ name }) => {
      const data = loadCodemapData();
      if (!data) {
        return {
          content: [{ type: 'text', text: 'No codemap found. Run `codemap generate` first.' }],
          isError: true,
        };
      }
      const result = getCalls(data, name);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`Codemap MCP server error: ${error.message}\n`);
  process.exit(1);
});
