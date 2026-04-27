package com.azure.documentdb.selectalgorithm;

import com.azure.ai.openai.OpenAIClient;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import com.mongodb.client.model.Indexes;
import org.bson.Document;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class SelectAlgorithm {
    private static final String SAMPLE_QUERY = "quintessential lodging near running trails, eateries, retail";
    private static final String DATABASE_NAME = "Hotels";


    public static void main(String[] args) {
        Utils.loadEnv();
        new SelectAlgorithm().run();
        System.exit(0);
    }

    public void run() {
        try (var mongoClient = Utils.createMongoClient()) {
            var openAIClient = Utils.createOpenAIClient();

            var algorithmParam = Utils.getEnv("ALGORITHM", "all").toLowerCase();
            var similarityParam = Utils.getEnv("SIMILARITY", "COS").toUpperCase();

            var algorithms = getAlgorithms(algorithmParam);
            var similarities = getSimilarities(similarityParam);

            System.out.println("Testing algorithms: " + algorithms);
            System.out.println("Testing similarity functions: " + similarities);
            System.out.println();

            var results = new ArrayList<Map<String, Object>>();
            var database = mongoClient.getDatabase(DATABASE_NAME);

            for (var algorithm : algorithms) {
                for (var similarity : similarities) {
                    var result = testConfiguration(database, openAIClient, algorithm, similarity);
                    results.add(result);
                }
            }

            Utils.printComparisonTable(results);

        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
        }
    }

    private List<String> getAlgorithms(String param) {
        if ("all".equals(param)) {
            return List.of("diskann", "hnsw", "ivf");
        }
        return List.of(param);
    }

    private List<String> getSimilarities(String param) {
        if ("all".equalsIgnoreCase(param)) {
            return List.of("COS", "L2", "IP");
        }
        return List.of(param);
    }

    private Map<String, Object> testConfiguration(MongoDatabase database, OpenAIClient openAIClient,
                                                   String algorithm, String similarity) {
        System.out.println("Testing " + algorithm.toUpperCase() + " with " + similarity + " similarity...");

        var collectionName = "hotels_" + algorithm.toLowerCase() + "_" + similarity.toLowerCase();
        var vectorIndexName = "vectorIndex_" + algorithm.toLowerCase() + "_" + similarity.toLowerCase();

        try {
            var collection = database.getCollection(collectionName, Document.class);
            collection.drop();
            database.createCollection(collectionName);
            System.out.println("  Created collection: " + collectionName);

            var hotelData = Utils.loadHotelData();
            insertDataInBatches(collection, hotelData);

            createStandardIndexes(collection);
            createVectorIndex(database, collectionName, vectorIndexName, algorithm, similarity);

            var queryEmbedding = Utils.createEmbedding(openAIClient, SAMPLE_QUERY);
            var searchResult = executeVectorSearch(collection, queryEmbedding, algorithm);

            System.out.println("  Latency: " + String.format("%.2f", searchResult.latencyMs) + " ms");
            System.out.println("  Results: " + searchResult.results.size());
            for (var doc : searchResult.results) {
                System.out.println("    - " + doc.getString("HotelName") + " (score: " + String.format("%.4f", doc.getDouble("score")) + ")");
            }
            System.out.println();

            var result = new HashMap<String, Object>();
            result.put("algorithm", algorithm.toUpperCase());
            result.put("similarity", similarity);
            result.put("latency", searchResult.latencyMs);
            return result;

        } catch (Exception e) {
            System.err.println("  Error testing " + algorithm + " with " + similarity + ": " + e.getMessage());
            var result = new HashMap<String, Object>();
            result.put("algorithm", algorithm.toUpperCase());
            result.put("similarity", similarity);
            result.put("latency", -1.0);
            return result;
        }
    }

    private void insertDataInBatches(MongoCollection<Document> collection, List<Map<String, Object>> hotelData) {
        var batchSizeStr = Utils.getEnv("LOAD_SIZE_BATCH");
        var batchSize = batchSizeStr != null ? Integer.parseInt(batchSizeStr) : 100;
        var batches = Utils.partitionList(hotelData, batchSize);

        System.out.println("  Loading data in batches of " + batchSize + "...");

        for (int i = 0; i < batches.size(); i++) {
            var batch = batches.get(i);
            var documents = batch.stream()
                .map(Document::new)
                .toList();

            collection.insertMany(documents);
            if ((i + 1) % 10 == 0 || (i + 1) == batches.size()) {
                System.out.println("    Loaded " + ((i + 1) * batchSize) + " documents");
            }
        }
    }

    private void createStandardIndexes(MongoCollection<Document> collection) {
        collection.createIndex(Indexes.ascending("HotelId"));
        collection.createIndex(Indexes.ascending("Category"));
        collection.createIndex(Indexes.ascending("Description"));
        collection.createIndex(Indexes.ascending("Description_fr"));
    }

    private void createVectorIndex(MongoDatabase database, String collectionName, String indexName,
                                   String algorithm, String similarity) {
        var embeddedField = Utils.getEnv("EMBEDDED_FIELD");
        var cosmosSearchOptions = Utils.createVectorIndexOptions(algorithm, similarity);

        var indexDefinition = new Document()
            .append("createIndexes", collectionName)
            .append("indexes", List.of(
                new Document()
                    .append("name", indexName)
                    .append("key", new Document(embeddedField, "cosmosSearch"))
                    .append("cosmosSearchOptions", cosmosSearchOptions)
            ));

        database.runCommand(indexDefinition);
        System.out.println("  Created vector index: " + indexName);
    }

    private static class SearchResult {
        double latencyMs;
        List<Document> results;

        SearchResult(double latencyMs, List<Document> results) {
            this.latencyMs = latencyMs;
            this.results = results;
        }
    }

    private SearchResult executeVectorSearch(MongoCollection<Document> collection, List<Double> queryEmbedding,
                                             String algorithm) {
        var embeddedField = Utils.getEnv("EMBEDDED_FIELD");
        var searchOptions = Utils.createSearchOptions(algorithm);

        var cosmosSearch = new Document()
            .append("vector", queryEmbedding)
            .append("path", embeddedField)
            .append("k", 5);

        if (!searchOptions.isEmpty()) {
            cosmosSearch.putAll(searchOptions);
        }

        var searchStage = new Document("$search", new Document()
            .append("cosmosSearch", cosmosSearch)
        );

        var projectStage = new Document("$project", new Document()
            .append("score", new Document("$meta", "searchScore"))
            .append("HotelName", 1)
        );

        var pipeline = List.of(searchStage, projectStage);

        var startTime = System.nanoTime();
        var results = collection.aggregate(pipeline).into(new java.util.ArrayList<>());
        var endTime = System.nanoTime();

        var latencyMs = (endTime - startTime) / 1_000_000.0;
        return new SearchResult(latencyMs, results);
    }
}
