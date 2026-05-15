package com.azure.documentdb.selectalgorithm;

import com.azure.ai.openai.OpenAIClient;
import com.azure.ai.openai.OpenAIClientBuilder;
import com.azure.ai.openai.models.EmbeddingItem;
import com.azure.ai.openai.models.EmbeddingsOptions;
import com.azure.core.credential.AccessToken;
import com.azure.identity.DefaultAzureCredential;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.MongoCredential;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.InsertManyOptions;
import org.bson.Document;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public class Utils {

    public static String getEnv(String key, String defaultValue) {
        String value = System.getenv(key);
        return (value != null && !value.isBlank()) ? value : defaultValue;
    }

    public static String getEnv(String key) {
        return getEnv(key, null);
    }

    public static MongoClient getMongoClient() {
        String clusterName = getEnv("DOCUMENTDB_CLUSTER_NAME");
        if (clusterName == null) {
            throw new IllegalStateException("DOCUMENTDB_CLUSTER_NAME environment variable is required");
        }

        String connectionUri = String.format(
                "mongodb+srv://%s.global.mongocluster.cosmos.azure.com/", clusterName);

        // Use custom OIDC callback with DefaultAzureCredential
        // This chains through CLI, managed identity, etc.
        DefaultAzureCredential credential = new DefaultAzureCredentialBuilder().build();
        String tokenResource = "https://ossrdbms-aad.database.windows.net/.default";

        MongoCredential mongoCredential = MongoCredential.createOidcCredential(null)
                .withMechanismProperty("OIDC_CALLBACK", (MongoCredential.OidcCallback) context -> {
                    AccessToken token = credential.getToken(
                            new com.azure.core.credential.TokenRequestContext()
                                    .addScopes(tokenResource)).block();
                    return new MongoCredential.OidcCallbackResult(token.getToken());
                });

        MongoClientSettings settings = MongoClientSettings.builder()
                .applyConnectionString(new ConnectionString(connectionUri))
                .credential(mongoCredential)
                .retryWrites(false)
                .build();

        return MongoClients.create(settings);
    }

    public static OpenAIClient getOpenAIClient() {
        String endpoint = getEnv("AZURE_OPENAI_EMBEDDING_ENDPOINT");
        if (endpoint == null) {
            throw new IllegalStateException("AZURE_OPENAI_EMBEDDING_ENDPOINT environment variable is required");
        }

        DefaultAzureCredential credential = new DefaultAzureCredentialBuilder().build();

        return new OpenAIClientBuilder()
                .endpoint(endpoint)
                .credential(credential)
                .buildClient();
    }

    public static List<Document> readJsonFile(String path) {
        try {
            String content = Files.readString(Path.of(path));
            // Parse JSON array of documents
            @SuppressWarnings("unchecked")
            List<Document> docs = Document.parse("{\"data\":" + content + "}").getList("data", Document.class);
            return docs;
        } catch (IOException e) {
            throw new RuntimeException("Failed to read data file: " + path, e);
        }
    }

    public static void insertData(MongoCollection<Document> collection, List<Document> data, int batchSize) {
        System.out.printf("  Inserting %d documents in batches of %d...%n", data.size(), batchSize);
        InsertManyOptions options = new InsertManyOptions().ordered(false);

        for (int i = 0; i < data.size(); i += batchSize) {
            List<Document> batch = data.subList(i, Math.min(i + batchSize, data.size()));
            // Remove _id to avoid duplicate key errors on re-run
            List<Document> cleaned = new ArrayList<>();
            for (Document doc : batch) {
                Document copy = new Document(doc);
                copy.remove("_id");
                cleaned.add(copy);
            }
            try {
                collection.insertMany(cleaned, options);
            } catch (Exception e) {
                // Ignore duplicate key errors on re-insert
                if (!e.getMessage().contains("duplicate key")) {
                    throw e;
                }
            }
            System.out.printf("  Inserted batch %d-%d%n", i + 1, Math.min(i + batchSize, data.size()));
        }
        System.out.println("  Data insertion complete.");
    }

    public static void dropVectorIndexes(MongoCollection<Document> collection, String vectorField) {
        try {
            for (Document idx : collection.listIndexes()) {
                String name = idx.getString("name");
                if (name != null && name.contains(vectorField) && !name.equals("_id_")) {
                    System.out.printf("  Dropping existing index: %s%n", name);
                    collection.dropIndex(name);
                }
            }
        } catch (Exception e) {
            // Ignore errors when indexes don't exist
            System.out.println("  No existing vector indexes to drop.");
        }
    }

    public static List<Float> getEmbedding(OpenAIClient client, String text, String model) {
        EmbeddingsOptions options = new EmbeddingsOptions(List.of(text));
        List<EmbeddingItem> embeddings = client.getEmbeddings(model, options).getData();
        if (embeddings.isEmpty()) {
            throw new RuntimeException("No embedding returned for query text");
        }
        return embeddings.get(0).getEmbedding();
    }

    public static List<Document> performVectorSearch(
            MongoCollection<Document> collection,
            OpenAIClient aiClient,
            String query,
            String vectorField,
            String model,
            int topK) {

        System.out.printf("  Generating embedding for query: \"%s\"%n", query);
        List<Float> queryVector = getEmbedding(aiClient, query, model);
        System.out.printf("  Embedding generated (%d dimensions)%n", queryVector.size());

        // Convert List<Float> to List<Double> for BSON
        List<Double> vectorAsDoubles = queryVector.stream()
                .map(Float::doubleValue)
                .toList();

        Document searchStage = new Document("$search", new Document("cosmosSearch", new Document()
                .append("vector", vectorAsDoubles)
                .append("path", vectorField)
                .append("k", topK)));

        Document projectStage = new Document("$project", new Document()
                .append("_id", 0)
                .append("HotelName", 1)
                .append("Description", 1)
                .append("score", new Document("$meta", "searchScore")));

        List<Document> pipeline = List.of(searchStage, projectStage);
        List<Document> results = new ArrayList<>();
        collection.aggregate(pipeline).forEach(results::add);

        return results;
    }

    public static void printResults(List<Document> results) {
        System.out.println("\n  === Search Results ===");
        for (int i = 0; i < results.size(); i++) {
            Document doc = results.get(i);
            System.out.printf("  %d. %s (score: %.4f)%n",
                    i + 1,
                    doc.getString("HotelName"),
                    doc.getDouble("score"));
            System.out.printf("     %s%n", doc.getString("Description"));
        }
        System.out.println();
    }
}
