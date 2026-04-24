# Select Algorithm - .NET

Compare DiskANN, HNSW, and IVF vector index algorithms across COS, L2, and IP similarity metrics using Azure DocumentDB.

## Prerequisites

- .NET 9.0+ SDK
- Azure DocumentDB cluster
- Azure OpenAI resource with `text-embedding-3-small` deployment
- **RBAC roles**:
  - `Cognitive Services OpenAI User` on the Azure OpenAI resource
  - DocumentDB `dbOwner` role on the target database

## Setup

1. Set required environment variables using `dotnet user-secrets` or export them directly:

```bash
# Using dotnet user-secrets (recommended for local development)
dotnet user-secrets init
dotnet user-secrets set "AZURE_OPENAI_EMBEDDING_ENDPOINT" "https://<RESOURCE-NAME>.openai.azure.com"
dotnet user-secrets set "AZURE_OPENAI_EMBEDDING_MODEL" "text-embedding-3-small"
dotnet user-secrets set "MONGO_CLUSTER_NAME" "<CLUSTER-NAME>"
dotnet user-secrets set "AZURE_TENANT_ID" "<TENANT-ID>"

# Or export as environment variables
export AZURE_OPENAI_EMBEDDING_ENDPOINT="https://<RESOURCE-NAME>.openai.azure.com"
export AZURE_OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
export MONGO_CLUSTER_NAME="<CLUSTER-NAME>"
export AZURE_TENANT_ID="<TENANT-ID>"
```

2. Restore dependencies:

```bash
dotnet restore
```

## Usage

### Compare all algorithms (default: COS similarity)

```bash
dotnet run
```

Set `ALGORITHM` and `SIMILARITY` environment variables to control which collections are queried:

| ALGORITHM | SIMILARITY | Collections queried |
|-----------|------------|---------------------|
| `all`     | `COS`      | 3 (one per algorithm, COS) |
| `all`     | `all`      | 9 (all combinations) |
| `diskann` | `COS`      | 1 (hotels_diskann_cos) |
| `diskann` | `all`      | 3 (diskann x all similarities) |

## Architecture

Creates collections named `hotels_{algorithm}_{similarity}` for each combination:

| Algorithm | COS | L2 | IP |
|-----------|-----|----|----|
| DiskANN   | `hotels_diskann_cos` | `hotels_diskann_l2` | `hotels_diskann_ip` |
| HNSW      | `hotels_hnsw_cos` | `hotels_hnsw_l2` | `hotels_hnsw_ip` |
| IVF       | `hotels_ivf_cos` | `hotels_ivf_l2` | `hotels_ivf_ip` |

Each collection gets its own vector index created via `RunCommandAsync` and data inserted via `InsertManyAsync`. The application runs vector search aggregation queries and prints a comparison table with latency metrics.

## Algorithm-Specific Parameters

### Index Creation
- **DiskANN**: `maxDegree: 32`, `lBuild: 50`
- **HNSW**: `m: 16`, `efConstruction: 64`
- **IVF**: `numLists: 1`

### Search Queries
- **DiskANN**: `lSearch: 100`
- **HNSW**: `efSearch: 80`
- **IVF**: `nProbes: 1`

## Authentication

Uses `DefaultAzureCredential` for passwordless authentication to both Azure OpenAI and DocumentDB. Ensure you are logged in with Azure CLI:

```bash
az login
```

## Expected output

Running with default settings (`ALGORITHM=all`, `SIMILARITY=COS`) prints a comparison table. Actual timings and scores vary per run.

```
==========================================================================================
                     Vector Algorithm Comparison Results
==========================================================================================
Algorithm     Similarity    Top Result                Score         Latency(ms)
------------------------------------------------------------------------------------------
DiskANN       COS           Historic Downtown Inn      0.8342        45
HNSW          COS           Historic Downtown Inn      0.8342        38
IVF           COS           Historic Downtown Inn      0.8342        52
==========================================================================================

--- DiskANN / COS (hotels_diskann_cos) ---
  1. Historic Downtown Inn              (Score: 0.8342)
  2. Mountain Trail Lodge                (Score: 0.7891)
  3. Riverside Retreat                   (Score: 0.7654)
  4. Urban Fitness Suites                (Score: 0.7210)
  5. Lakeside Wellness Resort            (Score: 0.7045)
```

> Note: Results vary based on data, embeddings, and server load. The table above is representative only.

## Troubleshooting

| Problem | Resolution |
|---------|------------|
| **OIDC authentication failure** | Verify `DefaultAzureCredential` configuration. Run `az login` (or `az login --tenant <TENANT-ID>`) and confirm the correct subscription is active. |
| **Data file not found** | Verify the `Hotels_Vector.json` path. By default the app resolves `../../data/Hotels_Vector.json` relative to the build output directory. Override with the `DATA_FILE_WITH_VECTORS` environment variable. |
| **Connection timeout** | Check network firewall rules and confirm the DocumentDB cluster is running and accessible. Ensure TLS is enabled and the cluster name is correct. |
| **Azure OpenAI errors** | Verify the endpoint URL, confirm the `text-embedding-3-small` model deployment exists, and ensure your identity has the `Cognitive Services OpenAI User` RBAC role. |

## Important Notes

- **Collection cleanup**: This sample drops and recreates collections on every run. Any existing data in collections matching the `hotels_{algorithm}_{similarity}` naming pattern will be deleted.
