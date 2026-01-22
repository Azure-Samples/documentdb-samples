package com.azure.documentdb.samples;

import com.azure.ai.openai.OpenAIClient;
import com.azure.ai.openai.OpenAIClientBuilder;
import com.azure.ai.openai.models.EmbeddingsOptions;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.MongoCredential;
import com.mongodb.client.AggregateIterable;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.Indexes;
import org.bson.Document;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Vector search sample using HNSW index.
 */
public class HNSW {
    private static final String SAMPLE_QUERY = "quintessential lodging near running trails, eateries, retail";
    private static final String DATABASE_NAME = "Hotels";
    private static final String COLLECTION_NAME = "hotels_hnsw";
    private static final String VECTOR_INDEX_NAME = "vectorIndex_hnsw";

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    public static void main(String[] args) {
        new HNSW().run();
        System.exit(0);
    }

    public void run() {
        try (var mongoClient = createMongoClient()) {
            var openAIClient = createOpenAIClient();

            var database = mongoClient.getDatabase(DATABASE_NAME);
            var collection = database.getCollection(COLLECTION_NAME, Document.class);

            // Drop and recreate collection
            collection.drop();
            database.createCollection(COLLECTION_NAME);
            System.out.println("Created collection: " + COLLECTION_NAME);

            // Load and insert data
            var hotelData = loadHotelData();
            insertDataInBatches(collection, hotelData);

            // Create standard indexes
            createStandardIndexes(collection);

            // Create vector index
            createVectorIndex(database);

            // Perform vector search
            var queryEmbedding = createEmbedding(openAIClient, SAMPLE_QUERY);
            performVectorSearch(collection, queryEmbedding);

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private MongoClient createMongoClient() {
        var clusterName = System.getenv("MONGO_CLUSTER_NAME");
        var managedIdentityPrincipalId = System.getenv("AZURE_MANAGED_IDENTITY_PRINCIPAL_ID");
        var azureCredential = new DefaultAzureCredentialBuilder().build();

        MongoCredential.OidcCallback callback = (MongoCredential.OidcCallbackContext context) -> {
            var token = azureCredential.getToken(
                new com.azure.core.credential.TokenRequestContext()
                    .addScopes("https://ossrdbms-aad.database.windows.net/.default")
            ).block();

            if (token == null) {
                throw new RuntimeException("Failed to obtain Azure AD token");
            }

            return new MongoCredential.OidcCallbackResult(token.getToken());
        };

        var credential = MongoCredential.createOidcCredential(null)
            .withMechanismProperty("OIDC_CALLBACK", callback);

        var connectionString = new ConnectionString(
            String.format("mongodb+srv://%s@%s.mongocluster.cosmos.azure.com/?authMechanism=MONGODB-OIDC&tls=true&retrywrites=false&maxIdleTimeMS=120000",
                managedIdentityPrincipalId, clusterName)
        );

        var settings = MongoClientSettings.builder()
            .applyConnectionString(connectionString)
            .credential(credential)
            .build();

        return MongoClients.create(settings);
    }

    private OpenAIClient createOpenAIClient() {
        var endpoint = System.getenv("AZURE_OPENAI_EMBEDDING_ENDPOINT");
        var credential = new DefaultAzureCredentialBuilder().build();

        return new OpenAIClientBuilder()
            .endpoint(endpoint)
            .credential(credential)
            .buildClient();
    }

    private List<Map<String, Object>> loadHotelData() throws IOException {
        var dataFile = System.getenv("DATA_FILE_WITH_VECTORS");
        var filePath = Path.of(dataFile);

        System.out.println("Reading JSON file from " + filePath);
        var jsonContent = Files.readString(filePath);

        return jsonMapper.readValue(jsonContent, new TypeReference<List<Map<String, Object>>>() {});
    }

    private void insertDataInBatches(MongoCollection<Document> collection, List<Map<String, Object>> hotelData) {
        var batchSizeStr = System.getenv("LOAD_SIZE_BATCH");
        var batchSize = batchSizeStr != null ? Integer.parseInt(batchSizeStr) : 100;
        var batches = partitionList(hotelData, batchSize);

        System.out.println("Processing in batches of " + batchSize + "...");

        for (int i = 0; i < batches.size(); i++) {
            var batch = batches.get(i);
            var documents = batch.stream()
                .map(Document::new)
                .toList();

            collection.insertMany(documents);
            System.out.println("Batch " + (i + 1) + " complete: " + documents.size() + " inserted");
        }
    }

    private void createStandardIndexes(MongoCollection<Document> collection) {
        collection.createIndex(Indexes.ascending("HotelId"));
        collection.createIndex(Indexes.ascending("Category"));
        collection.createIndex(Indexes.ascending("Description"));
        collection.createIndex(Indexes.ascending("Description_fr"));
    }

    private void createVectorIndex(MongoDatabase database) {
        var embeddedField = System.getenv("EMBEDDED_FIELD");
        var dimensionsStr = System.getenv("EMBEDDING_DIMENSIONS");
        var dimensions = dimensionsStr != null ? Integer.parseInt(dimensionsStr) : 1536;

        var indexDefinition = new Document()
            .append("createIndexes", COLLECTION_NAME)
            .append("indexes", List.of(
                new Document()
                    .append("name", VECTOR_INDEX_NAME)
                    .append("key", new Document(embeddedField, "cosmosSearch"))
                    .append("cosmosSearchOptions", new Document()
                        .append("kind", "vector-hnsw")
                        .append("dimensions", dimensions)
                        .append("similarity", "COS")
                        .append("m", 16)
                        .append("efConstruction", 64)
                    )
            ));

        database.runCommand(indexDefinition);
        System.out.println("Created vector index: " + VECTOR_INDEX_NAME);
    }

    private List<Double> createEmbedding(OpenAIClient openAIClient, String text) {
        var model = System.getenv("AZURE_OPENAI_EMBEDDING_MODEL");
        var options = new EmbeddingsOptions(List.of(text));

        var response = openAIClient.getEmbeddings(model, options);
        return response.getData().get(0).getEmbedding().stream()
                .map(Float::doubleValue)
                .toList();
    }

    private void performVectorSearch(MongoCollection<Document> collection, List<Double> queryEmbedding) {
        var embeddedField = System.getenv("EMBEDDED_FIELD");

        var searchStage = new Document("$search", new Document()
            .append("cosmosSearch", new Document()
                .append("vector", queryEmbedding)
                .append("path", embeddedField)
                .append("k", 5)
            )
        );

        var projectStage = new Document("$project", new Document()
            .append("score", new Document("$meta", "searchScore"))
            .append("document", "$$ROOT")
        );

        var pipeline = List.of(searchStage, projectStage);

        System.out.println("\nVector search results for: \"" + SAMPLE_QUERY + "\"");

        AggregateIterable<Document> results = collection.aggregate(pipeline);
        var rank = 1;

        for (var result : results) {
            var document = result.get("document", Document.class);
            var hotelName = document.getString("HotelName");
            var score = result.getDouble("score");
            System.out.printf("%d. HotelName: %s, Score: %.4f%n", rank++, hotelName, score);
        }
    }

    private static <T> List<List<T>> partitionList(List<T> list, int batchSize) {
        var partitions = new ArrayList<List<T>>();
        for (int i = 0; i < list.size(); i += batchSize) {
            partitions.add(list.subList(i, Math.min(i + batchSize, list.size())));
        }
        return partitions;
    }
}
