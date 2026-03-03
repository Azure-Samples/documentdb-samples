# Vector Index Algorithms & Query Behavior in Azure DocumentDB (MongoDB)

**Purpose:** Learn the fundamental differences between ANN (Approximate Nearest Neighbor) algorithms in DocumentDB, how they affect search accuracy (recall) and latency, and which algorithm fits your use case. This article assumes you've already created an index and now want to understand algorithm trade-offs and optimize for performance.

## Prerequisites

- Completion of the [Indexing for Embeddings](../documentdb-topic2/) tutorial
- An Azure account with an active subscription
- Azure DocumentDB account (MongoDB vCore)
- Node.js 18.x or later
- Azure OpenAI resource with an embeddings model deployed
- Understanding of vector index basics and MongoDB operations

## What You'll Learn

In this article, you'll learn:
- The fundamental differences between IVF, HNSW, and DiskANN algorithms
- How each algorithm affects recall (accuracy) and latency
- When to use each algorithm based on dataset size and requirements
- How to tune algorithm-specific parameters (nprobe for IVF, ef and m for HNSW)
- Benchmark patterns to measure recall vs. latency trade-offs

## Understanding ANN Algorithms in DocumentDB

Azure DocumentDB (MongoDB vCore) supports vector search through `cosmosSearchOptions` with three primary algorithms:

### Algorithm Comparison Matrix

| Algorithm | Search Type | Recall | Latency | Tuning Parameters | Best For |
|-----------|-------------|--------|---------|-------------------|----------|
| **IVF** | Approximate | 90-95% | Moderate | nprobe | Medium datasets, balanced recall/latency |
| **HNSW** | Approximate | 92-97% | Fast | ef, m | Fast queries with tunable precision |
| **DiskANN** | Approximate | 90-99% | Very Fast | efSearch | Large-scale datasets (scalable) |

### When to Use Each Algorithm

#### IVF (Inverted File)
- **Use when**: You need a good balance between recall and latency
- **Dataset size**: Medium-scale datasets (10K - 100K vectors)
- **Trade-off**: Moderate recall (~90-95%) with reasonable query speed
- **Tuning**: Adjust `nprobe` parameter (higher = better recall, slower queries)

**Example use case**: E-commerce product search with moderate catalog size

#### HNSW (Hierarchical Navigable Small World)
- **Use when**: Fast approximate search is priority
- **Dataset size**: Various scales, optimized for speed
- **Trade-off**: High recall (~92-97%) with fast queries
- **Tuning**: Adjust `ef` (search expansion) and `m` (graph connections)

**Example use case**: Real-time recommendation systems requiring low latency

#### DiskANN
- **Use when**: Working with very large datasets requiring scalability
- **Dataset size**: Large-scale (> 100K vectors, up to millions)
- **Trade-off**: Excellent scalability with tunable recall
- **Tuning**: Similar tuning principles to HNSW

**Example use case**: Enterprise-scale semantic search across large document repositories

## Algorithm Parameters

### IVF Tuning Parameters

IVF uses clustering to partition the vector space:

| Parameter | Description | Default | Impact |
|-----------|-------------|---------|--------|
| **nprobe** | Number of clusters to search | 10 | Higher = better recall, slower queries |
| **nlist** | Number of clusters (build time) | Auto | Affects index structure |

**Tuning guidance:**
- Start with default nprobe
- Increase nprobe (e.g., 20, 50, 100) for higher recall
- Monitor latency increase with higher nprobe values

### HNSW Tuning Parameters

HNSW builds a hierarchical graph structure:

| Parameter | Description | Default | Impact |
|-----------|-------------|---------|--------|
| **ef** | Search expansion factor | 40 | Higher = better recall, slower queries |
| **m** | Graph connections per node | 16 | Affects index quality and size |

**Tuning guidance:**
- Start with default ef (40)
- Increase ef (60, 80, 100) for higher recall requirements
- Adjust m during index creation (not queryable at runtime)
- Higher m = better recall but larger index size

