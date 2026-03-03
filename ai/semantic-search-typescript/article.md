# Vector Store Semantic Search in Azure DocumentDB

**Purpose:** Learn how to perform semantic similarity searches using vector embeddings in Azure DocumentDB (MongoDB vCore) using the cosmosSearch aggregation stage.

## Prerequisites
- Completion of Topic 2 and Topic 3
- Azure DocumentDB account (MongoDB vCore)
- Collection with vector index
- Node.js 18.x or later
- Azure OpenAI resource

## What You'll Learn
- How does semantic similarity work?
- What distance metrics should I use?
- How many results should I retrieve (top-k)?
- How do I interpret scores?

## Understanding Semantic Search
Semantic search finds documents based on meaning rather than keywords.

## Distance Metrics in DocumentDB

**FIXED SECTION - ADDED**

DocumentDB vector indexes support three distance metrics configured at index creation:

| Metric | DocumentDB Value | Range | Best For | Interpretation |
|--------|-----------------|-------|----------|----------------|
| **Cosine** | "COS" | 0 to 1 (similarity) | General text embeddings | 1 = identical, 0 = opposite |
| **Inner Product** | "IP" | -∞ to ∞ | Normalized vectors | Higher = more similar |
| **Euclidean (L2)** | "L2" | 0 to ∞ | Geometric distance | 0 = identical, larger = different |

### Choosing a Distance Metric

**Use Cosine (COS) - Recommended for most cases:**
- ✅ Text embeddings from models like text-embedding-ada-002
- ✅ When direction matters more than magnitude
- ✅ General semantic similarity
- Returns normalized similarity scores (0 to 1, higher = better)

**Use Inner Product (IP):**
- ✅ Pre-normalized embeddings (length = 1)
- ✅ Slightly faster than cosine
- ✅ When working with specific model requirements

**Use Euclidean (L2):**
- ✅ When absolute distance matters
- ✅ Some image embedding models
- ✅ Geometric proximity calculations

**Setting at Index Creation:**
```javascript
await collection.createSearchIndex({
  name: "vectorSearchIndex",
  type: "vector-hnsw",
  definition: {
    fields: [{
      path: "embedding",
      type: "vector",
      numDimensions: 1536,
      similarity: "COS"  // or "IP" or "L2"
    }]
  }
});
```

**Default recommendation: Use "COS" (cosine) for text embeddings**

## DocumentDB Vector Search Syntax
```javascript
const results = await collection.aggregate([
  {
    $search: {
      cosmosSearch: {
        vector: queryEmbedding,
        path: "embedding",
        k: 10
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
```

## Interpreting Similarity Scores
DocumentDB returns similarity scores (higher = more similar):

Score ranges for Cosine similarity:
- 0.9-1.0: Highly similar ⭐⭐⭐
- 0.7-0.9: Similar ⭐⭐
- 0.5-0.7: Moderately similar ⭐
- 0.3-0.5: Weakly similar
- <0.3: Dissimilar

## Choosing Top-K
| Use Case | Recommended K |
|----------|--------------|
| Direct user search | 5-10 |
| RAG context | 3-5 |
| Recommendations | 10-20 |

## Advanced Query Patterns
- Vector search with MongoDB filters
- Score thresholding
- Multi-field projection

## Best Practices
✅ Use cosine (COS) for text embeddings
✅ Top-K typically 5-10 for user search
✅ Combine with MongoDB filters
✅ Monitor query performance

## Key Takeaways
- Use cosmosSearch in $search aggregation
- Cosine similarity: higher scores = better matches
- Set distance metric at index creation
- Top-K typically 5-10
