# codemap — CLI Design Document

## Overview

`codemap` is a CLI tool that statically analyzes a codebase and generates structured JSON + AI-optimized Markdown files mapping all relationships between classes, functions, middleware, routes, models, config dependencies, and more.

**Primary goal:** Give AI coding assistants (Claude Code, Copilot, etc.) a pre-built context map so they can understand project structure without re-scanning the entire codebase on every interaction — leading to faster, more accurate code generation with less token usage.

---

## Core Decisions

| Decision | Choice |
|---|---|
| CLI language | Node.js / TypeScript |
| Target languages (v1) | TypeScript/JavaScript + Python |
| Framework detection | Auto-detect from config files |
| Update mode | Manual CLI run (`codemap generate`) |
| MD output style | AI-optimized (compact, token-efficient) |
| Output structure | Root-level summary + per-directory breakdown |
| Detail level | Full signatures (params, types, return types, decorators) |
| Config/env mapping | Yes — track env var and config file usage |

---

## Architecture

```
codemap/
├── src/
│   ├── cli/                    # CLI entry point + command definitions
│   │   ├── index.ts            # Main CLI entry (commander/yargs)
│   │   ├── commands/
│   │   │   ├── generate.ts     # `codemap generate` — full scan
│   │   │   ├── diff.ts         # `codemap diff` — show changes since last scan
│   │   │   └── init.ts         # `codemap init` — create .codemaprc config
│   │   └── options.ts          # Shared CLI flags/options
│   │
│   ├── core/                   # Core orchestration
│   │   ├── scanner.ts          # File discovery + ignore rules
│   │   ├── orchestrator.ts     # Coordinates parsing → analysis → output
│   │   └── config.ts           # Read .codemaprc / codemap.config.json
│   │
│   ├── parsers/                # Language-specific AST parsers
│   │   ├── parser.interface.ts # Common parser interface
│   │   ├── typescript/
│   │   │   ├── ts-parser.ts    # Uses ts-morph for TS/JS parsing
│   │   │   ├── class-extractor.ts
│   │   │   ├── function-extractor.ts
│   │   │   ├── import-extractor.ts
│   │   │   └── export-extractor.ts
│   │   └── python/
│   │       ├── py-parser.ts    # Uses tree-sitter-python
│   │       ├── class-extractor.ts
│   │       ├── function-extractor.ts
│   │       └── import-extractor.ts
│   │
│   ├── analyzers/              # Cross-file relationship analysis
│   │   ├── call-graph.ts       # Function → function call tracking
│   │   ├── import-graph.ts     # File → file dependency tree
│   │   ├── route-analyzer.ts   # Route → middleware → handler chains
│   │   ├── model-analyzer.ts   # DB model relationships
│   │   ├── type-analyzer.ts    # Type/interface dependency graph
│   │   ├── data-flow.ts        # Data flow between functions
│   │   └── config-analyzer.ts  # Env var + config file usage tracking
│   │
│   ├── frameworks/             # Framework-specific detection + adapters
│   │   ├── detector.ts         # Auto-detect framework from config files
│   │   ├── express.ts          # Express route/middleware patterns
│   │   ├── nestjs.ts           # NestJS decorator-based patterns
│   │   ├── fastapi.ts          # FastAPI route/dependency patterns
│   │   ├── django.ts           # Django URL conf/view/model patterns
│   │   └── flask.ts            # Flask route/blueprint patterns
│   │
│   ├── output/                 # Output generators
│   │   ├── json-generator.ts   # Structured JSON output
│   │   ├── md-generator.ts     # AI-optimized Markdown output
│   │   └── schema.ts           # JSON schema definitions
│   │
│   └── utils/
│       ├── file-utils.ts
│       ├── hash.ts             # Content hashing for change detection
│       └── logger.ts
│
├── templates/                  # Output templates
│   ├── root-summary.md.hbs     # Handlebars template for root MD
│   └── directory.md.hbs        # Template for per-directory MD
│
├── package.json
├── tsconfig.json
└── .codemaprc.example          # Example config file
```

---

## CLI Commands

