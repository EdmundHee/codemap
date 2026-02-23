import { CodemapData } from './json-generator';

/**
 * Generate a COMPACT root-level summary (~2K lines for large projects).
 * Designed as a table of contents — names and locations only.
 * For detailed info, use per-module files or `codemap query`.
 */
export function generateMarkdown(data: CodemapData): string {
  const lines: string[] = [];

  // Header
  lines.push(`# CODEMAP: ${data.project.name}`);
  lines.push(`> Generated: ${data.generated_at} | Languages: ${data.project.languages.join(', ')} | Frameworks: ${data.project.frameworks.join(', ') || 'none'}`);

  const fileCount = Object.keys(data.files).length;
  const classCount = Object.keys(data.classes).length;
  const funcCount = Object.keys(data.functions).length;
  const typeCount = Object.keys(data.types).length;
  lines.push(`> Files: ${fileCount} | Classes: ${classCount} | Functions: ${funcCount} | Types: ${typeCount}`);
  lines.push('');

  // Entry points
  if (data.project.entry_points.length > 0) {
    lines.push(`> Entry: ${data.project.entry_points.join(', ')}`);
    lines.push('');
  }

  // Directory structure summary — group files by directory
  lines.push('## MODULES');
  const dirMap = new Map<string, string[]>();
  for (const filePath of Object.keys(data.files)) {
    const dir = filePath.includes('/') ? filePath.split('/').slice(0, -1).join('/') : '.';
    if (!dirMap.has(dir)) dirMap.set(dir, []);
    dirMap.get(dir)!.push(filePath);
  }
  for (const [dir, files] of [...dirMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`${dir}/ (${files.length} files)`);
  }
  lines.push('');

  // Classes — compact: name, file, method names only
  if (classCount > 0) {
    lines.push('## CLASSES');
    for (const [name, cls] of Object.entries(data.classes) as [string, any][]) {
      const ext = cls.extends ? ` < ${cls.extends}` : '';
      const methods = cls.methods.map((m: any) => m.name).join(', ');
      lines.push(`${name}${ext} [${cls.file}] → ${methods}`);
    }
    lines.push('');
  }

  // Functions — compact: name, file only (no params/signatures)
  if (funcCount > 0) {
    lines.push('## FUNCTIONS');

    // Group by file to reduce repetition
    const funcsByFile = new Map<string, string[]>();
    for (const [name, func] of Object.entries(data.functions) as [string, any][]) {
      const file = func.file;
      if (!funcsByFile.has(file)) funcsByFile.set(file, []);
      funcsByFile.get(file)!.push(name);
    }
    for (const [file, names] of [...funcsByFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`${file}: ${names.join(', ')}`);
    }
    lines.push('');
  }

  // Types — compact: name and kind only
  if (typeCount > 0) {
    lines.push('## TYPES');
    const typesByFile = new Map<string, string[]>();
    for (const [name, type] of Object.entries(data.types) as [string, any][]) {
      const file = type.file;
      if (!typesByFile.has(file)) typesByFile.set(file, []);
      typesByFile.get(file)!.push(`${type.kind}:${name}`);
    }
    for (const [file, typeNames] of [...typesByFile.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`${file}: ${typeNames.join(', ')}`);
    }
    lines.push('');
  }

  // Import graph — keep this, it's structurally important and compact
  const importEntries = Object.entries(data.import_graph).filter(([, deps]) => deps.length > 0);
  if (importEntries.length > 0) {
    lines.push('## IMPORT_GRAPH');
    for (const [file, deps] of importEntries) {
      lines.push(`${file} ← ${deps.join(', ')}`);
    }
    lines.push('');
  }

  // Dependencies — always include, compact by nature
  const pkgDeps = data.dependencies;
  if (pkgDeps && Object.keys(pkgDeps.packages).length > 0) {
    lines.push(`## DEPENDENCIES [${pkgDeps.source}]`);
    const byType = { production: [] as string[], dev: [] as string[], peer: [] as string[] };
    for (const [name, info] of Object.entries(pkgDeps.packages)) {
      byType[info.type].push(`${name}@${info.version}`);
    }
    if (byType.production.length) lines.push(`prod: ${byType.production.join(', ')}`);
    if (byType.dev.length) lines.push(`dev: ${byType.dev.join(', ')}`);
    if (byType.peer.length) lines.push(`peer: ${byType.peer.join(', ')}`);
    lines.push('');
  }

  // Environment dependencies — always include
  const envVars = data.config_dependencies?.env_vars;
  if (envVars && Object.keys(envVars).length > 0) {
    lines.push('## ENV_DEPS');
    for (const [varName, info] of Object.entries(envVars)) {
      lines.push(`${varName} → ${info.used_in.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate DETAILED markdown for a specific directory/module.
 * Includes full signatures, call graphs, and called_by data.
 */
export function generateModuleMarkdown(
  data: CodemapData,
  directory: string
): string {
  const lines: string[] = [];

  lines.push(`# MODULE: ${directory}`);
  lines.push(`> Project: ${data.project.name} | Generated: ${data.generated_at}`);
  lines.push('');

  // Filter to files in this directory
  const moduleFiles = Object.entries(data.files).filter(([path]) => {
    const fileDir = path.includes('/') ? path.split('/').slice(0, -1).join('/') : '.';
    return fileDir === directory;
  });

  if (moduleFiles.length === 0) return '';

  // File index with exports
  lines.push('## FILES');
  for (const [path, fileData] of moduleFiles) {
    const exports = fileData.exports.length > 0 ? ` → ${fileData.exports.join(', ')}` : '';
    lines.push(`${path} [${fileData.hash}]${exports}`);
  }
  lines.push('');

  // File paths in this module
  const filePaths = new Set(moduleFiles.map(([path]) => path));

  // Classes in this module — full detail
  const moduleClasses = Object.entries(data.classes)
    .filter(([, cls]: [string, any]) => filePaths.has(cls.file)) as [string, any][];

  if (moduleClasses.length > 0) {
    lines.push('## CLASSES');
    for (const [name, cls] of moduleClasses) {
      const meta: string[] = [];
      if (cls.extends) meta.push(`extends: ${cls.extends}`);
      if (cls.implements?.length) meta.push(`implements: ${cls.implements.join(', ')}`);
      if (cls.decorators?.length) meta.push(`decorators: ${cls.decorators.join(', ')}`);

      lines.push(`### ${name} [${cls.file}]`);
      if (meta.length > 0) lines.push(meta.join(' | '));

      for (const method of cls.methods) {
        const params = method.params
          .map((p: any) => `${p.name}: ${p.type}`)
          .join(', ');
        const decorStr = method.decorators?.length ? ` [${method.decorators.join(', ')}]` : '';
        const asyncStr = method.async ? 'async ' : '';
        const staticStr = method.static ? 'static ' : '';
        const accessStr = method.access !== 'public' ? `${method.access} ` : '';

        lines.push(`├─ ${accessStr}${staticStr}${asyncStr}${method.name}(${params}) → ${method.return_type}${decorStr}`);

        if (method.calls?.length) {
          lines.push(`│  calls: ${method.calls.join(', ')}`);
        }
        if (method.called_by?.length) {
          lines.push(`│  called_by: ${method.called_by.join(', ')}`);
        }
      }
      lines.push('');
    }
  }

  // Functions in this module — full detail
  const moduleFunctions = Object.entries(data.functions)
    .filter(([, func]: [string, any]) => filePaths.has(func.file)) as [string, any][];

  if (moduleFunctions.length > 0) {
    lines.push('## FUNCTIONS');
    for (const [name, func] of moduleFunctions) {
      const params = func.params
        .map((p: any) => `${p.name}: ${p.type}`)
        .join(', ');
      const asyncStr = func.async ? 'async ' : '';
      const exportStr = func.exported ? '[exported] ' : '';

      lines.push(`${exportStr}${asyncStr}${name}(${params}) → ${func.return_type} [${func.file}]`);

      if (func.calls?.length) {
        lines.push(`  calls: ${func.calls.join(', ')}`);
      }
      if (func.called_by?.length) {
        lines.push(`  called_by: ${func.called_by.join(', ')}`);
      }
    }
    lines.push('');
  }

  // Types in this module — full detail
  const moduleTypes = Object.entries(data.types)
    .filter(([, type]: [string, any]) => filePaths.has(type.file)) as [string, any][];

  if (moduleTypes.length > 0) {
    lines.push('## TYPES');
    for (const [name, type] of moduleTypes) {
      const extendsStr = type.extends?.length ? ` extends ${type.extends.join(', ')}` : '';
      lines.push(`${type.kind} ${name}${extendsStr} [${type.file}]`);

      if (type.properties?.length) {
        const props = type.properties
          .map((p: any) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`)
          .join(', ');
        lines.push(`  { ${props} }`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
