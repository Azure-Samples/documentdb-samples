# Azure Cosmos DB for MongoDB (vCore) - AI Vector Search Samples

This directory contains vector search samples demonstrating how to use Azure Cosmos DB for MongoDB (vCore) with AI embeddings across multiple programming languages.

## Available Samples

- **vector-search-python** - Python implementation using PyMongo
- **vector-search-typescript** - TypeScript implementation using Node.js MongoDB driver
- **vector-search-go** - Go implementation using official MongoDB Go driver
- **vector-search-java** - Java implementation using MongoDB Java Sync driver
- **vector-search-dotnet** - .NET implementation using MongoDB C# driver
- **vector-search-agent-ts** - TypeScript agent implementation using LangChain
- **vector-search-agent-go** - Go agent implementation with vector store

## MongoDB Bulk Insert Best Practices

When creating new samples or modifying existing ones, always use the optimal bulk insert method for your language. This ensures best performance with parallel execution, automatic retry logic, and proper error handling.

### Python (PyMongo 4.6.0+)

**Required Driver:** `pymongo>=4.6.0`

**Recommended Method:**
```python
from pymongo.operations import InsertOne
from pymongo.errors import BulkWriteError

# Process in batches
for i in range(0, total_documents, batch_size):
    batch = data[i:i + batch_size]
    
    try:
        # Prepare bulk insert operations
        operations = [InsertOne(document) for document in batch]
        
        # Execute bulk insert with unordered flag
        result = collection.bulk_write(operations, ordered=False)
        inserted_count += result.inserted_count
        
    except BulkWriteError as e:
        # Handle partial failures
        inserted = len(batch) - len(e.details['writeErrors'])
        inserted_count += inserted
        failed_count += len(e.details['writeErrors'])
```

**Alternative (simpler but less flexible):**
```python
result = collection.insert_many(documents, ordered=False)
```

**Key Features:**
- `ordered=False` enables parallel execution
- Built-in retry logic for retryable errors
- Continues on individual document failures

### TypeScript/JavaScript (MongoDB Node.js Driver 6.0+)

**Required Driver:** `mongodb@^6.0.0`

**Recommended Method:**
```typescript
import { MongoClient } from 'mongodb';

// Process in batches
for (let i = 0; i < totalBatches; i++) {
    const batch = data.slice(start, end);
    
    try {
        // Insert with unordered flag
        const result = await collection.insertMany(batch, { ordered: false });
        inserted += result.insertedCount || 0;
        
    } catch (error: any) {
        // Handle bulk write errors
        if (error?.writeErrors) {
            failed += error.writeErrors.length;
            inserted += batch.length - error.writeErrors.length;
        }
    }
}
```

**Key Features:**
- `ordered: false` enables parallel execution
- Automatic retry for retryable writes
- Tracks partial successes in error handling

### Go (MongoDB Go Driver 1.17+)

**Required Driver:** `go.mongodb.org/mongo-driver@v1.17.0` or later

**Recommended Method:**
```go
import (
    "context"
    "go.mongodb.org/mongo-driver/mongo"
    "go.mongodb.org/mongo-driver/mongo/options"
)

// Process in batches
for i := 0; i < totalDocuments; i += batchSize {
    batch := data[i:end]
    
    // Convert to []interface{} for MongoDB driver
    documents := make([]interface{}, len(batch))
    for j, doc := range batch {
        documents[j] = doc
    }
    
    // Insert with unordered option
    opts := options.InsertMany().SetOrdered(false)
    result, err := collection.InsertMany(ctx, documents, opts)
    
    if err != nil {
        // Handle bulk write errors
        if bulkErr, ok := err.(mongo.BulkWriteException); ok {
            inserted := len(batch) - len(bulkErr.WriteErrors)
            insertedCount += inserted
            failedCount += len(bulkErr.WriteErrors)
        }
    } else {
        insertedCount += len(result.InsertedIDs)
    }
}
```

**Key Features:**
- `SetOrdered(false)` enables parallel execution
- Automatic retry logic built into driver
- Type assertion for handling bulk write exceptions

### Java (MongoDB Java Sync Driver 5.0+)

**Required Driver:** `mongodb-driver-sync@5.0.0` or later