### `codemap init`
Creates a `.codemaprc` config file in the project root.

```bash
codemap init
# Creates .codemaprc with sensible defaults
```

### `codemap generate`
Full scan of the project. This is the primary command.

```bash
codemap generate                    # Scan current directory
codemap generate --path ./src       # Scan specific path
codemap generate --output ./docs    # Custom output directory
codemap generate --framework express  # Override auto-detection
```

### `codemap diff`
Shows what changed since the last scan (using content hashes).

```bash
codemap diff                        # Show changed files/relationships
codemap diff --update               # Show diff then regenerate
```

---

## Output Structure

### Directory Layout
```
project-root/
├── .codemap/                       # Generated output directory
│   ├── codemap.json                # Root-level full project map
│   ├── codemap.md                  # Root-level AI-optimized summary
│   ├── .hashes                     # Content hashes for diff detection
│   └── modules/                    # Per-directory breakdowns
│       ├── src__controllers.json
│       ├── src__controllers.md
│       ├── src__models.json
│       ├── src__models.md
│       ├── src__services.json
│       └── src__services.md
```

### JSON Schema (Root Level — `codemap.json`)

```jsonc
{
  "version": "1.0.0",
  "generated_at": "2026-02-23T10:00:00Z",
  "project": {
    "name": "my-app",
    "root": "/path/to/project",
    "languages": ["typescript", "python"],
    "frameworks": ["express", "prisma"],
    "entry_points": ["src/index.ts", "src/app.ts"]
  },

  // Every file in the project
  "files": {
    "src/controllers/user.controller.ts": {
      "language": "typescript",
      "hash": "a1b2c3",
      "exports": ["UserController"],
      "imports": [
        { "from": "src/services/user.service.ts", "symbols": ["UserService"] },
        { "from": "src/models/user.model.ts", "symbols": ["User", "UserDTO"] }
      ]
    }
  },

  // All classes with full signatures
  "classes": {
    "UserController": {
      "file": "src/controllers/user.controller.ts",
      "extends": "BaseController",
      "implements": ["IController"],
      "decorators": ["@Controller('/users')"],
      "methods": [
        {
          "name": "getUser",
          "params": [
            { "name": "id", "type": "string" },
            { "name": "req", "type": "Request" }
          ],
          "return_type": "Promise<UserDTO>",
          "decorators": ["@Get('/:id')"],
          "calls": ["UserService.findById", "UserMapper.toDTO"],
          "called_by": []
        }
      ],
      "properties": [
        { "name": "userService", "type": "UserService", "access": "private" }
      ]
    }
  },

  // Standalone functions
  "functions": {
    "validateEmail": {
      "file": "src/utils/validators.ts",
      "params": [{ "name": "email", "type": "string" }],
      "return_type": "boolean",
      "calls": [],
      "called_by": ["UserService.createUser", "AuthService.register"],
      "exported": true
    }
  },

  // Route → middleware → handler mapping
  "routes": [
    {
      "method": "GET",
      "path": "/api/users/:id",
      "file": "src/controllers/user.controller.ts",
      "handler": "UserController.getUser",
      "middleware": ["authMiddleware", "rateLimiter"],
      "params": [{ "name": "id", "type": "string", "source": "path" }]
    }
  ],

  // Database models and their relationships
  "models": {
    "User": {
      "file": "src/models/user.model.ts",
      "orm": "prisma",
      "fields": [
        { "name": "id", "type": "string", "primary": true },
        { "name": "email", "type": "string", "unique": true },
        { "name": "posts", "type": "Post[]", "relation": "hasMany" }
      ],
      "relations": [
        { "type": "hasMany", "target": "Post", "foreign_key": "authorId" },
        { "type": "hasOne", "target": "Profile", "foreign_key": "userId" }
      ]
    }
  },

  // Type/interface dependency graph
  "types": {
    "UserDTO": {
      "file": "src/types/user.types.ts",
      "kind": "interface",
      "extends": ["BaseDTO"],
      "properties": [
        { "name": "id", "type": "string" },
        { "name": "email", "type": "string" },
        { "name": "profile", "type": "ProfileDTO" }
      ],
      "used_by": ["UserController.getUser", "UserService.findById"]
    }
  },

  // Call graph — adjacency list
  "call_graph": {
    "UserController.getUser": ["UserService.findById", "UserMapper.toDTO"],
    "UserService.findById": ["prisma.user.findUnique", "validateEmail"],
    "UserService.createUser": ["prisma.user.create", "validateEmail", "sendWelcomeEmail"]
  },

  // Import graph — file-level adjacency list
  "import_graph": {
    "src/controllers/user.controller.ts": [
      "src/services/user.service.ts",
      "src/models/user.model.ts",
      "src/middleware/auth.ts"
    ],
    "src/services/user.service.ts": [
      "src/models/user.model.ts",
      "src/utils/validators.ts"
    ]
  },

  // Data flow tracking
  "data_flows": [
    {
      "name": "User Registration Flow",
      "chain": [
        { "step": 1, "function": "AuthController.register", "input": "RegisterDTO", "output": "User" },
        { "step": 2, "function": "AuthService.register", "input": "RegisterDTO", "output": "User" },
        { "step": 3, "function": "UserService.createUser", "input": "CreateUserInput", "output": "User" },
        { "step": 4, "function": "prisma.user.create", "input": "Prisma.UserCreateInput", "output": "User" }
      ]
    }
  ],

  // Environment & config dependencies
  "config_dependencies": {
    "env_vars": {
      "DATABASE_URL": {
        "used_in": ["src/db/connection.ts"],
        "accessed_by": ["DatabaseService.connect"]
      },
      "JWT_SECRET": {
        "used_in": ["src/middleware/auth.ts", "src/services/auth.service.ts"],
        "accessed_by": ["authMiddleware", "AuthService.generateToken"]
      }
    },
    "config_files": {
      "prisma/schema.prisma": {
        "defines": ["User", "Post", "Profile"],
        "referenced_by": ["src/services/user.service.ts"]
      }
    }
  },

  // Middleware registry
  "middleware": {
    "authMiddleware": {
      "file": "src/middleware/auth.ts",
      "applied_to": ["/api/users/*", "/api/posts/*"],
      "calls": ["AuthService.verifyToken"],
      "env_vars": ["JWT_SECRET"]
    }
  }
}
```

