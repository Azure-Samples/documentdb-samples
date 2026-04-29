# Select Algorithm - Go

This sample demonstrates how to use different vector search algorithms (IVF, HNSW, DiskANN) with Azure DocumentDB (vCore) in Go. It loads hotel data with pre-computed embeddings, creates vector indexes, and performs similarity searches using each algorithm.

## Prerequisites

- [Go 1.24+](https://golang.org/dl/)
- [Azure DocumentDB (vCore) cluster](https://learn.microsoft.com/azure/cosmos-db/mongodb/vcore/)
- [Azure OpenAI resource](https://learn.microsoft.com/azure/ai-services/openai/) with an embedding model deployed
- [Azure CLI](https://learn.microsoft.com/cli/azure/) (for passwordless authentication)
- Pre-generated embeddings file (`Hotels_Vector.json`) — see the `vector-search-go` sample

## Setup

1. **Clone the repository** and navigate to this directory:

   ```bash
   cd ai/select-algorithm-go
   ```

2. **Configure environment variables** by copying the example file:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your Azure resource values.

3. **Install dependencies**:

   ```bash
   cd src
   go mod tidy
   ```

4. **Sign in to Azure** (for passwordless authentication):

   ```bash
   az login
   ```

## Usage

Run from the `src` directory:

```bash
cd src
```

### Run all algorithms

```bash
ALGORITHM=all go run .
```

### Run a specific algorithm

```bash
# IVF (Inverted File) — clustering-based, works on all tiers
ALGORITHM=ivf go run .

# HNSW (Hierarchical Navigable Small World) — graph-based, higher recall
ALGORITHM=hnsw go run .

# DiskANN — disk-optimized, best for large datasets
ALGORITHM=diskann go run .
```

### On Windows (PowerShell)

```powershell
$env:ALGORITHM="ivf"; go run .
```

## Algorithm comparison

| Algorithm | Kind            | Key Parameters              | Best For                    |
|-----------|-----------------|-----------------------------|-----------------------------|
| IVF       | `vector-ivf`    | `numLists=10`               | Small datasets, all tiers   |
| HNSW      | `vector-hnsw`   | `m=16`, `efConstruction=64` | High recall, medium datasets|
| DiskANN   | `vector-diskann`| `maxDegree=20`, `lBuild=10` | Large datasets, disk-based  |

## Project structure

```
select-algorithm-go/
├── .env.example          # Environment variable template
├── go.mod                # Go module dependencies
├── README.md             # This file
└── src/
    ├── main.go           # Entry point — dispatches by ALGORITHM env var
    ├── utils.go          # Shared config, auth, data, and search helpers
    ├── ivf.go            # IVF index creation and search workflow
    ├── hnsw.go           # HNSW index creation and search workflow
    └── diskann.go        # DiskANN index creation and search workflow
```

## Authentication

This sample uses **passwordless (OIDC) authentication** with `DefaultAzureCredential`. Ensure your Azure identity has:

- **DocumentDB**: Appropriate RBAC role on the cluster
- **Azure OpenAI**: `Cognitive Services OpenAI User` role on the OpenAI resource

The MongoDB OIDC auth uses the `https://ossrdbms-aad.database.windows.net/.default` scope, and the OpenAI client uses `https://cognitiveservices.azure.com/.default`.

## Important notes

- **One vector index per field**: DocumentDB supports only one vector index per field. The scripts automatically drop existing vector indexes before creating new ones.
- **Cluster tier requirements**: Some algorithms may not be available on all cluster tiers. The sample provides helpful error messages if a tier limitation is encountered.
- **Collection separation**: Each algorithm uses its own collection (`hotels_ivf`, `hotels_hnsw`, `hotels_diskann`) so they can coexist.
- **bson.D ordering**: All MongoDB commands use `bson.D` (ordered) instead of `bson.M` (unordered) to avoid "multi-key map" errors.

## Troubleshooting

- **Authentication errors**: Run `az login` and verify your identity has RBAC access to both DocumentDB and Azure OpenAI.
- **"not enabled for this cluster tier"**: Upgrade your DocumentDB cluster tier or try a different algorithm.
- **No embedding data**: Ensure your `Hotels_Vector.json` file contains documents with the embedding field specified in `EMBEDDED_FIELD`.

## Further resources

- [DocumentDB vector search documentation](https://learn.microsoft.com/azure/cosmos-db/mongodb/vcore/vector-search)
- [Azure OpenAI embeddings](https://learn.microsoft.com/azure/ai-services/openai/how-to/embeddings)
- [Go MongoDB driver](https://pkg.go.dev/go.mongodb.org/mongo-driver)
