# One-off: rewrites STUDY_PLAN.md §7 so each project week is a Learn + Build roadmap with a Friday checkpoint.
# Run from the DSA folder: python tracker/scripts/migrate-plan-step4.py
import re
import shutil

PLAN = 'STUDY_PLAN.md'
LEARN = {
    1: ["Node runtime, CommonJS vs ES modules, npm + package.json scripts", "The `http` module, request/response cycle, event loop basics", "Express routing and the middleware chain (`next()`, order matters)", "REST design: resources, HTTP verbs, status codes (200/201/204/400/404)", "async/await errors in Express; Postman collections and environments"],
    2: ["Documents vs tables: when MongoDB fits; connection strings and config", "Mongoose schemas, models, built-in validation, timestamps", "Querying: filters, text indexes, pagination with skip/limit + sort", "Validating input at the boundary with Zod; a consistent error shape", "Layered architecture: route → controller → service → model"],
    3: ["Password hashing: bcrypt, salts, cost factor (never store plain text)", "JWT anatomy (header.payload.signature), stateless auth, expiry", "Authentication vs authorization; 401 vs 403", "Cookies: httpOnly, Secure, SameSite; refresh-token flow", "OWASP basics: helmet headers, CORS, rate limiting, brute-force protection"],
    4: ["Slugs and unique indexes", "Embedding vs referencing; `populate` and its cost", "The aggregation pipeline: $match, $group, $sort, $limit", "Structured logging, log levels, request IDs for tracing", "OpenAPI: describing an API so others can use it"],
    5: ["The testing pyramid; Jest basics (describe/it/expect, setup/teardown)", "Integration tests over HTTP with Supertest", "Test isolation: fresh data per test, mocks vs real dependencies", "WebSockets vs HTTP; Socket.IO events and rooms", "Caching: LRU, TTL, cache invalidation, measuring before optimising"],
    6: ["Docker: images vs containers, Dockerfile layers, docker-compose", "CI: what a pipeline runs and why (lint → test → build)", "12-factor config: env vars per environment, no secrets in git", "Documenting a project: README structure, architecture diagrams", "Telling your project story in interviews (problem → design → trade-offs → result)"],
    7: [".NET SDK, solutions vs projects, project references, layered architecture", "Program.cs: the DI container, middleware pipeline, configuration + environments", "C# for domain models: classes vs records, enums, nullable reference types", "EF Core: DbContext, code-first migrations, connection strings", "Controllers vs minimal APIs; why DTOs instead of exposing entities"],
    8: ["Mapping entities ↔ DTOs (manual vs Mapster/AutoMapper)", "async/await in .NET: Task, CancellationToken, avoiding sync-over-async", "IQueryable vs IEnumerable: when the SQL actually runs; paging", "Validation with FluentValidation; ProblemDetails (RFC 7807)", "Custom middleware and global exception handling"],
    9: ["ASP.NET Core Identity: users, password hashing, stores", "JWT bearer authentication, claims, token validation parameters", "EF Core global query filters for per-user data", "Policy- and role-based authorization", "Refresh-token rotation and revocation"],
    10: ["EF relationships; eager/explicit loading; the N+1 problem; AsNoTracking", "Auditing with SaveChanges interceptors", "LINQ projections and GroupBy that translate to SQL", "Hosted services and BackgroundService", "DI lifetimes: singleton vs scoped vs transient; captive dependencies"],
    11: ["Structured logging with Serilog: enrichers, sinks, log levels", "Unit testing with xUnit; fakes/mocks with NSubstitute or Moq", "Integration testing with WebApplicationFactory + a test database", "OpenAPI/Swagger in .NET; XML comments; auth in Swagger UI", "The built-in rate limiter: fixed window, sliding window, token bucket"],
    12: ["Caching in ASP.NET Core: IMemoryCache, output caching, when caching is wrong", "Indexes and reading the SQL EF generates", "Health checks: liveness vs readiness", "Containerising .NET apps; SQL Server in Docker", "Holiday buffer: review your weakest topic so far"],
    13: ["File uploads: IFormFile, size limits, streaming", "Storage abstractions: interface + local implementation", "Search: LIKE vs full-text search trade-offs", "SOLID principles applied to your own services", "Buffer: refactor whatever felt hardest this phase"],
    14: ["CI for .NET: restore → build → test in GitHub Actions", "Deploying to Azure App Service + Azure SQL (free tiers)", "ER diagrams and layer diagrams that explain a backend", "`.http` files and Postman collections as living API docs", "Telling the JobHunt API story in interviews"],
    15: ["React's mental model: components, JSX, props, rendering; Vite project layout", "State and events; typing props/state/events in TypeScript", "React Router: routes, nested layouts, params, 404s", "Data fetching basics; why useEffect fetching gets messy; typed API client", "Controlled forms; auth flow and protected routes"],
    16: ["Server state vs client state; TanStack Query (queries, keys, caching)", "The URL as state: search params for filters and paging", "React Hook Form + Zod schemas for validation", "Mutations, optimistic updates, cache invalidation", "Error boundaries, toasts, loading states"],
    17: ["Lists and keys; composing a board from columns and cards", "Drag and drop with dnd-kit, including keyboard accessibility", "Component composition: children, render props, compound components", "Fetch/axios interceptors; refreshing tokens on 401", "Context API: when it's right and when it causes re-renders"],
    18: ["Derived state: compute, don't store; dashboard stats", "Charts with Recharts: choosing the right chart", "Responsive CSS: flexbox, grid, media queries, mobile-first", "Theming with CSS custom properties; dark mode", "Accessibility basics: semantic HTML, labels, focus, contrast"],
    19: ["Testing philosophy: test behaviour, not implementation (React Testing Library)", "user-event: simulating real typing and clicks; form tests", "Mock Service Worker (MSW) for API mocking", "Performance: why components re-render; memo, useMemo, lazy routes", "Custom hooks: extracting reusable logic"],
    20: ["Debouncing and throttling user input", "File uploads from the browser (FormData, progress)", "CSV parsing and generation in the browser", "Loading UX: skeletons, empty states, error states", "Buffer: revisit your weakest React topic"],
    21: ["Environment variables and production builds in Vite", "Deploying an SPA (Vercel/Netlify), routing fallbacks, CORS", "End-to-end testing with Playwright", "A README that sells: screenshots, GIF, architecture, setup", "Presenting your project in 2 minutes"],
}
CHECK = {
    1: "From a blank folder: an Express server with GET/POST `/notes` (in memory) + 404 + error middleware in 20 minutes",
    2: "Explain out loud: schema vs model, and why pagination needs a sort. Then add a `?limit=` cap (max 50) without looking anything up",
    3: "Draw the login → JWT → protected-route flow from memory; explain 401 vs 403 and where the refresh token lives",
    4: "Write an aggregation pipeline from memory: snippet count per tag, top 5",
    5: "Write a new Supertest test for a 403 case without copying an existing test",
    6: "Record a 2-minute explanation of SnippetVault's architecture on your phone",
    7: "Blank `dotnet new webapi`: add an entity + DbContext + migration + GET endpoint in 25 minutes, no docs",
    8: "Explain IQueryable vs IEnumerable and when SQL runs; then add a sort parameter without docs",
    9: "Draw how a JWT becomes a ClaimsPrincipal and how `[Authorize]` decides, from memory",
    10: "Explain the three DI lifetimes with an example of a captive-dependency bug",
    11: "Write an integration test for a 404 case from scratch",
    12: "Explain one case where output caching would leak another user's data",
    13: "Refactor one service method for single responsibility and explain the change",
    14: "Record a 2-minute explanation of the JobHunt API architecture",
    15: "Blank Vite app: a typed component with props + state + a route in 20 minutes, no docs",
    16: "Write a useQuery + useMutation pair from memory, with cache invalidation",
    17: "Explain when Context causes re-renders, and one alternative",
    18: "Build a 2-column → 1-column responsive layout with CSS grid from memory",
    19: "Write an RTL test for a button that shows a loading state, from scratch",
    20: "Write a useDebounce hook from memory",
    21: "Record a 2-minute JobHunt Web walkthrough + architecture",
}
DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
INTROS = {
    '### Project 1:': '**Node.js roadmap:** runtime → Express → REST → data → auth → testing → real-time → shipping.',
    '### Project 2:': '**.NET roadmap:** SDK + C# → DI + middleware → EF Core → validation → Identity/JWT → background work → testing → performance → shipping.',
    '### Project 3:': '**React roadmap:** components + TypeScript → routing → server state → forms → advanced patterns → styling + a11y → testing + performance → shipping.',
}

