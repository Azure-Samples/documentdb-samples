# Select Algorithm - Java

This sample demonstrates how to create and use different vector search index algorithms (IVF, HNSW, DiskANN) with Azure DocumentDB using the MongoDB Java driver.

## Prerequisites

- Java 17 or later
- Maven 3.8+
- Azure DocumentDB cluster with vector search enabled
- Azure OpenAI resource with an embedding model deployed
- Azure CLI logged in (`az login`) for passwordless authentication

## Setup

1. Copy the environment file and fill in your values:

   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Azure resource details:
   - `MONGO_CLUSTER_NAME` — your DocumentDB cluster name
   - `AZURE_OPENAI_EMBEDDING_ENDPOINT` — your Azure OpenAI endpoint
   - `AZURE_OPENAI_EMBEDDING_MODEL` — deployment name (e.g., `text-embedding-3-small`)
   - `DATA_FILE_WITH_VECTORS` — path to the pre-computed vectors JSON file

## Build

```bash
mvn clean compile
```

## Run

Run all algorithms:

```bash
mvn exec:java
```

Run a specific algorithm:

```bash
# Set ALGORITHM to: ivf, hnsw, diskann, or all
ALGORITHM=ivf mvn exec:java
```

On Windows (PowerShell):

```powershell
$env:ALGORITHM="hnsw"; mvn exec:java
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
| `ALGORITHM` | `all` | Which algorithm to run: `ivf`, `hnsw`, `diskann`, `all` |
| `SIMILARITY` | `COS` | Similarity metric: `COS`, `L2`, `IP` |
| `EMBEDDING_DIMENSIONS` | `1536` | Vector dimensions |
| `AZURE_DOCUMENTDB_DATABASENAME` | `Hotels` | Target database name |
| `EMBEDDED_FIELD` | `contentVector` | Field name containing embeddings |

## Authentication

This sample uses **passwordless authentication** via `DefaultAzureCredential`:

- **DocumentDB**: OIDC mechanism with Azure identity
- **Azure OpenAI**: Entra ID token-based auth

Ensure your identity has the appropriate RBAC roles assigned on both resources.

## Project Structure

```
src/main/java/com/azure/documentdb/selectalgorithm/
├── Main.java          — Entry point, dispatches to algorithm demos
├── Utils.java         — Shared helpers (connection, embedding, data loading)
├── IvfDemo.java       — IVF index creation and vector search
├── HnswDemo.java      — HNSW index creation and vector search
└── DiskannDemo.java   — DiskANN index creation and vector search
```
