import { ParsedFile } from '../parsers/parser.interface';

export interface CallGraph {
  /** "ClassName.methodName" or "functionName" → list of calls */
  [caller: string]: string[];
}

export interface ReverseCallGraph {
  /** function/method → list of callers */
  [callee: string]: string[];
}

/**
 * Build a call graph from parsed files.
 * Maps each function/method to the functions it calls.
 */
export function buildCallGraph(parsedFiles: ParsedFile[]): CallGraph {
  // Use null-prototype object to avoid collisions with Object.prototype
  // (e.g., "constructor", "toString", "hasOwnProperty")
  const graph: CallGraph = Object.create(null);

  for (const parsed of parsedFiles) {
    // Class methods
    for (const cls of parsed.classes) {
      for (const method of cls.methods) {
        const key = `${cls.name}.${method.name}`;
        graph[key] = method.calls;
      }
    }

    // Standalone functions
    for (const func of parsed.functions) {
      graph[func.name] = func.calls;
    }
  }

  return graph;
}

/**
 * Build a reverse call graph (callee → callers).
 * Useful for dead code detection.
 * Uses Map internally to avoid Object.prototype key collisions.
 */
export function buildReverseCallGraph(callGraph: CallGraph): ReverseCallGraph {
  const reverseMap = new Map<string, string[]>();

  // Initialize all known functions with empty arrays
  for (const caller of Object.keys(callGraph)) {
    if (!reverseMap.has(caller)) {
      reverseMap.set(caller, []);
    }
  }

  // Populate reverse mappings
  for (const [caller, callees] of Object.entries(callGraph)) {
    for (const callee of callees) {
      if (!reverseMap.has(callee)) {
        reverseMap.set(callee, []);
      }
      const callers = reverseMap.get(callee)!;
      if (!callers.includes(caller)) {
        callers.push(caller);
      }
    }
  }

  // Convert back to plain null-prototype object for JSON serialization
  const reverse: ReverseCallGraph = Object.create(null);
  for (const [key, value] of reverseMap) {
    reverse[key] = value;
  }

  return reverse;
}
