# DocumentDB Samples — Copilot Instructions

## Project Overview
Azure DocumentDB code samples for vector search and algorithm selection quickstart articles.

## Repository Structure

```
ai/
├── data/                          # Shared data files (Hotels.json, Hotels_Vector.json)
├── vector-search-python/          # Python vector search samples
├── vector-search-typescript/      # TypeScript/Node.js vector search samples
├── vector-search-go/              # Go vector search samples
├── vector-search-java/            # Java vector search samples
├── vector-search-dotnet/          # .NET vector search samples
├── vector-search-agent-go/        # Go agent sample (separate from quickstart)
└── vector-search-agent-typescript/ # TypeScript agent sample (separate from quickstart)
```

Each vector-search sample directory contains:
- `src/` — Source files: one per algorithm (`ivf`, `hnsw`, `diskann`) + `utils` + `create_embeddings` + `show_indexes`
- `output/` — Expected output files: `ivf.txt`, `hnsw.txt`, `diskann.txt`
- `README.md` — Setup, usage, and troubleshooting documentation
- `.env.example` (Go, Python, TypeScript) or `appsettings.json` (.NET) — Configuration template

## Language Dependencies

### Go
- Go 1.21+
- go.mongodb.org/mongo-driver v1.17+
- github.com/Azure/azure-sdk-for-go/sdk/azidentity
- github.com/Azure/azure-sdk-for-go/sdk/azcore
- github.com/openai/openai-go/v3
- github.com/joho/godotenv

### Java
- Java 17+
- MongoDB Driver (mongodb-driver-sync) 5.3+
- Azure Identity (azure-identity) 1.15+
- Azure AI OpenAI (azure-ai-openai)
- Maven 3.8+

### Python
- Python 3.10+
- pymongo >= 4.7
- azure-identity
- openai
- python-dotenv

### TypeScript/Node.js
- Node.js 20+
- mongodb 6.12+
- @azure/identity
- openai

### .NET
- .NET 8+
- MongoDB.Driver 3.0+
- Azure.Identity
- Azure.AI.OpenAI

## Consistent Variable Values

All samples MUST use these environment variable names and defaults:

| Variable | Default | Purpose |
|----------|---------|---------|
| MONGO_CLUSTER_NAME | (required) | DocumentDB cluster name (passwordless auth) |
| MONGO_CONNECTION_STRING | (none) | Full connection string (connection string auth) |
| AZURE_OPENAI_EMBEDDING_ENDPOINT | (required) | Azure OpenAI endpoint |
| AZURE_OPENAI_EMBEDDING_MODEL | (required) | Embedding model deployment name |
| AZURE_OPENAI_EMBEDDING_API_VERSION | 2023-05-15 | Azure OpenAI API version |
| DATA_FILE_WITH_VECTORS | ../data/Hotels_Vector.json | Path to data file with embeddings |
| EMBEDDED_FIELD | DescriptionVector | Vector field name in documents |
| EMBEDDING_DIMENSIONS | 1536 | Vector dimensions |
| LOAD_SIZE_BATCH | 100 | Batch size for document insertion |
| EMBEDDING_SIZE_BATCH | 16 | Batch size for embedding generation |
| AZURE_DOCUMENTDB_DATABASENAME | Hotels | Database name |
| SIMILARITY | (varies) | Similarity metric (COS, euclidean, ip) |
| ALGORITHM | (varies) | Algorithm (ivf, hnsw, diskann) |

## Consistent Algorithm Parameters

### IVF
- numLists: 1
- nProbes: 1

### HNSW
- m: 16
- efConstruction: 64
- efSearch: 40

