# Azure DocumentDB (MongoDB vCore) - Indexing for Embeddings

This sample demonstrates **how to create and verify vector search indexes** in Azure DocumentDB, focusing on index lifecycle, configuration, and health verification.

## What You'll Learn

This sample answers the key questions:
- **How do I create a vector index in my database?**
- **Why does index creation take time and what does "building" mean?**
- **How do I know if my index is working correctly?**
- **What dimension requirements must I follow?**

You'll learn to:
- Define vector indexes via `cosmosSearchOptions` on BSON fields
- Verify dimension compatibility between index and embeddings
- Observe index build timing and understand the BUILDING → READY lifecycle
- Check index status/health via `listSearchIndexes()` output
- Confirm the index is active by testing queries

## Focus: Index Creation & Verification (Not Algorithm Comparison)

**This is Topic 2**: Index lifecycle and configuration  
**Not Topic 3**: Algorithm comparison and parameter tuning

We demonstrate:
✅ Index creation syntax and configuration  
✅ Dimension compatibility verification  
✅ Index build monitoring (BUILDING → READY)  
✅ Health checks via listSearchIndexes()  
✅ Confirming index works with test queries

We do NOT cover (that's Topic 3):
❌ Comparing IVF vs HNSW vs DiskANN algorithms  
❌ Tuning parameters like nprobe, ef, m  
❌ Recall vs latency trade-offs  

## Prerequisites

- Node.js 18.x or later
- Azure subscription
- Azure DocumentDB account (MongoDB vCore)
- Azure OpenAI resource with embeddings deployment

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your Azure credentials
```

3. Update `.env` with your:
   - DocumentDB connection string
   - Database and collection names
   - Azure OpenAI endpoint and API key
   - Embedding deployment name and dimensions

## Run the Sample

```bash
npm start
```

## Sample Flow

The sample demonstrates the complete index lifecycle:

### Step 1: Verify Embedding Dimensions
```
✓ Embedding generated successfully
  Actual dimensions: 1536
  Expected dimensions: 1536
✓ Dimensions match - safe to proceed
```

**Why this matters**: Index dimensions MUST exactly match embedding model output.

### Step 2: Create Vector Index
```
Index Configuration:
  Name: vectorSearchIndex
  Type: vector-ivf
  Field Path: embedding
  Dimensions: 1536
  Similarity: COS (cosine distance)

✓ Index creation initiated
  Status will be BUILDING initially
  Will transition to READY when complete
```

**What happens**: DocumentDB initiates asynchronous index build process.

### Step 3: Monitor Index Build Status
```
Waiting for index "vectorSearchIndex" to be READY...

Check 1 [5s]: Status = BUILDING
  Still building... (this is normal)
Check 2 [10s]: Status = BUILDING
  Still building... (this is normal)
Check 3 [15s]: Status = READY

✓ Index is READY after 15 seconds
```

**Why it takes time**: DocumentDB reads all documents, calculates index structures, and stores index data.

### Step 4: Validate Index Configuration
```
Index Health Checklist:
✓ Index exists: PASS
✓ Status is READY: PASS
✓ Dimensions match: PASS
✓ Correct type: PASS
✓ Correct path: PASS

✓ Index is HEALTHY and ready to use
```

**Health checks**: Verify all configuration is correct before using.

### Step 5: Insert Documents
```
Inserting 5 test documents...
  ✓ Inserted: Understanding Vector Indexes (1536 dims)
  ✓ Inserted: Index Build Process (1536 dims)
  ...

✓ Successfully inserted 5/5 documents
```

**Dimension validation**: Each insert verifies dimensions match index.

### Step 6: Confirm Index Works
```
Test query: "How do I check if my vector index is healthy?"

1. Generating query embedding...
   ✓ Generated (1536 dimensions)

2. Executing vector search query...
   ✓ Query completed in 45ms
   ✓ Found 3 results

3. Top results:
   1. Monitoring Index Health
   2. Understanding Vector Indexes
   3. Index Build Process

✓ INDEX IS WORKING CORRECTLY
```

**Confirmation**: Successfully executes vector similarity search.

## Key Concepts

### Index Lifecycle

```
1. DEFINITION → You define index via createSearchIndex()
2. BUILDING   → DocumentDB builds index structure
3. READY      → Index is active and queries use it
4. (FAILED)   → Build failed (check logs)
```

### Dimension Requirements

The **numDimensions** must EXACTLY match your embedding model:

| Embedding Model | Dimensions |
|-----------------|------------|
| text-embedding-ada-002 | 1536 |
| text-embedding-3-small | 1536 |
| text-embedding-3-large | 3072 |

**Mismatch = insertion errors!**

### Index Build Timing

| Dataset Size | Typical Build Time |
|--------------|-------------------|
| < 1,000 docs | Seconds to 1 minute |
| 1K - 10K docs | 1-5 minutes |
| 10K - 100K docs | 5-30 minutes |
| > 100K docs | 30+ minutes |

### cosmosSearchOptions Syntax

```javascript
const indexDefinition = {
  name: "vectorSearchIndex",      // Unique identifier
  type: "vector-ivf",             // Algorithm (IVF or HNSW)
  definition: {
    fields: [
      {
        path: "embedding",        // Field with BSON array
        type: "vector",           // Must be "vector"
        numDimensions: 1536,      // Match embedding model
        similarity: "COS"         // COS, IP, or L2
      }
    ]
  }
};
```

### Checking Index Status

```javascript
const indexes = await collection.listSearchIndexes().toArray();
const index = indexes.find(idx => idx.name === "vectorSearchIndex");

console.log(index.status);  // BUILDING, READY, or FAILED
```

## Troubleshooting

### Issue: Dimension mismatch error on insert
**Cause**: Index dimensions don't match embedding dimensions  
**Fix**: Drop index and recreate with correct dimensions

### Issue: Index status stuck on BUILDING
**Cause**: Large dataset or resource constraints  
**Fix**: Wait longer; large datasets take more time

### Issue: Index status is FAILED
**Cause**: Configuration error  
**Fix**: Check logs; verify field path exists; recreate index

### Issue: Queries still slow after index created
**Cause**: Index not READY yet  
**Fix**: Verify status is READY (not BUILDING)

## Index Health Checklist

Use this to verify your index is healthy:

✅ Index exists (listSearchIndexes returns it)  
✅ Status is READY (not BUILDING or FAILED)  
✅ Dimensions match embedding model  
✅ Path matches document field name  
✅ Type is "vector"  
✅ Similarity is set (COS, IP, or L2)  
✅ Queries execute without errors  
✅ Results are returned  
✅ Performance is acceptable

## Next Steps

Now that you know how to create and verify indexes:

1. **Topic 3: Vector Index Algorithms & Query Behavior**
   - Compare IVF vs HNSW vs DiskANN
   - Understand recall vs latency trade-offs
   - Learn parameter tuning (nprobe, ef, m)

2. **Topic 4: Vector Store Semantic Search**
   - Use verified indexes for production search
   - Implement query patterns
   - Optimize for your use case

## Resources

- [Azure DocumentDB Vector Search](https://learn.microsoft.com/azure/documentdb/vector-search)
- [MongoDB Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/)
- [cosmosSearchOptions reference](https://learn.microsoft.com/azure/documentdb/mongodb-feature-support)
