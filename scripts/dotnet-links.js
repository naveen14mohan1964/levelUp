// .NET track (JobHunt API, 14 assignment-weeks): documentation for each day's Learn topic, [week][Mon..Fri].
// Official docs first (Microsoft Learn), then the tool's own docs. Checked by `npm run check:links`.
const l = (label, url) => ({ label, url });
const MS = 'https://learn.microsoft.com/en-us';

module.exports = {
  1: [
    [l('.NET CLI overview', `${MS}/dotnet/core/tools/`), l('dotnet sln', `${MS}/dotnet/core/tools/dotnet-sln`), l('Common web app architectures', `${MS}/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures`)],
    [l('Records', `${MS}/dotnet/csharp/language-reference/builtin-types/record`), l('Nullable reference types', `${MS}/dotnet/csharp/nullable-references`)],
    [l('LINQ overview', `${MS}/dotnet/csharp/linq/`), l('Standard query operators', `${MS}/dotnet/csharp/linq/standard-query-operators/`)],
    [l('Exceptions and exception handling', `${MS}/dotnet/csharp/fundamentals/exceptions/`), l('Best practices for exceptions', `${MS}/dotnet/standard/exceptions/best-practices-for-exceptions`)],
    [l('Unit testing C# with xUnit', `${MS}/dotnet/core/testing/unit-testing-csharp-with-xunit`), l('Code coverage for unit testing', `${MS}/dotnet/core/testing/unit-testing-code-coverage`)],
  ],
  2: [
    [l('WebApplication and WebApplicationBuilder', `${MS}/aspnet/core/fundamentals/minimal-apis/webapplication`), l('ASP.NET Core fundamentals', `${MS}/aspnet/core/fundamentals/`)],
    [l('Dependency injection in ASP.NET Core', `${MS}/aspnet/core/fundamentals/dependency-injection`), l('Service lifetimes', `${MS}/dotnet/core/extensions/dependency-injection#service-lifetimes`)],
    [l('Middleware', `${MS}/aspnet/core/fundamentals/middleware/`), l('Write custom middleware', `${MS}/aspnet/core/fundamentals/middleware/write`)],
    [l('Configuration', `${MS}/aspnet/core/fundamentals/configuration/`), l('Options pattern', `${MS}/aspnet/core/fundamentals/configuration/options`), l('Safe storage of app secrets', `${MS}/aspnet/core/security/app-secrets`)],
    [l('Choose between controller-based and minimal APIs', `${MS}/aspnet/core/fundamentals/apis`), l('Create web APIs', `${MS}/aspnet/core/web-api/`)],
  ],
  3: [
    [l('EF Core overview', `${MS}/ef/core/`), l('DbContext lifetime and configuration', `${MS}/ef/core/dbcontext-configuration/`)],
    [l('Migrations overview', `${MS}/ef/core/managing-schemas/migrations/`), l('Creating and configuring a model', `${MS}/ef/core/modeling/`)],
    [l('Relationships', `${MS}/ef/core/modeling/relationships`), l('Cascade delete', `${MS}/ef/core/saving/cascade-delete`)],
    [l('Design the infrastructure persistence layer', `${MS}/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design`)],
    [l('Data seeding', `${MS}/ef/core/modeling/data-seeding`), l('Asynchronous programming in EF Core', `${MS}/ef/core/miscellaneous/async`)],
  ],
  4: [
    [l('Model validation', `${MS}/aspnet/core/mvc/models/validation`), l('FluentValidation', 'https://docs.fluentvalidation.net/en/latest/')],
    [l('Handle errors in ASP.NET Core', `${MS}/aspnet/core/fundamentals/error-handling`), l('Handle errors in web APIs', `${MS}/aspnet/core/web-api/handle-errors`)],
    [l('Client vs server evaluation', `${MS}/ef/core/querying/client-eval`), l('Pagination', `${MS}/ef/core/querying/pagination`)],
    [l('OpenAPI support in ASP.NET Core', `${MS}/aspnet/core/fundamentals/openapi/overview`)],
    [l('JsonPatch in ASP.NET Core web API', `${MS}/aspnet/core/web-api/jsonpatch`), l('MDN: idempotent methods', 'https://developer.mozilla.org/en-US/docs/Glossary/Idempotent')],
  ],
  5: [
    [l('Introduction to Identity', `${MS}/aspnet/core/security/authentication/identity`), l('Authentication overview', `${MS}/aspnet/core/security/authentication/`)],
    [l('Configure JWT bearer authentication', `${MS}/aspnet/core/security/authentication/configure-jwt-bearer-authentication`), l('jwt.io introduction', 'https://jwt.io/introduction')],
    [l('Refresh token rotation (Auth0 docs)', 'https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation')],
    [l('Policy-based authorization', `${MS}/aspnet/core/security/authorization/policies`), l('Resource-based authorization', `${MS}/aspnet/core/security/authorization/resourcebased`), l('Global query filters', `${MS}/ef/core/querying/filters`)],
    [l('OpenID Connect on the Microsoft identity platform', `${MS}/entra/identity-platform/v2-protocols-oidc`), l('Register an application', `${MS}/entra/identity-platform/quickstart-register-app`)],
  ],
  6: [
    [l('Unit testing best practices', `${MS}/dotnet/core/testing/unit-testing-best-practices`), l('NSubstitute', 'https://nsubstitute.github.io/help/getting-started/')],
    [l('Integration tests in ASP.NET Core', `${MS}/aspnet/core/test/integration-tests`)],
    [l('Testcontainers for .NET', 'https://dotnet.testcontainers.org/'), l('Testing against your production database (EF Core)', `${MS}/ef/core/testing/testing-with-the-database`)],
    [l('Integration tests: mock authentication', `${MS}/aspnet/core/test/integration-tests#mock-authentication`)],
    [l('Code coverage for unit testing', `${MS}/dotnet/core/testing/unit-testing-code-coverage`), l('ReportGenerator', 'https://github.com/danielpalme/ReportGenerator')],
  ],
  7: [
    [l('Simple logging (see the SQL)', `${MS}/ef/core/logging-events-diagnostics/simple-logging`), l('Efficient querying', `${MS}/ef/core/performance/efficient-querying`)],
    [l('Tracking vs no-tracking queries', `${MS}/ef/core/querying/tracking`), l('Single vs split queries', `${MS}/ef/core/querying/single-split-queries`)],
    [l('Indexes in EF Core', `${MS}/ef/core/modeling/indexes`), l('SQL Server index design guide', `${MS}/sql/relational-databases/sql-server-index-design-guide`)],
    [l('Using transactions', `${MS}/ef/core/saving/transactions`)],
    [l('Handling concurrency conflicts', `${MS}/ef/core/saving/concurrency`)],
  ],
  8: [
    [l('Caching overview', `${MS}/aspnet/core/performance/caching/overview`), l('In-memory caching', `${MS}/aspnet/core/performance/caching/memory`)],
    [l('Distributed caching', `${MS}/aspnet/core/performance/caching/distributed`), l('Redis docs', 'https://redis.io/docs/latest/')],
    [l('Output caching middleware', `${MS}/aspnet/core/performance/caching/output`)],
    [l('Rate limiting middleware', `${MS}/aspnet/core/performance/rate-limit`)],
    [l('Rate limiting: partitioned limiters', `${MS}/aspnet/core/performance/rate-limit#limiter-algorithms`), l('MDN: Retry-After', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After')],
  ],
  9: [
    [l('IHttpClientFactory', `${MS}/dotnet/core/extensions/httpclient-factory`)],
    [l('Build resilient HTTP apps', `${MS}/dotnet/core/resilience/http-resilience`), l('Retry pattern', `${MS}/azure/architecture/patterns/retry`)],
    [l('Circuit Breaker pattern', `${MS}/azure/architecture/patterns/circuit-breaker`), l('Polly docs', 'https://www.pollydocs.org/')],
    [l('Background tasks with hosted services', `${MS}/aspnet/core/fundamentals/host/hosted-services`), l('System.Threading.Channels', `${MS}/dotnet/core/extensions/channels`)],
    [l('Hangfire docs', 'https://docs.hangfire.io/en/latest/'), l('Quartz.NET docs', 'https://www.quartz-scheduler.net/documentation/')],
  ],
  10: [
    [l('Logging in .NET', `${MS}/dotnet/core/extensions/logging`), l('Serilog for ASP.NET Core', 'https://github.com/serilog/serilog-aspnetcore')],
    [l('Logging in ASP.NET Core', `${MS}/aspnet/core/fundamentals/logging/`)],
    [l('.NET observability with OpenTelemetry', `${MS}/dotnet/core/diagnostics/observability-with-otel`), l('Standalone Aspire dashboard', `${MS}/dotnet/aspire/fundamentals/dashboard/standalone`)],
    [l('Health checks in ASP.NET Core', `${MS}/aspnet/core/host-and-deploy/health-checks`)],
    [l('Application Insights for ASP.NET Core', `${MS}/azure/azure-monitor/app/asp-net-core`)],
  ],
  11: [
    [l('Asynchronous messaging options', `${MS}/azure/architecture/guide/technology-choices/messaging`)],
    [l('RabbitMQ tutorial (.NET)', 'https://www.rabbitmq.com/tutorials/tutorial-one-dotnet'), l('Azure Service Bus overview', `${MS}/azure/service-bus-messaging/service-bus-messaging-overview`)],
    [l('Worker services in .NET', `${MS}/dotnet/core/extensions/workers`), l('Dead-letter queues', `${MS}/azure/service-bus-messaging/service-bus-dead-letter-queues`)],
    [l('Transactional outbox pattern', 'https://microservices.io/patterns/data/transactional-outbox.html')],
    [l('Idempotent consumer', 'https://microservices.io/patterns/communication-style/idempotent-consumer.html'), l('MassTransit concepts', 'https://masstransit.io/documentation/concepts')],
  ],
  12: [
    [l('OWASP API Security Top 10 (2023)', 'https://owasp.org/API-Security/editions/2023/en/0x11-t10/')],
    [l('SQL queries in EF Core (parameterised)', `${MS}/ef/core/querying/sql-queries`), l('OWASP SQL injection prevention', 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html')],
    [l('Enable CORS', `${MS}/aspnet/core/security/cors`), l('Enforce HTTPS and HSTS', `${MS}/aspnet/core/security/enforcing-ssl`)],
    [l('Safe storage of app secrets', `${MS}/aspnet/core/security/app-secrets`), l('Azure Key Vault configuration provider', `${MS}/aspnet/core/security/key-vault-configuration`)],
    [l('Auditing package dependencies (NuGet)', `${MS}/nuget/concepts/auditing-packages`)],
  ],
  13: [
    [l('Containerize a .NET app', `${MS}/dotnet/core/docker/build-container`), l('Docker multi-stage builds', 'https://docs.docker.com/build/building/multi-stage/')],
    [l('Docker Compose', 'https://docs.docker.com/compose/')],
    [l('Building and testing .NET (GitHub Actions)', 'https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-net')],
    [l('Deploy to App Service with GitHub Actions', `${MS}/azure/app-service/deploy-github-actions`), l('Deployment slots', `${MS}/azure/app-service/deploy-staging-slots`)],
    [l('Design to scale out', `${MS}/azure/architecture/guide/design-principles/scale-out`), l('Scale up an App Service app', `${MS}/azure/app-service/manage-scale-up`)],
  ],
  14: [
    [l('Common web application architectures', `${MS}/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures`), l('NetArchTest', 'https://github.com/BenMorris/NetArchTest')],
    [l('Architecture decision records', 'https://adr.github.io/')],
    [l('k6 documentation', 'https://grafana.com/docs/k6/latest/')],
    [l('.http files in Visual Studio', `${MS}/aspnet/core/test/http-files`)],
    [l('The STAR method (MIT CAPD)', 'https://capd.mit.edu/resources/the-star-method-for-behavioral-interviews/')],
  ],
};
