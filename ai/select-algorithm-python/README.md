# DocumentDB Vector Algorithm Comparison - Python

Compare DocumentDB vector index algorithms (DiskANN, HNSW, IVF) across similarity functions (cosine, L2, inner product).

## Prerequisites

- Python 3.10+
- Azure DocumentDB cluster with vector search enabled
- Azure OpenAI service with embedding model deployed
- Azure CLI authenticated (`az login`)
- DocumentDB `dbOwner` role on the target database
- `Cognitive Services OpenAI User` role on the Azure OpenAI resource

## Setup

1. Create and activate a virtual environment:
```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your Azure resource details
```

4. Ensure vector data exists:
```bash
# Data file should be at: ../../data/Hotels_Vector.json
```

## Usage

Run all algorithms with all similarity functions:
```bash
python src/select_algorithm.py
```

Run specific algorithm:
```bash
ALGORITHM=diskann python src/select_algorithm.py
```

Run specific similarity function:
```bash
SIMILARITY=L2 python src/select_algorithm.py
```

Run specific combination:
```bash
ALGORITHM=hnsw SIMILARITY=IP python src/select_algorithm.py
```

## Environment Variables

- `ALGORITHM`: Algorithm to test (`all`, `diskann`, `hnsw`, `ivf`)
- `SIMILARITY`: Similarity function (`all`, `COS`, `L2`, `IP`)
- `MONGO_CLUSTER_NAME`: DocumentDB cluster name
- `AZURE_OPENAI_EMBEDDING_ENDPOINT`: Azure OpenAI endpoint
- `AZURE_OPENAI_EMBEDDING_MODEL`: Embedding model deployment name

## Expected output

The script creates collections per algorithm/similarity combo, runs vector search, and prints a comparison table showing:
- Algorithm and similarity function used
- Top search result
- Search score
- Query latency in milliseconds

```
Vector Algorithm Comparison
   Database: Hotels
   Algorithms: all
   Similarity: cos
   Collections to query: hotels_diskann_cos, hotels_hnsw_cos, hotels_ivf_cos
   Search query: "quintessential lodging near running trails, eateries, retail"

Initializing MongoDB and Azure OpenAI clients...
Loading data from ...
Loaded [N] documents
Generating query embedding...
Query embedding: 1536 dimensions

--- DiskANN / COS ---
Collection: hotels_diskann_cos
Created collection: hotels_diskann_cos
Inserted: [N]/[N]
Created vector index: vectorIndex_diskann_cos
Executing vector search...
Success: 5 results, [time]ms

--- HNSW / COS ---
...

--- IVF / COS ---
...

=== Vector Search Comparison ===
[Table of results with Algorithm, Similarity, Top Result, Score, and Latency columns]
[Results vary based on data and cluster configuration]
```

## Troubleshooting

### Authentication failures

This sample uses `DefaultAzureCredential` for passwordless authentication. If you see authentication errors:

- Run `az login` to authenticate with Azure CLI.
- Verify your account has access to the DocumentDB cluster and Azure OpenAI resource.
- If using a managed identity, ensure the identity is assigned to the resource.

### Missing environment variables

If the script fails at startup, verify all required variables are set in your `.env` file. Copy `.env.example` as a starting point and fill in each value.

### pymongo connection issues

- Verify the `MONGO_CLUSTER_NAME` value matches your DocumentDB cluster name.
- Ensure network access is enabled for your IP in the DocumentDB cluster firewall settings.
- Check that the cluster is running and not paused.

### DocumentDB RBAC permissions

Vector search requires read/write permissions on the target database. Ensure your identity has the appropriate DocumentDB RBAC role assigned, such as `dbOwner` or a custom role with `createCollection`, `createIndex`, and `find` actions.