**Recommended Method:**
```java
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.InsertManyOptions;
import com.mongodb.MongoBulkWriteException;
import org.bson.Document;
import java.util.List;

// Process in batches
int totalInserted = 0;
int totalFailed = 0;

for (int i = 0; i < batches.size(); i++) {
    List<Document> batch = batches.get(i);
    
    // Create options with unordered flag
    InsertManyOptions insertOptions = new InsertManyOptions().ordered(false);
    
    try {
        collection.insertMany(batch, insertOptions);
        totalInserted += batch.size();
        
    } catch (MongoBulkWriteException e) {
        // Handle partial failures
        int inserted = batch.size() - e.getWriteErrors().size();
        totalInserted += inserted;
        totalFailed += e.getWriteErrors().size();
    }
}
```

**Key Features:**
- `ordered(false)` enables parallel execution
- Exception handling for partial successes
- Built-in retry mechanism in driver

### .NET (MongoDB C# Driver 2.19+)

**Required Driver:** `MongoDB.Driver@2.19.0` or later (3.0.0+ recommended)

**Recommended Method:**
```csharp
using MongoDB.Driver;
using System.Collections.Generic;
using System.Threading.Tasks;

// Process all documents
var dataList = data.ToList();

try
{
    // Use unordered insert for better performance
    var options = new InsertManyOptions { IsOrdered = false };
    await collection.InsertManyAsync(dataList, options);
    inserted = dataList.Count;
}
catch (MongoBulkWriteException ex)
{
    // Handle partial failures
    // Note: Track success/failure based on exception details
    failed = ex.WriteErrors.Count;
    inserted = dataList.Count - failed;
}
```

**Key Features:**
- `IsOrdered = false` enables parallel execution
- Async/await pattern for better performance
- Automatic retry for transient failures

### LangChain Integration (TypeScript)

**Required Package:** `@langchain/azure-cosmosdb@^1.0.0`

**Recommended Method:**
```typescript
import { AzureCosmosDBMongoDBVectorStore } from '@langchain/azure-cosmosdb';
import { Document } from '@langchain/core/documents';

// Prepare documents
const documents = data.map(item => new Document({
    pageContent: `${item.title}\n\n${item.description}`,
    metadata: item,
    id: item.id.toString()
}));

// Insert using LangChain abstraction
const store = await AzureCosmosDBMongoDBVectorStore.fromDocuments(
    documents,
    embeddingClient,
    {
        ...dbConfig,
        indexOptions: vectorIndexOptions,
    }
);
```

**Key Features:**
- Abstracts bulk insert complexity
- Uses optimal MongoDB settings internally
- Handles vector index creation

## General Guidelines for All Languages

1. **Always use unordered inserts** (`ordered=false` or equivalent) for bulk operations
   - Enables parallel execution across shards
   - Continues processing even if individual documents fail
   - Significantly improves throughput

2. **Implement proper error handling**
   - Catch bulk write exceptions
   - Track both successful and failed insertions
   - Log partial successes for observability

3. **Process in batches**
   - Typical batch size: 100-1000 documents
   - Adjust based on document size and memory constraints
   - Provide progress feedback during insertion

4. **Leverage driver features**
   - Use the latest stable driver version
   - Automatic retry logic is built into modern drivers
   - Connection pooling is configured by default

5. **Create indexes after insertion**
   - Insert data first, then create standard indexes
   - Create vector indexes using database commands
   - Reduces overhead during bulk operations

## MongoDB Driver Versions

| Language | Driver | Minimum Version | Recommended |
|----------|--------|----------------|-------------|
| Python | pymongo | 4.6.0 | Latest 4.x |
| TypeScript/JavaScript | mongodb | 6.0.0 | Latest 6.x |
| Go | mongo-driver | 1.17.0 | Latest 1.x |
| Java | mongodb-driver-sync | 5.0.0 | Latest 5.x |
| .NET | MongoDB.Driver | 2.19.0 | Latest 3.x |

## Additional Resources

