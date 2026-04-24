# Select algorithm - Go

Compare DiskANN, HNSW, and IVF vector index algorithms across COS, L2, and IP similarity metrics using Azure DocumentDB.

## Prerequisites

- Go 1.22+
- Azure DocumentDB cluster
- Azure OpenAI resource with `text-embedding-3-small` deployment

## Setup

1. Copy `.env.example` to `.env` in this directory and fill in your values.
2. Source the `.env` file into your shell (the app reads `os.Getenv` directly):

```bash
export $(grep -v '^#' .env | xargs)   # Linux / macOS
```

```powershell
Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#][^=]+)=(.*)') { [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim()) } }
```

3. Install dependencies:

```bash
go mod download
```

## Usage

### Compare all algorithms (default: COS similarity)

```bash
go run src/main.go
```

Set `ALGORITHM` and `SIMILARITY` env vars in `.env` to control which collections are queried:

| ALGORITHM | SIMILARITY | Collections queried |
|-----------|------------|---------------------|
| `all`     | `COS`      | 3 (one per algorithm, COS) |
| `all`     | `all`      | 9 (all combinations) |
| `diskann` | `COS`      | 1 (hotels_diskann_cos) |
| `diskann` | `all`      | 3 (diskann × all similarities) |

## Architecture

Creates collections per algorithm and similarity combination (3 algorithms × 3 distance metrics):

| Algorithm | COS | L2 | IP |
|-----------|-----|----|----|
| DiskANN   | `hotels_diskann_cos` | `hotels_diskann_l2` | `hotels_diskann_ip` |
| HNSW      | `hotels_hnsw_cos` | `hotels_hnsw_l2` | `hotels_hnsw_ip` |
| IVF       | `hotels_ivf_cos` | `hotels_ivf_l2` | `hotels_ivf_ip` |

Each collection gets its own vector index created via `db.RunCommand()` and data inserted via `InsertMany()`. The main script runs `$search` aggregation queries and prints a comparison table.

## Expected output

When you run the sample with `ALGORITHM=all` and `SIMILARITY=COS`, the console prints a comparison table similar to the following (exact timings and scores vary per run):

```
Vector Algorithm Comparison
   Database: hotels
   Algorithms: all
   Similarity: COS
   Collections to query: hotels_diskann_cos, hotels_hnsw_cos, hotels_ivf_cos
   Search query: "luxury hotel with ocean view"

Initializing MongoDB and Azure OpenAI clients...
Loading data from data/hotels.json...
Loaded 10 documents
Generating query embedding...

Processing collection: hotels_diskann_cos
  Creating collection...
  Creating vector index (diskann / COS)...
  Inserting 10 documents...
  Running vector search...
[OK] 3 results, 42ms

Processing collection: hotels_hnsw_cos
  Creating collection...
  Creating vector index (hnsw / COS)...
  Inserting 10 documents...
  Running vector search...
[OK] 3 results, 38ms

Processing collection: hotels_ivf_cos
  Creating collection...
  Creating vector index (ivf / COS)...
  Inserting 10 documents...
  Running vector search...
[OK] 3 results, 35ms

+-------------------+-----------+--------+----------------------------------+
| Collection        | Algorithm | Latency| Top Result                       |
+-------------------+-----------+--------+----------------------------------+
| hotels_diskann_cos| diskann   |  42 ms | Oceanfront Resort (score: 0.87)  |
| hotels_hnsw_cos   | hnsw      |  38 ms | Oceanfront Resort (score: 0.87)  |
| hotels_ivf_cos    | ivf       |  35 ms | Oceanfront Resort (score: 0.86)  |
+-------------------+-----------+--------+----------------------------------+

Done.
```

> Results vary based on cluster size, region latency, and data. The table format and column names are stable; the values are not.

## Notes

- Uses passwordless authentication with `DefaultAzureCredential` for both Azure OpenAI and DocumentDB
- Environment variables are read directly via `os.Getenv`; source your `.env` file before running
- Algorithm-specific index parameters:
  - DiskANN: maxDegree=32, lBuild=50
  - HNSW: m=16, efConstruction=64
  - IVF: numLists=1
- Algorithm-specific search parameters:
  - DiskANN: lSearch=100
  - HNSW: efSearch=80
  - IVF: nProbes=1

## Troubleshooting

### Authentication with DefaultAzureCredential

This sample uses `DefaultAzureCredential` for passwordless authentication to both Azure OpenAI and DocumentDB. Before running, sign in with the Azure CLI:

```bash
az login
```

`DefaultAzureCredential` tries multiple credential sources in order (environment variables, managed identity, Azure CLI, and others). For local development, the Azure CLI credential is typically used.

### RBAC role requirements

Your Azure identity needs the following roles:

- **Cognitive Services OpenAI User** on the Azure OpenAI resource (for embedding generation).
- A DocumentDB/Cosmos DB data-plane role that permits read and write operations on the target database. Consult your cluster's access control settings.

### MongoDB OIDC connection errors

If you see `MONGODB-OIDC` authentication failures:

- Confirm the `MONGO_CLUSTER_NAME` environment variable is set correctly (cluster name only, not the full URI).
- Verify your Azure identity has been granted access to the DocumentDB cluster.
- Check that the token resource (`https://ossrdbms-aad.database.windows.net`) is correct for your cluster type.
- Ensure network connectivity to the cluster (firewall rules, VNet configuration).

### Common error codes

| Error | Cause | Fix |
|-------|-------|-----|
| `failed to create Azure credential` | No valid Azure credential found | Run `az login` or configure a service principal |
| `failed to connect to MongoDB` | Network or auth issue | Check cluster name, firewall rules, and RBAC |
| `failed to generate embedding` | Azure OpenAI call failed | Verify endpoint URL, deployment name, and RBAC role |
| `invalid ALGORITHM` / `invalid SIMILARITY` | Bad env var value | Use one of: `all`, `diskann`, `hnsw`, `ivf` / `all`, `COS`, `L2`, `IP` |