### AI-Optimized Markdown Format (`codemap.md`)

The MD file is designed for minimal token usage while maintaining queryability:

```markdown
# CODEMAP: my-app
> Generated: 2026-02-23T10:00:00Z | Languages: typescript, python | Frameworks: express, prisma

## FILE_INDEX
src/controllers/user.controller.ts [hash:a1b2c3] → exports: UserController
src/services/user.service.ts [hash:d4e5f6] → exports: UserService
src/models/user.model.ts [hash:g7h8i9] → exports: User, UserDTO

## CLASSES
### UserController [src/controllers/user.controller.ts]
extends: BaseController | implements: IController | decorators: @Controller('/users')
├─ getUser(id: string, req: Request) → Promise<UserDTO> [@Get('/:id')]
│  calls: UserService.findById, UserMapper.toDTO
├─ createUser(dto: CreateUserDTO) → Promise<User> [@Post('/')]
│  calls: UserService.create, validateEmail

## ROUTES
GET /api/users/:id → [authMiddleware, rateLimiter] → UserController.getUser
POST /api/users → [authMiddleware, validateBody] → UserController.createUser
DELETE /api/users/:id → [authMiddleware, adminOnly] → UserController.deleteUser

## MODELS
### User [prisma] [src/models/user.model.ts]
fields: id(string,PK), email(string,unique), name(string), createdAt(DateTime)
→ hasMany: Post(authorId) | hasOne: Profile(userId)

## CALL_GRAPH
UserController.getUser → UserService.findById → prisma.user.findUnique
UserController.createUser → validateEmail → (pure)
                          → UserService.create → prisma.user.create
                                               → sendWelcomeEmail

## IMPORT_GRAPH
user.controller.ts ← user.service.ts, user.model.ts, auth.middleware.ts
user.service.ts ← user.model.ts, validators.ts

## ENV_DEPS
DATABASE_URL → DatabaseService.connect [src/db/connection.ts]
JWT_SECRET → authMiddleware [src/middleware/auth.ts], AuthService.generateToken [src/services/auth.service.ts]
```

