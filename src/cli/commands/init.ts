import { Command } from 'commander';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { Logger } from '../../utils/logger';
import { DEFAULT_CONFIG, detectIncludeDirs } from '../../core/config';

const CLAUDE_MD_SECTION_START = '<!-- codemap:start -->';
const CLAUDE_MD_SECTION_END = '<!-- codemap:end -->';

const CLAUDE_MD_CONTENT = `${CLAUDE_MD_SECTION_START}
## Codemap

This project uses **codemap** for static analysis. A codemap MCP server is available
that provides pre-indexed project structure, call graphs, and relationships.

**Always prefer codemap MCP tools over grep/read for code exploration:**

- \`codemap_overview\` — project summary: modules, frameworks, languages, file counts
- \`codemap_module\` — all classes, functions, imports for a specific directory
- \`codemap_query\` — search by name (exact + fuzzy) across the entire codebase
- \`codemap_callers\` — find all callers of a function (impact analysis)
- \`codemap_calls\` — find all functions called by a function (dependency tracing)
- \`codemap_projects\` — list all registered projects (multi-project setups)

These return structured context in a single call instead of multiple file reads.
Use \`codemap_overview\` first to understand the project, then drill into specific
modules or functions as needed.
${CLAUDE_MD_SECTION_END}`;

function updateClaudeMd(root: string, logger: Logger): void {
  const claudeMdPath = join(root, 'CLAUDE.md');

  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf-8');

    // Check if codemap section already exists
    if (existing.includes(CLAUDE_MD_SECTION_START)) {
      // Replace existing section
      const regex = new RegExp(
        `${escapeRegex(CLAUDE_MD_SECTION_START)}[\\s\\S]*?${escapeRegex(CLAUDE_MD_SECTION_END)}`,
        'g'
      );
      const updated = existing.replace(regex, CLAUDE_MD_CONTENT);
      writeFileSync(claudeMdPath, updated);
      logger.success('Updated codemap section in CLAUDE.md');
    } else {
      // Append section
      const separator = existing.endsWith('\n') ? '\n' : '\n\n';
      writeFileSync(claudeMdPath, existing + separator + CLAUDE_MD_CONTENT + '\n');
      logger.success('Added codemap section to CLAUDE.md');
    }
  } else {
    // Create new CLAUDE.md
    writeFileSync(claudeMdPath, CLAUDE_MD_CONTENT + '\n');
    logger.success('Created CLAUDE.md with codemap instructions');
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const initCommand = new Command('init')
  .description('Create a .codemaprc config file in the current directory')
  .option('-p, --path <path>', 'Directory to create config in', '.')
  .option('--force', 'Overwrite existing config', false)
  .option('--no-claude-md', 'Skip creating/updating CLAUDE.md')
  .action(async (options) => {
    const logger = new Logger();
    const root = resolve(options.path);
    const configPath = join(root, '.codemaprc');

    if (existsSync(configPath) && !options.force) {
      logger.warn('.codemaprc already exists. Use --force to overwrite.');
      return;
    }

    try {
      // Auto-detect include directories based on actual project structure
      const detectedDirs = detectIncludeDirs(root);

      // Write both include and exclude so users can see and customize both.
      // When .codemaprc has an exclude list, loadConfig uses it as-is.
      // Only falls back to defaults when no exclude field is present.
      const config: Record<string, any> = {
        include: detectedDirs,
        exclude: [...DEFAULT_CONFIG.exclude],
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      logger.success(`Created ${configPath}`);
      logger.info(`Auto-detected include dirs: ${detectedDirs.join(', ')}`);
      logger.info(`Default excludes written — customize as needed`);

      // Create/update CLAUDE.md for Claude Code integration
      if (options.claudeMd !== false) {
        updateClaudeMd(root, logger);
      }
    } catch (error) {
      logger.error(`Failed to create config: ${(error as Error).message}`);
      process.exit(1);
    }
  });