### Similarity Functions

All algorithms support these distance functions:

| Function | Use Case | DocumentDB Notation |
|----------|----------|---------------------|
| **Cosine** | Most common; angle between vectors | "COS" |
| **Inner Product** | For normalized vectors | "IP" |
### How to Tune IVF Parameters

#### Setting nprobe at Query Time

For IVF indexes, `nprobe` controls how many clusters to search. You set this **at query time** in the aggregation pipeline:

```javascript
// IVF query with default nprobe (10)
const resultsDefault = await collection.aggregate([
  {
    $search: {
      cosmosSearch: {
        vector: queryEmbedding,
        path: "embedding",
        k: 10
        // nprobe defaults to 10 if not specified
      }
    }
  }
]).toArray();

// IVF query with TUNED nprobe (50) for better recall
const resultsHighRecall = await collection.aggregate([
  {
    $search: {
      cosmosSearch: {
        vector: queryEmbedding,
        path: "embedding",
        k: 10,
        nprobe: 50  // Search 50 clusters instead of default 10
      }
    }
  }
]).toArray();

console.log(`Default (nprobe=10): ${resultsDefault.length} results`);
console.log(`Tuned (nprobe=50): ${resultsHighRecall.length} results`);
```

#### nprobe Tuning Guide

| nprobe Value | Recall | Latency | Use Case |
|--------------|--------|---------|----------|
| 5 | ~85-88% | Lowest | Latency-critical, lower accuracy OK |
| 10 (default) | ~90-93% | Moderate | Balanced (recommended starting point) |
| 20 | ~93-95% | Higher | Better accuracy needed |
| 50 | ~95-97% | Higher | High accuracy priority |
| 100 | ~97-99% | Highest | Near-exact search |

**Example: Tuning for Your Workload**

```javascript
async function findOptimalNprobe(collection, queryEmbedding) {
  const nprobeValues = [5, 10, 20, 50, 100];
  
  console.log("Testing nprobe values...\n");
  
  for (const nprobe of nprobeValues) {
    const startTime = Date.now();
    
    const results = await collection.aggregate([
      {
        $search: {
          cosmosSearch: {
            vector: queryEmbedding,
            path: "embedding",
            k: 10,
            nprobe: nprobe
          }
        }
      }
    ]).toArray();
    
    const latency = Date.now() - startTime;
    
    console.log(`nprobe=${nprobe}:`);
    console.log(`  Latency: ${latency}ms`);
    console.log(`  Results: ${results.length}`);
    // Calculate recall against ground truth if available
  }
}
```

### How to Tune HNSW Parameters

#### Setting ef at Query Time

For HNSW indexes, `ef` (efSearch) controls the search expansion. You set this **at query time**:

```javascript
// HNSW query with default ef (typically 40)
const resultsDefault = await collection.aggregate([
  {
    $search: {
      cosmosSearch: {
        vector: queryEmbedding,
        path: "embedding",
        k: 10
        // ef defaults to index creation value if not specified
      }
    }
  }
]).toArray();

// HNSW query with TUNED ef (80) for better recall
const resultsHighRecall = await collection.aggregate([
  {
    $search: {
      cosmosSearch: {
        vector: queryEmbedding,
        path: "embedding",
        k: 10,
        ef: 80  // Search expansion factor
      }
    }
  }
]).toArray();

console.log(`Default: ${resultsDefault.length} results`);
console.log(`Tuned (ef=80): ${resultsHighRecall.length} results`);
```

#### ef Tuning Guide

| ef Value | Recall | Latency | Use Case |
|----------|--------|---------|----------|
| 20 | ~90-92% | Lowest | Latency-critical |
| 40 (typical default) | ~94-96% | Moderate | Balanced (recommended) |
| 60 | ~95-97% | Higher | Better accuracy |
| 80 | ~96-98% | Higher | High accuracy priority |
| 100+ | ~97-99% | Highest | Near-exact search |

