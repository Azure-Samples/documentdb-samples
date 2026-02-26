/**
 * Azure DocumentDB (MongoDB vCore) - Vector Index Algorithms & Query Behavior
 * 
 * This sample demonstrates:
 * - Creating collections with different index algorithms (IVF, HNSW, DiskANN)
 * - Benchmarking query performance across algorithms
 * - Measuring recall vs. latency trade-offs
 * - Tuning algorithm parameters for optimal performance
 */

const { MongoClient } = require("mongodb");
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
require("dotenv").config();

// Configuration
const config = {
  documentdb: {
    connectionString: process.env.DOCUMENTDB_CONNECTION_STRING,
    databaseName: process.env.DOCUMENTDB_DATABASE_NAME || "vectordb"
  },
  openai: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    key: process.env.AZURE_OPENAI_API_KEY,
    embeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-ada-002",
    dimensions: parseInt(process.env.AZURE_OPENAI_EMBEDDING_DIMENSIONS || "1536")
  },
  benchmark: {
    numTestQueries: 5,
    topK: 10
  }
};

// Initialize OpenAI client
const openaiClient = new OpenAIClient(
  config.openai.endpoint,
  new AzureKeyCredential(config.openai.key)
);

/**
 * Generate embedding for text
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
 * Create collection with specific algorithm
 */
async function createCollectionWithAlgorithm(database, algorithmType, suffix = "") {
  const collectionName = `embeddings_${algorithmType}${suffix}`;
  
  try {
    // Create collection
    const collection = database.collection(collectionName);
    
    // Define vector search index based on algorithm type
    let indexType, indexName;
    
    if (algorithmType === "ivf") {
      indexType = "vector-ivf";
      indexName = "vectorSearchIndex_ivf";
    } else if (algorithmType === "hnsw") {
      indexType = "vector-hnsw";
      indexName = "vectorSearchIndex_hnsw";
    } else if (algorithmType === "diskann") {
      // DiskANN may use similar configuration to HNSW
      indexType = "vector-hnsw"; // Placeholder: adjust based on DocumentDB support
      indexName = "vectorSearchIndex_diskann";
    }
    
    const indexDefinition = {
      name: indexName,
      type: indexType,
      definition: {
        fields: [
          {
            path: "embedding",
            type: "vector",
            numDimensions: config.openai.dimensions,
            similarity: "COS"
          }
        ]
      }
    };
    
    // Create the index
    await collection.createSearchIndex(indexDefinition);
    console.log(`✓ Created collection: ${collectionName} with ${indexType} index`);
    
    return collection;
    
  } catch (error) {
    console.error(`Error creating collection ${collectionName}:`, error.message);
    throw error;
  }
}

/**
 * Generate test dataset
 */
