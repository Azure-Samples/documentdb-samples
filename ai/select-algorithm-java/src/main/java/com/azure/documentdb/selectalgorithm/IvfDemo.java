package com.azure.documentdb.selectalgorithm;

import com.azure.ai.openai.OpenAIClient;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import org.bson.Document;

import java.util.List;

public class IvfDemo {

    private static final String COLLECTION_NAME = "hotels_ivf";
    private static final String QUERY = "quintessential lodging near running trails, eateries, retail";

    public static void createIvfIndex(MongoCollection<Document> collection, String vectorField, int dimensions, String similarity) {
        System.out.println("  Creating IVF vector index...");

        Document indexDefinition = new Document()
                .append("name", "ivf_index_" + vectorField)
                .append("key", new Document(vectorField, "cosmosSearch"))
                .append("cosmosSearchOptions", new Document()
                        .append("kind", "vector-ivf")
                        .append("dimensions", dimensions)
                        .append("similarity", similarity)
                        .append("numLists", 10));

        Document command = new Document("createIndexes", collection.getNamespace().getCollectionName())
                .append("indexes", List.of(indexDefinition));

        collection.getDatabase().runCommand(command);
        System.out.println("  IVF index created successfully.");
    }

    public static void run() {
        System.out.println("\n========================================");
        System.out.println("  IVF (Inverted File) Index Demo");
        System.out.println("========================================\n");

        String databaseName = Utils.getEnv("AZURE_DOCUMENTDB_DATABASENAME", "Hotels");
        String dataFile = Utils.getEnv("DATA_FILE_WITH_VECTORS", "../data/Hotels_Vector.json");
        String vectorField = Utils.getEnv("EMBEDDED_FIELD", "contentVector");
        int dimensions = Integer.parseInt(Utils.getEnv("EMBEDDING_DIMENSIONS", "1536"));
        String similarity = Utils.getEnv("SIMILARITY", "COS");
        String model = Utils.getEnv("AZURE_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small");

        try (MongoClient mongoClient = Utils.getMongoClient()) {
            MongoDatabase database = mongoClient.getDatabase(databaseName);
            MongoCollection<Document> collection = database.getCollection(COLLECTION_NAME);

            // Load and insert data
            System.out.println("  Loading data from: " + dataFile);
            List<Document> data = Utils.readJsonFile(dataFile);
            System.out.printf("  Loaded %d documents%n", data.size());

            // Drop existing collection to start fresh
            collection.drop();
            System.out.println("  Collection reset.");

            Utils.insertData(collection, data, 100);

            // Create IVF index
            createIvfIndex(collection, vectorField, dimensions, similarity);

            // Perform vector search
            OpenAIClient aiClient = Utils.getOpenAIClient();
            System.out.println("\n  Performing vector search with IVF index...");
            List<Document> results = Utils.performVectorSearch(
                    collection, aiClient, QUERY, vectorField, model, 5);

            Utils.printResults(results);
        }

        System.out.println("  IVF Demo complete.\n");
    }
}