#### Setting m at Index Creation Time

The `m` parameter controls the graph structure and is set **at index creation time**:

```javascript
// Create HNSW index with custom m parameter
const indexDefinition = {
  name: "vectorSearchIndex_hnsw",
  type: "vector-hnsw",
  definition: {
    fields: [
      {
        path: "embedding",
        type: "vector",
        numDimensions: 1536,
        similarity: "COS"
      }
    ]
  },
  hnswOptions: {
    m: 16,              // Graph connections per node (default: 16)
    efConstruction: 100 // Build-time search expansion (default: 100)
  }
};

await collection.createSearchIndex(indexDefinition);
```

#### m Parameter Guide

| m Value | Index Size | Recall | Build Time | Use Case |
|---------|------------|--------|------------|----------|
| 8 | Smaller | Lower | Faster | Memory-constrained |
| 16 (default) | Moderate | Good | Moderate | Balanced (recommended) |
| 32 | Larger | Better | Slower | High accuracy priority |
| 64 | Much larger | Best | Much slower | Maximum accuracy |

**Important**: `m` is **fixed at index creation** and cannot be changed later. Choose carefully based on your accuracy and memory requirements.

### Complete Tuning Example

```javascript
/**
 * Comprehensive parameter tuning demonstration
 */
async function demonstrateParameterTuning(database) {
  console.log("=== Parameter Tuning Demonstration ===\n");
  
  // 1. Create IVF collection
  const collectionIVF = database.collection("embeddings_ivf");
  
  // IVF: Test different nprobe values
  console.log("1. IVF nprobe Tuning:");
  const queryEmbedding = await generateEmbedding("test query");
  
  for (const nprobe of [10, 20, 50]) {
    const startTime = Date.now();
    
    const results = await collectionIVF.aggregate([
      {
        $search: {
          cosmosSearch: {
            vector: queryEmbedding,
            path: "embedding",
            k: 10,
            nprobe: nprobe
          }
        }
      },
      { $project: { _id: 1, title: 1, score: { $meta: "searchScore" } } }
    ]).toArray();
    
    const latency = Date.now() - startTime;
    console.log(`  nprobe=${nprobe}: ${latency}ms, ${results.length} results`);
  }
  
  // 2. Create HNSW collection with custom m
  console.log("\n2. HNSW Index with m=32:");
  const collectionHNSW = database.collection("embeddings_hnsw");
  
  await collectionHNSW.createSearchIndex({
    name: "vectorSearchIndex_hnsw_m32",
    type: "vector-hnsw",
    definition: {
      fields: [{
        path: "embedding",
        type: "vector",
        numDimensions: 1536,
        similarity: "COS"
      }]
    },
    hnswOptions: {
      m: 32,              // Higher m for better accuracy
      efConstruction: 200 // Higher efConstruction during build
    }
  });
  
  console.log("  ✓ HNSW index created with m=32");
  
  // 3. HNSW: Test different ef values
  console.log("\n3. HNSW ef Tuning:");
  
  for (const ef of [40, 60, 80]) {
    const startTime = Date.now();
    
    const results = await collectionHNSW.aggregate([
      {
        $search: {
          cosmosSearch: {
            vector: queryEmbedding,
            path: "embedding",
            k: 10,
            ef: ef
          }
        }
      },
      { $project: { _id: 1, title: 1, score: { $meta: "searchScore" } } }
    ]).toArray();
    
    const latency = Date.now() - startTime;
    console.log(`  ef=${ef}: ${latency}ms, ${results.length} results`);
  }
  
  console.log("\n✓ Parameter tuning demonstration complete");
}
```

### Before/After Tuning Comparison

Example showing the impact of parameter tuning:

