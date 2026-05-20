/// Unified comparison runner for all 9 combinations (3 algorithms × 3 similarity metrics).
/// Executes vector searches sequentially for fair timing and prints a formatted comparison table.

namespace SelectAlgorithm;

using MongoDB.Driver;
using MongoDB.Bson;
using OpenAI.Embeddings;
using SelectAlgorithm.Models;

public static class CompareAll
{
    private record IndexConfig(string Name, string Kind, string Similarity, BsonDocument ExtraParams);

    private record SearchResult(string Algorithm, string Metric, string Top1Name, double Top1Score, string Top2Name, double Top2Score);

    private static string GetAlgoDisplay(string kind) => kind switch
    {
        "vector-ivf" => "IVF",
        "vector-hnsw" => "HNSW",
        "vector-diskann" => "DiskANN",
        _ => kind
    };

    public static void Run(AppConfiguration appConfig)
    {
        Console.WriteLine(new string('=', 60));
        Console.WriteLine("  Compare All Algorithms × Metrics");
        Console.WriteLine("  9 combinations: IVF, HNSW, DiskANN × COS, L2, IP");
        Console.WriteLine(new string('=', 60));

        // Use config values with env var overrides for compare-specific settings
        var databaseName = appConfig.MongoDB.DatabaseName;
        var dataFile = appConfig.DataFiles.WithVectors;
        var vectorField = appConfig.Embedding.EmbeddedField;
        var dimensions = appConfig.Embedding.Dimensions;
        var batchSize = appConfig.MongoDB.LoadBatchSize;
        var queryText = Environment.GetEnvironmentVariable("QUERY_TEXT") ?? "luxury hotel near the beach";
        var topK = int.Parse(Environment.GetEnvironmentVariable("TOP_K") ?? "5");

        var mongoClient = Utils.GetMongoClientPasswordless(appConfig);
        var embeddingClient = Utils.GetEmbeddingClient(appConfig);

        try
        {
            var database = mongoClient.GetDatabase(databaseName);

            // Drop collection for a clean comparison
            database.DropCollection("hotels");
            Console.WriteLine("Dropped existing 'hotels' collection (if any)");

            var collection = database.GetCollection<BsonDocument>("hotels");

            // Load data once into single collection
            var data = Utils.ReadJsonFile(dataFile);
            var documents = data.Where(d => d.Contains(vectorField)).ToList();
            Console.WriteLine($"\nLoaded {documents.Count} documents with embeddings");
            Utils.InsertData(collection, documents, batchSize);

            // Generate ONE embedding for the query (reused for all 9 searches)
            Console.WriteLine($"\nQuery: \"{queryText}\"");
            Console.WriteLine($"Top K: {topK}");
            var embeddingResult = embeddingClient.GenerateEmbedding(queryText);
            var queryVector = embeddingResult.Value.ToFloats().ToArray();
            Console.WriteLine("Embedding generated (reused for all searches)\n");

            // Define 9 index configurations
            var configs = BuildIndexConfigs(dimensions);

            // Run each config sequentially: drop→create→wait→search
            // DocumentDB doesn't allow multiple vector indexes of the same kind on the same field
            Console.WriteLine("Running 9 algorithm × metric combinations...\n");
            var results = new List<SearchResult>();
            foreach (var config in configs)
            {
                // 1. Drop all existing vector indexes
                DropVectorIndexes(collection, vectorField);

                // 2. Create this specific index
                CreateIndex(collection, vectorField, config);
                Console.WriteLine($"  ✓ {config.Name} created");

                // 3. Search with retries while the index becomes available
                var searchResults = RunVectorSearchWithRetry(collection, queryVector, vectorField, config.Name, topK);
                if (searchResults.Count == 0)
                {
                    results.Add(new SearchResult(GetAlgoDisplay(config.Kind), config.Similarity, "(failed)", 0.0, "(failed)", 0.0));
                    continue;
                }

                // 4. Extract top 2 results and record
                var algoDisplay = GetAlgoDisplay(config.Kind);
                var top1Name = "-"; var top1Score = 0.0;
                var top2Name = "-"; var top2Score = 0.0;
                if (searchResults.Count > 0)
                {
                    var doc1 = searchResults[0];
                    top1Name = doc1.Contains("HotelName") ? doc1["HotelName"].AsString : "Unknown";
                    top1Score = doc1.Contains("score") ? doc1["score"].ToDouble() : 0.0;
                }
                if (searchResults.Count > 1)
                {
                    var doc2 = searchResults[1];
                    top2Name = doc2.Contains("HotelName") ? doc2["HotelName"].AsString : "Unknown";
                    top2Score = doc2.Contains("score") ? doc2["score"].ToDouble() : 0.0;
                }
                results.Add(new SearchResult(algoDisplay, config.Similarity, top1Name, top1Score, top2Name, top2Score));
            }

            // Print comparison table
            PrintComparisonTable(results);
        }
        finally
        {
            // Cleanup: drop the comparison collection
            try
            {
                var database = mongoClient.GetDatabase(databaseName);
                database.DropCollection("hotels");
                Console.WriteLine("\nCleanup: dropped collection 'hotels'");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Cleanup warning: {ex.Message}");
            }
            mongoClient.Cluster.Dispose();
        }
    }

