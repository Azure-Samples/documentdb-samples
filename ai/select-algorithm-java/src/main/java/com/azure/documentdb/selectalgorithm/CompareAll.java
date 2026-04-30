package com.azure.documentdb.selectalgorithm;

import com.azure.ai.openai.OpenAIClient;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import org.bson.Document;

import java.util.ArrayList;
import java.util.List;

/**
 * Unified comparison runner that executes all 9 combinations
 * (3 algorithms x 3 similarity metrics) and prints a formatted table.
 */
public class CompareAll {

    private static final String COLLECTION_NAME = "hotels";
    private static final String[] ALGORITHMS = {"ivf", "hnsw", "diskann"};
    private static final String[] METRICS = {"COS", "L2", "IP"};

    public static void main(String[] args) {
        run();
    }

    public static void run() {
        String queryText = Utils.getEnv("QUERY_TEXT", "luxury hotel near the beach");
        int topK = Integer.parseInt(Utils.getEnv("TOP_K", "3"));
        boolean verbose = Boolean.parseBoolean(Utils.getEnv("VERBOSE", "false"));

        String databaseName = Utils.getEnv("AZURE_DOCUMENTDB_DATABASENAME", "Hotels");
        String dataFile = Utils.getEnv("DATA_FILE_WITH_VECTORS", "../data/Hotels_Vector.json");
        String vectorField = Utils.getEnv("EMBEDDED_FIELD", "contentVector");
        int dimensions = Integer.parseInt(Utils.getEnv("EMBEDDING_DIMENSIONS", "1536"));
        String model = Utils.getEnv("AZURE_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small");

        System.out.println("==============================================");
        System.out.println("  Azure DocumentDB - Compare All Algorithms");
        System.out.println("==============================================");
        System.out.printf("  Query:   \"%s\"%n", queryText);
        System.out.printf("  Top K:   %d%n", topK);
        System.out.printf("  Metrics: COS, L2, IP%n");
        System.out.printf("  Algos:   IVF, HNSW, DiskANN%n");
        System.out.println();

        List<SearchResult> results = new ArrayList<>();

        try (MongoClient mongoClient = Utils.getMongoClient()) {
            MongoDatabase database = mongoClient.getDatabase(databaseName);
            MongoCollection<Document> collection = database.getCollection(COLLECTION_NAME);

            try {
                // Load data ONCE into the single collection
                System.out.println("  Loading data from: " + dataFile);
                List<Document> data = Utils.readJsonFile(dataFile);
                System.out.printf("  Loaded %d documents%n", data.size());

                // Drop collection if it already exists (clean start)
                if (database.listCollectionNames().into(new ArrayList<>()).contains(COLLECTION_NAME)) {
                    collection.drop();
                    System.out.println("  Dropped existing collection.");
                }
                Utils.insertData(collection, data, 100);

                // Generate ONE embedding for the query (reused for all 9 searches)
                OpenAIClient aiClient = Utils.getOpenAIClient();
                System.out.printf("%n  Generating embedding for: \"%s\"%n", queryText);
                List<Float> queryVector = Utils.getEmbedding(aiClient, queryText, model);
                System.out.printf("  Embedding generated (%d dimensions)%n%n", queryVector.size());

                // Convert to doubles for BSON
                List<Double> vectorAsDoubles = queryVector.stream()
                        .map(Float::doubleValue)
                        .toList();

                // Create all 9 indexes idempotently
                System.out.println("  Creating 9 vector indexes...");
                for (String algo : ALGORITHMS) {
                    for (String metric : METRICS) {
                        createIndex(collection, vectorField, dimensions, algo, metric);
                    }
                }
                System.out.println("  All indexes created.\n");

                // Run searches sequentially for fair timing
                System.out.println("  Running searches...");
                for (String algo : ALGORITHMS) {
                    for (String metric : METRICS) {
                        String indexName = String.format("vector_%s_%s", algo, metric.toLowerCase());

                        long startNs = System.nanoTime();
                        List<Document> searchResults = performSearch(
                                collection, vectorAsDoubles, vectorField, topK);
                        long elapsedNs = System.nanoTime() - startNs;
                        double elapsedMs = elapsedNs / 1_000_000.0;

                        // Extract top result info
                        String topHotel = "-";
                        double topScore = 0.0;
                        if (!searchResults.isEmpty()) {
                            Document top = searchResults.get(0);
                            topHotel = top.getString("HotelName") != null
                                    ? top.getString("HotelName") : "-";
                            topScore = top.getDouble("score") != null
                                    ? top.getDouble("score") : 0.0;
                        }

                        results.add(new SearchResult(
                                algo.toUpperCase(), metric, indexName,
                                elapsedMs, searchResults.size(), topHotel, topScore));

                        if (verbose) {
                            System.out.printf("    [%s] %d results in %.2f ms%n",
                                    indexName, searchResults.size(), elapsedMs);
                            for (int i = 0; i < searchResults.size(); i++) {
                                Document doc = searchResults.get(i);
                                System.out.printf("      %d. %s (%.4f)%n",
                                        i + 1,
                                        doc.getString("HotelName"),
                                        doc.getDouble("score"));
                            }
                        }
                    }
                }
            } finally {
                // Cleanup: always drop the comparison collection
                System.out.println("\n  Cleanup: dropping comparison collection...");
                collection.drop();
                System.out.println("  Cleanup: dropped collection 'hotels'");
            }
        }

        // Print comparison table
        printComparisonTable(results, topK);
    }