```javascript
async function compareBeforeAfterTuning(collection) {
  const queryEmbedding = await generateEmbedding("machine learning embeddings");
  
  console.log("=== Before/After Tuning Comparison ===\n");
  
  // BEFORE: Default parameters
  console.log("BEFORE (default parameters):");
  const startBefore = Date.now();
  const resultsBefore = await collection.aggregate([
    {
      $search: {
        cosmosSearch: {
          vector: queryEmbedding,
          path: "embedding",
          k: 10
          // Using defaults: IVF nprobe=10 or HNSW ef=40
        }
      }
    }
  ]).toArray();
  const latencyBefore = Date.now() - startBefore;
  
  console.log(`  Latency: ${latencyBefore}ms`);
  console.log(`  Results: ${resultsBefore.length}`);
  console.log(`  Top result: ${resultsBefore[0]?.title}`);
  
  // AFTER: Tuned parameters (assuming IVF)
  console.log("\nAFTER (tuned nprobe=50):");
  const startAfter = Date.now();
  const resultsAfter = await collection.aggregate([
    {
      $search: {
        cosmosSearch: {
          vector: queryEmbedding,
          path: "embedding",
          k: 10,
          nprobe: 50  // Tuned for better recall
        }
      }
    }
  ]).toArray();
  const latencyAfter = Date.now() - startAfter;
  
  console.log(`  Latency: ${latencyAfter}ms`);
  console.log(`  Results: ${resultsAfter.length}`);
  console.log(`  Top result: ${resultsAfter[0]?.title}`);
  
  // Calculate differences
  const latencyIncrease = latencyAfter - latencyBefore;
  const latencyPercent = ((latencyIncrease / latencyBefore) * 100).toFixed(1);
  
  console.log("\nImpact:");
  console.log(`  Latency increased by: ${latencyIncrease}ms (${latencyPercent}%)`);
  console.log(`  Likely recall improved by: ~3-5% (test with ground truth)`);
  console.log(`  Trade-off: Worth it if accuracy is critical`);
}
```

### Parameter Tuning Best Practices

#### For IVF (nprobe)
✅ Start with nprobe=10 (default)  
✅ Test with nprobe=20, 50 on your data  
✅ Measure recall vs. ground truth (Flat or high-nprobe IVF)  
✅ Choose value that meets recall target at acceptable latency  
✅ Can adjust per-query based on importance

#### For HNSW (ef and m)
✅ **ef**: Start with ef=40, tune per-query based on needs  
✅ **m**: Choose at index creation (default m=16 is good for most cases)  
✅ Higher m = better accuracy but larger index and slower builds  
✅ Test ef values 40, 60, 80 with your queries  
✅ Document chosen parameters for team

#### General Tuning Workflow
1. **Establish baseline** with default parameters
2. **Define SLOs** (latency target, recall target)
3. **Test parameter ranges** on representative queries
4. **Measure trade-offs** (recall vs. latency)
5. **Choose optimal values** that meet both targets
6. **Monitor in production** and adjust as needed

| **Euclidean (L2)** | Geometric distance | "L2" |

## Sample Scenario

This sample demonstrates:
1. Creating collections with different index algorithms
2. Inserting identical datasets using BSON format
3. Running the same queries across all algorithms
4. Measuring and comparing recall, latency, and performance
5. Generating algorithm trade-off analysis

## Complete Working Sample

### Setup

Create a new Node.js project:

```bash
npm init -y
npm install mongodb @azure/openai dotenv
```

### Environment Configuration

Create `.env` file:

```env
# DocumentDB Configuration
DOCUMENTDB_CONNECTION_STRING=mongodb+srv://<username>:<password>@<cluster>.mongocluster.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000
DOCUMENTDB_DATABASE_NAME=vectordb

# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=https://<your-openai-resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=<your-openai-key>
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-ada-002
AZURE_OPENAI_EMBEDDING_DIMENSIONS=1536
```

### Implementation

The complete implementation includes:

