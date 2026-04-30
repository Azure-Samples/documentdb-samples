# Select Algorithm — TypeScript

Compare IVF, HNSW, and DiskANN vector index algorithms in Azure DocumentDB using TypeScript.

## Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (for `az login`)
- An Azure DocumentDB cluster with vector search enabled
- An Azure OpenAI resource with an embedding model deployed

## Setup

1. **Install dependencies:**

    ```bash
    npm install
    ```

2. **Sign in to Azure** (for passwordless authentication):

    ```bash
    az login
    ```

3. **Configure environment variables:**

    After deploying with `azd up`, create a `.env` file with your provisioned resource values:

    ```bash
    azd env get-values > .env
    ```

    This creates a `.env` file at the repository root with the connection strings and endpoints needed to run the sample.

    Alternatively, copy the example and fill in values manually:

    ```bash
    cp .env.example .env
    ```

    | Variable | Description |
    |---|---|
    | `MONGO_CLUSTER_NAME` | Your DocumentDB cluster name |
    | `AZURE_OPENAI_EMBEDDING_ENDPOINT` | Azure OpenAI endpoint URL |
    | `AZURE_OPENAI_EMBEDDING_MODEL` | Embedding model deployment name |
    | `AZURE_OPENAI_EMBEDDING_API_VERSION` | Azure OpenAI API version |
    | `AZURE_DOCUMENTDB_DATABASENAME` | Database name (default: `Hotels`) |
    | `DATA_FILE_WITH_VECTORS` | Path to JSON data file with vectors |
    | `EMBEDDED_FIELD` | Field name containing the vector (default: `contentVector`) |
    | `EMBEDDING_DIMENSIONS` | Vector dimensions (default: `1536`) |
    | `LOAD_SIZE_BATCH` | Batch size for data insertion |
    | `SIMILARITY` | Similarity metric: `COS`, `L2`, or `IP` |

4. **Build the project:**

    ```bash
    npm run build
    ```

## Run

Each script creates a collection, inserts data, builds a vector index, and performs a similarity search.

```bash
# IVF (Inverted File Index)
npm run start:ivf

# HNSW (Hierarchical Navigable Small World)
npm run start:hnsw

# DiskANN
npm run start:diskann
```

## Compare All Algorithms

Run all 9 combinations (3 algorithms × 3 similarity metrics) across multiple diverse queries and view formatted comparison tables with a ranking divergence summary:

```bash
npm run start:compare-all
```

By default, the script runs **5 diverse queries** designed to stress different aspects of similarity ranking:

1. `outdoor adventure with family activities`
2. `quiet romantic getaway with ocean view`
3. `budget-friendly downtown hotel with free WiFi`
4. `historic building with fine dining and spa`
5. `ski resort with yoga and winter sports`

**Environment variables** (optional overrides):

| Variable | Default | Description |
|---|---|---|
| `QUERY_TEXT` | *(5 built-in queries)* | Override with a single custom query |
| `TOP_K` | `5` | Number of results per combination |
| `VERBOSE` | `false` | When `true`, shows all k results per combo |

### Architecture

> **DocumentDB limitation:** Only ONE vector index per field per collection is allowed. The script creates 9 separate collections (one per algorithm×metric pair), loads data into each, creates one index per collection, runs searches, and cleans up all collections on exit.

### Output

The script produces:
- **Per-query comparison table** — shows algorithm, metric, latency, top score, and #1 result for each of the 9 combinations
- **Ranking divergence summary** — highlights queries where algorithms/metrics disagreed on the #1 result
- **Score gap analysis** — shows the confidence margin between #1 and #2 results

### Small dataset caveat

With ~50 hotel documents, all algorithms typically return identical rankings. This is expected — the dataset is too small for algorithmic differences to surface. For meaningful differentiation, use 1000+ documents with varied embeddings. The diverse queries help by combining attributes that no single hotel perfectly satisfies, which can reveal metric-level differences (COS vs L2 vs IP) even on small data.

## Algorithm comparison

| Algorithm | Index type | Best for |
|---|---|---|
| **IVF** | `vector-ivf` | Smaller datasets, lower memory usage |
| **HNSW** | `vector-hnsw` | Fast approximate search, balanced recall/speed |
| **DiskANN** | `vector-diskann` | Large-scale datasets, disk-based search |