md = open(PLAN, encoding='utf-8').read()
if '#### Week' in md:
    raise SystemExit('Already migrated.')
shutil.copy(PLAN, PLAN + '.bak')

start = md.index('## 7.')
head, body = md[:start], md[start:]
body = body.replace(
    '**Format:** 1 hour a day, Mon–Fri, during office hours (~5h a week, ~110h in total).',
    '**Format:** 1 hour a day, Mon–Fri, during office hours (~5h a week, ~110h in total). '
    'Each day = **📖 Learn** one concept (~20 min, official docs) → **🛠 Build** it into the project (~40 min). '
    'Each Friday ends with a **✅ checkpoint**: a 15–20 min no-docs exercise that proves the week stuck. '
    'Every area is a from-scratch roadmap, and its project is the capstone.')

out = []
lines = body.split('\n')
i = 0
while i < len(lines):
    line = lines[i]
    for prefix, intro in INTROS.items():
        if line.startswith(prefix):
            out.append(line)
            out.append(intro)
            break
    else:
        if line.startswith('| Week | Mon |'):
            i += 2  # header + separator
            while i < len(lines) and re.match(r'^\| \d+ · ', lines[i]):
                m = re.match(r'^\| (\d+) · ([^|]+)\|(.*)\|\s*$', lines[i])
                week, title = int(m.group(1)), m.group(2).strip()
                builds = [c.strip() for c in m.group(3).split('|')]
                out += [f'#### Week {week} · {title}', '| Day | 📖 Learn | 🛠 Build |', '|---|---|---|']
                out += [f'| {DAYS[d]} | {LEARN[week][d]} | {builds[d]} |' for d in range(5)]
                out += ['', f'**✅ Checkpoint (Fri, no docs):** {CHECK[week]}', '']
                i += 1
            continue
        out.append(line)
    i += 1

open(PLAN, 'w', encoding='utf-8').write(head + '\n'.join(out))
print('weeks:', (head + '\n'.join(out)).count('#### Week'))