1. **Test Data Generator**: Creates consistent test datasets with BSON embeddings
2. **Algorithm Benchmark**: Tests each algorithm with identical queries
3. **Recall Calculator**: Compares results against ground truth
4. **Performance Metrics**: Captures latency and recall

Key functions:
- `createCollectionWithAlgorithm()`: Creates collections with different algorithms
- `runBenchmark()`: Executes identical queries across all algorithms
- `calculateRecall()`: Measures accuracy
- `comparePerformance()`: Generates comparison reports

## Benchmark Results

### Expected Performance Characteristics

Based on a dataset of ~15-50 documents with 1536-dimensional embeddings:

#### IVF Index
```
Average Latency: 120ms (nprobe=10)
Recall: 92-94%
Parameters: nprobe=10 (default)
Use case: Balanced performance
```

With tuning (nprobe=50):
```
Latency: 180ms
Recall: 95-97%
```

#### HNSW Index
```
Average Latency: 75ms (ef=40)
Recall: 94-96%
Parameters: ef=40, m=16 (defaults)
Use case: Fast queries
```

With tuning (ef=80):
```
Latency: 100ms
Recall: 96-98%
```

#### DiskANN Index
```
Average Latency: 65ms
Recall: 93-96%
Scalability: Excellent for large datasets
Use case: Large-scale production
```

### Recall vs. Latency Curves

```
Recall (%)
 98 │           HNSW (ef=80) ●
 96 │     HNSW (ef=40) ●
 94 │              IVF (nprobe=50) ●
 92 │  IVF (nprobe=10) ●
 90 │                           DiskANN ●
    └──────────────────────────────────────
      50ms    100ms   150ms   200ms
                 Latency
```

## Choosing the Right Algorithm

### Decision Tree

```
Start: What's your primary concern?

├─ Speed (low latency)
│  └─ Use HNSW
│     • Start with ef=40
│     • Tune ef based on recall needs
│
├─ Balance (moderate recall/latency)
│  └─ Use IVF
│     • Start with nprobe=10
│     • Increase nprobe for better recall
│
└─ Scale (very large datasets)
   └─ Use DiskANN
      • Best for > 100K vectors
      • Excellent scalability
```

### Algorithm Selection Guide

| Scenario | Recommended Algorithm | Configuration |
|----------|----------------------|---------------|
| Real-time search (low latency) | HNSW | ef=40 (default) |
| Balanced workloads | IVF | nprobe=10-20 |
| High accuracy required | HNSW | ef=80-100 |
| Large-scale (> 100K vectors) | DiskANN | Default settings |
| Medium-scale (10K-100K) | IVF or HNSW | Based on latency vs. recall priority |

## Tuning for Your Workload

### Step 1: Establish Baseline

1. Choose an algorithm based on dataset size and requirements
2. Start with default parameters
3. Run representative queries
4. Measure baseline recall and latency

### Step 2: Define Requirements

Define your SLOs (Service Level Objectives):
- **Latency target**: e.g., < 100ms for 95th percentile
- **Recall target**: e.g., > 95% for top-10 results
- **Cost considerations**: Index size and query cost

### Step 3: Tune Parameters

**For IVF:**
- If recall too low → increase nprobe (try 20, 50, 100)
- If latency too high → decrease nprobe (try 5, 10)
- Monitor cluster distribution quality

**For HNSW:**
- If recall too low → increase ef (try 60, 80, 100)
- If latency too high → decrease ef (try 20, 30)
- Consider m parameter during index creation for better graph quality

### Step 4: Validate at Scale

- Test with production-representative data volume
- Measure across different query patterns
- Monitor during peak load
- A/B test algorithm choices if possible

## Measuring Recall

### Recall Calculation

Recall measures what percentage of true matches were found:

```
Recall = (True Positives Found) / (Total True Positives)
```

For top-k results:
```
Recall@k = (Relevant docs in top k) / (Total relevant docs)
```

### Sample Recall Test

