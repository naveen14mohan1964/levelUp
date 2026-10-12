// Exact documentation / learning links for every module. Verified by `npm run check:links`.
// Shape: { label, url }. Keep labels short: "<site>: <page>".
const l = (label, url) => ({ label, url });

const MDN = 'https://developer.mozilla.org/en-US/docs';
const JAVA = 'https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util';
const CPA = 'https://cp-algorithms.com';
const LCX = 'https://leetcode.com/explore/learn/card';
const MS = 'https://learn.microsoft.com/en-us';

// DSA: one array per study day (Mon..Sat), indexed by week number.
const DSA_DAY_LINKS = {
  1: [
    [l('dev.java: Collections framework', 'https://dev.java/learn/api/collections-framework/'), l('Big-O cheat sheet', 'https://www.bigocheatsheet.com/')],
    [l('cp-algorithms: Euclid (GCD)', `${CPA}/algebra/euclid-algorithm.html`), l('cp-algorithms: Sieve of Eratosthenes', `${CPA}/algebra/sieve-of-eratosthenes.html`), l('cp-algorithms: Binary exponentiation', `${CPA}/algebra/binary-exp.html`)],
    [l('LeetCode Explore: Arrays 101', `${LCX}/fun-with-arrays/`), l('Java: Arrays class', `${JAVA}/Arrays.html`)],
    [l('Boyer–Moore majority vote', 'https://en.wikipedia.org/wiki/Boyer%E2%80%93Moore_majority_vote_algorithm'), l('LeetCode Explore: Arrays 101', `${LCX}/fun-with-arrays/`)],
    [l('cp-algorithms: Bit manipulation', `${CPA}/algebra/bit-manipulation.html`)],
    [l('LeetCode Explore: Array and String (2D arrays)', `${LCX}/array-and-string/`)],
  ],
  2: [
    [l('LeetCode Explore: Two-pointer technique', `${LCX}/array-and-string/`), l('NeetCode roadmap', 'https://neetcode.io/roadmap')],
    [l('Dutch national flag problem', 'https://en.wikipedia.org/wiki/Dutch_national_flag_problem')],
    [l('USACO Guide: Prefix sums', 'https://usaco.guide/silver/prefix-sums')],
    [l("Kadane's algorithm", 'https://en.wikipedia.org/wiki/Maximum_subarray_problem')],
    [l('Next permutation (lexicographic order)', 'https://en.wikipedia.org/wiki/Permutation#Generation_in_lexicographic_order')],
    [l('Interval scheduling', 'https://en.wikipedia.org/wiki/Interval_scheduling'), l('USACO Guide: Greedy with sorting', 'https://usaco.guide/silver/greedy-sorting')],
  ],
  3: [
    [l('LeetCode Explore: Hash Table', `${LCX}/hash-table/`), l('Java: HashMap', `${JAVA}/HashMap.html`)],
    [l('Java: StringBuilder', 'https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/StringBuilder.html'), l('LeetCode Explore: Array and String', `${LCX}/array-and-string/`)],
    [l("cp-algorithms: Manacher's (palindromes)", `${CPA}/string/manacher.html`)],
    [l('USACO Guide: Sliding window', 'https://usaco.guide/gold/sliding-window')],
    [l('USACO Guide: Sliding window', 'https://usaco.guide/gold/sliding-window'), l('NeetCode roadmap', 'https://neetcode.io/roadmap')],
    [l('USACO Guide: Sliding window', 'https://usaco.guide/gold/sliding-window')],
  ],
  4: [
    [l('VisuAlgo: Sorting', 'https://visualgo.net/en/sorting'), l('Java: Comparator', `${JAVA}/Comparator.html`)],
    [l('Quickselect', 'https://en.wikipedia.org/wiki/Quickselect'), l('VisuAlgo: Merge sort', 'https://visualgo.net/en/sorting')],
    [l('LeetCode Explore: Binary Search', `${LCX}/binary-search/`), l('cp-algorithms: Binary search', `${CPA}/num_methods/binary_search.html`)],
    [l('LeetCode Explore: Binary Search', `${LCX}/binary-search/`)],
    [l('USACO Guide: Binary search on the answer', 'https://usaco.guide/silver/binary-search'), l('cp-algorithms: Binary search', `${CPA}/num_methods/binary_search.html`)],
    [l('LeetCode Explore: Binary Search', `${LCX}/binary-search/`)],
  ],
  5: [
    [l('LeetCode Explore: Recursion I', `${LCX}/recursion-i/`)],
    [l('LeetCode Explore: Recursion II', `${LCX}/recursion-ii/`)],
    [l('LeetCode Explore: Recursion II', `${LCX}/recursion-ii/`)],
    [l('Backtracking', 'https://en.wikipedia.org/wiki/Backtracking')],
    [l('Eight queens puzzle', 'https://en.wikipedia.org/wiki/Eight_queens_puzzle'), l('LeetCode Explore: Recursion II', `${LCX}/recursion-ii/`)],
    [l('LeetCode Explore: Recursion II', `${LCX}/recursion-ii/`)],
  ],
  6: [
    [l('LeetCode Explore: Linked List', `${LCX}/linked-list/`)],
    [l("Floyd's cycle detection", 'https://en.wikipedia.org/wiki/Cycle_detection')],
    [l('LeetCode Explore: Linked List', `${LCX}/linked-list/`)],
    [l('LeetCode Explore: Linked List', `${LCX}/linked-list/`)],
    [l('Java: LinkedList', `${JAVA}/LinkedList.html`)],
    [l('Java: LinkedHashMap (LRU)', `${JAVA}/LinkedHashMap.html`)],
  ],
  7: [
    [l('LeetCode Explore: Queue & Stack', `${LCX}/queue-stack/`), l('Java: ArrayDeque', `${JAVA}/ArrayDeque.html`)],
    [l('cp-algorithms: Expression parsing', `${CPA}/string/expression_parsing.html`)],
    [l('cp-algorithms: Stack/queue modifications', `${CPA}/data_structures/stack_queue_modification.html`)],
    [l('cp-algorithms: Stack/queue modifications', `${CPA}/data_structures/stack_queue_modification.html`)],
    [l('Java: ArrayDeque', `${JAVA}/ArrayDeque.html`), l('LeetCode Explore: Queue & Stack', `${LCX}/queue-stack/`)],
    [l('LeetCode Explore: Queue & Stack', `${LCX}/queue-stack/`)],
  ],
  8: [
    [l('LeetCode Explore: Binary Tree', `${LCX}/data-structure-tree/`)],
    [l('LeetCode Explore: Binary Tree', `${LCX}/data-structure-tree/`)],
    [l('VisuAlgo: Binary trees', 'https://visualgo.net/en/bst')],
    [l('LeetCode Explore: Binary Tree', `${LCX}/data-structure-tree/`)],
    [l('cp-algorithms: Lowest common ancestor', `${CPA}/graph/lca.html`)],
    [l('LeetCode Explore: Binary Tree', `${LCX}/data-structure-tree/`)],
  ],
  9: [
    [l('VisuAlgo: BST', 'https://visualgo.net/en/bst'), l('LeetCode Explore: BST', `${LCX}/introduction-to-data-structure-binary-search-tree/`)],
    [l('Java: TreeMap', `${JAVA}/TreeMap.html`)],
    [l('VisuAlgo: Binary heap', 'https://visualgo.net/en/heap'), l('Java: PriorityQueue', `${JAVA}/PriorityQueue.html`)],
    [l('Java: PriorityQueue', `${JAVA}/PriorityQueue.html`)],
    [l('VisuAlgo: Binary heap', 'https://visualgo.net/en/heap')],
    [l('LeetCode Explore: Trie', `${LCX}/trie/`)],
  ],
  10: [
    [l('cp-algorithms: DFS', `${CPA}/graph/depth-first-search.html`), l('cp-algorithms: BFS', `${CPA}/graph/breadth-first-search.html`), l('VisuAlgo: Graph traversal', 'https://visualgo.net/en/dfsbfs')],
    [l('cp-algorithms: BFS', `${CPA}/graph/breadth-first-search.html`)],
    [l('cp-algorithms: Finding a cycle', `${CPA}/graph/finding-cycle.html`), l('cp-algorithms: Bipartite check', `${CPA}/graph/bipartite-check.html`)],
    [l('cp-algorithms: Topological sort', `${CPA}/graph/topological-sort.html`)],
    [l('cp-algorithms: BFS', `${CPA}/graph/breadth-first-search.html`)],
    [l('LeetCode Explore: Graph', `${LCX}/graph/`)],
  ],
  11: [
    [l('cp-algorithms: Dijkstra', `${CPA}/graph/dijkstra.html`)],
    [l('cp-algorithms: Bellman–Ford', `${CPA}/graph/bellman_ford.html`), l('cp-algorithms: Floyd–Warshall', `${CPA}/graph/all-pair-shortest-path-floyd-warshall.html`)],
    [l('cp-algorithms: Disjoint set union', `${CPA}/data_structures/disjoint_set_union.html`)],
    [l("cp-algorithms: Kruskal's MST", `${CPA}/graph/mst_kruskal.html`), l("cp-algorithms: Prim's MST", `${CPA}/graph/mst_prim.html`), l('cp-algorithms: Bridges', `${CPA}/graph/bridge-searching.html`)],
    [l('USACO Guide: Greedy with sorting', 'https://usaco.guide/silver/greedy-sorting')],
    [l('USACO Guide: Greedy with sorting', 'https://usaco.guide/silver/greedy-sorting')],
  ],
  12: [
    [l('cp-algorithms: Introduction to DP', `${CPA}/dynamic_programming/intro-to-dp.html`), l('LeetCode Explore: DP', `${LCX}/dynamic-programming/`)],
    [l('LeetCode Explore: DP', `${LCX}/dynamic-programming/`)],
    [l('USACO Guide: Paths on grids', 'https://usaco.guide/gold/paths-grids')],
    [l('cp-algorithms: Knapsack', `${CPA}/dynamic_programming/knapsack.html`)],
    [l('cp-algorithms: Knapsack', `${CPA}/dynamic_programming/knapsack.html`)],
    [l('Longest common subsequence', 'https://en.wikipedia.org/wiki/Longest_common_subsequence')],
  ],
  13: [
    [l('Levenshtein (edit) distance', 'https://en.wikipedia.org/wiki/Levenshtein_distance')],
    [l('cp-algorithms: LIS', `${CPA}/sequences/longest_increasing_subsequence.html`)],
    [l('LeetCode Explore: DP', `${LCX}/dynamic-programming/`)],
    [l('USACO Guide: Range DP', 'https://usaco.guide/gold/dp-ranges')],
    [l('USACO Guide: DP on trees', 'https://usaco.guide/gold/dp-trees'), l('USACO Guide: Bitmask DP', 'https://usaco.guide/gold/dp-bitmasks')],
    [l('cp-algorithms: Segment tree', `${CPA}/data_structures/segment_tree.html`), l('cp-algorithms: Fenwick tree', `${CPA}/data_structures/fenwick.html`), l('cp-algorithms: Prefix function (KMP)', `${CPA}/string/prefix-function.html`)],
  ],
};

