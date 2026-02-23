import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { Logger } from '../../utils/logger';
import { CodemapData } from '../../output/json-generator';

export const queryCommand = new Command('query')
  .description('Query the codemap for specific functions, classes, files, or modules')
  .option('-p, --path <path>', 'Path to project root', '.')
  .option('-f, --function <name>', 'Query a function by name')
  .option('-c, --class <name>', 'Query a class by name')
  .option('-F, --file <path>', 'Query a file by path')
  .option('-m, --module <dir>', 'Query a directory/module')
  .option('-t, --type <name>', 'Query a type/interface by name')
  .option('-s, --search <term>', 'Search across all names')
  .option('--callers <name>', 'Show what calls this function')
  .option('--calls <name>', 'Show what this function calls')
  .option('--json', 'Output as JSON instead of formatted text', false)
  .action(async (options) => {
    const logger = new Logger();
    const root = resolve(options.path);
    const codemapPath = join(root, '.codemap', 'codemap.json');

    if (!existsSync(codemapPath)) {
      logger.error('No codemap found. Run `codemap generate` first.');
      process.exit(1);
    }

    let data: CodemapData;
    try {
      data = JSON.parse(readFileSync(codemapPath, 'utf-8'));
    } catch (error) {
      logger.error(`Failed to read codemap: ${(error as Error).message}`);
      process.exit(1);
    }

    if (options.function) {
      queryFunction(data, options.function, options.json);
    } else if (options.class) {
      queryClass(data, options.class, options.json);
    } else if (options.file) {
      queryFile(data, options.file, options.json);
    } else if (options.module) {
      queryModule(data, options.module, options.json);
    } else if (options.type) {
      queryType(data, options.type, options.json);
    } else if (options.search) {
      searchAll(data, options.search, options.json);
    } else if (options.callers) {
      queryCallers(data, options.callers, options.json);
    } else if (options.calls) {
      queryCalls(data, options.calls, options.json);
    } else {
      // No specific query — show a summary
      showSummary(data);
    }
  });

function queryFunction(data: CodemapData, name: string, json: boolean): void {
  // Search in standalone functions
  const func = data.functions[name];
  if (func) {
    if (json) {
      console.log(JSON.stringify({ [name]: func }, null, 2));
    } else {
      const params = func.params.map((p: any) => `${p.name}: ${p.type}`).join(', ');
      console.log(`\n  ${func.async ? 'async ' : ''}${name}(${params}) → ${func.return_type}`);
      console.log(`  File: ${func.file}`);
      console.log(`  Exported: ${func.exported}`);
      if (func.calls?.length) console.log(`  Calls: ${func.calls.join(', ')}`);
      if (func.called_by?.length) console.log(`  Called by: ${func.called_by.join(', ')}`);
      console.log('');
    }
    return;
  }

  // Search in class methods (ClassName.methodName or just methodName)
  for (const [clsName, cls] of Object.entries(data.classes) as [string, any][]) {
    for (const method of cls.methods) {
      if (method.name === name || `${clsName}.${method.name}` === name) {
        if (json) {
          console.log(JSON.stringify({ [`${clsName}.${method.name}`]: { ...method, class: clsName, file: cls.file } }, null, 2));
        } else {
          const params = method.params.map((p: any) => `${p.name}: ${p.type}`).join(', ');
          console.log(`\n  ${clsName}.${method.name}(${params}) → ${method.return_type}`);
          console.log(`  File: ${cls.file}`);
          console.log(`  Access: ${method.access}`);
          if (method.decorators?.length) console.log(`  Decorators: ${method.decorators.join(', ')}`);
          if (method.calls?.length) console.log(`  Calls: ${method.calls.join(', ')}`);
          if (method.called_by?.length) console.log(`  Called by: ${method.called_by.join(', ')}`);
          console.log('');
        }
        return;
      }
    }
  }

  console.log(`  Function "${name}" not found.`);
}

