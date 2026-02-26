# Indexing for Embeddings in Azure DocumentDB (MongoDB)

**Purpose:** Learn how to **create and verify** vector search indexes in Azure DocumentDB. This article focuses on **index lifecycle and configuration**: defining indexes via cosmosSearchOptions, monitoring build status, validating dimension compatibility, and confirming indexes are active and working correctly.

## Prerequisites

- An Azure account with an active subscription
- Azure DocumentDB account (MongoDB vCore)
- Node.js 18.x or later
- Azure OpenAI resource with an embeddings model deployed
- Familiarity with the [DocumentDB vector search quickstart](https://learn.microsoft.com/en-us/azure/documentdb/quickstart-nodejs-vector-search)

## What You'll Learn

In this article, you'll answer the key questions:
- **How do I create a vector index in my database?**
- **Why does index creation take time and what does "building" mean?**
- **How do I know if my index is working correctly?**
- **What dimension requirements must I follow?**

You'll learn to:
- Define vector indexes via `cosmosSearchOptions` on BSON fields
- Verify dimension compatibility between index and embeddings
- Observe index build timing and understand resource impact
- Check index status and health via `listSearchIndexes()` output
- Confirm the index is active by comparing query performance before/after

## Understanding Vector Indexes in DocumentDB

### What is a Vector Index?

A vector index is a specialized data structure that enables **fast similarity search** on high-dimensional embedding vectors. Without an index, DocumentDB would need to scan every document and calculate distances—slow and expensive. With an index, similarity searches become orders of magnitude faster.

### Index Lifecycle

Vector indexes in DocumentDB go through distinct phases:

```
1. DEFINITION    → You define index via createSearchIndex()
2. BUILDING      → DocumentDB builds index structure in background
3. READY         → Index is active and queries use it automatically
4. (FAILED)      → Build failed (check logs for errors)
```

**Why "BUILDING" takes time:**
- DocumentDB must read all existing documents
- Calculate index structures (clusters, graphs, etc.)
- Store index data separately from documents
- The more documents, the longer this takes

### cosmosSearchOptions

DocumentDB uses `cosmosSearchOptions` to configure vector search indexes. This is MongoDB's vector search API, compatible with Azure DocumentDB.

## Index Creation Syntax

### Basic Vector Index Definition

Here's the core syntax for creating a vector search index:

```javascript
const indexDefinition = {
  name: "vectorSearchIndex",           // Index name (must be unique)
  type: "vector-ivf",                  // Algorithm type (covered in Topic 3)
  definition: {
    fields: [
      {
        path: "embedding",             // Field containing vector array
        type: "vector",                // Must be "vector" for vector search
        numDimensions: 1536,           // MUST match your embedding model
        similarity: "COS"              // Distance metric (COS, IP, L2)
      }
    ]
  }
};

await collection.createSearchIndex(indexDefinition);
```

### Configuration Options Explained

| Option | Description | Required | Notes |
|--------|-------------|----------|-------|
| **name** | Index identifier | Yes | Must be unique per collection |
| **type** | Algorithm type | Yes | `vector-ivf` or `vector-hnsw` (algorithms in Topic 3) |
| **path** | Field with embeddings | Yes | Must contain BSON array of numbers |
| **type** (field) | Field type | Yes | Must be `"vector"` for vector search |
| **numDimensions** | Vector size | Yes | **MUST match embedding model exactly** |
| **similarity** | Distance function | Yes | `COS` (cosine), `IP` (inner product), `L2` (euclidean) |

## Dimension Requirements

### Critical Rule: Dimensions Must Match

The **numDimensions** in your index definition **MUST exactly match** your embedding model's output:

| Embedding Model | Dimensions |
|-----------------|------------|
| text-embedding-ada-002 | 1536 |
| text-embedding-3-small | 1536 |
| text-embedding-3-large | 3072 |

**What happens if dimensions don't match:**

```javascript
// Index defined with 1536 dimensions
numDimensions: 1536

// But embedding has 768 dimensions
embedding: [0.1, 0.2, ...] // only 768 values

// Result: INSERT FAILS with dimension mismatch error
```

### Verifying Dimension Compatibility

Before inserting documents, verify your embedding dimensions:

```javascript
// Generate a test embedding
const testEmbedding = await generateEmbedding("test");
console.log(`Embedding dimensions: ${testEmbedding.length}`);

// Compare to index definition
const indexes = await collection.listSearchIndexes().toArray();
const vectorIndex = indexes.find(idx => idx.name === "vectorSearchIndex");
const indexDimensions = vectorIndex.definition.fields[0].numDimensions;

if (testEmbedding.length !== indexDimensions) {
  throw new Error(
    `Dimension mismatch! Embedding: ${testEmbedding.length}, Index: ${indexDimensions}`
  );
}

console.log("✓ Dimensions match - safe to insert documents");
```

## Index Build Process

### Understanding Build Time

Index builds are **asynchronous** and take time based on:

| Factor | Impact on Build Time |
|--------|---------------------|
| **Document count** | More documents = longer build |
| **Vector dimensions** | Higher dimensions = more computation |
| **Index algorithm** | Different algorithms have different build costs |
| **Resource allocation** | DocumentDB cluster resources affect speed |

**Typical build times:**
- Small (< 1,000 docs): Seconds to 1 minute
- Medium (1,000 - 10,000 docs): 1-5 minutes
- Large (10,000 - 100,000 docs): 5-30 minutes
- Very large (> 100,000 docs): 30+ minutes

### What Happens During "BUILDING"

While the index status is "BUILDING":

1. **DocumentDB reads all documents** with the specified field path
2. **Extracts embedding vectors** from BSON arrays
3. **Builds index structures** (clusters, graphs, etc. based on algorithm)
4. **Stores index data** separately from documents
5. **Updates status to READY** when complete

**Can you query during BUILDING?**
- Yes, queries will execute
- But they may **not use the index** (slower performance)
- Wait for READY status for optimal performance

### Resource Impact

Index builds consume:
- **CPU**: For index structure computation
- **Memory**: For holding index data structures
- **Storage**: Indexes are stored separately (adds to total storage)
- **I/O**: Reading documents and writing index

**Best practice:** For large datasets, create indexes during off-peak hours or on a new collection before switching traffic.

## Checking Index Status and Health

### Using listSearchIndexes()

The primary way to check index status:

```javascript
const indexes = await collection.listSearchIndexes().toArray();

indexes.forEach(index => {
  console.log(`Index: ${index.name}`);
  console.log(`  Status: ${index.status}`);    // BUILDING, READY, FAILED
  console.log(`  Type: ${index.type}`);         // vector-ivf, vector-hnsw
  
  if (index.definition && index.definition.fields) {
    index.definition.fields.forEach(field => {
      console.log(`  Field: ${field.path}`);
      console.log(`    Dimensions: ${field.numDimensions}`);
      console.log(`    Similarity: ${field.similarity}`);
    });
  }
});
```

### Index Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| **BUILDING** | Index is being created | Wait for READY before querying |
| **READY** | Index is active and queryable | Safe to run vector searches |
| **FAILED** | Index build failed | Check logs; verify configuration; recreate |
| **(not present)** | Index doesn't exist | Create index first |

### Monitoring Index Build Progress

```javascript
async function waitForIndexReady(collection, indexName, maxWaitMs = 300000) {
  const startTime = Date.now();
  const checkIntervalMs = 5000;
  
  console.log(`Waiting for index "${indexName}" to be READY...`);
  
  while (Date.now() - startTime < maxWaitMs) {
    const indexes = await collection.listSearchIndexes().toArray();
    const index = indexes.find(idx => idx.name === indexName);
    
    if (!index) {
      console.log("Index not found");
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      continue;
    }
    
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`[${elapsedSec}s] Status: ${index.status}`);
    
    if (index.status === "READY") {
      console.log(`✓ Index ready after ${elapsedSec} seconds`);
      return true;
    }
    
    if (index.status === "FAILED") {
      throw new Error("Index build failed");
    }
    
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }
  
  throw new Error("Index build timeout");
}
```

## Confirming Index is Working

### Test 1: Index Exists and is READY

```javascript
async function verifyIndexActive(collection, indexName) {
  const indexes = await collection.listSearchIndexes().toArray();
  const index = indexes.find(idx => idx.name === indexName);
  
  if (!index) {
    return { active: false, reason: "Index not found" };
  }
  
  if (index.status !== "READY") {
    return { active: false, reason: `Status is ${index.status}, not READY` };
  }
  
  return { active: true, index: index };
}
```

### Test 2: Query Executes Successfully

```javascript
async function testVectorQuery(collection, embedding) {
  try {
    const results = await collection.aggregate([
      {
        $search: {
          cosmosSearch: {
            vector: embedding,
            path: "embedding",
            k: 5
          },
          returnStoredSource: true
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          score: { $meta: "searchScore" }
        }
      }
    ]).toArray();
    
    return { success: true, resultCount: results.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Test 3: Performance Comparison (Before/After)

The most definitive test: compare query performance with and without the index.

**Approach:**
1. Insert documents WITHOUT an index
2. Measure query time (will be slow or fail)
3. Create the index and wait for READY
4. Measure query time again (should be much faster)

```javascript
async function comparePerformanceBeforeAfter(collection) {
  console.log("=== Performance Comparison ===");
  
  // Generate test documents
  const testDocs = await generateTestDocuments(100);
  
  // Insert WITHOUT index
  console.log("\n1. Inserting documents without index...");
  await collection.insertMany(testDocs);
  
  // Try querying without index
  console.log("\n2. Querying WITHOUT index...");
  try {
    const queryEmbedding = await generateEmbedding("test query");
    const startTime = Date.now();
    
    const results = await collection.aggregate([
      {
        $search: {
          cosmosSearch: {
            vector: queryEmbedding,
            path: "embedding",
            k: 5
          },
          returnStoredSource: true
        }
      }
    ]).toArray();
    
    const withoutIndexTime = Date.now() - startTime;
    console.log(`   Query time: ${withoutIndexTime}ms (or may fail without index)`);
  } catch (error) {
    console.log(`   Query failed: ${error.message}`);
    console.log("   (This is expected - vector search requires an index)");
  }
  
  // Create index
  console.log("\n3. Creating vector index...");
  await createVectorSearchIndex(collection, "vector-ivf");
  
  // Wait for index to be ready
  console.log("\n4. Waiting for index to be READY...");
  await waitForIndexReady(collection, "vectorSearchIndex");
  
  // Query WITH index
  console.log("\n5. Querying WITH index...");
  const queryEmbedding = await generateEmbedding("test query");
  const startTime = Date.now();
  
  const results = await collection.aggregate([
    {
      $search: {
        cosmosSearch: {
          vector: queryEmbedding,
          path: "embedding",
          k: 5
        },
        returnStoredSource: true
      }
    }
  ]).toArray();
  
  const withIndexTime = Date.now() - startTime;
  console.log(`   Query time: ${withIndexTime}ms`);
  console.log(`   Results: ${results.length} documents`);
  
  console.log("\n6. Summary:");
  console.log(`   ✓ Index is working correctly`);
  console.log(`   ✓ Query completed in ${withIndexTime}ms`);
  console.log(`   ✓ Returned ${results.length} results`);
}
```

## Index Health Checklist

Use this checklist to verify your index is healthy:

✅ **Index exists**: `listSearchIndexes()` returns your index  
✅ **Status is READY**: `index.status === "READY"`  
✅ **Dimensions match**: Index dimensions = embedding dimensions  
✅ **Path is correct**: `field.path` matches your document field name  
✅ **Type is vector**: `field.type === "vector"`  
✅ **Similarity is set**: `field.similarity` is COS, IP, or L2  
✅ **Queries execute**: Vector searches complete without errors  
✅ **Results are returned**: Queries return expected documents  
✅ **Performance is good**: Query latency is acceptable (< 100ms typical)

## Complete Working Sample

### Full Index Creation and Verification Flow

```javascript
const { MongoClient } = require("mongodb");
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
require("dotenv").config();

async function main() {
  // Connect to DocumentDB
  const client = new MongoClient(process.env.DOCUMENTDB_CONNECTION_STRING);
  await client.connect();
  
  const database = client.db(process.env.DOCUMENTDB_DATABASE_NAME);
  const collection = database.collection(process.env.DOCUMENTDB_COLLECTION_NAME);
  
  try {
    // Step 1: Verify embedding dimensions
    console.log("Step 1: Verifying embedding dimensions...");
    const testEmbedding = await generateEmbedding("test");
    console.log(`✓ Embedding dimensions: ${testEmbedding.length}`);
    
    // Step 2: Create index with matching dimensions
    console.log("\nStep 2: Creating vector index...");
    const indexDefinition = {
      name: "vectorSearchIndex",
      type: "vector-ivf",
      definition: {
        fields: [
          {
            path: "embedding",
            type: "vector",
            numDimensions: testEmbedding.length,  // Match embedding size
            similarity: "COS"
          }
        ]
      }
    };
    
    await collection.createSearchIndex(indexDefinition);
    console.log("✓ Index creation initiated");
    
    // Step 3: Monitor build status
    console.log("\nStep 3: Monitoring index build...");
    await waitForIndexReady(collection, "vectorSearchIndex");
    
    // Step 4: Verify index configuration
    console.log("\nStep 4: Verifying index configuration...");
    const indexes = await collection.listSearchIndexes().toArray();
    const index = indexes.find(idx => idx.name === "vectorSearchIndex");
    
    console.log("Index Configuration:");
    console.log(`  Name: ${index.name}`);
    console.log(`  Status: ${index.status}`);
    console.log(`  Type: ${index.type}`);
    console.log(`  Dimensions: ${index.definition.fields[0].numDimensions}`);
    console.log(`  Similarity: ${index.definition.fields[0].similarity}`);
    
    // Step 5: Insert test documents
    console.log("\nStep 5: Inserting test documents...");
    const docs = await generateTestDocuments(10);
    await collection.insertMany(docs);
    console.log(`✓ Inserted ${docs.length} documents`);
    
    // Step 6: Confirm index works with query
    console.log("\nStep 6: Testing vector query...");
    const queryResult = await testVectorQuery(collection, testEmbedding);
    
    if (queryResult.success) {
      console.log(`✓ Index is working correctly`);
      console.log(`✓ Query returned ${queryResult.resultCount} results`);
    } else {
      console.log(`✗ Index test failed: ${queryResult.error}`);
    }
    
  } finally {
    await client.close();
  }
}
```

## Troubleshooting

### Issue: Index status stuck on BUILDING
**Cause**: Large dataset or resource constraints  
**Solution**: 
- Wait longer (check every 5 minutes for large datasets)
- Monitor DocumentDB cluster metrics
- Consider creating index during off-peak hours

### Issue: Dimension mismatch error on insert
**Cause**: Index dimensions don't match embedding dimensions  
**Solution**:
```javascript
// Drop the index
await collection.dropSearchIndex("vectorSearchIndex");

// Recreate with correct dimensions
const correctDimensions = yourEmbedding.length;
// Create index with correctDimensions
```

### Issue: Index status is FAILED
**Cause**: Configuration error or resource issue  
**Solution**:
- Check DocumentDB logs for specific error
- Verify field path exists in documents
- Ensure field contains BSON arrays of numbers
- Drop and recreate index with fixed configuration

### Issue: Queries don't use index (still slow)
**Cause**: Index not READY or path mismatch  
**Solution**:
- Verify status is READY (not BUILDING)
- Check index path matches query path exactly
- Ensure query uses `cosmosSearch` syntax correctly

### Issue: "Index not found" even after creation
**Cause**: Creation command didn't complete or network issue  
**Solution**:
- Check for errors in `createSearchIndex()` response
- Verify collection name is correct
- List all indexes to see what exists: `listSearchIndexes().toArray()`

## Best Practices

### Index Creation
✅ Create indexes BEFORE inserting large datasets (faster than retrofitting)  
✅ Verify dimensions match before creating index  
✅ Use descriptive index names (e.g., "contentEmbedding_ivf")  
✅ Monitor build status for large collections  
✅ Document your index configuration for team reference

### Dimension Management
✅ Store embedding model name in documents for tracking  
✅ Validate dimensions before bulk inserts  
✅ Use consistent embedding model across all documents  
✅ Test with sample documents before production deployment

### Index Health Monitoring
✅ Check index status before querying (ensure READY)  
✅ Monitor query performance metrics  
✅ Set up alerts for index build failures  
✅ Regularly verify index exists and is active  
✅ Test queries after index creation to confirm functionality

### Resource Management
✅ Create indexes during off-peak hours for large datasets  
✅ Monitor cluster resources during index builds  
✅ Consider scaling up temporarily for large index builds  
✅ Account for index storage in capacity planning

## Next Steps

Now that you understand how to create and verify vector indexes:

1. **Topic 3: Vector Index Algorithms & Query Behavior**
   - Learn when to choose IVF vs. HNSW vs. DiskANN
   - Understand recall vs. latency trade-offs
   - Tune algorithm parameters for your workload

2. **Topic 4: Vector Store Semantic Search**
   - Use your verified indexes for production semantic search
   - Implement query patterns and result handling
   - Optimize for your specific use case

## Additional Resources

- [Azure DocumentDB Vector Search documentation](https://learn.microsoft.com/azure/documentdb/vector-search)
- [MongoDB Vector Search documentation](https://www.mongodb.com/docs/atlas/atlas-vector-search/)
- [cosmosSearchOptions reference](https://learn.microsoft.com/azure/documentdb/mongodb-feature-support)
- [BSON array format documentation](https://www.mongodb.com/docs/manual/reference/bson-types/)