    private static void createIndex(MongoCollection<Document> collection,
                                    String vectorField, int dimensions,
                                    String algo, String metric) {
        String indexName = String.format("vector_%s_%s", algo, metric.toLowerCase());

        Document cosmosSearchOptions = new Document()
                .append("dimensions", dimensions)
                .append("similarity", metric);

        switch (algo) {
            case "ivf" -> cosmosSearchOptions
                    .append("kind", "vector-ivf")
                    .append("numLists", 1);
            case "hnsw" -> cosmosSearchOptions
                    .append("kind", "vector-hnsw")
                    .append("m", 16)
                    .append("efConstruction", 64);
            case "diskann" -> cosmosSearchOptions
                    .append("kind", "vector-diskann")
                    .append("maxDegree", 32)
                    .append("lBuild", 50);
        }

        Document indexDefinition = new Document()
                .append("name", indexName)
                .append("key", new Document(vectorField, "cosmosSearch"))
                .append("cosmosSearchOptions", cosmosSearchOptions);

        Document command = new Document("createIndexes", collection.getNamespace().getCollectionName())
                .append("indexes", List.of(indexDefinition));

        try {
            collection.getDatabase().runCommand(command);
        } catch (Exception e) {
            // Idempotent: ignore if index already exists
            if (!e.getMessage().contains("already exists")) {
                throw e;
            }
        }
    }

    private static List<Document> performSearch(MongoCollection<Document> collection,
                                                List<Double> vectorAsDoubles,
                                                String vectorField, int topK) {
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

    private static void printComparisonTable(List<SearchResult> results, int topK) {
        System.out.println();
        System.out.println("  ╔══════════════════════════════════════════════════════════════════════════════════╗");
        System.out.println("  ║                    COMPARISON TABLE — All Algorithms × Metrics                  ║");
        System.out.println("  ╠══════════════════════════════════════════════════════════════════════════════════╣");
        System.out.printf("  ║  %-10s %-8s %-22s %10s %8s %-18s ║%n",
                "ALGO", "METRIC", "INDEX NAME", "LATENCY", "RESULTS", "TOP MATCH");
        System.out.println("  ╠══════════════════════════════════════════════════════════════════════════════════╣");

        for (SearchResult r : results) {
            String topMatch = r.topHotel.length() > 16
                    ? r.topHotel.substring(0, 16) + ".."
                    : r.topHotel;
            System.out.printf("  ║  %-10s %-8s %-22s %8.2f ms %5d    %-18s ║%n",
                    r.algorithm, r.metric, r.indexName,
                    r.latencyMs, r.resultCount, topMatch);
        }

        System.out.println("  ╠══════════════════════════════════════════════════════════════════════════════════╣");

        // Summary stats
        double fastest = results.stream().mapToDouble(r -> r.latencyMs).min().orElse(0);
        double slowest = results.stream().mapToDouble(r -> r.latencyMs).max().orElse(0);
        double avg = results.stream().mapToDouble(r -> r.latencyMs).average().orElse(0);
        String fastestIdx = results.stream()
                .filter(r -> r.latencyMs == fastest)
                .findFirst().map(r -> r.indexName).orElse("-");

        System.out.printf("  ║  Fastest: %-22s (%8.2f ms)                              ║%n", fastestIdx, fastest);
        System.out.printf("  ║  Slowest: %8.2f ms | Average: %8.2f ms | Top K: %-3d                    ║%n", slowest, avg, topK);
        System.out.println("  ╚══════════════════════════════════════════════════════════════════════════════════╝");
        System.out.println();
    }

    private record SearchResult(
            String algorithm,
            String metric,
            String indexName,
            double latencyMs,
            int resultCount,
            String topHotel,
            double topScore) {
    }
}
