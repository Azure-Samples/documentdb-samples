/**
 * Azure DocumentDB (MongoDB vCore) - Indexing for Embeddings Sample
 * 
 * This sample demonstrates INDEX LIFECYCLE AND VERIFICATION:
 * - Define vector indexes via cosmosSearchOptions on BSON fields
 * - Verify dimension compatibility between index and embeddings
 * - Observe index build timing and resource impact
 * - Check index status/health via listSearchIndexes() output
 * - Confirm the index is active by testing queries
 * 
 * This is Topic 2: Focus on "How do I create and verify an index?"
 * NOT Topic 3: Algorithm comparison and parameter tuning
 */

const { MongoClient } = require("mongodb");
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
require("dotenv").config();

// Configuration
const config = {
  documentdb: {
    connectionString: process.env.DOCUMENTDB_CONNECTION_STRING,
    databaseName: process.env.DOCUMENTDB_DATABASE_NAME || "vectordb",
    collectionName: process.env.DOCUMENTDB_COLLECTION_NAME || "embeddings"
  },
  openai: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    key: process.env.AZURE_OPENAI_API_KEY,
    embeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-ada-002",
    dimensions: parseInt(process.env.AZURE_OPENAI_EMBEDDING_DIMENSIONS || "1536")
  }
};

// Initialize OpenAI client
const openaiClient = new OpenAIClient(
  config.openai.endpoint,
  new AzureKeyCredential(config.openai.key)
);

/**
 * Generate embedding for text using Azure OpenAI
 */
async function generateEmbedding(text) {
  try {
    const embeddings = await openaiClient.getEmbeddings(
      config.openai.embeddingDeployment,
      [text]
    );
    return embeddings.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error.message);
    throw error;
  }
}

/**
 * Connect to DocumentDB
 */
async function connectToDocumentDB() {
  const client = new MongoClient(config.documentdb.connectionString);
  await client.connect();
  console.log("✓ Connected to DocumentDB");
  return client;
}

/**
 * STEP 1: Verify embedding dimensions
 * Critical: Index dimensions MUST match embedding model output
 */
async function verifyEmbeddingDimensions() {
  console.log("\n=== STEP 1: Verifying Embedding Dimensions ===");
  console.log("Why this matters: Index dimensions MUST exactly match embedding model output");
  
  // Generate a test embedding
  const testText = "This is a test to verify embedding dimensions";
  console.log(`\nGenerating test embedding for: "${testText}"`);
  
  const embedding = await generateEmbedding(testText);
  const actualDimensions = embedding.length;
  
  console.log(`✓ Embedding generated successfully`);
  console.log(`  Actual dimensions: ${actualDimensions}`);
  console.log(`  Expected dimensions (from config): ${config.openai.dimensions}`);
  
  if (actualDimensions !== config.openai.dimensions) {
    console.log(`⚠ WARNING: Dimension mismatch detected!`);
    console.log(`  Please update AZURE_OPENAI_EMBEDDING_DIMENSIONS in .env to ${actualDimensions}`);
    
    // Update config for this session
    config.openai.dimensions = actualDimensions;
    console.log(`  Auto-corrected for this session`);
  } else {
    console.log(`✓ Dimensions match - safe to proceed`);
  }
  
  return actualDimensions;
}

/**
 * STEP 2: Create vector search index
 * Demonstrates: cosmosSearchOptions syntax and configuration
 */
