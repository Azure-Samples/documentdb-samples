# Java-Specific Instructions

## Stack

- Java 17+
- MongoDB Java Driver (`org.mongodb:mongodb-driver-sync`)
- Azure Identity (`com.azure:azure-identity`)
- Azure OpenAI (`com.azure:azure-ai-openai`)

## File Structure

```
ai/select-algorithm-java/
├── src/main/java/com/azure/documentdb/sample/
│   ├── CompareAll.java
│   └── Utils.java
├── pom.xml
└── README.md

ai/vector-search-java/
├── src/main/java/com/azure/documentdb/sample/
│   ├── Ivf.java
│   ├── Hnsw.java
│   ├── Diskann.java
│   └── Utils.java
├── pom.xml
└── README.md
```

## Naming Conventions

- Files: `PascalCase.java`
- Methods: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Classes: `PascalCase`
- Packages: `com.azure.documentdb.sample`

## Authentication Pattern

```java
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.mongodb.MongoClientSettings;
import com.mongodb.MongoCredential;

DefaultAzureCredential credential = new DefaultAzureCredentialBuilder().build();
MongoCredential mongoCredential = MongoCredential.createOidcCredential(null)
    .withMechanismProperty("OIDC_CALLBACK", (context) -> {
        AccessToken token = credential.getToken(
            new TokenRequestContext().addScopes("https://ossrdbms-aad.database.windows.net/.default")
        ).block();
        return new OidcCallbackResult(token.getToken());
    });
```

## $search Syntax

```java
// CORRECT
Document searchStage = new Document("$search",
    new Document("cosmosSearch",
        new Document("vector", queryVector)
            .append("path", embeddedField)
            .append("k", topK)));

// WRONG — do NOT add cosmosSearchOptions to the $search stage
```

## Bulk Insert

Use `collection.insertMany()` with `InsertManyOptions().ordered(false)`:

```java
import com.mongodb.client.model.InsertManyOptions;
import com.mongodb.MongoBulkWriteException;

try {
    collection.insertMany(documents, new InsertManyOptions().ordered(false));
    insertedCount += documents.size();
} catch (MongoBulkWriteException e) {
    // Partial failure — some docs inserted
    insertedCount += e.getWriteResult().getInsertedCount();
    failedCount += documents.size() - e.getWriteResult().getInsertedCount();
}
```

- Batch size configurable via `LOAD_SIZE_BATCH` env var (default: 100)
- 200ms delay between batches (`Thread.sleep(200)`)
- Catch `MongoBulkWriteException` for partial failure handling

## Key Patterns

- Use `System.getenv("VAR")` with null check for config
- Use try-with-resources for MongoClient
- Use `try/finally` for collection cleanup
- Match TypeScript output format exactly

## Environment Variables

- Read directly via `System.getenv("VAR")` — **no dotenv library**
- Provide a `.env.example` file in each sample directory for documentation purposes
- Access pattern: `System.getenv("VAR")` with null check or ternary for defaults
- Validate required vars early and fail with a clear message

```java
var clusterName = System.getenv("MONGO_CLUSTER_NAME");
var endpoint = System.getenv("AZURE_OPENAI_EMBEDDING_ENDPOINT");
var model = System.getenv("AZURE_OPENAI_EMBEDDING_MODEL");
var batchSizeStr = System.getenv("LOAD_SIZE_BATCH");
var batchSize = batchSizeStr != null ? Integer.parseInt(batchSizeStr) : 100;

if (clusterName == null || endpoint == null) {
    throw new IllegalStateException("Missing required environment variables: MONGO_CLUSTER_NAME, AZURE_OPENAI_EMBEDDING_ENDPOINT");
}
```

- Users set env vars via shell export, IDE run configuration, or azd-provided `.env`

## Build & Run

```bash
mvn compile exec:java -Dexec.mainClass="com.azure.documentdb.sample.CompareAll"
```
