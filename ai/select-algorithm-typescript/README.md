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

    This creates a `.env` file in the project folder with the connection strings and endpoints needed to run the sample.

    Alternatively, copy the example and fill in values manually:

    ```bash
    cp .env.example .env
    ```

    | Variable | Description |
    |---|---|
    | `DOCUMENTDB_CLUSTER_NAME` | Your DocumentDB cluster name |
    | `AZURE_OPENAI_EMBEDDING_ENDPOINT` | Azure OpenAI endpoint URL |
    | `AZURE_OPENAI_EMBEDDING_MODEL` | Embedding model deployment name |
    | `AZURE_OPENAI_EMBEDDING_API_VERSION` | Azure OpenAI API version |
    | `AZURE_DOCUMENTDB_DATABASENAME` | Database name (default: `Hotels`) |
    | `DATA_FILE_WITH_VECTORS` | Path to JSON data file with vectors |
    | `EMBEDDED_FIELD` | Field name containing the vector (default: `DescriptionVector`) |
    | `EMBEDDING_DIMENSIONS` | Vector dimensions (default: `1536`) |
    | `LOAD_SIZE_BATCH` | Batch size for data insertion |
    | `SIMILARITY` | Similarity metric: `COS`, `L2`, or `IP` |

5. **Copy the shared data file** into this directory:

    ```bash
    cp ../data/Hotels_Vector.json .
    ```

    The `DATA_FILE_WITH_VECTORS` env var defaults to `../data/Hotels_Vector.json`.

6. **Build the project:**

    ```bash
    npm run build
    ```

## Run

Run all 9 combinations (3 algorithms × 3 similarity metrics) in a single invocation and view a formatted comparison table:

```bash
npm start
```

**Environment variables** (optional overrides):

| Variable | Default | Description |
|---|---|---|
| `QUERY_TEXT` | `luxury hotel near the beach` | Search query text |
| `TOP_K` | `5` | Number of results per combination |
| `VERBOSE` | `false` | When `true`, shows all k results per combo |

The script creates a single `hotels` collection, loads data once, then for each of the 9 algorithm/metric combinations: creates the index → searches → drops the index. DocumentDB only allows one vector index per kind per field, so indexes are created sequentially.

**Output:**
```
====================================================================================================
  COMPARISON RESULTS
====================================================================================================
Algorithm   Similarity  #1 Result               #1 Score    #2 Result               #2 Score    Diff
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

## Algorithm comparison

| Algorithm | Index type | Best for |
|---|---|---|
| **IVF** | `vector-ivf` | Smaller datasets, lower memory usage |
| **HNSW** | `vector-hnsw` | Fast approximate search, balanced recall/speed |
| **DiskANN** | `vector-diskann` | Large-scale datasets, disk-based search |
