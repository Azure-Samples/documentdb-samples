# DocumentDB Samples — Copilot Instructions

## Project Overview
Azure DocumentDB code samples for vector search and algorithm selection quickstart articles.

## Language Dependencies

### Go
- Go 1.21+
- go.mongodb.org/mongo-driver v1.17+
- github.com/Azure/azure-sdk-for-go/sdk/azidentity
- github.com/Azure/azure-sdk-for-go/sdk/azcore

### Java
- Java 17+
- MongoDB Driver 5.3+
- Azure Identity 1.15+
- Maven 3.8+

### Python
- Python 3.10+
- pymongo >= 4.7
- azure-identity
- openai

### TypeScript/Node.js
- Node.js 20+
- mongodb 6.12+
- @azure/identity
- openai

### .NET
- .NET 8+
- MongoDB.Driver 3.2+
- Azure.Identity

## Consistent Variable Values

All samples MUST use these environment variable names and defaults:

| Variable | Default | Purpose |
|----------|---------|---------|
| MONGO_CLUSTER_NAME | (required) | DocumentDB cluster name |
| AZURE_OPENAI_EMBEDDING_ENDPOINT | (required) | Azure OpenAI endpoint |
| AZURE_OPENAI_EMBEDDING_MODEL | (required) | Embedding model deployment |
| DATA_FILE_WITH_VECTORS | ./Hotels_Vector.json | Path to data file |
| EMBEDDED_FIELD | DescriptionVector | Vector field name in documents |
| EMBEDDING_DIMENSIONS | 1536 | Vector dimensions |
| LOAD_SIZE_BATCH | 100 | Batch size for document insertion |
| EMBEDDING_SIZE_BATCH | 16 | Batch size for embedding generation |
| AZURE_DOCUMENTDB_DATABASENAME | Hotels | Database name |
| SIMILARITY | (varies) | Similarity metric (cosine, euclidean, ip) |
| ALGORITHM | (varies) | Algorithm (ivf, hnsw, diskann) |

## Consistent Algorithm Parameters

### IVF
- numLists: 1
- nProbes: 1

### HNSW
- m: 16
- efConstruction: 64
- efSearch: 40

### DiskANN
- maxDegree: 20
- lBuild: 10
- lSearch: 40

## Rules

1. **No Cosmos DB references.** Never use "Cosmos DB", "cosmosdb", "MongoDB vCore", or "mongo.cosmos.azure.com". Always use "Azure DocumentDB" and "documentdb.azure.com".
2. **Vector field name is DescriptionVector.** Never default to "contentVector".
3. **Data file is shared.** All samples reference `../data/Hotels_Vector.json`. READMEs instruct users to copy it locally.
4. **Batch size is LOAD_SIZE_BATCH=100.** Do not use BATCH_SIZE or other variants.
5. **Database name variable is AZURE_DOCUMENTDB_DATABASENAME.** Do not use MONGO_DB_NAME or other variants.
6. **.NET uses appsettings.json** with same variable names under a "DocumentDB" section.