// Phase 2 (revision): same practice sources every day.
const PHASE2_LINKS = [
  l('LeetCode: Top Interview 150', 'https://leetcode.com/studyplan/top-interview-150/'),
  l('NeetCode 150', 'https://neetcode.io/practice'),
  l('Grind 75 (Blind 75 successor)', 'https://www.techinterviewhandbook.org/grind75/'),
];

// Free video channels referenced in the plan.
const CHANNELS = [
  l('Kunal Kushwaha (Java + DSA)', 'https://www.youtube.com/@KunalKushwaha'),
  l('takeUforward (Striver A2Z)', 'https://www.youtube.com/@takeUforward'),
  l('NeetCode', 'https://www.youtube.com/@NeetCode'),
  l('Abdul Bari', 'https://www.youtube.com/@abdul_bari'),
  l('Aditya Verma', 'https://www.youtube.com/@TheAdityaVerma'),
  l('William Fiset', 'https://www.youtube.com/@WilliamFiset-videos'),
];

// Projects: one array per Learn topic (Mon..Fri), indexed by week number (1–21).
const PROJECT_LEARN_LINKS = {
  1: [
    [l('Node.js: Introduction', 'https://nodejs.org/learn/getting-started/introduction-to-nodejs'), l('Node.js: ECMAScript modules', 'https://nodejs.org/api/esm.html'), l('npm: scripts', 'https://docs.npmjs.com/cli/v10/using-npm/scripts')],
    [l('Node.js: http module', 'https://nodejs.org/api/http.html'), l('Node.js: The event loop', 'https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick')],
    [l('Express: Routing', 'https://expressjs.com/en/guide/routing/'), l('Express: Using middleware', 'https://expressjs.com/en/guide/using-middleware/')],
    [l('MDN: HTTP request methods', `${MDN}/Web/HTTP/Reference/Methods`), l('MDN: HTTP status codes', `${MDN}/Web/HTTP/Reference/Status`)],
    [l('Express: Error handling', 'https://expressjs.com/en/guide/error-handling/'), l('Postman: Environments', 'https://learning.postman.com/docs/use/send-requests/variables/managing-environments/')],
  ],
  2: [
    [l('MongoDB: Data modeling', 'https://www.mongodb.com/docs/manual/data-modeling/'), l('MongoDB: Connection strings', 'https://www.mongodb.com/docs/manual/reference/connection-string/')],
    [l('Mongoose: Schemas', 'https://mongoosejs.com/docs/guide.html'), l('Mongoose: Validation', 'https://mongoosejs.com/docs/validation.html')],
    [l('Mongoose: Queries', 'https://mongoosejs.com/docs/queries.html'), l('MongoDB: Text indexes', 'https://www.mongodb.com/docs/manual/core/indexes/index-types/index-text/')],
    [l('Zod: Basic usage', 'https://zod.dev/basics')],
    [l('Express: express.Router', 'https://expressjs.com/en/guide/routing/#expressrouter'), l('Node best practices: Project structure', 'https://github.com/goldbergyoni/nodebestpractices#1-project-architecture-practices')],
  ],
  3: [
    [l('OWASP: Password storage', 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html'), l('npm: bcrypt', 'https://www.npmjs.com/package/bcrypt')],
    [l('JWT: Introduction', 'https://www.jwt.io/introduction'), l('RFC 7519 (JWT)', 'https://datatracker.ietf.org/doc/html/rfc7519')],
    [l('MDN: 401 Unauthorized', `${MDN}/Web/HTTP/Reference/Status/401`), l('MDN: 403 Forbidden', `${MDN}/Web/HTTP/Reference/Status/403`)],
    [l('MDN: Using HTTP cookies', `${MDN}/Web/HTTP/Guides/Cookies`), l('Auth0: Refresh tokens', 'https://auth0.com/docs/secure/tokens/refresh-tokens')],
    [l('Express: Security best practices', 'https://expressjs.com/en/advanced/best-practice-security/'), l('Helmet', 'https://helmet.js.org/'), l('npm: express-rate-limit', 'https://www.npmjs.com/package/express-rate-limit')],
  ],
  4: [
    [l('MongoDB: Unique indexes', 'https://www.mongodb.com/docs/manual/core/index-unique/')],
    [l('MongoDB: Embed vs link related data', 'https://www.mongodb.com/docs/manual/data-modeling/best-practices/#link-related-data'), l('Mongoose: Populate', 'https://mongoosejs.com/docs/populate.html')],
    [l('MongoDB: Aggregation pipeline', 'https://www.mongodb.com/docs/manual/core/aggregation-pipeline/')],
    [l('Pino', 'https://getpino.io/'), l('pino-http', 'https://github.com/pinojs/pino-http')],
    [l('Swagger: OpenAPI 3.0 guide', 'https://swagger.io/docs/specification/v3_0/about/'), l('OpenAPI: Getting started', 'https://learn.openapis.org/')],
  ],
  5: [
    [l('Jest: Getting started', 'https://jestjs.io/docs/getting-started'), l('Jest: Setup and teardown', 'https://jestjs.io/docs/setup-teardown')],
    [l('Supertest', 'https://github.com/forwardemail/supertest')],
    [l('Jest: Mock functions', 'https://jestjs.io/docs/mock-functions'), l('mongodb-memory-server', 'https://github.com/typegoose/mongodb-memory-server')],
    [l('MDN: WebSockets API', `${MDN}/Web/API/WebSockets_API`), l('Socket.IO: Rooms', 'https://socket.io/docs/v4/rooms/')],
    [l('npm: lru-cache', 'https://www.npmjs.com/package/lru-cache')],
  ],
  6: [
    [l('Docker: What is an image?', 'https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-an-image/'), l('Docker Compose', 'https://docs.docker.com/compose/')],
    [l('GitHub Actions: Building Node.js', 'https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs')],
    [l('The Twelve-Factor App: Config', 'https://12factor.net/config')],
    [l('Make a README', 'https://www.makeareadme.com/'), l('C4 model (diagrams)', 'https://c4model.com/')],
    [l('Tech Interview Handbook: Behavioral', 'https://www.techinterviewhandbook.org/behavioral-interview/')],
  ],
  7: [
    [l('dotnet sln', `${MS}/dotnet/core/tools/dotnet-sln`), l('Common web app architectures', `${MS}/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures`)],
    [l('ASP.NET Core: Dependency injection', `${MS}/aspnet/core/fundamentals/dependency-injection`), l('ASP.NET Core: Middleware', `${MS}/aspnet/core/fundamentals/middleware/`), l('ASP.NET Core: Configuration', `${MS}/aspnet/core/fundamentals/configuration/`)],
    [l('C#: Records', `${MS}/dotnet/csharp/fundamentals/types/records`), l('C#: Nullable reference types', `${MS}/dotnet/csharp/fundamentals/null-safety/nullable-reference-types`)],
    [l('EF Core: DbContext configuration', `${MS}/ef/core/dbcontext-configuration/`), l('EF Core: Migrations', `${MS}/ef/core/managing-schemas/migrations/`)],
    [l('ASP.NET Core: APIs overview', `${MS}/aspnet/core/fundamentals/apis`), l('Tutorial: Prevent over-posting (DTOs)', `${MS}/aspnet/core/tutorials/first-web-api#prevent-over-posting`)],
  ],
  8: [
    [l('Mapster', 'https://github.com/MapsterMapper/Mapster')],
    [l('C#: Asynchronous programming', `${MS}/dotnet/csharp/asynchronous-programming/`), l('Cancellation in managed threads', `${MS}/dotnet/standard/threading/cancellation-in-managed-threads`)],
    [l('EF Core: Client vs server evaluation', `${MS}/ef/core/querying/client-eval`), l('EF Core: Pagination', `${MS}/ef/core/querying/pagination`)],
    [l('FluentValidation: ASP.NET Core', 'https://docs.fluentvalidation.net/en/latest/aspnet.html'), l('ASP.NET Core: Handle errors (ProblemDetails)', `${MS}/aspnet/core/fundamentals/error-handling-api`)],
    [l('ASP.NET Core: Write custom middleware', `${MS}/aspnet/core/fundamentals/middleware/write`), l('ASP.NET Core: Error handling', `${MS}/aspnet/core/fundamentals/error-handling`)],
  ],
  9: [
    [l('ASP.NET Core Identity', `${MS}/aspnet/core/security/authentication/identity`)],
    [l('Configure JWT bearer authentication', `${MS}/aspnet/core/security/authentication/configure-jwt-bearer-authentication`)],
    [l('EF Core: Global query filters', `${MS}/ef/core/querying/filters`)],
    [l('Policy-based authorization', `${MS}/aspnet/core/security/authorization/policies`), l('Role-based authorization', `${MS}/aspnet/core/security/authorization/roles`)],
    [l('Auth0: Refresh token rotation', 'https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation')],
  ],
  10: [
    [l('EF Core: Relationships', `${MS}/ef/core/modeling/relationships`), l('EF Core: Loading related data', `${MS}/ef/core/querying/related-data/`), l('EF Core: Tracking vs no-tracking', `${MS}/ef/core/querying/tracking`)],
    [l('EF Core: Interceptors', `${MS}/ef/core/logging-events-diagnostics/interceptors`)],
    [l('EF Core: Complex query operators', `${MS}/ef/core/querying/complex-query-operators`)],
    [l('ASP.NET Core: Hosted services', `${MS}/aspnet/core/fundamentals/host/hosted-services`)],
    [l('.NET DI: Service lifetimes', `${MS}/dotnet/core/extensions/dependency-injection/service-lifetimes`), l('.NET DI guidelines (captive dependency)', `${MS}/dotnet/core/extensions/dependency-injection/guidelines`)],
  ],
  11: [
    [l('Serilog.AspNetCore', 'https://github.com/serilog/serilog-aspnetcore')],
    [l('Unit testing with xUnit', `${MS}/dotnet/core/testing/unit-testing-csharp-with-xunit`), l('NSubstitute: Getting started', 'https://nsubstitute.github.io/help/getting-started/')],
    [l('ASP.NET Core: Integration tests', `${MS}/aspnet/core/test/integration-tests`)],
    [l('ASP.NET Core: OpenAPI overview', `${MS}/aspnet/core/fundamentals/openapi/overview`)],
    [l('ASP.NET Core: Rate limiting', `${MS}/aspnet/core/performance/rate-limit`)],
  ],
  12: [
    [l('ASP.NET Core: In-memory cache', `${MS}/aspnet/core/performance/caching/memory`), l('ASP.NET Core: Output caching', `${MS}/aspnet/core/performance/caching/output`)],
    [l('EF Core: Indexes', `${MS}/ef/core/modeling/indexes`), l('EF Core: Simple logging (see the SQL)', `${MS}/ef/core/logging-events-diagnostics/simple-logging`)],
    [l('ASP.NET Core: Health checks', `${MS}/aspnet/core/host-and-deploy/health-checks`)],
    [l('Containerize a .NET app', `${MS}/dotnet/core/docker/build-container`), l('SQL Server in Docker', `${MS}/sql/linux/install-upgrade/quickstart-install-docker`)],
    [l('roadmap.sh: ASP.NET Core', 'https://roadmap.sh/aspnet-core')],
  ],
  13: [
    [l('ASP.NET Core: File uploads', `${MS}/aspnet/core/mvc/models/file-uploads`)],
    [l('.NET: File providers', `${MS}/aspnet/core/fundamentals/file-providers`)],
    [l('SQL Server: Full-text search', `${MS}/sql/relational-databases/search/full-text-search`)],
    [l('Architectural principles (SOLID)', `${MS}/dotnet/architecture/modern-web-apps-azure/architectural-principles`)],
    [l('Refactoring catalog', 'https://refactoring.guru/refactoring/catalog')],
  ],
  14: [
    [l('GitHub Actions: Building .NET', 'https://docs.github.com/en/actions/tutorials/build-and-test-code/net')],
    [l('Azure App Service: .NET quickstart', `${MS}/azure/app-service/quickstart-dotnetcore`), l('Azure SQL Database free offer', `${MS}/azure/azure-sql/database/free-offer`)],
    [l('Mermaid: ER diagrams', 'https://mermaid.js.org/syntax/entityRelationshipDiagram.html'), l('C4 model', 'https://c4model.com/')],
    [l('Visual Studio: .http files', `${MS}/aspnet/core/test/http-files`)],
    [l('Tech Interview Handbook: Behavioral', 'https://www.techinterviewhandbook.org/behavioral-interview/')],
  ],
  15: [
    [l('React: Describing the UI', 'https://react.dev/learn/describing-the-ui'), l('Vite: Getting started', 'https://vite.dev/guide/')],
    [l('React: Adding interactivity', 'https://react.dev/learn/adding-interactivity'), l('React: Using TypeScript', 'https://react.dev/learn/typescript')],
    [l('React Router: Routing', 'https://reactrouter.com/start/declarative/routing')],
    [l('React: You might not need an effect', 'https://react.dev/learn/you-might-not-need-an-effect'), l('React: Synchronizing with effects', 'https://react.dev/learn/synchronizing-with-effects')],
    [l('React: Controlled inputs', 'https://react.dev/reference/react-dom/components/input#controlling-an-input-with-a-state-variable'), l('React Router: Navigating', 'https://reactrouter.com/start/declarative/navigating')],
  ],
  16: [
    [l('TanStack Query: Overview', 'https://tanstack.com/query/latest/docs/framework/react/overview'), l('TanStack Query: Query keys', 'https://tanstack.com/query/latest/docs/framework/react/guides/query-keys')],
    [l('React Router: useSearchParams', 'https://reactrouter.com/api/hooks/useSearchParams')],
    [l('React Hook Form: Schema validation', 'https://react-hook-form.com/get-started#SchemaValidation'), l('Zod: Basic usage', 'https://zod.dev/basics')],
    [l('TanStack Query: Optimistic updates', 'https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates'), l('TanStack Query: Invalidation from mutations', 'https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations')],
    [l('React: Error boundaries', 'https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary')],
  ],
  17: [
    [l('React: Rendering lists', 'https://react.dev/learn/rendering-lists')],
    [l('dnd-kit: Docs', 'https://dndkit.com/'), l('dnd-kit: Accessibility', 'https://dndkit.com/legacy/guides/accessibility/')],
    [l('React: Passing JSX as children', 'https://react.dev/learn/passing-props-to-a-component#passing-jsx-as-children')],
    [l('Axios: Interceptors', 'https://axios.rest/pages/advanced/interceptors')],
    [l('React: Passing data with context', 'https://react.dev/learn/passing-data-deeply-with-context'), l('React: Optimizing context re-renders', 'https://react.dev/reference/react/useContext#optimizing-re-renders-when-passing-objects-and-functions')],
  ],
  18: [
    [l('React: Avoid redundant state', 'https://react.dev/learn/choosing-the-state-structure#avoid-redundant-state')],
    [l('Recharts: Getting started', 'https://recharts.github.io/en-US/guide/getting-started/')],
    [l('MDN: Responsive design', `${MDN}/Learn_web_development/Core/CSS_layout/Responsive_Design`), l('MDN: CSS grid layout', `${MDN}/Web/CSS/Guides/Grid_layout`)],
    [l('MDN: Using CSS custom properties', `${MDN}/Web/CSS/Guides/Cascading_variables/Using_custom_properties`), l('MDN: prefers-color-scheme', `${MDN}/Web/CSS/Reference/At-rules/@media/prefers-color-scheme`)],
    [l('MDN: Accessibility', `${MDN}/Learn_web_development/Core/Accessibility`), l('W3C ARIA Authoring Practices', 'https://www.w3.org/WAI/ARIA/apg/')],
  ],
  19: [
    [l('Testing Library: Guiding principles', 'https://testing-library.com/docs/guiding-principles'), l('React Testing Library', 'https://testing-library.com/docs/react-testing-library/intro/')],
    [l('user-event', 'https://testing-library.com/docs/user-event/intro')],
    [l('Mock Service Worker', 'https://mswjs.io/docs/')],
    [l('React: memo', 'https://react.dev/reference/react/memo'), l('React: lazy', 'https://react.dev/reference/react/lazy')],
    [l('React: Custom hooks', 'https://react.dev/learn/reusing-logic-with-custom-hooks')],
  ],
  20: [
    [l('MDN: Debounce', `${MDN}/Glossary/Debounce`)],
    [l('MDN: FormData', `${MDN}/Web/API/FormData`), l('MDN: Using files from web apps', `${MDN}/Web/API/File_API/Using_files_from_web_applications`)],
    [l('Papa Parse docs', 'https://www.papaparse.com/docs')],
    [l('React: Suspense', 'https://react.dev/reference/react/Suspense'), l('NN/g: Skeleton screens', 'https://www.nngroup.com/articles/skeleton-screens/')],
    [l('React: Learn', 'https://react.dev/learn')],
  ],
  21: [
    [l('Vite: Env variables and modes', 'https://vite.dev/guide/env-and-mode'), l('Vite: Building for production', 'https://vite.dev/guide/build')],
    [l('Vercel: Vite', 'https://vercel.com/docs/frameworks/frontend/vite'), l('MDN: CORS', `${MDN}/Web/HTTP/Guides/CORS`)],
    [l('Playwright: Installation', 'https://playwright.dev/docs/intro')],
    [l('Make a README', 'https://www.makeareadme.com/')],
    [l('Tech Interview Handbook: Behavioral', 'https://www.techinterviewhandbook.org/behavioral-interview/')],
  ],
};

// Week 22 portfolio wrap-up (Mon..Fri)
const PORTFOLIO_LINKS = [
  [l('GitHub: Profile README', 'https://docs.github.com/en/account-and-profile/how-tos/profile-customization/managing-your-profile-readme'), l('GitHub: Pinning items', 'https://docs.github.com/en/account-and-profile/how-tos/profile-customization/pinning-items-to-your-profile')],
  [l('Tech Interview Handbook: Resume', 'https://www.techinterviewhandbook.org/resume/')],
  [l('Tech Interview Handbook: Behavioral', 'https://www.techinterviewhandbook.org/behavioral-interview/')],
  [l('Tech Interview Handbook: Behavioral', 'https://www.techinterviewhandbook.org/behavioral-interview/')],
  [],
];

module.exports = { DSA_DAY_LINKS, PHASE2_LINKS, CHANNELS, PROJECT_LEARN_LINKS, PORTFOLIO_LINKS };