### General MongoDB Documentation
- **Detailed Analysis:** See [BULK_OPERATION_ANALYSIS.md](./BULK_OPERATION_ANALYSIS.md) for comprehensive analysis of all samples
- **MongoDB Bulk Write Operations:** [https://www.mongodb.com/docs/manual/core/bulk-write-operations/](https://www.mongodb.com/docs/manual/core/bulk-write-operations/)
- **MongoDB Retryable Writes:** [https://www.mongodb.com/docs/manual/core/retryable-writes/](https://www.mongodb.com/docs/manual/core/retryable-writes/)
- **Vector Search:** [Azure Cosmos DB for MongoDB (vCore) Vector Search](https://learn.microsoft.com/azure/cosmos-db/mongodb/vcore/vector-search)

### Driver-Specific Documentation

#### Python (PyMongo)
- **PyMongo bulk_write() Documentation:** [https://pymongo.readthedocs.io/en/stable/api/pymongo/collection.html#pymongo.collection.Collection.bulk_write](https://pymongo.readthedocs.io/en/stable/api/pymongo/collection.html#pymongo.collection.Collection.bulk_write)
- **PyMongo insert_many() Documentation:** [https://pymongo.readthedocs.io/en/stable/api/pymongo/collection.html#pymongo.collection.Collection.insert_many](https://pymongo.readthedocs.io/en/stable/api/pymongo/collection.html#pymongo.collection.Collection.insert_many)
- **PyMongo Bulk Write Operations Guide:** [https://pymongo.readthedocs.io/en/stable/examples/bulk.html](https://pymongo.readthedocs.io/en/stable/examples/bulk.html)

#### TypeScript/JavaScript (Node.js Driver)
- **Node.js insertMany() Documentation:** [https://www.mongodb.com/docs/drivers/node/current/usage-examples/insertMany/](https://www.mongodb.com/docs/drivers/node/current/usage-examples/insertMany/)
- **Node.js Bulk Write Operations:** [https://www.mongodb.com/docs/drivers/node/current/usage-examples/bulkWrite/](https://www.mongodb.com/docs/drivers/node/current/usage-examples/bulkWrite/)
- **Node.js Driver API Reference:** [https://mongodb.github.io/node-mongodb-native/6.0/classes/Collection.html#insertMany](https://mongodb.github.io/node-mongodb-native/6.0/classes/Collection.html#insertMany)

#### Go (MongoDB Go Driver)
- **Go InsertMany() Documentation:** [https://pkg.go.dev/go.mongodb.org/mongo-driver/mongo#Collection.InsertMany](https://pkg.go.dev/go.mongodb.org/mongo-driver/mongo#Collection.InsertMany)
- **Go InsertManyOptions Documentation:** [https://pkg.go.dev/go.mongodb.org/mongo-driver/mongo/options#InsertManyOptions](https://pkg.go.dev/go.mongodb.org/mongo-driver/mongo/options#InsertManyOptions)
- **Go Driver Usage Examples:** [https://www.mongodb.com/docs/drivers/go/current/usage-examples/insertMany/](https://www.mongodb.com/docs/drivers/go/current/usage-examples/insertMany/)

#### Java (MongoDB Java Sync Driver)
- **Java insertMany() Documentation:** [https://www.mongodb.com/docs/drivers/java/sync/current/usage-examples/insertMany/](https://www.mongodb.com/docs/drivers/java/sync/current/usage-examples/insertMany/)
- **Java InsertManyOptions API:** [https://mongodb.github.io/mongo-java-driver/5.0/apidocs/mongodb-driver-sync/com/mongodb/client/model/InsertManyOptions.html](https://mongodb.github.io/mongo-java-driver/5.0/apidocs/mongodb-driver-sync/com/mongodb/client/model/InsertManyOptions.html)
- **Java Bulk Write Operations:** [https://www.mongodb.com/docs/drivers/java/sync/current/usage-examples/bulkWrite/](https://www.mongodb.com/docs/drivers/java/sync/current/usage-examples/bulkWrite/)

#### .NET (MongoDB C# Driver)
- **C# InsertManyAsync() Documentation:** [https://www.mongodb.com/docs/drivers/csharp/current/usage-examples/insertMany/](https://www.mongodb.com/docs/drivers/csharp/current/usage-examples/insertMany/)
- **C# InsertManyOptions API:** [https://mongodb.github.io/mongo-csharp-driver/2.19.0/apidocs/html/T_MongoDB_Driver_InsertManyOptions.htm](https://mongodb.github.io/mongo-csharp-driver/2.19.0/apidocs/html/T_MongoDB_Driver_InsertManyOptions.htm)
- **C# Bulk Write Operations:** [https://www.mongodb.com/docs/drivers/csharp/current/usage-examples/bulkWrite/](https://www.mongodb.com/docs/drivers/csharp/current/usage-examples/bulkWrite/)

## Performance Tips

1. **Connection Pooling:** Configure appropriate pool sizes for your workload
2. **Write Concern:** Use `w: 1` for better performance in non-critical scenarios
3. **Batch Size:** Experiment with batch sizes (100-1000) to find optimal throughput
4. **Network Latency:** Deploy applications in the same region as your database
5. **Index Strategy:** Create indexes after bulk insert completes

## Contributing

When contributing new samples:
1. Follow the bulk insert patterns documented above for your language
2. Include comprehensive error handling
3. Add logging for observability
4. Test with both successful and failure scenarios
5. Update this README if introducing new patterns or languages
