# Azure DocumentDB (MongoDB vCore) - Vector Index Algorithms & Query Behavior

This sample demonstrates the differences between vector index algorithms (IVF, HNSW, DiskANN) in DocumentDB and how they affect search accuracy and performance.

## What You'll Learn

- Fundamental differences between ANN algorithms in DocumentDB
- Recall vs. latency trade-offs for each algorithm
- When to use IVF, HNSW, or DiskANN based on requirements
- How to tune algorithm-specific parameters (nprobe, ef, m)
- Benchmark patterns to measure algorithm performance

## Prerequisites

- Completion of the [Indexing for Embeddings](../documentdb-topic2/) tutorial
- Node.js 18.x or later
- Azure subscription
- Azure DocumentDB account (MongoDB vCore)
- Azure OpenAI resource with embeddings deployment

## Algorithm Comparison

| Algorithm | Search Type | Recall | Latency | Tuning | Best For |
|-----------|-------------|--------|---------|--------|----------|
| **IVF** | Approximate | 90-95% | Moderate | nprobe | Balanced performance |
| **HNSW** | Approximate | 92-97% | Fast | ef, m | Low latency priority |
| **DiskANN** | Approximate | 90-99% | Very Fast | efSearch | Large scale (> 100K) |

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Update your Azure credentials in `.env`

## Run the Benchmark

```bash
npm start
```

## What the Benchmark Does

1. Creates collections with different algorithms (IVF, HNSW)
2. Inserts identical test datasets (BSON format)
3. Executes the same queries across all algorithms
4. Measures recall, latency, and performance
5. Generates comparison reports

## Expected Results

### IVF Index
- **Recall**: 92-94% (nprobe=10 default)
- **Latency**: Moderate (~120ms)
- **Tuning**: Increase nprobe for better recall
- **Use case**: Balanced workloads

### HNSW Index
- **Recall**: 94-96% (ef=40 default)
- **Latency**: Fast (~75ms)
- **Tuning**: Increase ef for better recall, m for better graph
- **Use case**: Real-time search

### DiskANN Index
- **Recall**: 93-96%
- **Latency**: Very fast (~65ms)
- **Use case**: Large-scale production

## Algorithm Selection Guide

### Decision Tree

```
Priority: What matters most?

├─ Speed (low latency)
│  └─ Use HNSW
│     • Start with ef=40
│     • Increase for higher recall
│
├─ Balance
│  └─ Use IVF
│     • Start with nprobe=10
│     • Tune based on needs
│
└─ Scale (> 100K vectors)
   └─ Use DiskANN
      • Best scalability
      • Tunable accuracy
```

## Tuning Parameters

### IVF Parameters

| Parameter | Default | Tuning |
|-----------|---------|--------|
| **nprobe** | 10 | Increase (20, 50, 100) for higher recall |

### HNSW Parameters

| Parameter | Default | Tuning |
|-----------|---------|--------|
| **ef** | 40 | Increase (60, 80, 100) for higher recall |
| **m** | 16 | Set at build time (higher = better graph) |

## Sample Output

```
================================================================================
ALGORITHM COMPARISON SUMMARY
================================================================================

Algorithm           Avg Latency    Avg Recall     Characteristics
--------------------------------------------------------------------------------
IVF                 118.50ms       93.20%         Balanced recall/latency
HNSW                76.80ms        95.40%         Fast, tunable (ef, m)
--------------------------------------------------------------------------------

RECOMMENDATIONS:

📌 ALGORITHM SELECTION GUIDE:
  • Low latency → HNSW (tune ef)
  • Balanced → IVF (tune nprobe)
  • Large scale → DiskANN
```

## Measuring Recall

Recall measures the percentage of true matches found:

```
Recall@k = (Relevant docs in top k) / (Total relevant docs)
```

The benchmark uses IVF with high nprobe as baseline.

## MongoDB-Specific Considerations

- Embeddings stored in BSON array format
- Use cosmosSearchOptions for vector search
- 16MB document size limit
- Connection pooling for production

## Next Steps

- Apply optimal algorithm to your production data
- Tune parameters based on specific SLOs
- Implement [Hybrid Search](../documentdb-topic5/) patterns
- Add [Semantic Reranking](../documentdb-topic6/) with Cohere

## Cleanup

To remove test collections:

```javascript
await database.collection("embeddings_ivf").drop();
await database.collection("embeddings_hnsw").drop();
await database.collection("embeddings_diskann").drop();
```

## Resources

- [MongoDB Vector Search Overview](https://www.mongodb.com/docs/atlas/atlas-vector-search/)
- [Azure DocumentDB Vector Search](https://learn.microsoft.com/azure/documentdb/vector-search)
- [HNSW Paper](https://arxiv.org/abs/1603.09320)
- [IVF Algorithm](https://en.wikipedia.org/wiki/Inverted_index)