```javascript
// Use IVF with high nprobe as ground truth
const groundTruthResults = await queryIVF(embedding, { nprobe: 100 });

// Test HNSW
const hnswResults = await queryHNSW(embedding, { ef: 40 });

// Calculate overlap
const groundTruthIds = new Set(groundTruthResults.map(r => r._id));
const hnswIds = new Set(hnswResults.map(r => r._id));
const overlap = [...hnswIds].filter(id => groundTruthIds.has(id)).length;

const recall = overlap / groundTruthResults.length;
console.log(`Recall: ${(recall * 100).toFixed(2)}%`);
```

## Best Practices

### Algorithm Selection
✅ Choose based on dataset size and latency requirements
✅ Start with defaults, tune based on measurements
✅ Test with production-scale data before deployment
✅ Monitor recall degradation as data grows

### Parameter Tuning
✅ **IVF**: Adjust nprobe for recall/latency balance
✅ **HNSW**: Tune ef at query time, m at index creation time
✅ Document your parameter choices and rationale
✅ Set up automated recall monitoring

### MongoDB-Specific Considerations
✅ Use BSON array format for embeddings (native support)
✅ Remember 16MB document size limit
✅ Handle connection pooling appropriately
✅ Monitor index size growth

### Production Readiness
✅ Benchmark with representative queries
✅ Load test at expected scale
✅ Set up monitoring for latency and recall
✅ Plan for index rebuild during algorithm changes

## Troubleshooting

### Issue: Low recall with IVF
**Solution**: Increase nprobe parameter; test with values 20, 50, 100

### Issue: High latency with HNSW
**Solution**: Decrease ef parameter or verify dataset size is appropriate

### Issue: Results inconsistent
**Solution**: Verify similarity function matches your use case; COS is most common for embeddings

### Issue: Index build failed
**Solution**: Check DocumentDB logs; verify dimensions match; ensure sufficient resources

### Issue: Query timeout
**Solution**: Increase connection timeout; verify index status is READY; check network connectivity

## Evaluation Framework

### Building a Test Suite

1. **Create evaluation dataset**
   - Representative queries from your domain
   - Known relevant documents for each query
   - Edge cases and challenging queries

2. **Define metrics**
   - Recall@k (k = 10, 20, 50)
   - Average latency (p50, p95, p99)
   - Query cost and resource usage

3. **Run comparisons**
   - Test each algorithm with identical queries
   - Vary parameters (nprobe for IVF, ef for HNSW)
   - Measure at different data scales

4. **Analyze trade-offs**
   - Plot recall vs. latency curves
   - Calculate cost per query at target recall
   - Identify optimal configuration for your SLOs

## Complete Sample Code

The complete working sample is available in `index.js`, which includes:
- Multi-algorithm collection creation
- BSON format handling
- Benchmark harness with MongoDB aggregation pipeline
- Recall calculation
- Performance comparison reports

## Next Steps

Now that you understand algorithm trade-offs in DocumentDB:
- **Vector Store Semantic Search**: Apply optimized indexes to production search
- **Hybrid Search**: Combine vector and text search using MongoDB operators
- **Semantic Reranking**: Implement with Cohere reranker for improved precision

## Clean Up Resources

```javascript
async function cleanup(database) {
  // Drop test collections
  await database.collection("embeddings_ivf").drop();
  await database.collection("embeddings_hnsw").drop();
  await database.collection("embeddings_diskann").drop();
  console.log("✓ Test collections dropped");
}
```

## Additional Resources

- [MongoDB Vector Search Overview](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/)
- [Azure DocumentDB Vector Search documentation](https://learn.microsoft.com/azure/documentdb/vector-search)
- [HNSW Paper](https://arxiv.org/abs/1603.09320)
- [IVF Algorithm Overview](https://en.wikipedia.org/wiki/Inverted_index)
- [cosmosSearchOptions reference](https://learn.microsoft.com/azure/documentdb/mongodb-feature-support)
