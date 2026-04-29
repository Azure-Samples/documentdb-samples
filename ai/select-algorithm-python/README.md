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
| DiskANN   | 50K+        | M30+         | maxDegree, lBuild |

## Prerequisites

- Azure subscription
- Azure DocumentDB vCore cluster (M30+ for all algorithms, M10+ for IVF only)
- Azure OpenAI resource with `text-embedding-3-small` deployed
- Python 3.10+
- Azure CLI (`az login` for passwordless auth)

## Setup

1. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your resource values.

3. Install dependencies:
   ```bash
   cd src
   pip install -r ../requirements.txt
   ```

4. Ensure you're logged in to Azure:
   ```bash
   az login
   ```

## Run

```bash
cd src

# Run individual algorithms
python ivf.py
python hnsw.py
python diskann.py
```

## Compare All Algorithms

Run all 9 combinations (3 algorithms × 3 similarity metrics) in a single invocation:

```bash
cd src
python compare_all.py
```

This creates a single `hotels` collection with 9 vector indexes and runs each search sequentially for fair timing comparison. Output is a formatted table showing latency, scores, and top results for every combination.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `QUERY_TEXT` | "luxury hotel near the beach" | Search query text |
| `TOP_K` | 3 | Number of results per search |
| `VERBOSE` | false | Print individual results per combo |

## Configuration

Edit `.env` to configure:
- `ALGORITHM` — Which algorithm to test: `all`, `ivf`, `hnsw`, `diskann`
- `SIMILARITY` — Similarity metric: `COS`, `L2`, `IP`
- `EMBEDDING_DIMENSIONS` — Must match your embedding model (1536 for text-embedding-3-small)
