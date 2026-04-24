package com.azure.documentdb.selectalgorithm;

import com.azure.ai.openai.OpenAIClient;
import com.azure.ai.openai.OpenAIClientBuilder;
import com.azure.ai.openai.models.EmbeddingsOptions;
import com.azure.core.http.policy.ExponentialBackoffOptions;
import com.azure.core.http.policy.RetryOptions;
import com.azure.identity.DefaultAzureCredentialBuilder;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mongodb.ConnectionString;
import com.mongodb.MongoClientSettings;
import com.mongodb.MongoCredential;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import io.github.cdimascio.dotenv.Dotenv;
import org.bson.Document;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class Utils {
    private static Dotenv dotenv;
    private static final ObjectMapper objectMapper = new ObjectMapper();

    public static void loadEnv() {
        try {
            dotenv = Dotenv.configure()
                .ignoreIfMissing()
                .load();
        } catch (Exception e) {
            System.err.println("Warning: Could not load .env file, using system environment variables");
        }
    }

    public static String getEnv(String key) {
        if (dotenv != null) {
            String value = dotenv.get(key);
            if (value != null) return value;
        }
        return System.getenv(key);
    }

    public static String getEnv(String key, String defaultValue) {
        String value = getEnv(key);
        return value != null ? value : defaultValue;
    }

    public static MongoClient createMongoClient() {
        var clusterName = getEnv("MONGO_CLUSTER_NAME");
        var managedIdentityPrincipalId = getEnv("AZURE_MANAGED_IDENTITY_PRINCIPAL_ID");
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
            .retryWrites(true)
            .retryReads(true)
            .build();

        return MongoClients.create(settings);
    }

    public static OpenAIClient createOpenAIClient() {
        var endpoint = getEnv("AZURE_OPENAI_EMBEDDING_ENDPOINT");
        var credential = new DefaultAzureCredentialBuilder().build();

        return new OpenAIClientBuilder()
            .endpoint(endpoint)
            .credential(credential)
            .retryOptions(new RetryOptions(
                new ExponentialBackoffOptions()
                    .setMaxRetries(3)
                    .setBaseDelay(Duration.ofSeconds(1))
                    .setMaxDelay(Duration.ofSeconds(30))
            ))
            .buildClient();
    }

    public static List<Map<String, Object>> loadHotelData() throws IOException {
        var dataFile = getEnv("DATA_FILE_WITH_VECTORS");
        var filePath = Path.of(dataFile);

        System.out.println("Reading JSON file from " + filePath.toAbsolutePath());
        var jsonContent = Files.readString(filePath);

        return objectMapper.readValue(jsonContent, new TypeReference<List<Map<String, Object>>>() {});
    }

    public static List<Double> createEmbedding(OpenAIClient openAIClient, String text) {
        var model = getEnv("AZURE_OPENAI_EMBEDDING_MODEL");
        var options = new EmbeddingsOptions(List.of(text));

        var response = openAIClient.getEmbeddings(model, options);
        return response.getData().get(0).getEmbedding().stream()
                .map(Float::doubleValue)
                .toList();
    }

    public static Document createVectorIndexOptions(String algorithm, String similarity) {
        var embeddedField = getEnv("EMBEDDED_FIELD");
        var dimensionsStr = getEnv("EMBEDDING_DIMENSIONS");
        var dimensions = dimensionsStr != null ? Integer.parseInt(dimensionsStr) : 1536;

        var options = new Document()
            .append("kind", getVectorKind(algorithm))
            .append("dimensions", dimensions)
            .append("similarity", similarity);

        switch (algorithm.toLowerCase()) {
            case "diskann":
                options.append("maxDegree", 32)
                       .append("lBuild", 50);
                break;
            case "hnsw":
                options.append("m", 16)
                       .append("efConstruction", 64);
                break;
            case "ivf":
                options.append("numLists", 1);
                break;
        }

        return options;
    }

    public static Document createSearchOptions(String algorithm) {
        var options = new Document();

        switch (algorithm.toLowerCase()) {
            case "diskann":
                options.append("lSearch", 100);
                break;
            case "hnsw":
                options.append("efSearch", 80);
                break;
            case "ivf":
                options.append("nProbes", 1);
                break;
        }

        return options;
    }

    private static String getVectorKind(String algorithm) {
        return "vector-" + algorithm.toLowerCase();
    }

    public static <T> List<List<T>> partitionList(List<T> list, int batchSize) {
        var partitions = new ArrayList<List<T>>();
        for (int i = 0; i < list.size(); i += batchSize) {
            partitions.add(list.subList(i, Math.min(i + batchSize, list.size())));
        }
        return partitions;
    }

    public static void printComparisonTable(List<Map<String, Object>> results) {
        System.out.println("\n" + "=".repeat(80));
        System.out.println("Vector Index Algorithm Comparison Results");
        System.out.println("=".repeat(80));
        System.out.printf("%-15s %-15s %-20s%n", "Algorithm", "Similarity", "Avg Latency (ms)");
        System.out.println("-".repeat(80));

        for (var result : results) {
            System.out.printf("%-15s %-15s %-20.2f%n",
                result.get("algorithm"),
                result.get("similarity"),
                result.get("latency"));
        }

        System.out.println("=".repeat(80));
    }
}