    private static List<IndexConfig> BuildIndexConfigs(int dimensions)
    {
        string[] metrics = ["COS", "L2", "IP"];
        var configs = new List<IndexConfig>();

        // IVF
        foreach (var metric in metrics)
            configs.Add(new IndexConfig($"vector_ivf_{metric.ToLower()}", "vector-ivf", metric, new BsonDocument { { "numLists", 1 } }));

        // HNSW
        foreach (var metric in metrics)
            configs.Add(new IndexConfig($"vector_hnsw_{metric.ToLower()}", "vector-hnsw", metric, new BsonDocument { { "m", 16 }, { "efConstruction", 64 } }));

        // DiskANN
        foreach (var metric in metrics)
            configs.Add(new IndexConfig($"vector_diskann_{metric.ToLower()}", "vector-diskann", metric, new BsonDocument { { "maxDegree", 32 }, { "lBuild", 50 } }));

        return configs;
    }

    private static void DropVectorIndexes(IMongoCollection<BsonDocument> collection, string vectorField)
    {
        try
        {
            using var cursor = collection.Indexes.List();
            foreach (var idx in cursor.ToList())
            {
                var name = idx.GetValue("name", "").AsString;
                var key = idx.GetValue("key", new BsonDocument()).AsBsonDocument;
                if (key.Contains(vectorField) && key[vectorField].AsString == "cosmosSearch")
                {
                    try { collection.Indexes.DropOne(name); } catch { }
                }
            }
        }
        catch { }
    }

    private static void CreateIndex(IMongoCollection<BsonDocument> collection, string vectorField, IndexConfig config)
    {
        // Drop existing index with same name if present
        try
        {
            collection.Indexes.DropOne(config.Name);
        }
        catch (MongoCommandException)
        {
            // Index doesn't exist, that's fine
        }

        var cosmosSearchOptions = new BsonDocument
        {
            { "kind", config.Kind },
            { "dimensions", int.Parse(Environment.GetEnvironmentVariable("EMBEDDING_DIMENSIONS") ?? "1536") },
            { "similarity", config.Similarity }
        };

        foreach (var param in config.ExtraParams)
        {
            cosmosSearchOptions.Add(param);
        }

        var command = new BsonDocument
        {
            { "createIndexes", collection.CollectionNamespace.CollectionName },
            { "indexes", new BsonArray
                {
                    new BsonDocument
                    {
                        { "name", config.Name },
                        { "key", new BsonDocument(vectorField, "cosmosSearch") },
                        { "cosmosSearchOptions", cosmosSearchOptions }
                    }
                }
            }
        };

        try
        {
            collection.Database.RunCommand<BsonDocument>(command);
        }
        catch (MongoCommandException ex) when (ex.Message.Contains("already exists"))
        {
            // Index already exists with same config — idempotent
        }
    }

    private static List<BsonDocument> RunVectorSearch(
        IMongoCollection<BsonDocument> collection,
        float[] queryVector,
        string vectorField,
        string indexName,
        int topK)
    {
        var pipeline = new[]
        {
            new BsonDocument("$search", new BsonDocument("cosmosSearch", new BsonDocument
            {
                { "vector", new BsonArray(queryVector.Select(f => (double)f)) },
                { "path", vectorField },
                { "k", topK }
            })),
            new BsonDocument("$project", new BsonDocument
            {
                { "HotelName", 1 },
                { "score", new BsonDocument("$meta", "searchScore") }
            })
        };

        return collection.Aggregate<BsonDocument>(pipeline).ToList();
    }

    private static List<BsonDocument> RunVectorSearchWithRetry(
        IMongoCollection<BsonDocument> collection,
        float[] queryVector,
        string vectorField,
        string indexName,
        int topK)
    {
        const int maxRetries = 5;
        const int retryDelayMs = 2000;

        for (var attempt = 0; attempt <= maxRetries; attempt++)
        {
            var results = RunVectorSearch(collection, queryVector, vectorField, indexName, topK);
            if (results.Count > 0)
            {
                return results;
            }

            if (attempt < maxRetries)
            {
                Console.WriteLine($"  No results for {indexName} yet. Retrying in 2 seconds ({attempt + 1}/{maxRetries})...");
                Thread.Sleep(retryDelayMs);
            }
        }

        Console.WriteLine($"  Search for {indexName} did not return results after {maxRetries} retries. Recording as failed.");
        return [];
    }

    private static void PrintComparisonTable(List<SearchResult> results)
    {
        Console.WriteLine();
        Console.WriteLine("┌──────────┬────────┬────────────────────────────┬────────┬────────────────────────────┬────────┬───────┐");
        Console.WriteLine($"│ {"Algorithm",-9}│ {"Metric",-7}│ {"Top 1 Result",-27}│ {"Score",-7}│ {"Top 2 Result",-27}│ {"Score",-7}│ {"Diff",-6}│");
        Console.WriteLine("├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤");

        for (var i = 0; i < results.Count; i++)
        {
            var r = results[i];
            var diff = Math.Abs(r.Top1Score - r.Top2Score);
            var top1Display = r.Top1Name.Length > 27 ? r.Top1Name[..24] + "..." : r.Top1Name;
            var top2Display = r.Top2Name.Length > 27 ? r.Top2Name[..24] + "..." : r.Top2Name;
            Console.WriteLine($"│ {r.Algorithm,-9}│ {r.Metric,-7}│ {top1Display,-27}│ {r.Top1Score,-7:F4}│ {top2Display,-27}│ {r.Top2Score,-7:F4}│ {diff,-6:F4}│");
            if (i < results.Count - 1)
                Console.WriteLine("├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤");
        }
        Console.WriteLine("└──────────┴────────┴────────────────────────────┴────────┴────────────────────────────┴────────┴───────┘");
    }
}