function queryClass(data: CodemapData, name: string, json: boolean): void {
  const cls = data.classes[name];
  if (!cls) {
    console.log(`  Class "${name}" not found.`);
    return;
  }

  if (json) {
    console.log(JSON.stringify({ [name]: cls }, null, 2));
    return;
  }

  console.log(`\n  class ${name} [${cls.file}]`);
  if (cls.extends) console.log(`  Extends: ${cls.extends}`);
  if (cls.implements?.length) console.log(`  Implements: ${cls.implements.join(', ')}`);
  if (cls.decorators?.length) console.log(`  Decorators: ${cls.decorators.join(', ')}`);
  console.log(`  Methods:`);
  for (const method of cls.methods) {
    const params = method.params.map((p: any) => `${p.name}: ${p.type}`).join(', ');
    const prefix = method.access !== 'public' ? `${method.access} ` : '';
    console.log(`    ${prefix}${method.name}(${params}) → ${method.return_type}`);
  }
  if (cls.properties?.length) {
    console.log(`  Properties:`);
    for (const prop of cls.properties) {
      console.log(`    ${prop.name}: ${prop.type}`);
    }
  }
  console.log('');
}

function queryFile(data: CodemapData, filePath: string, json: boolean): void {
  const fileData = data.files[filePath];
  if (!fileData) {
    // Try partial match
    const matches = Object.keys(data.files).filter((f) => f.includes(filePath));
    if (matches.length === 0) {
      console.log(`  File "${filePath}" not found.`);
      return;
    }
    if (matches.length > 1) {
      console.log(`  Multiple matches:`);
      matches.forEach((m) => console.log(`    ${m}`));
      return;
    }
    return queryFile(data, matches[0], json);
  }

  // Gather all classes, functions, types in this file
  const result: any = {
    file: filePath,
    ...fileData,
    classes: Object.entries(data.classes)
      .filter(([, cls]: [string, any]) => cls.file === filePath)
      .map(([name, cls]) => ({ name, ...cls })),
    functions: Object.entries(data.functions)
      .filter(([, func]: [string, any]) => func.file === filePath)
      .map(([name, func]) => ({ name, ...func })),
    types: Object.entries(data.types)
      .filter(([, type]: [string, any]) => type.file === filePath)
      .map(([name, type]) => ({ name, ...type })),
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n  ${filePath} [${fileData.hash}]`);
  console.log(`  Language: ${fileData.language}`);
  if (fileData.exports?.length) console.log(`  Exports: ${fileData.exports.join(', ')}`);
  if (fileData.imports?.length) {
    console.log(`  Imports:`);
    for (const imp of fileData.imports) {
      console.log(`    ${imp.symbols.join(', ')} from ${imp.from}`);
    }
  }
  if (result.classes.length) {
    console.log(`  Classes: ${result.classes.map((c: any) => c.name).join(', ')}`);
  }
  if (result.functions.length) {
    console.log(`  Functions: ${result.functions.map((f: any) => f.name).join(', ')}`);
  }
  if (result.types.length) {
    console.log(`  Types: ${result.types.map((t: any) => t.name).join(', ')}`);
  }
  console.log('');
}

function queryModule(data: CodemapData, dir: string, json: boolean): void {
  const moduleFiles = Object.keys(data.files).filter((f) => {
    const fileDir = f.includes('/') ? f.split('/').slice(0, -1).join('/') : '.';
    return fileDir === dir || fileDir.startsWith(dir + '/');
  });

  if (moduleFiles.length === 0) {
    console.log(`  Module "${dir}" not found.`);
    return;
  }

  const filePaths = new Set(moduleFiles);

  const classes = Object.entries(data.classes)
    .filter(([, cls]: [string, any]) => filePaths.has(cls.file))
    .map(([name]) => name);

  const functions = Object.entries(data.functions)
    .filter(([, func]: [string, any]) => filePaths.has(func.file))
    .map(([name]) => name);

  if (json) {
    console.log(JSON.stringify({ module: dir, files: moduleFiles, classes, functions }, null, 2));
    return;
  }

  console.log(`\n  Module: ${dir} (${moduleFiles.length} files)`);
  console.log(`  Files: ${moduleFiles.join(', ')}`);
  if (classes.length) console.log(`  Classes: ${classes.join(', ')}`);
  if (functions.length) console.log(`  Functions: ${functions.join(', ')}`);
  console.log('');
}

function queryType(data: CodemapData, name: string, json: boolean): void {
  const type = data.types[name];
  if (!type) {
    console.log(`  Type "${name}" not found.`);
    return;
  }

  if (json) {
    console.log(JSON.stringify({ [name]: type }, null, 2));
    return;
  }

  console.log(`\n  ${type.kind} ${name} [${type.file}]`);
  if (type.extends?.length) console.log(`  Extends: ${type.extends.join(', ')}`);
  if (type.properties?.length) {
    console.log(`  Properties:`);
    for (const prop of type.properties) {
      console.log(`    ${prop.name}${prop.optional ? '?' : ''}: ${prop.type}`);
    }
  }
  console.log('');
}

function searchAll(data: CodemapData, term: string, json: boolean): void {
  const lowerTerm = term.toLowerCase();
  const results: { type: string; name: string; file: string }[] = [];

  // Search files
  for (const filePath of Object.keys(data.files)) {
    if (filePath.toLowerCase().includes(lowerTerm)) {
      results.push({ type: 'file', name: filePath, file: filePath });
    }
  }

  // Search classes
  for (const [name, cls] of Object.entries(data.classes) as [string, any][]) {
    if (name.toLowerCase().includes(lowerTerm)) {
      results.push({ type: 'class', name, file: cls.file });
    }
    // Search methods within classes
    for (const method of cls.methods) {
      if (method.name.toLowerCase().includes(lowerTerm)) {
        results.push({ type: 'method', name: `${name}.${method.name}`, file: cls.file });
      }
    }
  }

  // Search functions
  for (const [name, func] of Object.entries(data.functions) as [string, any][]) {
    if (name.toLowerCase().includes(lowerTerm)) {
      results.push({ type: 'function', name, file: func.file });
    }
  }

  // Search types
  for (const [name, type] of Object.entries(data.types) as [string, any][]) {
    if (name.toLowerCase().includes(lowerTerm)) {
      results.push({ type: 'type', name, file: type.file });
    }
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log(`  No results for "${term}".`);
    return;
  }

  console.log(`\n  ${results.length} results for "${term}":\n`);
  for (const r of results) {
    console.log(`  [${r.type}] ${r.name} → ${r.file}`);
  }
  console.log('');
}

function queryCallers(data: CodemapData, name: string, json: boolean): void {
  const callers: string[] = [];

  for (const [caller, callees] of Object.entries(data.call_graph)) {
    if (callees.includes(name)) {
      callers.push(caller);
    }
  }

  if (json) {
    console.log(JSON.stringify({ function: name, callers }, null, 2));
    return;
  }

  if (callers.length === 0) {
    console.log(`  No callers found for "${name}".`);
    return;
  }

  console.log(`\n  "${name}" is called by:\n`);
  for (const caller of callers) {
    console.log(`    ← ${caller}`);
  }
  console.log('');
}

function queryCalls(data: CodemapData, name: string, json: boolean): void {
  const calls = data.call_graph[name];

  if (!calls || calls.length === 0) {
    console.log(`  No calls found for "${name}".`);
    return;
  }

  if (json) {
    console.log(JSON.stringify({ function: name, calls }, null, 2));
    return;
  }

  console.log(`\n  "${name}" calls:\n`);
  for (const call of calls) {
    console.log(`    → ${call}`);
  }
  console.log('');
}

function showSummary(data: CodemapData): void {
  console.log(`\n  CODEMAP: ${data.project.name}`);
  console.log(`  Generated: ${data.generated_at}`);
  console.log(`  Languages: ${data.project.languages.join(', ')}`);
  console.log(`  Frameworks: ${data.project.frameworks.join(', ') || 'none'}`);
  console.log(`  Files: ${Object.keys(data.files).length}`);
  console.log(`  Classes: ${Object.keys(data.classes).length}`);
  console.log(`  Functions: ${Object.keys(data.functions).length}`);
  console.log(`  Types: ${Object.keys(data.types).length}`);
  console.log('');
  console.log('  Usage:');
  console.log('    codemap query --function <name>     Query a function');
  console.log('    codemap query --class <name>        Query a class');
  console.log('    codemap query --file <path>         Query a file');
  console.log('    codemap query --module <dir>        Query a directory');
  console.log('    codemap query --type <name>         Query a type/interface');
  console.log('    codemap query --search <term>       Search across everything');
  console.log('    codemap query --callers <name>      Show what calls a function');
  console.log('    codemap query --calls <name>        Show what a function calls');
  console.log('    codemap query --json                Output as JSON');
  console.log('');
}
