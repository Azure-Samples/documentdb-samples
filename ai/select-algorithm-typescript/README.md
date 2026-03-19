# Select Algorithm - TypeScript

Compare DiskANN, HNSW, and IVF vector index algorithms across COS, L2, and IP similarity metrics using Azure DocumentDB.

## Prerequisites

- Node.js 20+
- Azure DocumentDB cluster
- Azure OpenAI resource with `text-embedding-3-small` deployment

## Setup

1. Copy `.env.example` to `../../.env` (repo root) and fill in your values.
2. Install dependencies:

```bash
npm install
```

## Usage

### Compare all algorithms (default: COS similarity)

```bash
npm start
```

Set `ALGORITHM` and `SIMILARITY` env vars in `.env` to control which collections are queried:

| ALGORITHM | SIMILARITY | Collections queried |
|-----------|------------|---------------------|
| `all`     | `COS`      | 3 (one per algorithm, COS) |
| `all`     | `all`      | 9 (all combinations) |
| `diskann` | `COS`      | 1 (hotels_diskann_cos) |
| `diskann` | `all`      | 3 (diskann × all similarities) |

### Run single algorithm

```bash
npm run start:diskann
npm run start:hnsw
npm run start:ivf
```

### Verify indexes

```bash
npm run start:show-indexes
```

## Architecture

Creates 9 collections (3 algorithms × 3 distance metrics):

| Algorithm | COS | L2 | IP |
|-----------|-----|----|----|
| DiskANN   | `hotels_diskann_cos` | `hotels_diskann_l2` | `hotels_diskann_ip` |
| HNSW      | `hotels_hnsw_cos` | `hotels_hnsw_l2` | `hotels_hnsw_ip` |
| IVF       | `hotels_ivf_cos` | `hotels_ivf_l2` | `hotels_ivf_ip` |

Each collection gets its own vector index created via `db.command()` and data inserted via `insertMany()`. The main script runs `$search` aggregation queries and prints a comparison table.
