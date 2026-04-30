# Go-Specific Instructions

## Stack

- Go 1.21+
- `go.mongodb.org/mongo-driver/v2` for DocumentDB access
- `github.com/Azure/azure-sdk-for-go/sdk/azidentity` for DefaultAzureCredential
- `github.com/openai/openai-go` for Azure OpenAI

## File Structure

```
ai/select-algorithm-go/
├── src/
│   ├── compare_all.go    # Multi-query comparison runner
│   └── utils.go          # Shared utilities
├── go.mod
├── go.sum
└── README.md

ai/vector-search-go/
├── src/
│   ├── ivf.go
│   ├── hnsw.go
│   ├── diskann.go
│   └── utils.go
├── go.mod
├── go.sum
└── README.md
```

## Naming Conventions

- Files: `snake_case.go`
- Functions: `PascalCase` (exported), `camelCase` (unexported)
- Constants: `PascalCase` or `camelCase`
- Packages: `lowercase`

## Authentication Pattern

```go
import (
    "github.com/Azure/azure-sdk-for-go/sdk/azidentity"
    "go.mongodb.org/mongo-driver/v2/mongo"
    "go.mongodb.org/mongo-driver/v2/mongo/options"
)

credential, _ := azidentity.NewDefaultAzureCredential(nil)
// Use OIDC callback with DocumentDB scope
```

## $search Syntax

```go
// CORRECT
searchStage := bson.D{{Key: "$search", Value: bson.D{
    {Key: "cosmosSearch", Value: bson.D{
        {Key: "vector", Value: queryVector},
        {Key: "path", Value: embeddedField},
        {Key: "k", Value: topK},
    }},
}}}

// WRONG — do NOT include cosmosSearchOptions in the $search stage
```

## Bulk Insert

Use `collection.InsertMany()` with `SetOrdered(false)` and handle `BulkWriteException`:

```go
result, err := collection.InsertMany(ctx, documents, options.InsertMany().SetOrdered(false))
if err != nil {
    if bulkErr, ok := err.(mongo.BulkWriteException); ok {
        // Partial failure — some docs inserted, some failed
        failed := len(bulkErr.WriteErrors)
        insertedCount += len(batch) - failed
    } else {
        return fmt.Errorf("batch insert failed: %w", err)
    }
} else {
    insertedCount += len(result.InsertedIDs)
}
```

- Batch size configurable via `LOAD_SIZE_BATCH` env var (default: 100)
- 200ms delay between batches (`time.Sleep(200 * time.Millisecond)`)
- Type-assert `mongo.BulkWriteException` for partial failure handling

## Key Patterns

- Use `os.Getenv("VAR")` with fallback helper for config
- Always check errors explicitly — no panic in sample code
- Use `context.Background()` or appropriate timeout contexts
- Use `defer` for cleanup (drop collections)
- Match TypeScript output format exactly

## Environment Variables

- Use `github.com/joho/godotenv` to load from `.env` file at startup
- Provide a `.env.example` file in each sample directory
- Access pattern: `os.Getenv("VAR")` with a helper function for defaults
- Call `godotenv.Load()` early — log a warning if `.env` is missing but don't fail (env vars may be set externally)

```go
import (
    "os"
    "github.com/joho/godotenv"
)

func init() {
    err := godotenv.Load()
    if err != nil {
        fmt.Println("No .env file found, using environment variables")
    }
}

func getEnvOrDefault(key, defaultValue string) string {
    if value := os.Getenv(key); value != "" {
        return value
    }
    return defaultValue
}
```

- Include `github.com/joho/godotenv` in `go.mod`

## Build & Run

```bash
cd src
go run .
```