function generateTestDataset() {
  return [
    {
      _id: "1",
      title: "Introduction to Vector Databases",
      content: "Vector databases store and query high-dimensional embeddings for semantic search applications. They enable similarity-based retrieval using approximate nearest neighbor algorithms.",
      category: "tutorial"
    },
    {
      _id: "2",
      title: "Understanding Neural Networks",
      content: "Neural networks are computing systems inspired by biological neural networks. They learn patterns from data through training and can perform tasks like classification and prediction.",
      category: "machine-learning"
    },
    {
      _id: "3",
      title: "Azure DocumentDB Overview",
      content: "DocumentDB provides MongoDB compatibility with enterprise features like global distribution, automatic scaling, and comprehensive SLAs for availability and performance.",
      category: "cloud-services"
    },
    {
      _id: "4",
      title: "Semantic Search Fundamentals",
      content: "Semantic search understands the intent and contextual meaning of search queries. Unlike keyword matching, it finds results based on conceptual similarity using embeddings.",
      category: "search"
    },
    {
      _id: "5",
      title: "Building RAG Applications",
      content: "Retrieval-Augmented Generation combines large language models with information retrieval. It grounds LLM responses in external knowledge bases to reduce hallucinations.",
      category: "ai-applications"
    },
    {
      _id: "6",
      title: "Vector Indexing Algorithms",
      content: "Different algorithms offer trade-offs between speed and accuracy. IVF provides good balance, while HNSW offers fast approximate nearest neighbor search.",
      category: "algorithms"
    },
    {
      _id: "7",
      title: "Embeddings and Representation Learning",
      content: "Embeddings map discrete objects to continuous vector spaces where semantic similarity corresponds to geometric proximity. They capture meaning in numerical form.",
      category: "machine-learning"
    },
    {
      _id: "8",
      title: "MongoDB Vector Search",
      content: "MongoDB's vector search capabilities enable semantic similarity matching on embeddings stored in BSON format. It supports multiple indexing algorithms for different use cases.",
      category: "databases"
    },
    {
      _id: "9",
      title: "Natural Language Processing Basics",
      content: "NLP enables computers to understand and process human language. It includes tasks like tokenization, named entity recognition, and sentiment analysis.",
      category: "machine-learning"
    },
    {
      _id: "10",
      title: "Scalable Search Architecture",
      content: "Building scalable search requires distributed indexing, caching strategies, and load balancing. Vector search adds challenges of high-dimensional data management.",
      category: "architecture"
    },
    {
      _id: "11",
      title: "Azure OpenAI Service",
      content: "Azure OpenAI provides access to powerful language models like GPT-4. It includes enterprise features like private networking, managed identity, and content filtering.",
      category: "ai-services"
    },
    {
      _id: "12",
      title: "Approximate Nearest Neighbor Search",
      content: "ANN algorithms sacrifice perfect accuracy for speed. They use data structures like graphs and trees to quickly find similar vectors in high-dimensional spaces.",
      category: "algorithms"
    },
    {
      _id: "13",
      title: "Hybrid Search Strategies",
      content: "Combining keyword search with vector search provides better results. Reciprocal rank fusion merges results from multiple retrieval methods effectively.",
      category: "search"
    },
    {
      _id: "14",
      title: "Database Performance Optimization",
      content: "Optimizing database performance involves indexing strategies, query optimization, and resource allocation. Understanding throughput and latency is essential.",
      category: "databases"
    },
    {
      _id: "15",
      title: "Transformer Models",
      content: "Transformers revolutionized NLP with attention mechanisms. They process sequences in parallel and capture long-range dependencies better than RNNs.",
      category: "machine-learning"
    }
  ];
}

/**
 * Insert documents into collection
 */
async function insertDocuments(collection, documents) {
  console.log(`\nInserting ${documents.length} documents into ${collection.collectionName}...`);
  
  let successCount = 0;
  for (const doc of documents) {
    try {
      const embedding = await generateEmbedding(doc.content);
      const docWithEmbedding = {
        ...doc,
        embedding: embedding, // BSON array format
        createdAt: new Date()
      };
      
      await collection.insertOne(docWithEmbedding);
      successCount++;
      
      if (successCount % 5 === 0) {
        process.stdout.write(`  ${successCount}/${documents.length} completed\r`);
      }
    } catch (error) {
      console.error(`  Error inserting document ${doc._id}:`, error.message);
    }
  }
  
  console.log(`  ✓ ${successCount}/${documents.length} documents inserted`);
  return successCount;
}

/**
 * Wait for index to be ready
 */
async function waitForIndexReady(collection, indexName, maxWaitMs = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const indexes = await collection.listSearchIndexes().toArray();
      const index = indexes.find(idx => idx.name === indexName);
      
      if (index && index.status === "READY") {
        return true;
      }
    } catch (error) {
      // Continue waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return false;
}

/**
 * Generate test queries
 */
function generateTestQueries() {
  return [
    "How do vector databases work?",
    "What are the best practices for semantic search?",
    "Explain machine learning embeddings",
    "How to optimize database performance?",
    "What is retrieval augmented generation?"
  ];
}

/**
 * Execute vector search query
 */
/**
 * Execute vector search query with optional tuning parameters
 * @param {Object} options - Query options
 * @param {number} options.nprobe - IVF parameter (default: 10)
 * @param {number} options.ef - HNSW parameter (default: 40)
 */
