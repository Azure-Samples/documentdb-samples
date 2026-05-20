<!--
---
page_type: sample
name: "DocumentDB Select Algorithm - Python"
description: "Compare IVF, HNSW, and DiskANN vector index algorithms in Azure DocumentDB with Python."
urlFragment: select-algorithm-python
languages:
- python
products:
- azure
---
-->
# Select Vector Algorithm (Python)

Compare IVF, HNSW, and DiskANN vector index algorithms in Azure DocumentDB. Each algorithm is optimized for different dataset sizes and performance requirements.

## Algorithm Selection Guide

| Algorithm | Dataset Size | Cluster Tier | Key Parameters |
|-----------|-------------|--------------|----------------|
| IVF       | < 10K docs  | M10+         | numLists       |
| HNSW      | 10K-50K     | M30+         | m, efConstruction |
| DiskANN   | 50K+        | M40+         | maxDegree, lBuild |

## Prerequisites

- Azure subscription
- Azure DocumentDB cluster (M40+ for all algorithms, M10+ for IVF only)
- Azure OpenAI resource with `text-embedding-3-small` deployed
- Python 3.10+
- Azure CLI (`az login` for passwordless auth)

## Setup

1. ### Configure environment variables

   After deploying with `azd up`, create a `.env` file with your provisioned resource values:

   ```bash
   azd env get-values > .env
   ```

   This creates a `.env` file at the repository root with the connection strings and endpoints needed to run the sample.

   Alternatively, copy the example and fill in values manually:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   cd src
   pip install -r ../requirements.txt
   ```

3. Copy the shared data file:

   ```bash
   cp ../data/Hotels_Vector.json .
   ```

4. Ensure you're logged in to Azure:
   ```bash
   az login
   ```

## Run

Compare all 9 combinations (3 algorithms × 3 similarity metrics) in a single invocation:

```bash
cd src
python compare_all.py
```

The script creates a single `hotels` collection, loads data once, then for each of the 9 algorithm/metric combinations: creates the index → searches → drops the index. DocumentDB only allows one vector index per kind per field, so indexes are created sequentially.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCUMENTDB_CLUSTER_NAME` | (required) | DocumentDB cluster name |
| `AZURE_OPENAI_EMBEDDING_ENDPOINT` | (required) | Azure OpenAI endpoint |
| `AZURE_OPENAI_EMBEDDING_MODEL` | (required) | Embedding model deployment name |
| `DATA_FILE_WITH_VECTORS` | `../data/Hotels_Vector.json` | Path to vectors JSON file |
| `EMBEDDED_FIELD` | `DescriptionVector` | Field name containing embeddings |
| `EMBEDDING_DIMENSIONS` | `1536` | Vector dimensions |
| `AZURE_DOCUMENTDB_DATABASENAME` | `Hotels` | Target database name |
| `LOAD_SIZE_BATCH` | `100` | Batch size for data loading |
| `EMBEDDING_SIZE_BATCH` | `16` | Batch size for embedding requests |
| `ALGORITHM` | (empty = all) | Which algorithm to run |
| `SIMILARITY` | (empty = all) | Similarity metric: `COS`, `L2`, `IP` |
| `QUERY_TEXT` | `luxury hotel near the beach` | Search query text |
| `TOP_K` | `5` | Number of results per search |
| `VERBOSE` | `false` | Show all k results per combo |
