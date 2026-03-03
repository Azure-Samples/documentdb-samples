const { MongoClient } = require("mongodb");
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
require("dotenv").config();

const config = {
  documentdb: { connectionString: process.env.DOCUMENTDB_CONNECTION_STRING, databaseName: process.env.DOCUMENTDB_DATABASE_NAME || "vectordb", collectionName: process.env.DOCUMENTDB_COLLECTION_NAME || "embeddings" },
  openai: { endpoint: process.env.AZURE_OPENAI_ENDPOINT, key: process.env.AZURE_OPENAI_API_KEY, embeddingDeployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || "text-embedding-ada-002" }
};

const openaiClient = new OpenAIClient(config.openai.endpoint, new AzureKeyCredential(config.openai.key));

async function generateQueryEmbedding(queryText) {
  const result = await openaiClient.getEmbeddings(config.openai.embeddingDeployment, [queryText]);
  return result.data[0].embedding;
}

async function semanticSearch(collection, queryText, topK = 10) {
  console.log(\`\\n=== Semantic Search: "\${queryText}" ===\`);
  const queryEmbedding = await generateQueryEmbedding(queryText);
  const results = await collection.aggregate([
    { $search: { cosmosSearch: { vector: queryEmbedding, path: "embedding", k: topK }, returnStoredSource: true } },
    { $project: { _id: 1, title: 1, content: 1, score: { $meta: "searchScore" } } }
  ]).toArray();
  console.log(\`Results: \${results.length} documents\`);
  return results;
}

async function main() {
  console.log("=".repeat(80));
  console.log("Azure DocumentDB - Vector Store Semantic Search");
  console.log("=".repeat(80));
  const client = new MongoClient(config.documentdb.connectionString);
  await client.connect();
  const collection = client.db(config.documentdb.databaseName).collection(config.documentdb.collectionName);
  try {
    const results = await semanticSearch(collection, "machine learning fundamentals", 5);
    results.forEach((doc, i) => {
      const stars = doc.score > 0.9 ? "⭐⭐⭐" : doc.score > 0.7 ? "⭐⭐" : "⭐";
      console.log(\`\${i + 1}. \${doc.title} - Score: \${doc.score.toFixed(4)} \${stars}\`);
    });
    console.log("\\n✓ Semantic search complete");
  } finally {
    await client.close();
  }
}

if (require.main === module) { main().catch(console.error); }
module.exports = { semanticSearch, generateQueryEmbedding };