### DiskANN
- maxDegree: 20
- lBuild: 10
- lSearch: 40

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
  { "$search": { "cosmosSearch": { "vector": <queryEmbedding>, "path": <vectorField>, "k": 5 } } },
  { "$project": { "score": { "$meta": "searchScore" }, "document": "$$ROOT" } }
]
```

> **Note:** `cosmosSearch` is a valid MongoDB API command name for DocumentDB — this is NOT a Cosmos DB reference.

## Agent Samples (Multi-LLM Convention)

Agent samples (`vector-search-agent-*`) use a **different convention** from quickstart samples. They orchestrate multiple LLM deployments and use a distinct set of environment variables. Do NOT mix agent conventions with quickstart conventions.

### Architecture: Planner → Synthesizer

Agent samples use a two-agent pipeline with three Azure OpenAI deployments:

| Deployment | Role | Temperature | Purpose |
|------------|------|-------------|---------|
| Embedding | Vector search | — | Same as quickstart samples |
| Planner | Tool-calling agent | 0.0 | Transforms user query → tool call → retrieves search results |
| Synthesizer | Response generation | 0.3 | Takes search results + query → produces natural language recommendation |

The planner invokes a `search_hotels_collection` tool that performs the vector search. The synthesizer receives the search results and generates a comparative hotel recommendation.

### Agent Entry Points

Agent samples have three separate entry points (not a single main file):

| Entry Point | Purpose |
|-------------|---------|
| `upload` | Load hotel data, create embeddings, insert into DocumentDB, create vector index |
| `agent` | Run planner → synthesizer pipeline against an existing collection |
| `cleanup` | Drop the database |

### Agent Environment Variables

Agent samples use `AZURE_DOCUMENTDB_*` and `AZURE_OPENAI_*` prefixes consistently. These differ from quickstart variable names.

| Agent Variable | Quickstart Equivalent | Notes |
|---------------|----------------------|-------|
| `AZURE_OPENAI_ENDPOINT` | `AZURE_OPENAI_EMBEDDING_ENDPOINT` | Single endpoint for all 3 deployments |
| `AZURE_OPENAI_API_KEY` | — | For API key auth (not used in quickstarts) |
| `AZURE_DOCUMENTDB_CLUSTER` | `MONGO_CLUSTER_NAME` | Cluster name for passwordless auth |
| `AZURE_DOCUMENTDB_CONNECTION_STRING` | `MONGO_CONNECTION_STRING` | Full connection string |
| `AZURE_DOCUMENTDB_COLLECTION` | — | Collection name (agents parameterize this) |
| `AZURE_DOCUMENTDB_INDEX_NAME` | — | Vector index name (agents parameterize this) |
| `VECTOR_INDEX_ALGORITHM` | `ALGORITHM` | Default: `vector-ivf` |
| `VECTOR_SIMILARITY` | `SIMILARITY` | Default: `COS` |
| `USE_PASSWORDLESS` | — | `true`/`false` toggle for auth mode |
| `DEBUG` | — | `true`/`false` verbose logging |
| `QUERY` | — | Default: `"quintessential lodging near running trails, eateries, retail"` |
| `NEAREST_NEIGHBORS` | — | Default: `5` |

**Agent-only variables (no quickstart equivalent):**

| Variable | Default | Purpose |
|----------|---------|---------|
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | (required) | Embedding model deployment name |
| `AZURE_OPENAI_EMBEDDING_API_VERSION` | 2024-06-01 (Go), 2023-05-15 (TS) | Embedding API version |
| `AZURE_OPENAI_PLANNER_DEPLOYMENT` / `AZURE_OPENAI_PLANNER_MODEL` | (required) | Planner LLM deployment |
| `AZURE_OPENAI_PLANNER_API_VERSION` | (required) | Planner API version |
| `AZURE_OPENAI_SYNTH_DEPLOYMENT` / `AZURE_OPENAI_SYNTH_MODEL` | (required) | Synthesizer LLM deployment |
| `AZURE_OPENAI_SYNTH_API_VERSION` | (required) | Synthesizer API version |
| `IVF_NUM_LISTS` | 10 | IVF numLists (⚠️ differs from quickstart default of 1) |
| `HNSW_M` | 16 | HNSW m parameter |
| `HNSW_EF_CONSTRUCTION` | 64 | HNSW efConstruction parameter |
| `DISKANN_MAX_DEGREE` | 20 | DiskANN maxDegree parameter |
| `DISKANN_L_BUILD` | 10 | DiskANN lBuild parameter |

### Agent Authentication

Agents support passwordless (OIDC) and API key auth, toggled by `USE_PASSWORDLESS`.

**OIDC scopes:**
- DocumentDB: `https://ossrdbms-aad.database.windows.net/.default`
- Azure OpenAI: `https://cognitiveservices.azure.com/.default`

**MongoDB URI (passwordless):** `mongodb+srv://{cluster}.global.mongocluster.cosmos.azure.com/`
- Auth mechanism: `MONGODB-OIDC` with machine callback

### Language-Specific SDK Stacks

| Language | MongoDB | OpenAI | Agent Framework |
|----------|---------|--------|-----------------|
| Go | `go.mongodb.org/mongo-driver` (raw) | `github.com/openai/openai-go/v3` (raw) | Manual tool-calling loop |
| TypeScript | `mongodb` (cleanup only) | `@langchain/openai` | `langchain` + `@langchain/azure-cosmosdb` + `zod` |

**TypeScript agents use LangChain** — the `@langchain/azure-cosmosdb` package manages the vector store, and `langchain`'s `createAgent` handles tool orchestration. This is a fundamentally different SDK stack from the quickstart TypeScript samples which use the raw MongoDB driver.

**Go agents use raw SDKs** — both MongoDB driver and OpenAI SDK are used directly, with manual tool-calling implementation.

### IVF numLists Discrepancy

Agent samples default to `IVF_NUM_LISTS=10`. Quickstart samples (vector-search, select-algorithm) hardcode `numLists=1`. This is intentional — agent samples are designed for tunable, production-like configurations while quickstart samples use minimal values for simplicity.

## Rules

1. **No Cosmos DB references.**Never use "Cosmos DB", "cosmosdb", "MongoDB vCore", or "mongo.cosmos.azure.com". Always use "Azure DocumentDB" and "documentdb.azure.com". Exception: `mongocluster.cosmos.azure.com` (hostname), `cosmosSearch` (API command), and `ms-azuretools.vscode-cosmosdb` (VS Code extension) are valid and NOT Cosmos references.
2. **Vector field name is DescriptionVector.** Never default to "contentVector".
3. **Data file path from env var.** Code reads `DATA_FILE_WITH_VECTORS` which defaults to `../data/Hotels_Vector.json` (the shared data location). .NET copies data locally to `data/Hotels_Vector.json` in the build output.
4. **Batch size is LOAD_SIZE_BATCH=100.** Do not use BATCH_SIZE or other variants.
5. **Database name variable is AZURE_DOCUMENTDB_DATABASENAME.** Do not use MONGO_DB_NAME or other variants.
6. **.NET uses appsettings.json** with configuration sections: `AzureOpenAI`, `DataFiles`, `Embedding`, `MongoDB`, `VectorSearch`.
7. **Similarity metric is COS.** All vector index definitions use `"similarity": "COS"` (cosine similarity).
8. **Output files are committed.** Each sample has an `output/` directory with expected output for each algorithm (`ivf.txt`, `hnsw.txt`, `diskann.txt`). Update these when output format changes.
9. **DocumentDB supports all index types at any dataset size.** IVF, HNSW, and DiskANN are all available — do not imply tier restrictions limit algorithm availability.