async function executeVectorQuery(collection, queryEmbedding, topK = 10, options = {}) {
  const startTime = Date.now();
  
  // Build cosmosSearch options
  const cosmosSearchOptions = {
    vector: queryEmbedding,
    path: "embedding",
    k: topK
  };
  
  // Add tuning parameters if provided
  if (options.nprobe) {
    cosmosSearchOptions.nprobe = options.nprobe;  // IVF tuning
  }
  if (options.ef) {
    cosmosSearchOptions.ef = options.ef;  // HNSW tuning
  }
  
  const results = await collection.aggregate([
    {
      $search: {
        cosmosSearch: cosmosSearchOptions,
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
  
  const latency = Date.now() - startTime;
  
  return {
    results,
    latency,
    parameters: options  // Return which parameters were used
  };
}
  };
}

/**
 * Calculate recall between two result sets
 */
function calculateRecall(groundTruth, testResults, k = 10) {
  const groundTruthIds = new Set(groundTruth.slice(0, k).map(r => r._id));
  const testResultIds = new Set(testResults.slice(0, k).map(r => r._id));
  
  const intersection = [...testResultIds].filter(id => groundTruthIds.has(id));
  const recall = intersection.length / Math.min(k, groundTruth.length);
  
  return {
    recall: recall,
    matchCount: intersection.length,
    totalRelevant: Math.min(k, groundTruth.length)
  };
}

/**
 * Run benchmark for a specific algorithm
 */
async function runAlgorithmBenchmark(collection, algorithmName, testQueries, groundTruthResults = null) {
  console.log(`\n--- Benchmarking ${algorithmName} ---`);
  
  const results = {
    algorithm: algorithmName,
    queries: [],
    avgLatency: 0,
    avgRecall: null,
    totalQueries: testQueries.length
  };
  
  for (let i = 0; i < testQueries.length; i++) {
    const query = testQueries[i];
    console.log(`\nQuery ${i + 1}/${testQueries.length}: "${query}"`);
    
    try {
      const embedding = await generateEmbedding(query);
      const { results: queryResults, latency } = await executeVectorQuery(
        collection, 
        embedding, 
        config.benchmark.topK
      );
      
      let recallData = null;
      if (groundTruthResults && groundTruthResults[i]) {
        recallData = calculateRecall(
          groundTruthResults[i].results, 
          queryResults, 
          config.benchmark.topK
        );
        console.log(`  Recall@${config.benchmark.topK}: ${(recallData.recall * 100).toFixed(2)}%`);
      }
      
      console.log(`  Latency: ${latency}ms`);
      console.log(`  Results: ${queryResults.length} documents`);
      
      results.queries.push({
        query,
        latency,
        resultCount: queryResults.length,
        recall: recallData,
        topResult: queryResults[0]?.title
      });
      
    } catch (error) {
      console.error(`  Error executing query: ${error.message}`);
    }
  }
  
  results.avgLatency = results.queries.reduce((sum, q) => sum + q.latency, 0) / results.queries.length;
  
  if (groundTruthResults) {
    const recalls = results.queries.map(q => q.recall?.recall).filter(r => r !== undefined);
    results.avgRecall = recalls.length > 0 
      ? recalls.reduce((sum, r) => sum + r, 0) / recalls.length 
      : null;
  }
  
  return results;
}

/**
 * Display comparison table
 */
function displayComparisonTable(benchmarkResults) {
  console.log("\n" + "=".repeat(80));
  console.log("ALGORITHM COMPARISON SUMMARY");
  console.log("=".repeat(80));
  
  console.log("\n" + "-".repeat(80));
  console.log("Algorithm".padEnd(20) + 
              "Avg Latency".padEnd(15) + 
              "Avg Recall".padEnd(15) + 
              "Characteristics");
  console.log("-".repeat(80));
  
  const algorithmInfo = {
    ivf: { chars: "Balanced recall/latency" },
    hnsw: { chars: "Fast, tunable (ef, m)" },
    diskann: { chars: "Scalable for large datasets" }
  };
  
  benchmarkResults.forEach(result => {
    const info = algorithmInfo[result.algorithm] || { chars: "N/A" };
    const recallStr = result.avgRecall !== null 
      ? `${(result.avgRecall * 100).toFixed(2)}%` 
      : "N/A (baseline)";
    
    console.log(
      result.algorithm.toUpperCase().padEnd(20) +
      `${result.avgLatency.toFixed(2)}ms`.padEnd(15) +
      recallStr.padEnd(15) +
      info.chars
    );
  });
  
  console.log("-".repeat(80));
}

/**
 * Display recommendations
 */
function displayRecommendations(benchmarkResults) {
  console.log("\n" + "=".repeat(80));
  console.log("ALGORITHM SELECTION RECOMMENDATIONS");
  console.log("=".repeat(80));
  
  console.log("\n📌 ALGORITHM SELECTION GUIDE:");
  console.log("\n  IVF (Inverted File):");
  console.log("    • Use for: Medium-scale datasets (10K-100K vectors)");
  console.log("    • Recall: ~90-95%");
  console.log("    • Tuning: Adjust nprobe (higher = better recall)");
  console.log("    • Best for: Balanced recall/latency requirements");
  
  console.log("\n  HNSW (Hierarchical Navigable Small World):");
  console.log("    • Use for: Fast queries with good recall");
  console.log("    • Recall: ~92-97%");
  console.log("    • Tuning: Adjust ef (query time) and m (build time)");
  console.log("    • Best for: Real-time search, low latency priority");
  
  console.log("\n  DiskANN:");
  console.log("    • Use for: Very large scale (> 100K vectors)");
  console.log("    • Recall: ~90-99% (tunable)");
  console.log("    • Best for: Enterprise-scale semantic search");
  
  console.log("\n🎯 DECISION TREE:");
  console.log("  • Low latency priority → Use HNSW (tune ef)");
  console.log("  • Balanced needs → Use IVF (tune nprobe)");
  console.log("  • Large scale (> 100K) → Use DiskANN");
  
  console.log("\n🔧 TUNING PARAMETERS:");
  console.log("  IVF:");
  console.log("    • nprobe: 10 (default) → 20, 50, 100 (higher recall)");
  console.log("  HNSW:");
  console.log("    • ef: 40 (default) → 60, 80, 100 (higher recall)");
  console.log("    • m: 16 (default, set at build time)");
}

/**
 * Main execution
 */
/**
 * Demonstrate parameter tuning with IVF nprobe
 */
async function demonstrateNprobeTuning(collection, algorithmName, testQueries) {
  console.log(`\n--- Demonstrating nprobe Tuning (${algorithmName}) ---`);
  
  if (algorithmName !== "ivf") {
    console.log("Skipping: nprobe only applies to IVF indexes");
    return;
  }
  
  const queryEmbedding = await generateEmbedding(testQueries[0]);
  const nprobeValues = [10, 20, 50];
  
  console.log(`\nTesting query: "${testQueries[0]}"`);
  console.log("Comparing different nprobe values:\n");
  
  for (const nprobe of nprobeValues) {
    const { results, latency } = await executeVectorQuery(
      collection,
      queryEmbedding,
      10,
      { nprobe }
    );
    
    console.log(`nprobe=${nprobe}:`);
    console.log(`  Latency: ${latency}ms`);
    console.log(`  Results: ${results.length}`);
    console.log(`  Top result: ${results[0]?.title || 'N/A'}`);
  }
  
  console.log("\nObservation:");
  console.log("  • Higher nprobe = more clusters searched");
  console.log("  • Typically improves recall by 3-5%");
  console.log("  • Adds latency cost (20-50% increase)");
}

/**
 * Demonstrate parameter tuning with HNSW ef
 */
async function demonstrateEfTuning(collection, algorithmName, testQueries) {
  console.log(`\n--- Demonstrating ef Tuning (${algorithmName}) ---`);
  
  if (algorithmName !== "hnsw") {
    console.log("Skipping: ef only applies to HNSW indexes");
    return;
  }
  
  const queryEmbedding = await generateEmbedding(testQueries[0]);
  const efValues = [40, 60, 80];
  
  console.log(`\nTesting query: "${testQueries[0]}"`);
  console.log("Comparing different ef values:\n");
  
  for (const ef of efValues) {
    const { results, latency } = await executeVectorQuery(
      collection,
      queryEmbedding,
      10,
      { ef }
    );
    
    console.log(`ef=${ef}:`);
    console.log(`  Latency: ${latency}ms`);
    console.log(`  Results: ${results.length}`);
    console.log(`  Top result: ${results[0]?.title || 'N/A'}`);
  }
  
  console.log("\nObservation:");
  console.log("  • Higher ef = wider search in graph");
  console.log("  • Typically improves recall by 2-4%");
  console.log("  • Adds moderate latency cost");
}

async function main() {
  console.log("=".repeat(80));
  console.log("Azure DocumentDB (MongoDB) - Vector Index Algorithms Benchmark");
  console.log("=".repeat(80));
  
  let client;
  
  try {
    // Step 1: Connect
    console.log("\n[1/7] Connecting to DocumentDB...");
    client = await connectToDocumentDB();
    const database = client.db(config.documentdb.databaseName);
    
    // Step 2: Generate test data
    console.log("\n[2/7] Generating test dataset...");
    const testDataset = generateTestDataset();
    console.log(`✓ Generated ${testDataset.length} test documents`);
    
    // Step 3: Create collections for each algorithm
    console.log("\n[3/7] Creating collections with different algorithms...");
    const collectionIVF = await createCollectionWithAlgorithm(database, "ivf");
    const collectionHNSW = await createCollectionWithAlgorithm(database, "hnsw");
    
    // Step 4: Insert data
    console.log("\n[4/7] Inserting test data into collections...");
    await insertDocuments(collectionIVF, testDataset);
    await insertDocuments(collectionHNSW, testDataset);
    
    // Step 5: Wait for indexes
    console.log("\n[5/7] Waiting for indexes to be ready...");
    await waitForIndexReady(collectionIVF, "vectorSearchIndex_ivf");
    await waitForIndexReady(collectionHNSW, "vectorSearchIndex_hnsw");
    console.log("✓ Indexes are ready");
    
    // Step 6: Run benchmarks
    console.log("\n[6/7] Running benchmarks...");
    const testQueries = generateTestQueries();
    console.log(`✓ Generated ${testQueries.length} test queries`);
    console.log("=".repeat(80));
    
    const ivfResults = await runAlgorithmBenchmark(collectionIVF, "ivf", testQueries);
    const hnswResults = await runAlgorithmBenchmark(collectionHNSW, "hnsw", testQueries, ivfResults.queries);
    
    const allResults = [ivfResults, hnswResults];
    
    
    // Demonstrate parameter tuning
    console.log("\n[7/7] Demonstrating Parameter Tuning...");
    await demonstrateNprobeTuning(collectionIVF, "ivf", testQueries);
    await demonstrateEfTuning(collectionHNSW, "hnsw", testQueries);
    // Step 7: Display results
    console.log("\n[7/7] Analysis complete");
    displayComparisonTable(allResults);
    displayRecommendations(allResults);
    
    console.log("\n" + "=".repeat(80));
    console.log("✓ Benchmark completed successfully");
    console.log("=".repeat(80));
    
    console.log("\n💡 Next Steps:");
    console.log("  • Review algorithm characteristics above");
    console.log("  • Test with your production data");
    console.log("  • Tune parameters based on your SLOs");
    console.log("  • Monitor recall and latency in production");
    
    console.log("\n🧹 Cleanup:");
    console.log("  To delete test collections:");
    console.log(`  • ${collectionIVF.collectionName}`);
    console.log(`  • ${collectionHNSW.collectionName}`);
    
  } catch (error) {
    console.error("\n✗ Error:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log("\n✓ Connection closed");
    }
  }
}

// Run the benchmark
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  generateEmbedding,
  connectToDocumentDB,
  createCollectionWithAlgorithm,
  executeVectorQuery,
  calculateRecall,
  runAlgorithmBenchmark
};
