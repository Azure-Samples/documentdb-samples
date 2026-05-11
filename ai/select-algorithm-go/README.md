# DocumentDB Vector Search - Go Algorithm Comparison Sample

This sample demonstrates how to compare different vector search algorithms (IVF, HNSW, DiskANN) and similarity metrics (Cosine, L2, Inner Product) with Azure DocumentDB.

## Prerequisites

- [Go 1.24+](https://golang.org/dl/)
- [Azure DocumentDB cluster](/azure/documentdb/) (M40+ tier for DiskANN)
- [Azure OpenAI resource](https://learn.microsoft.com/azure/ai-services/openai/) with an embedding model deployed
- [Azure CLI](https://learn.microsoft.com/cli/azure/) (for passwordless authentication)
- Pre-generated embeddings file (`Hotels_Vector.json`) — see the `vector-search-go` sample

## Setup

1. **Clone the repository** and navigate to this directory:

   ```bash
   cd ai/select-algorithm-go
   ```

2. **Configure environment variables:**

   After deploying with `azd up`, create a `.env` file with your provisioned resource values:

   ```bash
   azd env get-values > .env
   ```

   Alternatively, copy the example and fill in values manually:

   ```bash
   cp .env.example .env
   ```

   Required variables:
   ```env
   MONGO_CLUSTER_NAME=your-cluster-name
   AZURE_OPENAI_EMBEDDING_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   AZURE_DOCUMENTDB_DATABASENAME=Hotels
   DATA_FILE_WITH_VECTORS=../data/Hotels_Vector.json
   EMBEDDED_FIELD=DescriptionVector
   EMBEDDING_DIMENSIONS=1536
   ```

3. **Copy the shared data file** into this directory:

   ```bash
   cp ../data/Hotels_Vector.json .
   ```

   The `DATA_FILE_WITH_VECTORS` env var defaults to `../data/Hotels_Vector.json`.

4. **Install dependencies**:

   ```bash
   go mod download
   ```

5. **Sign in to Azure** (for passwordless authentication):

   ```bash
   az login
   ```

## Usage

### Compare All Algorithms

Run all 9 combinations (3 algorithms × 3 similarity metrics) in a single execution:

```bash
go run ./src/...
```

This creates indexes sequentially (create/search/drop per combo — DocumentDB allows one vector index per kind per field) and prints a comparison table showing scores and top results.

**Output:**
```
======================================================================
  COMPARE ALL: 3 Algorithms × 3 Similarity Metrics (9 combinations)
======================================================================
  ...
====================================================================================================
  COMPARISON RESULTS
====================================================================================================
ALGORITHM   SIMILARITY  #1 RESULT               #1 SCORE    #2 RESULT               #2 SCORE    DIFF
----------------------------------------------------------------------------------------------------
IVF         COS         Ocean Water Resort &..  0.6184      Windy Ocean Motel       0.5056      0.1128
IVF         L2          Ocean Water Resort &..  0.8736      Windy Ocean Motel       0.9943      -0.1208
IVF         IP          Ocean Water Resort &..  0.6184      Windy Ocean Motel       0.5056      0.1128
...
====================================================================================================
  KEY INSIGHTS
====================================================================================================
  🎯 Highest #1 score:   IVF/COS (0.6184)
  📊 Biggest separation: IVF/COS (diff: 0.1128)
  🔑 All algorithms return the same top results — algorithm choice
     affects performance at scale, not accuracy on small datasets.
  📐 COS and IP produce identical scores (normalized embeddings).
  📏 L2 scores are distances (lower = closer), not similarities.
====================================================================================================
```

### On Windows (PowerShell)

```powershell
go run ./src/...
```

## Environment Variables

| Variable     | Default                          | Description                     |
|--------------|----------------------------------|---------------------------------|
| `MONGO_CLUSTER_NAME` | *(required)* | DocumentDB cluster name |
| `AZURE_OPENAI_EMBEDDING_ENDPOINT` | *(required)* | Azure OpenAI endpoint |
| `AZURE_OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model name |
| `AZURE_DOCUMENTDB_DATABASENAME` | `Hotels` | Database name |
| `DATA_FILE_WITH_VECTORS` | `../data/Hotels_Vector.json` | Path to data file |
| `EMBEDDED_FIELD` | `DescriptionVector` | Field containing embeddings |
| `EMBEDDING_DIMENSIONS` | `1536` | Embedding vector dimensions |
| `LOAD_SIZE_BATCH` | `100` | Batch size for data insertion |
| `QUERY_TEXT` | `luxury hotel near the beach` | Search query |
| `VERBOSE` | `false` | Show full results |

## How It Works

### Comparison Mode (`compare_all.go`)

1. **Data Loading:** Loads hotel data with pre-generated embeddings
2. **Index Creation:** Creates vector indexes sequentially (one at a time):
   - For each algorithm (IVF, HNSW, DiskANN) × each metric (COS, L2, IP):
     - Create the index → wait for readiness → search → drop the index
   - DocumentDB only allows one vector index per kind per field
3. **Query Execution:** Generates embedding once, reuses for all 9 searches
4. **Result Comparison:** Prints formatted table with #1/#2 results, scores, and diff

## Index Parameters

| Algorithm | Kind            | Key Parameters              | Values Used                 |
|-----------|-----------------|-----------------------------|-----------------------------|
| IVF       | `vector-ivf`    | `numLists`                  | 1 (optimized for small datasets) |
| HNSW      | `vector-hnsw`   | `m`, `efConstruction`       | 16, 64                      |
| DiskANN   | `vector-diskann`| `maxDegree`, `lBuild`       | 32, 50                      |

## Project Structure

```
select-algorithm-go/
├── .env.example          # Environment variable template
├── go.mod                # Go module dependencies
├── go.sum                # Go module checksums
├── output/               # Sample output files
├── README.md             # This file
└── src/
    ├── main.go           # Entry point
    ├── utils.go          # Shared config, auth, data, and search helpers
    └── compare_all.go    # Unified 9-combination comparison runner (create/search/drop)
```

## Authentication

This sample uses **passwordless (OIDC) authentication** with `DefaultAzureCredential`. Ensure your Azure identity has:

- **DocumentDB**: Appropriate RBAC role on the cluster
- **Azure OpenAI**: `Cognitive Services OpenAI User` role on the OpenAI resource

The MongoDB OIDC auth uses the `https://ossrdbms-aad.database.windows.net/.default` scope, and the OpenAI client uses Azure token credentials.

## Important Notes

- **COS/IP scores:** Higher = more similar (0–1 range)
- **L2 scores:** Lower = more similar (distance metric)
- **Sequential indexing:** DocumentDB requires create/search/drop per combo (one vector index per kind per field)
- **Cleanup:** The sample automatically drops collections on exit
- **bson.D ordering:** All MongoDB commands use `bson.D` (ordered) instead of `bson.M` (unordered) to avoid "multi-key map" errors

## Troubleshooting

**"OIDC authentication failed"**
- Run `az login` and ensure you're authenticated
- Verify your Azure identity has RBAC permissions on the DocumentDB cluster
- Check that `MONGO_CLUSTER_NAME` matches your cluster name

**"DiskANN indexes require a higher cluster tier"**
- DiskANN requires M40+ cluster tier
- Try IVF or HNSW instead, or upgrade your cluster

**"No documents found with embeddings"**
- Ensure `DATA_FILE_WITH_VECTORS` points to the correct file
- Verify the file contains the field specified in `EMBEDDED_FIELD`
- Check that embeddings were generated with the correct dimensions

## Learn More

- [Azure DocumentDB Documentation](/azure/documentdb/)
- [Vector Search in DocumentDB](/azure/documentdb/vector-search)
- [Choosing a Vector Index Algorithm](/azure/documentdb/vector-search-algorithms)
- [Go MongoDB driver](https://pkg.go.dev/go.mongodb.org/mongo-driver)
