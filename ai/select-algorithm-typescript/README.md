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

    Copy `.env.example` to `.env` and fill in your values:

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

## Algorithm comparison

| Algorithm | Index type | Best for |
|---|---|---|
| **IVF** | `vector-ivf` | Smaller datasets, lower memory usage |
| **HNSW** | `vector-hnsw` | Fast approximate search, balanced recall/speed |
| **DiskANN** | `vector-diskann` | Large-scale datasets, disk-based search |