async function createVectorSearchIndex(collection, dimensions) {
  console.log("\n=== STEP 2: Creating Vector Search Index ===");
  console.log("This initiates the index build process (asynchronous)");
  
  // Check if index already exists
  const existingIndexes = await collection.listSearchIndexes().toArray();
  const existingIndex = existingIndexes.find(idx => idx.name === "vectorSearchIndex");
  
  if (existingIndex) {
    console.log(`\n⚠ Index "vectorSearchIndex" already exists`);
    console.log(`  Current status: ${existingIndex.status}`);
    console.log(`  Skipping creation (will monitor existing index)`);
    return existingIndex;
  }
  
  // Define index using cosmosSearchOptions
  const indexDefinition = {
    name: "vectorSearchIndex",
    type: "vector-ivf",  // Using IVF for this demonstration
    definition: {
      fields: [
        {
          path: "embedding",           // Field containing BSON array
          type: "vector",              // Must be "vector" for vector search
          numDimensions: dimensions,   // MUST match embedding model
          similarity: "COS"            // Cosine distance (most common)
        }
      ]
    }
  };
  
  console.log("\nIndex Configuration:");
  console.log(`  Name: ${indexDefinition.name}`);
  console.log(`  Type: ${indexDefinition.type}`);
  console.log(`  Field Path: embedding`);
  console.log(`  Dimensions: ${dimensions}`);
  console.log(`  Similarity: COS (cosine distance)`);
  
  console.log("\nCreating index...");
  const startTime = Date.now();
  
  try {
    await collection.createSearchIndex(indexDefinition);
    const creationTime = Date.now() - startTime;
    
    console.log(`✓ Index creation initiated (${creationTime}ms)`);
    console.log(`  Status will be BUILDING initially`);
    console.log(`  Will transition to READY when complete`);
    
    return indexDefinition;
  } catch (error) {
    console.error(`✗ Index creation failed: ${error.message}`);
    throw error;
  }
}

/**
 * STEP 3: Monitor index build status
 * Demonstrates: Index lifecycle (BUILDING → READY) and timing
 */
