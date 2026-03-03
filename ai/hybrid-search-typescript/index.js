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

async function vectorSearch(collection, queryText, topK = 20) {
  const queryEmbedding = await generateQueryEmbedding(queryText);
  return await collection.aggregate([
    { $search: { cosmosSearch: { vector: queryEmbedding, path: "embedding", k: topK }, returnStoredSource: true } }
  ]).toArray();
}

async function textSearch(collection, queryText, topK = 20) {
  return await collection.find({ $text: { $search: queryText } }, { projection: { _id: 1, title: 1, content: 1, score: { $meta: "textScore" } } }).limit(topK).toArray();
}

function applyRRF(vectorResults, textResults, weights = { vector: 1.0, keyword: 1.0 }, k = 60) {
  const scores = new Map();
  vectorResults.forEach((doc, index) => {
    const rank = index + 1;
    scores.set(doc._id.toString(), { ...doc, vectorRank: rank, textRank: null, rrfScore: weights.vector / (rank + k) });
  });
  textResults.forEach((doc, index) => {
    const rank = index + 1;
    const id = doc._id.toString();
    const rrfScore = weights.keyword / (rank + k);
    if (scores.has(id)) {
      scores.get(id).textRank = rank;
      scores.get(id).rrfScore += rrfScore;
    } else {
      scores.set(id, { ...doc, vectorRank: null, textRank: rank, rrfScore });
    }
  });
  return Array.from(scores.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}

async function hybridSearch(collection, queryText, topK = 10, weights = { vector: 1.0, keyword: 1.0 }) {
  console.log(\`\\n=== Hybrid Search: "\${queryText}" ===\`);
  const vectorResults = await vectorSearch(collection, queryText, topK * 2);
  const textResults = await textSearch(collection, queryText, topK * 2);
  return applyRRF(vectorResults, textResults, weights).slice(0, topK);
}

async function main() {
  console.log("=".repeat(80));
  console.log("Azure DocumentDB - Hybrid Search with RRF");
  console.log("=".repeat(80));
  const client = new MongoClient(config.documentdb.connectionString);
  await client.connect();
  const collection = client.db(config.documentdb.databaseName).collection(config.documentdb.collectionName);
  try {
    const results = await hybridSearch(collection, "machine learning deployment", 5);
    results.forEach((doc, i) => {
      console.log(\`\${i + 1}. \${doc.title}\`);
      console.log(\`   RRF Score: \${doc.rrfScore.toFixed(4)}\`);
      console.log(\`   Vector Rank: \${doc.vectorRank || "N/A"}, Text Rank: \${doc.textRank || "N/A"}\`);
    });
    console.log("\\n✓ Hybrid search complete");
  } finally {
    await client.close();
  }
}

if (require.main === module) { main().catch(console.error); }
module.exports = { hybridSearch, vectorSearch, textSearch, applyRRF };
