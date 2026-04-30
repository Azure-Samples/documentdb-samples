# Copilot Instructions for DocumentDB Samples

## Repository Purpose

This repo contains Azure DocumentDB (vCore) code samples demonstrating vector search capabilities across multiple languages. Each sample must work identically across all supported languages.

## Supported Languages

- [TypeScript](.github/copilot-instructions-typescript.md) (reference implementation)
- [Python](.github/copilot-instructions-python.md)
- [Go](.github/copilot-instructions-go.md)
- [Java](.github/copilot-instructions-java.md)
- [.NET (C#)](.github/copilot-instructions-dotnet.md)

## Architecture Rules

### Authentication

- **Always support two auth modes**: passwordless (DefaultAzureCredential with OIDC callback) AND connection string
- Passwordless is the primary path; connection string is fallback
- DocumentDB vCore uses MongoDB wire protocol — auth token scope is `https://ossrdbms-aad.database.windows.net/.default`

### Azure OpenAI Integration

- Use `text-embedding-3-small` (1536 dimensions) as the default embedding model
- Model deployment name comes from env var `AZURE_OPENAI_EMBEDDING_MODEL`
- Support both API key and DefaultAzureCredential for OpenAI client

### DocumentDB Vector Search

- **One vector index per field per collection** — this is a hard platform constraint
- When comparing multiple index types, use separate collections (one per algorithm×metric combination)
- Collection naming: `compare_{algorithm}_{metric}` (e.g., `compare_hnsw_cos`)
- Supported algorithms: `vector-ivf`, `vector-hnsw`, `vector-diskann`
- Supported metrics: `COS`, `L2` (IP is omitted — see below)

### Why No Inner Product (IP)

`text-embedding-3-small` produces unit-normalized vectors (magnitude ≈ 1). For normalized vectors:
- cosine similarity = dot(a,b) / (||a|| × ||b||) = dot(a,b) = inner product
- COS and IP always return identical results

Including IP adds no insight and doubles comparison time. All samples use only COS and L2.

### $search Query Syntax

The correct MongoDB `$search` syntax for DocumentDB vector search is:

```
{ $search: { cosmosSearch: { vector: <array>, path: "<field>", k: <number> } } }
```

**DO NOT** use `cosmosSearchOptions` as a key in the `$search` stage. That key is only valid in index creation commands.

### Data

- Shared dataset: `ai/data/Hotels_Vector.json` (50 documents with pre-computed embeddings)
- All samples reference this shared data file — do not duplicate data per language
- The `DescriptionVector` field contains the 1536-dimension embedding

### Batch Insert

- Always use bulk/batch insert (`insertMany` or equivalent) with `ordered: false`
- Default batch size: 100 (configurable via `LOAD_SIZE_BATCH` env var)
- Add a small delay between batches (200ms) to avoid rate limiting
- Handle partial failures gracefully (log failed count, continue)

### Environment Variables

All samples must support these env vars:

| Variable | Purpose |
|----------|---------|
| `AZURE_DOCUMENTDB_CONNECTION_STRING` | MongoDB connection string |
| `AZURE_DOCUMENTDB_DATABASENAME` | Database name (default: `Hotels`) |
| `AZURE_OPENAI_EMBEDDING_ENDPOINT` | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_EMBEDDING_MODEL` | Deployment name (e.g., `text-embedding-3-small`) |
| `AZURE_OPENAI_EMBEDDING_KEY` | API key (optional if using DefaultAzureCredential) |
| `AZURE_OPENAI_EMBEDDING_API_VERSION` | API version |
| `TOP_K` | Number of results to return (default: 5) |
| `LOAD_SIZE_BATCH` | Batch size for bulk insert (default: 100) |
| `QUERY_TEXT` | Single query override (optional) |
| `VERBOSE` | Enable verbose output (default: false) |

### Sample Categories

1. **vector-search-{lang}**: Basic vector search with individual algorithm samples (ivf.ts, hnsw.ts, diskann.ts)
2. **select-algorithm-{lang}**: Comparison runner that tests all algorithms × metrics with multi-query support

### select-algorithm Comparison Runner Requirements

The comparison runner (`compare-all`) must:

1. **Multi-query support**: Run 5 diverse default queries (overridable via `QUERY_TEXT` for single)
2. **Adaptive table collapse**: When all algorithms return the same #1 result for a query, show collapsed metric-only view. When they disagree, show expanded algorithm×metric grid.
3. **Gap analysis**: Show the score gap between #1 and #2 results
4. **Per-query output**: Header with query text, then comparison table
5. **Summary**: Final divergence summary across all queries

### Console Output Style

- Use clear section headers with `\n` separation
- Tables with aligned columns (use padding)
- Emoji indicators: ✅ (agreement), ⚠️ (disagreement)
- Show document counts, embedding dimensions, and collection names during setup

### Collection Lifecycle (REQUIRED)

Every sample must follow this exact lifecycle — the validation workflow depends on it:

1. **Start**: Check if collection exists → drop only if it does (defensive, handles prior crashes)
2. **End**: Always drop the collection in a `finally`/`defer` block (cleanup for next run)

Language-specific patterns:

| Language | Conditional drop at start | Always drop at end |
|----------|--------------------------|-------------------|
| TypeScript | `db.listCollections({name}).toArray()` → `db.dropCollection(name)` | `finally { db.dropCollection(name) }` |
| Python | `name in database.list_collection_names()` → `database.drop_collection(name)` | `finally: database.drop_collection(name)` |
| Go | `database.ListCollectionNames(ctx, bson.M{"name": name})` → `collection.Drop(ctx)` | `defer func() { collection.Drop(ctx) }()` |
| Java | `database.listCollectionNames().into(list).contains(name)` → `collection.drop()` | `finally { collection.drop() }` |
| .NET | `ListCollectionNamesAsync(filter)` → `DropCollectionAsync(name)` | `finally { DropCollectionAsync(name) }` |

**Why this matters**: The CI workflow runs samples in parallel across languages. Without end-of-run cleanup, leftover collections cause name conflicts and flaky test failures.

### Collection Naming Convention (REQUIRED)

Collection names must be unique per algorithm to avoid conflicts:

- **vector-search samples**: `hotels_{algorithm}` (e.g., `hotels_diskann`, `hotels_hnsw`, `hotels_ivf`)
- **select-algorithm samples**: `compare_{algorithm}_{metric}` (e.g., `compare_hnsw_cos`, `compare_ivf_l2`)
- **Database**: Always `Hotels`
- **Index names**: `vectorIndex_{algorithm}` (e.g., `vectorIndex_diskann`)

All languages must use identical collection/index names for a given algorithm. This enables the shared validation workflow to verify behavior consistency.

### Error Handling

- Graceful cleanup: drop created collections on error (use try/finally)
- Log but don't crash on individual batch insert failures
- Validate all required env vars at startup with clear error messages

### Code Style

- No unnecessary comments — only comment non-obvious decisions (like why IP is omitted)
- Use descriptive variable names over comments
- Keep functions focused — extract helpers for repeated patterns
- TypeScript is the reference implementation — other languages should match its behavior exactly
