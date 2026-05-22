# Select Algorithm - Java

This sample demonstrates how to compare all three vector search index algorithms (IVF, HNSW, DiskANN) with Azure DocumentDB using the MongoDB Java driver.

## Prerequisites

- Java 17 or later
- Maven 3.8+
- Azure DocumentDB cluster with vector search enabled
- Azure OpenAI resource with an embedding model deployed
- Azure CLI logged in (`az login`) for passwordless authentication

## Setup

1. ### Configure environment variables

   After deploying with `azd up`, use the provisioned output values to set the required environment variables in your terminal:

   ```bash
   export DOCUMENTDB_CLUSTER_NAME=your-cluster-name
   export AZURE_OPENAI_EMBEDDING_ENDPOINT=https://your-resource.openai.azure.com
   export AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   export AZURE_DOCUMENTDB_DATABASENAME=Hotels
   export DATA_FILE_WITH_VECTORS=data/Hotels_Vector.json
   export EMBEDDED_FIELD=DescriptionVector
   export EMBEDDING_DIMENSIONS=1536
   ```

2. Copy the shared data file into the local `data/` directory:

   ```bash
   mkdir -p data && cp ../data/Hotels_Vector.json data/
   ```

## Build

```bash
mvn clean compile
```

## Run

Compare all 9 algorithm × similarity combinations:

```bash
mvn exec:java -Pcompare
```

On Windows (PowerShell):

```powershell
mvn exec:java -Pcompare
```

## Algorithms

| Algorithm | Description | Best For |
|-----------|-------------|----------|
| **IVF** | Inverted File index — partitions vectors into clusters | Large datasets with batch queries |
| **HNSW** | Hierarchical Navigable Small World graph | Low-latency, high-recall searches |
| **DiskANN** | Disk-based Approximate Nearest Neighbor | Very large datasets that exceed memory |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCUMENTDB_CLUSTER_NAME` | (required) | DocumentDB cluster name |
| `AZURE_OPENAI_EMBEDDING_ENDPOINT` | (required) | Azure OpenAI endpoint |
| `AZURE_OPENAI_EMBEDDING_MODEL` | (required) | Embedding model deployment name |
| `DATA_FILE_WITH_VECTORS` | `data/Hotels_Vector.json` | Path to vectors JSON file |
| `EMBEDDED_FIELD` | `DescriptionVector` | Field name containing embeddings |
| `EMBEDDING_DIMENSIONS` | `1536` | Vector dimensions |
| `AZURE_DOCUMENTDB_DATABASENAME` | `Hotels` | Target database name |
| `LOAD_SIZE_BATCH` | `100` | Batch size for data loading |
| `EMBEDDING_SIZE_BATCH` | `16` | Batch size for embedding requests |
| `QUERY_TEXT` | `luxury hotel near the beach` | Search query text |
| `TOP_K` | `5` | Number of results per search |
| `VERBOSE` | `false` | Print detailed per-index results |

`CompareAll.java` always runs all 9 algorithm/metric combinations. It does not read `ALGORITHM` or `SIMILARITY` environment variables.

## Authentication

This sample uses **passwordless authentication** via `DefaultAzureCredential`:

- **DocumentDB**: OIDC mechanism with Azure identity
- **Azure OpenAI**: Entra ID token-based auth

Ensure your identity has the appropriate RBAC roles assigned on both resources.

### What It Does

1. Connects to DocumentDB and loads hotel data into a single `hotels` collection
2. Generates one embedding for the query text (reused for all searches)
3. For each of the 9 algorithm/metric combinations: creates the index → searches → drops the index
4. DocumentDB only allows one vector index per kind per field, so indexes are created sequentially
5. Prints a formatted comparison table with scores, top results, and key insights

### Index Parameters

| Algorithm | Kind | Parameters |
|-----------|------|------------|
| IVF | `vector-ivf` | numLists=1 |
| HNSW | `vector-hnsw` | m=16, efConstruction=64 |
| DiskANN | `vector-diskann` | maxDegree=32, lBuild=50 |

## Project Structure

```
src/main/java/com/azure/documentdb/selectalgorithm/
├── Main.java          — Entry point, runs CompareAll
├── Utils.java         — Shared helpers (connection, embedding, data loading)
└── CompareAll.java    — Unified comparison runner (all 9 combinations)
```
