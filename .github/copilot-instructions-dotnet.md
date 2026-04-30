# .NET (C#) Specific Instructions

## Stack

- .NET 8+
- `MongoDB.Driver` for DocumentDB access
- `Azure.Identity` for DefaultAzureCredential
- `Azure.AI.OpenAI` for Azure OpenAI

## File Structure

```
ai/select-algorithm-dotnet/
├── src/
│   ├── CompareAll.cs
│   └── Utils.cs
├── select-algorithm-dotnet.csproj
└── README.md

ai/vector-search-dotnet/
├── src/
│   ├── Ivf.cs
│   ├── Hnsw.cs
│   ├── Diskann.cs
│   └── Utils.cs
├── vector-search-dotnet.csproj
└── README.md
```

## Naming Conventions

- Files: `PascalCase.cs`
- Methods: `PascalCase`
- Constants: `PascalCase`
- Private fields: `_camelCase`
- Local variables: `camelCase`
- Namespaces: `Azure.DocumentDB.Samples`

## Authentication Pattern

```csharp
using Azure.Identity;
using MongoDB.Driver;
using MongoDB.Driver.Authentication.Oidc;

var credential = new DefaultAzureCredential();
var oidcCallback = new OidcCallback(async (parameters, cancellationToken) =>
{
    var token = await credential.GetTokenAsync(
        new TokenRequestContext(new[] { "https://ossrdbms-aad.database.windows.net/.default" }),
        cancellationToken);
    return new OidcAccessToken(token.Token, token.ExpiresOn);
});
```

## $search Syntax

```csharp
// CORRECT
var searchStage = new BsonDocument("$search",
    new BsonDocument("cosmosSearch",
        new BsonDocument
        {
            { "vector", new BsonArray(queryVector) },
            { "path", embeddedField },
            { "k", topK }
        }));

// WRONG — do NOT add cosmosSearchOptions to the $search stage
```

## Bulk Insert

Use `collection.InsertManyAsync()` with `InsertManyOptions { IsOrdered = false }`:

```csharp
using MongoDB.Driver;

try
{
    await collection.InsertManyAsync(batch, new InsertManyOptions { IsOrdered = false });
    insertedCount += batch.Count;
}
catch (MongoBulkWriteException<BsonDocument> e)
{
    // Partial failure — some docs inserted
    insertedCount += (int)e.Result.InsertedCount;
    failedCount += batch.Count - (int)e.Result.InsertedCount;
}
```

- Batch size configurable via `LOAD_SIZE_BATCH` env var (default: 100)
- 200ms delay between batches (`await Task.Delay(200)`)
- Catch `MongoBulkWriteException` for partial failure handling
- Always use the async variant (`InsertManyAsync`)

## Key Patterns

- Use `Environment.GetEnvironmentVariable("VAR") ?? "default"` for config
- Use `using` statements for disposable resources
- Use `try/finally` for collection cleanup
- Async/await throughout (use `Async` suffix on method names)
- Match TypeScript output format exactly

## Environment Variables

- Use `IConfiguration` with layered sources: `appsettings.json` → environment variables
- Provide `appsettings.json` with placeholder structure (committed) and gitignore `appsettings.local.json`
- Environment variables override JSON config values
- Bind to strongly-typed configuration classes (`AppConfiguration`, `AzureOpenAIConfiguration`, etc.)

```csharp
var configuration = new ConfigurationBuilder()
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddEnvironmentVariables()
    .Build();

var appConfig = configuration.Get<AppConfiguration>()
    ?? throw new InvalidOperationException("Failed to load configuration");
```

- Configuration class hierarchy:
  - `AppConfiguration` → root
  - `AzureOpenAIConfiguration` → endpoint, model, apiVersion
  - `MongoDBConfiguration` → connectionString, clusterName, loadBatchSize
  - `EmbeddingConfiguration` → fieldToEmbed, embeddedField, dimensions, batchSize
  - `VectorSearchConfiguration` → query, databaseName, topK

- Include `Microsoft.Extensions.Configuration` packages in `.csproj`

## Build & Run

```bash
dotnet run
```