---

## Framework Detection Logic

The auto-detector scans for these signals:

| Framework | Detection Signal |
|---|---|
| Express | `package.json` has `express` dep + `app.use()` / `router.get()` patterns |
| NestJS | `package.json` has `@nestjs/core` + decorator patterns `@Controller`, `@Module` |
| FastAPI | `requirements.txt` / `pyproject.toml` has `fastapi` + `@app.get()` patterns |
| Django | `manage.py` exists + `settings.py` + `urls.py` patterns |
| Flask | `requirements.txt` has `flask` + `@app.route()` patterns |
| Prisma | `prisma/schema.prisma` exists |
| Sequelize | `package.json` has `sequelize` + model definition patterns |
| SQLAlchemy | `requirements.txt` has `sqlalchemy` + `Base = declarative_base()` |
| Mongoose | `package.json` has `mongoose` + `Schema()` patterns |

Each detected framework activates a specialized adapter that knows how to extract framework-specific patterns (decorators, route definitions, model schemas, etc).

---

## Config File (`.codemaprc`)

```jsonc
{
  // Directories to scan
  "include": ["src", "lib", "app"],

  // Directories/patterns to ignore
  "exclude": [
    "node_modules", "__pycache__", "dist", "build",
    ".git", "*.test.*", "*.spec.*"
  ],

  // Override auto-detected framework
  "framework": null,

  // Output directory
  "output": ".codemap",

  // What to include in output
  "features": {
    "call_graph": true,
    "import_graph": true,
    "routes": true,
    "models": true,
    "types": true,
    "data_flow": true,
    "config_deps": true,
    "middleware": true
  },

  // Detail level for signatures
  "detail": "full",

  // Max depth for call graph traversal
  "max_call_depth": 5,

  // Custom entry points (auto-detected if null)
  "entry_points": null
}
```

---

## Key Dependencies (v1)

| Package | Purpose |
|---|---|
| `ts-morph` | TypeScript/JavaScript AST parsing |
| `tree-sitter` + `tree-sitter-python` | Python AST parsing |
| `commander` | CLI framework |
| `fast-glob` | File discovery |
| `chalk` | CLI output coloring |
| `ora` | Spinner/progress indicators |

---

## Implementation Phases

### Phase 1 — Foundation
- CLI scaffolding (`init`, `generate` commands)
- File scanner with ignore rules
- Config system (`.codemaprc`)
- TypeScript parser: extract classes, functions, imports, exports with full signatures
- JSON + MD output generators

### Phase 2 — Relationships
- Import graph builder (file → file)
- Call graph analyzer (function → function)
- Type dependency graph
- Data flow tracking

### Phase 3 — Framework Intelligence
- Framework auto-detection
- Express adapter (routes, middleware chains)
- NestJS adapter (decorators, modules, providers)
- Prisma/Sequelize model relationship extraction
- Config/env var dependency tracking

### Phase 4 — Python Support
- Python parser via tree-sitter
- Django adapter (urls, views, models)
- FastAPI adapter (routes, dependencies)
- Flask adapter (routes, blueprints)
- SQLAlchemy model extraction

### Phase 5 — Polish
- `codemap diff` command (hash-based change detection)
- Per-directory output generation
- Performance optimization for large codebases
- Error handling + graceful degradation for unparseable files

---

## Usage with AI Assistants

Once generated, the codemap files can be referenced in AI prompts:

```
@.codemap/codemap.md — Give full project context to the AI
@.codemap/modules/src__controllers.md — Give context for a specific module
```

Or in a `.claude` project instruction:
```
Always read .codemap/codemap.json before making code changes.
Use the call_graph to understand function dependencies.
Use the routes section to understand API structure.
```

This eliminates redundant file scanning and gives the AI a pre-built understanding of the entire codebase structure.
