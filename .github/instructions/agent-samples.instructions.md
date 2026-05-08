---
applyTo: "ai/vector-search-agent-*/**"
---
# Agent Samples (Multi-LLM Convention)

Agent samples (`vector-search-agent-*`) use a **different convention** from quickstart samples. They orchestrate multiple LLM deployments and use a distinct set of environment variables. Do NOT mix agent conventions with quickstart conventions.

## Architecture: Planner → Synthesizer

Agent samples use a two-agent pipeline with three Azure OpenAI deployments:

| Deployment | Role | Temperature | Purpose |
|------------|------|-------------|---------|
| Embedding | Vector search | — | Same as quickstart samples |
| Planner | Tool-calling agent | 0.0 | Transforms user query → tool call → retrieves search results |
| Synthesizer | Response generation | 0.3 | Takes search results + query → produces natural language recommendation |

The planner invokes a `search_hotels_collection` tool that performs the vector search. The synthesizer receives the search results and generates a comparative hotel recommendation.

## Agent Entry Points

Agent samples have three separate entry points (not a single main file):

| Entry Point | Purpose |
|-------------|---------|
| `upload` | Load hotel data, create embeddings, insert into DocumentDB, create vector index |
| `agent` | Run planner → synthesizer pipeline against an existing collection |
| `cleanup` | Drop the database |

## Agent Environment Variables

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

## Agent Authentication

Agents support passwordless (OIDC) and API key auth, toggled by `USE_PASSWORDLESS`.

**OIDC scopes:**
- DocumentDB: `https://ossrdbms-aad.database.windows.net/.default`
- Azure OpenAI: `https://cognitiveservices.azure.com/.default`

**MongoDB URI (passwordless):** `mongodb+srv://{cluster}.global.mongocluster.cosmos.azure.com/`
- Auth mechanism: `MONGODB-OIDC` with machine callback

## Language-Specific SDK Stacks

| Language | MongoDB | OpenAI | Agent Framework |
|----------|---------|--------|-----------------|
| Go | `go.mongodb.org/mongo-driver` (raw) | `github.com/openai/openai-go/v3` (raw) | Manual tool-calling loop |
| TypeScript | `mongodb` (cleanup only) | `@langchain/openai` | `langchain` + `@langchain/azure-cosmosdb` + `zod` |

**TypeScript agents use LangChain** — the `@langchain/azure-cosmosdb` package manages the vector store, and `langchain`'s `createAgent` handles tool orchestration. This is a fundamentally different SDK stack from the quickstart TypeScript samples which use the raw MongoDB driver.

**Go agents use raw SDKs** — both MongoDB driver and OpenAI SDK are used directly, with manual tool-calling implementation.

## IVF numLists Discrepancy

Agent samples default to `IVF_NUM_LISTS=10`. Quickstart samples (vector-search, select-algorithm) hardcode `numLists=1`. This is intentional — agent samples are designed for tunable, production-like configurations while quickstart samples use minimal values for simplicity.
