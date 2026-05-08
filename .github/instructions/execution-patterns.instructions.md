---
applyTo: "ai/vector-search-*/**"
---
# Sample Execution Patterns

## Authentication

All samples support two authentication modes. **Passwordless (OIDC) is preferred.**

### Passwordless Authentication (Recommended)
- Uses `DefaultAzureCredential` / OIDC with `MONGO_CLUSTER_NAME`
- Connection URI format: `mongodb+srv://{clusterName}.global.mongocluster.cosmos.azure.com/`
- OIDC token scope: `https://ossrdbms-aad.database.windows.net/.default`
- Each language implements a utility function pair: `getClients()` and `getClientsPasswordless()`

### Connection String Authentication
- Uses `MONGO_CONNECTION_STRING` with username/password
- Format: `mongodb+srv://username:password@{cluster}.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000`

> **Note:** `mongocluster.cosmos.azure.com` is the current DocumentDB hostname — this is NOT a Cosmos DB reference.

## Sample Execution Pattern

All vector search samples follow this consistent lifecycle:

1. **Initialize clients** — Create MongoDB and Azure OpenAI clients (passwordless preferred)
2. **Drop collection** — Drop the algorithm-specific collection if it exists (clean start)
3. **Create collection** — Create a fresh collection
4. **Load data** — Read `Hotels_Vector.json` and batch-insert documents
5. **Create vector index** — Create algorithm-specific vector index using `createIndexes` command with `cosmosSearch` key type
6. **Generate query embedding** — Embed the search query text using Azure OpenAI
7. **Perform vector search** — Run `$search` aggregation pipeline with `cosmosSearch` operator
8. **Print results** — Display `HotelName` and `score` for top results
9. **Cleanup** — Drop the collection in a `finally`/`defer` block

### Naming Conventions
- **Collection names:** `hotels_{algorithm}` — e.g., `hotels_ivf`, `hotels_hnsw`, `hotels_diskann`
- **Index names:** `vectorIndex_{algorithm}` — e.g., `vectorIndex_ivf`, `vectorIndex_hnsw`, `vectorIndex_diskann`
- **Database name:** `Hotels` (hardcoded, matches `AZURE_DOCUMENTDB_DATABASENAME` default)

### Standard Search Query
All samples use the same query text: `"quintessential lodging near running trails, eateries, retail"`

### Vector Search Pipeline Structure
All languages use the same aggregation pipeline structure:
```
[
  { "$search": { "cosmosSearch": { "vector": <queryEmbedding>, "path": "DescriptionVector", "k": 5 } } },
  { "$project": { "score": { "$meta": "searchScore" }, "document": "$$ROOT" } }
]
```

> **Note:** `cosmosSearch` is a valid MongoDB API command name for DocumentDB — this is NOT a Cosmos DB reference.
