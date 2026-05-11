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
        int topK = Integer.parseInt(Utils.getEnv("TOP_K", "5"));

        String databaseName = Utils.getEnv("AZURE_DOCUMENTDB_DATABASENAME", "Hotels");
        String dataFile = Utils.getEnv("DATA_FILE_WITH_VECTORS", "data/Hotels_Vector.json");
        String vectorField = Utils.getEnv("EMBEDDED_FIELD", "DescriptionVector");
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

            // Load data ONCE into the single collection
            System.out.println("  Loading data from: " + dataFile);
            List<Document> data = Utils.readJsonFile(dataFile);
            System.out.printf("  Loaded %d documents%n", data.size());

            collection.drop();
            System.out.println("  Collection reset.");
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

            // Run 9 algorithm × metric combinations sequentially (create→search→drop)
            // DocumentDB does not allow multiple vector indexes of the same kind
            // on the same field path simultaneously.
            System.out.println("  Running 9 algorithm × metric combinations...\n");
            for (String algo : ALGORITHMS) {
                for (String metric : METRICS) {
                    String indexName = String.format("vector_%s_%s", algo, metric.toLowerCase());

                    // 1. Drop all existing vector indexes
                    dropVectorIndexes(collection, vectorField);

                    // 2. Create this specific index
                    createIndex(database, collection, vectorField, dimensions, algo, metric);
                    System.out.printf("  ✓ %s created%n", indexName);

                    // 3. Wait for index to build
                    try { Thread.sleep(5000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }

                    // 4. Search
                    List<Document> searchResults = performSearch(
                            collection, vectorAsDoubles, vectorField, topK);

                    // 5. Extract top 2 results
                    String top1Name = "-"; double top1Score = 0.0;
                    String top2Name = "-"; double top2Score = 0.0;
                    if (!searchResults.isEmpty()) {
                        Document top1 = searchResults.get(0);
                        top1Name = top1.getString("HotelName") != null ? top1.getString("HotelName") : "-";
                        top1Score = top1.getDouble("score") != null ? top1.getDouble("score") : 0.0;
                    }
                    if (searchResults.size() > 1) {
                        Document top2 = searchResults.get(1);
                        top2Name = top2.getString("HotelName") != null ? top2.getString("HotelName") : "-";
                        top2Score = top2.getDouble("score") != null ? top2.getDouble("score") : 0.0;
                    }
                    results.add(new SearchResult(algo.toUpperCase(), metric, top1Name, top1Score, top2Name, top2Score));
                }
            }

            // Cleanup: drop the comparison collection
            System.out.println("\n  Cleanup: dropping comparison collection...");
            collection.drop();
            System.out.println("  Cleanup: dropped collection 'hotels'");
        }

        // Print comparison table
        printComparisonTable(results);
    }

    private static void dropVectorIndexes(MongoCollection<Document> collection, String vectorField) {
        for (Document idx : collection.listIndexes()) {
            String name = idx.getString("name");
            Document key = idx.get("key", Document.class);
            if (key != null && "cosmosSearch".equals(key.getString(vectorField))) {
                try {
                    collection.dropIndex(name);
                } catch (Exception e) {
                    // Ignore if index doesn't exist
                }
            }
        }
    }

    private static void createIndex(MongoDatabase database, MongoCollection<Document> collection,
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
            database.runCommand(command);
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

    private static void printComparisonTable(List<SearchResult> results) {
        System.out.println("┌──────────┬────────┬────────────────────────────┬────────┬────────────────────────────┬────────┬───────┐");
        System.out.printf("│ %-9s│ %-7s│ %-27s│ %-7s│ %-27s│ %-7s│ %-6s│%n",
                "Algorithm", "Metric", "Top 1 Result", "Score", "Top 2 Result", "Score", "Diff");
        System.out.println("├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤");

        for (int i = 0; i < results.size(); i++) {
            SearchResult r = results.get(i);
            double diff = Math.abs(r.top1Score() - r.top2Score());
            String top1Display = r.top1Name().length() > 27 ? r.top1Name().substring(0, 24) + "..." : r.top1Name();
            String top2Display = r.top2Name().length() > 27 ? r.top2Name().substring(0, 24) + "..." : r.top2Name();
            System.out.printf("│ %-9s│ %-7s│ %-27s│ %-7.4f│ %-27s│ %-7.4f│ %-6.4f│%n",
                    r.algorithm(), r.metric(), top1Display, r.top1Score(), top2Display, r.top2Score(), diff);
            if (i < results.size() - 1) {
                System.out.println("├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤");
            }
        }
        System.out.println("└──────────┴────────┴────────────────────────────┴────────┴────────────────────────────┴────────┴───────┘");
    }

    private record SearchResult(
            String algorithm,
            String metric,
            String top1Name,
            double top1Score,
            String top2Name,
            double top2Score) {
    }
}