async function monitorIndexBuildStatus(collection, indexName, maxWaitMs = 300000) {
  console.log("\n=== STEP 3: Monitoring Index Build Status ===");
  console.log("Why indexes take time to build:");
  console.log("  • DocumentDB must read all existing documents");
  console.log("  • Calculate index structures (clusters, graphs, etc.)");
  console.log("  • Store index data separately from documents");
  console.log("  • More documents = longer build time");
  
  const startTime = Date.now();
  const checkIntervalMs = 5000;  // Check every 5 seconds
  let checkCount = 0;
  
  console.log(`\nWaiting for index "${indexName}" to be READY...`);
  console.log(`(Will check every ${checkIntervalMs / 1000} seconds, max ${maxWaitMs / 1000 / 60} minutes)\n`);
  
  while (Date.now() - startTime < maxWaitMs) {
    checkCount++;
    
    try {
      const indexes = await collection.listSearchIndexes().toArray();
      const index = indexes.find(idx => idx.name === indexName);
      
      if (!index) {
        console.log(`Check ${checkCount}: Index not found (may be creating...)`);
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
        continue;
      }
      
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(0);
      const status = index.status || "UNKNOWN";
      
      console.log(`Check ${checkCount} [${elapsedSec}s]: Status = ${status}`);
      
      if (status === "READY") {
        console.log(`\n✓ Index is READY after ${elapsedSec} seconds`);
        console.log(`  Total checks: ${checkCount}`);
        console.log(`  The index is now active and will be used for queries`);
        return true;
      } else if (status === "FAILED") {
        console.log(`\n✗ Index build FAILED`);
        console.log(`  Check DocumentDB logs for details`);
        throw new Error("Index build failed");
      } else if (status === "BUILDING") {
        console.log(`  Still building... (this is normal)`);
      }
      
    } catch (error) {
      console.log(`Check ${checkCount}: Error checking status - ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }
  
  console.log(`\n⚠ Index build did not complete within ${maxWaitMs / 1000 / 60} minutes`);
  console.log(`  This may be normal for very large datasets`);
  console.log(`  Check back later or increase timeout`);
  return false;
}

/**
 * STEP 4: Validate index configuration
 * Demonstrates: How to check index health and verify settings
 */
async function validateIndexConfiguration(collection, expectedDimensions) {
  console.log("\n=== STEP 4: Validating Index Configuration ===");
  console.log("Index Health Checklist:");
  
  const checks = {
    exists: false,
    ready: false,
    dimensionsMatch: false,
    correctType: false,
    correctPath: false
  };
  
  try {
    // Get all indexes
    const indexes = await collection.listSearchIndexes().toArray();
    console.log(`\nTotal search indexes found: ${indexes.length}`);
    
    if (indexes.length === 0) {
      console.log("✗ No indexes found");
      return { healthy: false, checks };
    }
    
    // Find our vector index
    const vectorIndex = indexes.find(idx => idx.name === "vectorSearchIndex");
    
    if (!vectorIndex) {
      console.log("✗ Vector index not found");
      return { healthy: false, checks };
    }
    
    checks.exists = true;
    console.log(`✓ Index exists: ${vectorIndex.name}`);
    
    // Check status
    console.log(`\nStatus: ${vectorIndex.status || "UNKNOWN"}`);
    if (vectorIndex.status === "READY") {
      checks.ready = true;
      console.log("✓ Status is READY");
    } else {
      console.log(`✗ Status is not READY (current: ${vectorIndex.status})`);
    }
    
    // Check configuration
    console.log("\nConfiguration Details:");
    console.log(`  Type: ${vectorIndex.type}`);
    checks.correctType = vectorIndex.type === "vector-ivf" || vectorIndex.type === "vector-hnsw";
    
    if (vectorIndex.definition && vectorIndex.definition.fields) {
      vectorIndex.definition.fields.forEach((field, i) => {
        console.log(`\n  Field ${i + 1}:`);
        console.log(`    Path: ${field.path}`);
        console.log(`    Type: ${field.type}`);
        console.log(`    Dimensions: ${field.numDimensions}`);
        console.log(`    Similarity: ${field.similarity}`);
        
        checks.correctPath = field.path === "embedding";
        checks.dimensionsMatch = field.numDimensions === expectedDimensions;
        
        if (!checks.correctPath) {
          console.log(`    ⚠ Path mismatch: expected "embedding"`);
        }
        
        if (!checks.dimensionsMatch) {
          console.log(`    ⚠ Dimension mismatch: expected ${expectedDimensions}`);
        }
      });
    }
    
    // Summary
    console.log("\n--- Health Check Summary ---");
    console.log(`✓ Index exists: ${checks.exists ? "PASS" : "FAIL"}`);
    console.log(`✓ Status is READY: ${checks.ready ? "PASS" : "FAIL"}`);
    console.log(`✓ Dimensions match: ${checks.dimensionsMatch ? "PASS" : "FAIL"}`);
    console.log(`✓ Correct type: ${checks.correctType ? "PASS" : "FAIL"}`);
    console.log(`✓ Correct path: ${checks.correctPath ? "PASS" : "FAIL"}`);
    
    const healthy = Object.values(checks).every(check => check === true);
    
    if (healthy) {
      console.log("\n✓ Index is HEALTHY and ready to use");
    } else {
      console.log("\n⚠ Index has issues - review checks above");
    }
    
    return { healthy, checks, index: vectorIndex };
    
  } catch (error) {
    console.error("Error validating index:", error.message);
    return { healthy: false, checks, error: error.message };
  }
}

/**
 * STEP 5: Insert documents with embeddings
 */
async function insertDocumentsWithEmbeddings(collection) {
  console.log("\n=== STEP 5: Inserting Documents with Embeddings ===");
  
  const documents = [
    {
      _id: "1",
      title: "Understanding Vector Indexes",
      content: "Vector indexes enable fast similarity search on high-dimensional embeddings by organizing data for efficient retrieval.",
      category: "tutorial"
    },
    {
      _id: "2",
      title: "Index Build Process",
      content: "When you create an index, DocumentDB reads documents, extracts embeddings, and builds specialized data structures for fast queries.",
      category: "concepts"
    },
    {
      _id: "3",
      title: "Dimension Requirements",
      content: "The dimension count in your index definition must exactly match your embedding model output to avoid insertion errors.",
      category: "best-practices"
    },
    {
      _id: "4",
      title: "Monitoring Index Health",
      content: "Use listSearchIndexes to check index status, verify configuration, and ensure your index is READY before querying.",
      category: "operations"
    },
    {
      _id: "5",
      title: "BSON Array Format",
      content: "DocumentDB stores embeddings as native BSON arrays, which provides efficient storage and query performance for vector data.",
      category: "technical"
    }
  ];
  
  console.log(`Inserting ${documents.length} test documents...`);
  let successCount = 0;
  
  for (const doc of documents) {
    try {
      // Generate embedding
      const embedding = await generateEmbedding(doc.content);
      
      // Verify dimensions before insert
      if (embedding.length !== config.openai.dimensions) {
        console.log(`⚠ Skipping ${doc._id}: dimension mismatch (${embedding.length} vs ${config.openai.dimensions})`);
        continue;
      }
      
      // Add embedding to document (BSON array format)
      const docWithEmbedding = {
        ...doc,
        embedding: embedding,  // Stored as native BSON array
        embeddingModel: config.openai.embeddingDeployment,
        embeddingDimensions: embedding.length,
        createdAt: new Date()
      };
      
      // Insert
      await collection.insertOne(docWithEmbedding);
      successCount++;
      console.log(`  ✓ Inserted: ${doc.title} (${embedding.length} dims)`);
      
    } catch (error) {
      console.error(`  ✗ Error inserting ${doc._id}: ${error.message}`);
    }
  }
  
  console.log(`\n✓ Successfully inserted ${successCount}/${documents.length} documents`);
  return successCount;
}

/**
 * STEP 6: Confirm index is working by testing queries
 */
async function confirmIndexWorking(collection) {
  console.log("\n=== STEP 6: Confirming Index Works ===");
  console.log("Testing vector similarity search...");
  
  const testQuery = "How do I check if my vector index is healthy?";
  console.log(`\nTest query: "${testQuery}"`);
  
  try {
    // Generate query embedding
    console.log("\n1. Generating query embedding...");
    const queryEmbedding = await generateEmbedding(testQuery);
    console.log(`   ✓ Generated (${queryEmbedding.length} dimensions)`);
    
    // Execute vector search
    console.log("\n2. Executing vector search query...");
    const startTime = Date.now();
    
    const results = await collection.aggregate([
      {
        $search: {
          cosmosSearch: {
            vector: queryEmbedding,
            path: "embedding",
            k: 3  // Top 3 results
          },
          returnStoredSource: true
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          category: 1,
          score: { $meta: "searchScore" }
        }
      }
    ]).toArray();
    
    const queryTime = Date.now() - startTime;
    
    // Display results
    console.log(`   ✓ Query completed in ${queryTime}ms`);
    console.log(`   ✓ Found ${results.length} results`);
    
    if (results.length > 0) {
      console.log("\n3. Top results:");
      results.forEach((result, i) => {
        console.log(`   ${i + 1}. ${result.title}`);
        console.log(`      Category: ${result.category}`);
        console.log(`      Score: ${result.score.toFixed(4)}`);
      });
      
      console.log("\n✓ INDEX IS WORKING CORRECTLY");
      console.log(`  • Query executed successfully`);
      console.log(`  • Results returned in ${queryTime}ms`);
      console.log(`  • Semantic matches found`);
      
      return { working: true, queryTime, resultCount: results.length };
    } else {
      console.log("\n⚠ Query executed but returned no results");
      console.log("  This may mean:");
      console.log("  • No documents match the query");
      console.log("  • Index may not be fully active yet");
      
      return { working: false, queryTime, resultCount: 0 };
    }
    
  } catch (error) {
    console.error(`\n✗ Query failed: ${error.message}`);
    console.log("\nPossible causes:");
    console.log("  • Index is not READY yet");
    console.log("  • Index path doesn't match document field");
    console.log("  • Dimension mismatch");
    
    return { working: false, error: error.message };
  }
}

/**
 * Display index lifecycle summary
 */
function displayIndexLifecycleSummary() {
  console.log("\n" + "=".repeat(80));
  console.log("INDEX LIFECYCLE SUMMARY");
  console.log("=".repeat(80));
  
  console.log("\n📋 What We Demonstrated:");
  console.log("  1. ✓ Verified embedding dimensions match index requirements");
  console.log("  2. ✓ Created vector index via cosmosSearchOptions");
  console.log("  3. ✓ Monitored index build status (BUILDING → READY)");
  console.log("  4. ✓ Validated index configuration and health");
  console.log("  5. ✓ Inserted documents with proper dimension validation");
  console.log("  6. ✓ Confirmed index works by executing queries");
  
  console.log("\n🔑 Key Takeaways:");
  console.log("  • Index dimensions MUST exactly match embedding model");
  console.log("  • Index builds are asynchronous (BUILDING → READY)");
  console.log("  • Always verify index status before querying");
  console.log("  • Use listSearchIndexes() to check health");
  console.log("  • Test queries to confirm index is working");
  
  console.log("\n📊 Index Build Timing:");
  console.log("  • Small datasets (< 1K docs): Seconds to 1 minute");
  console.log("  • Medium (1K-10K docs): 1-5 minutes");
  console.log("  • Large (10K-100K docs): 5-30 minutes");
  console.log("  • Very large (> 100K docs): 30+ minutes");
  
  console.log("\n🎯 Next Steps:");
  console.log("  → Topic 3: Learn about algorithm choices (IVF vs HNSW vs DiskANN)");
  console.log("  → Topic 4: Implement semantic search patterns");
  console.log("  → Production: Monitor index health and query performance");
}

/**
 * Main execution flow
 */
async function main() {
  console.log("=".repeat(80));
  console.log("Azure DocumentDB - Vector Indexing Lifecycle & Verification");
  console.log("=".repeat(80));
  console.log("\nThis sample demonstrates:");
  console.log("  • How to create vector indexes via cosmosSearchOptions");
  console.log("  • Index build process and timing");
  console.log("  • How to verify index health and configuration");
  console.log("  • Dimension compatibility requirements");
  console.log("  • Confirming indexes work correctly");
  
  let client;
  
  try {
    // Connect
    client = await connectToDocumentDB();
    const database = client.db(config.documentdb.databaseName);
    const collection = database.collection(config.documentdb.collectionName);
    
    // STEP 1: Verify embedding dimensions
    const dimensions = await verifyEmbeddingDimensions();
    
    // STEP 2: Create index
    await createVectorSearchIndex(collection, dimensions);
    
    // STEP 3: Monitor build status
    const isReady = await monitorIndexBuildStatus(collection, "vectorSearchIndex");
    
    if (!isReady) {
      console.log("\n⚠ Index not ready yet - skipping remaining steps");
      console.log("  You can re-run this script later to complete validation");
      return;
    }
    
    // STEP 4: Validate configuration
    const validation = await validateIndexConfiguration(collection, dimensions);
    
    if (!validation.healthy) {
      console.log("\n⚠ Index validation failed - review issues above");
      return;
    }
    
    // STEP 5: Insert documents
    const insertedCount = await insertDocumentsWithEmbeddings(collection);
    
    if (insertedCount === 0) {
      console.log("\n⚠ No documents inserted - skipping query test");
      return;
    }
    
    // STEP 6: Confirm index works
    const queryTest = await confirmIndexWorking(collection);
    
    if (!queryTest.working) {
      console.log("\n⚠ Index may not be working correctly - review errors above");
      return;
    }
    
    // Summary
    displayIndexLifecycleSummary();
    
    console.log("\n" + "=".repeat(80));
    console.log("✓ Sample completed successfully");
    console.log("=".repeat(80));
    
  } catch (error) {
    console.error("\n" + "=".repeat(80));
    console.error("✗ Error:", error.message);
    console.error("=".repeat(80));
    console.error(error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log("\n✓ Connection closed");
    }
  }
}

// Run the sample
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  generateEmbedding,
  connectToDocumentDB,
  verifyEmbeddingDimensions,
  createVectorSearchIndex,
  monitorIndexBuildStatus,
  validateIndexConfiguration,
  insertDocumentsWithEmbeddings,
  confirmIndexWorking
};
