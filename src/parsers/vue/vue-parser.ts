import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { ScannedFile } from '../../core/scanner';
import { ParserInterface, ParsedFile } from '../parser.interface';
import { TypeScriptParser } from '../typescript/ts-parser';

/**
 * Vue Single File Component parser.
 *
 * Extracts <script> or <script setup> blocks from .vue files and delegates
 * to the TypeScript parser for actual AST analysis. Also captures template
 * component references as additional relationship data.
 */
export class VueParser implements ParserInterface {
  private tsParser: TypeScriptParser;

  constructor(tsParser: TypeScriptParser) {
    this.tsParser = tsParser;
  }

  async parse(file: ScannedFile): Promise<ParsedFile> {
    const content = readFileSync(file.absolute, 'utf-8');
    const hash = createHash('md5').update(content).digest('hex').slice(0, 8);

    // Extract script block content
    const scriptContent = this.extractScript(content);

    if (!scriptContent) {
      // No script block — return minimal parsed file with just template info
      return {
        file,
        hash,
        classes: [],
        functions: [],
        imports: [],
        exports: [],
        types: [],
        envVars: [],
      };
    }

    // Parse the script block through the TS parser
    const parsed = await this.tsParser.parseContent(file, scriptContent.code, hash);

    // Extract component references from <template>
    const templateComponents = this.extractTemplateComponents(content);
    if (templateComponents.length > 0) {
      // Add template component usages as calls on any existing functions
      // or create a synthetic entry so they appear in the call graph
      for (const func of parsed.functions) {
        func.calls = [...func.calls, ...templateComponents];
      }
    }

    return parsed;
  }

  /**
   * Extract the <script> or <script setup> block from a Vue SFC.
   * Prefers <script setup> if both exist.
   */
  private extractScript(content: string): { code: string; isSetup: boolean } | null {
    // Match <script setup ...> first (preferred in Vue 3)
    const setupMatch = content.match(
      /<script\s+[^>]*setup[^>]*>([\s\S]*?)<\/script>/i
    );
    if (setupMatch) {
      return { code: setupMatch[1], isSetup: true };
    }

    // Fall back to regular <script>
    const scriptMatch = content.match(
      /<script[^>]*>([\s\S]*?)<\/script>/i
    );
    if (scriptMatch) {
      return { code: scriptMatch[1], isSetup: false };
    }

    return null;
  }

  /**
   * Extract component names used in <template>.
   * This captures relationships like <UserCard />, <BaseModal>, etc.
   */
  private extractTemplateComponents(content: string): string[] {
    const templateMatch = content.match(
      /<template[^>]*>([\s\S]*?)<\/template>/i
    );
    if (!templateMatch) return [];

    const template = templateMatch[1];
    const components = new Set<string>();

    // Match PascalCase components: <UserCard>, <BaseModal />, etc.
    const pascalRegex = /<([A-Z][a-zA-Z0-9]+)[\s/>]/g;
    let match;
    while ((match = pascalRegex.exec(template)) !== null) {
      components.add(match[1]);
    }

    // Match kebab-case components: <user-card>, <base-modal />, etc.
    // Standard HTML elements don't have hyphens, so hyphenated = custom component
    const kebabRegex = /<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)[\s/>]/g;
    while ((match = kebabRegex.exec(template)) !== null) {
      // Convert kebab-case to PascalCase for consistency
      const pascal = match[1]
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join('');
      components.add(pascal);
    }

    return Array.from(components);
  }
}
