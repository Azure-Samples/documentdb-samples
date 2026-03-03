# Hybrid Search in Azure DocumentDB

**Purpose:** Learn how to combine vector semantic search with keyword search using Reciprocal Rank Fusion (RRF) in Azure DocumentDB (MongoDB vCore).

## Prerequisites
- Completion of Topic 4
- Azure DocumentDB account
- Collection with vector index
- Node.js 18.x or later

## What You'll Learn
- When should I use hybrid vs pure vector search?
- How do I combine vector and keyword results?
- What is Reciprocal Rank Fusion (RRF)?
- How do I weight semantic vs keyword results?

## Understanding Hybrid Search
Hybrid search combines:
1. **Semantic search**: cosmosSearch for meaning
2. **Text search**: MongoDB $text for keywords
3. **RRF fusion**: Merge results by rank

**Why combine them?**
- Semantic: Great for concepts, synonyms
- Keyword: Essential for exact IDs, codes
- Hybrid: Best of both worlds

## What is Reciprocal Rank Fusion (RRF)?

**FIXED SECTION - ADDED**

RRF is an algorithm that combines rankings from multiple search methods into a unified score.

### The Formula

```
RRF_score = Σ (weight / (rank + k))

where:
- rank = position in results list (1-based indexing)
- k = constant (typically 60)
- weight = importance factor (vector vs keyword)
```

### Why RRF Works

- ✅ No score normalization needed (handles different score ranges)
- ✅ Simple and effective
- ✅ Industry standard for hybrid search
- ✅ Proven in production systems

### Concrete Example

Document "ML Deployment Guide" appears in both result sets:

**Vector search results:**
- Position 1: "AI Systems"
- Position 2: "ML Deployment Guide" ← Our document
- Position 3: "Neural Networks"

**Text search results:**
- Position 1: "ML-2024 Deployment"
- Position 5: "ML Deployment Guide" ← Our document
- Position 6: "Machine Learning Basics"

**RRF Calculation (k=60, weights both 1.0):**
```
From vector: 1.0 / (2 + 60) = 0.0161
From text:   1.0 / (5 + 60) = 0.0154
Combined RRF score = 0.0161 + 0.0154 = 0.0315
```

Documents appearing in both lists get boosted scores (sum of both contributions).

## How Do I Weight Semantic vs Keyword Results?

**FIXED SECTION - ADDED**

### Weight Configuration

Weights control the relative importance of semantic vs keyword search:

```javascript
// Balanced (default)
const balancedWeights = { vector: 1.0, keyword: 1.0 };

// Semantic-heavy
const semanticWeights = { vector: 1.5, keyword: 0.5 };

// Keyword-heavy
const keywordWeights = { vector: 0.5, keyword: 1.5 };
```

### When to Adjust Weights

| Scenario | Recommended Weights | Example Query | Rationale |
|----------|-------------------|---------------|-----------|
| **Conceptual queries** | vector: 1.5, keyword: 0.5 | "machine learning concepts" | User wants meaning, not exact terms |
| **Technical IDs/codes** | vector: 0.5, keyword: 1.5 | "ML-2024-v3 deployment" | Exact code match is critical |
| **Mixed queries** | vector: 1.0, keyword: 1.0 | "ML model best practices" | Balance both approaches |
| **User search (general)** | vector: 1.2, keyword: 0.8 | "how to train models" | Slight semantic bias |
| **Product search** | vector: 0.8, keyword: 1.2 | "red shoes size 10" | Exact attributes matter |

### Dynamic Weight Selection

Automatically choose weights based on query characteristics:

```javascript
function chooseWeights(queryText) {
  // Check for exact codes/IDs (e.g., "ML-2024", "ID-12345")
  if (/[A-Z]{2,}-\d+/.test(queryText)) {
    return { vector: 0.5, keyword: 1.5 };  // Keyword-heavy
  }
  
  // Check for quoted phrases (exact match intent)
  if (queryText.includes('"')) {
    return { vector: 0.6, keyword: 1.4 };
  }
  
  // Default: slightly favor semantic
  return { vector: 1.2, keyword: 0.8 };
}
```

## When to Use Hybrid vs Pure Vector?

**FIXED SECTION - ADDED**

### Use Hybrid Search When:

✅ **Users search with exact codes or IDs**
- Example: "ML-2024-v3", "TICKET-12345", "SKU-ABC-001"
- Keyword search ensures exact matches
- Vector search adds related documents

✅ **Mix of conceptual and exact-match queries**
- Example: "machine learning deployment strategies"
- Both semantic understanding and exact term matching needed

✅ **Enterprise search scenarios**
- Document management systems
- Knowledge bases with technical content
- Product catalogs with SKUs and descriptions

✅ **E-commerce product search**
- Example: "red leather shoes size 10"
- Attributes (size, color) need exact match
- Style/category benefits from semantic search

### Use Pure Vector Search When:

✅ **Purely conceptual queries**
- Example: "how do neural networks learn"
- Meaning matters, not exact phrasing

✅ **Cross-language similarity**
- Finding similar content regardless of language
- Embeddings capture meaning across languages

✅ **Paraphrase and synonym matching**
- Example: "automobile" should match "car", "vehicle"
- Vector embeddings handle this naturally

✅ **Recommendation systems**
- "Find similar products"
- "Users who liked this also liked..."
- Pure similarity, no keyword matching needed

### Decision Flow Chart

```
Query Type?
│
├─ Contains exact ID/code? → Hybrid (keyword-heavy: 0.5/1.5)
├─ Contains quoted phrase? → Hybrid (keyword-heavy: 0.6/1.4)
├─ Technical with mixed terms? → Hybrid (balanced: 1.0/1.0)
├─ Pure conceptual question? → Pure Vector
└─ General search? → Hybrid (semantic-heavy: 1.2/0.8)
```

## Implementation

```javascript
async function hybridSearch(collection, queryText, topK = 10, weights = { vector: 1.0, keyword: 1.0 }) {
  // Vector search
  const vectorResults = await collection.aggregate([
    { $search: { cosmosSearch: { vector: await generateQueryEmbedding(queryText), path: "embedding", k: topK * 2 }, returnStoredSource: true } }
  ]).toArray();
  
  // Text search  
  const textResults = await collection.find(
    { $text: { $search: queryText } },
    { projection: { _id: 1, title: 1, score: { $meta: "textScore" } } }
  ).limit(topK * 2).toArray();
  
  // Apply RRF
  return applyRRF(vectorResults, textResults, weights).slice(0, topK);
}

function applyRRF(vectorResults, textResults, weights = { vector: 1.0, keyword: 1.0 }, k = 60) {
  const scores = new Map();
  
  // Process vector results
  vectorResults.forEach((doc, index) => {
    const rank = index + 1;
    const rrfScore = weights.vector / (rank + k);
    scores.set(doc._id.toString(), { 
      ...doc, 
      vectorRank: rank, 
      textRank: null, 
      rrfScore 
    });
  });
  
  // Process text results
  textResults.forEach((doc, index) => {
    const rank = index + 1;
    const rrfScore = weights.keyword / (rank + k);
    const id = doc._id.toString();
    
    if (scores.has(id)) {
      // Document in both results - boost score
      scores.get(id).textRank = rank;
      scores.get(id).rrfScore += rrfScore;
    } else {
      // Document only in text results
      scores.set(id, { ...doc, vectorRank: null, textRank: rank, rrfScore });
    }
  });
  
  // Sort by RRF score (highest first)
  return Array.from(scores.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}
```

## Complete Example

```javascript
async function demonstrateHybridSearch() {
  const client = new MongoClient(process.env.DOCUMENTDB_CONNECTION_STRING);
  await client.connect();
  
  const collection = client.db("vectordb").collection("embeddings");
  
  // Test query with code
  const query = "ML-2024 deployment best practices";
  
  // Automatically choose weights
  const weights = chooseWeights(query);  // Returns keyword-heavy due to "ML-2024"
  
  const results = await hybridSearch(collection, query, 5, weights);
  
  results.forEach((doc, i) => {
    console.log(\`\${i + 1}. \${doc.title}\`);
    console.log(\`   RRF Score: \${doc.rrfScore.toFixed(4)}\`);
    console.log(\`   Vector Rank: \${doc.vectorRank || "N/A"}, Text Rank: \${doc.textRank || "N/A"}\`);
  });
  
  await client.close();
}
```

## Best Practices

### Query Strategy
✅ Detect query type and adjust weights automatically
✅ Use hybrid for enterprise/product search
✅ Use pure vector for conceptual queries
✅ Monitor which search contributes more results

### Weight Tuning
✅ Start with balanced (1.0/1.0)
✅ A/B test different weight configurations
✅ Analyze query patterns to optimize defaults
✅ Allow user intent signals to adjust weights

### Production Deployment
✅ Log queries and weights used
✅ Monitor hybrid vs pure vector performance
✅ Track which search method finds more relevant results
✅ Implement fallback to pure vector if one method fails

## Key Takeaways

### RRF Formula
- Combines rankings using: weight / (rank + 60)
- No score normalization needed
- Documents in both results get boosted scores

### Weight Tuning
- Balanced (1.0/1.0): General use
- Semantic-heavy (1.5/0.5): Conceptual queries
- Keyword-heavy (0.5/1.5): Exact codes/IDs

### When to Use Hybrid
- Exact IDs/codes in queries → Hybrid
- Mixed conceptual + exact terms → Hybrid
- Pure concepts/paraphrasing → Pure vector
- Enterprise/product search → Hybrid

## Next Steps
- Implement in your application
- A/B test weight configurations
- Monitor query patterns
- Optimize for your use case
