/// Unified comparison runner for all 9 combinations (3 algorithms × 3 similarity metrics).
/// Executes vector searches sequentially for fair timing and prints a formatted comparison table.

namespace SelectAlgorithm;

using System.Diagnostics;
using MongoDB.Driver;
using MongoDB.Bson;
using OpenAI.Embeddings;

public static class CompareAll
{
    private record IndexConfig(string Name, string Kind, string Similarity, BsonDocument ExtraParams);

    private record SearchResult(string IndexName, string Algorithm, string Metric, long LatencyMs, List<BsonDocument> Results);

    public static void Run()
    {
        Console.WriteLine(new string('=', 60));
        Console.WriteLine("  Compare All Algorithms × Metrics");
        Console.WriteLine("  9 combinations: IVF, HNSW, DiskANN × COS, L2, IP");
        Console.WriteLine(new string('=', 60));

        var databaseName = Environment.GetEnvironmentVariable("AZURE_DOCUMENTDB_DATABASENAME") ?? "Hotels";
        var dataFile = Environment.GetEnvironmentVariable("DATA_FILE_WITH_VECTORS") ?? "../../data/Hotels_Vector.json";
        var vectorField = Environment.GetEnvironmentVariable("EMBEDDED_FIELD") ?? "DescriptionVector";
        var dimensions = int.Parse(Environment.GetEnvironmentVariable("EMBEDDING_DIMENSIONS") ?? "1536");
        var batchSize = int.Parse(Environment.GetEnvironmentVariable("LOAD_SIZE_BATCH") ?? "100");
        var queryText = Environment.GetEnvironmentVariable("QUERY_TEXT") ?? "luxury hotel near the beach";
        var topK = int.Parse(Environment.GetEnvironmentVariable("TOP_K") ?? "3");
        var verbose = (Environment.GetEnvironmentVariable("VERBOSE") ?? "false").Equals("true", StringComparison.OrdinalIgnoreCase);

        var mongoClient = Utils.GetMongoClientPasswordless();
        var embeddingClient = Utils.GetEmbeddingClient();

        try
        {
            var database = mongoClient.GetDatabase(databaseName);

            // Drop collection if it already exists (clean start)
            var collectionNames = database.ListCollectionNames().ToList();
            if (collectionNames.Contains("hotels"))
            {
                database.DropCollection("hotels");
                Console.WriteLine("Dropped existing 'hotels' collection.");
            }

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

            // Create all 9 indexes (idempotent)
            Console.WriteLine("Creating 9 vector indexes...");
            foreach (var config in configs)
            {
                CreateIndex(collection, vectorField, config);
            }
            Console.WriteLine("Waiting for indexes to build...");
            Thread.Sleep(5000);

            // Run searches sequentially for fair timing
            Console.WriteLine("\nRunning searches...\n");
            var results = new List<SearchResult>();
            foreach (var config in configs)
            {
                var sw = Stopwatch.StartNew();
                var searchResults = RunVectorSearch(collection, queryVector, vectorField, config.Name, topK);
                sw.Stop();

                results.Add(new SearchResult(config.Name, config.Kind, config.Similarity, sw.ElapsedMilliseconds, searchResults));

                if (verbose)
                {
                    Console.WriteLine($"  {config.Name}: {sw.ElapsedMilliseconds}ms ({searchResults.Count} results)");
                }
            }

            // Print comparison table
            PrintComparisonTable(results, verbose);
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

        foreach (var metric in metrics)
        {
            configs.Add(new IndexConfig(
                $"vector_ivf_{metric.ToLower()}",
                "vector-ivf",
                metric,
                new BsonDocument { { "numLists", 1 } }
            ));

            configs.Add(new IndexConfig(
                $"vector_hnsw_{metric.ToLower()}",
                "vector-hnsw",
                metric,
                new BsonDocument { { "m", 16 }, { "efConstruction", 64 } }
            ));

            configs.Add(new IndexConfig(
                $"vector_diskann_{metric.ToLower()}",
                "vector-diskann",
                metric,
                new BsonDocument { { "maxDegree", 32 }, { "lBuild", 50 } }
            ));
        }

        return configs;
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

    private static void PrintComparisonTable(List<SearchResult> results, bool verbose)
    {
        Console.WriteLine();
        Console.WriteLine(new string('=', 78));
        Console.WriteLine("  COMPARISON RESULTS");
        Console.WriteLine(new string('=', 78));
        Console.WriteLine();

        // Header
        var header = "Index Name".PadRight(24) +
                     "Algorithm".PadRight(14) +
                     "Metric".PadRight(8) +
                     "Latency".PadRight(10) +
                     "Top Result".PadRight(22);
        Console.WriteLine(header);
        Console.WriteLine(new string('-', 78));

        foreach (var result in results)
        {
            var topResult = "—";
            var topScore = "";
            if (result.Results.Count > 0)
            {
                var doc = result.Results[0];
                topResult = doc.Contains("HotelName") ? doc["HotelName"].AsString : "Unknown";
                if (topResult.Length > 18) topResult = topResult[..18] + "...";
                var score = doc.Contains("score") ? doc["score"].ToDouble() : 0.0;
                topScore = $" ({score:F3})";
            }

            var algoDisplay = result.Algorithm.Replace("vector-", "").ToUpper();
            var row = result.IndexName.PadRight(24) +
                      algoDisplay.PadRight(14) +
                      result.Metric.PadRight(8) +
                      $"{result.LatencyMs}ms".PadRight(10) +
                      $"{topResult}{topScore}";
            Console.WriteLine(row);
        }

        Console.WriteLine(new string('-', 78));
        Console.WriteLine();

        // Summary stats
        var fastest = results.MinBy(r => r.LatencyMs)!;
        var slowest = results.MaxBy(r => r.LatencyMs)!;
        Console.WriteLine($"  Fastest: {fastest.IndexName} ({fastest.LatencyMs}ms)");
        Console.WriteLine($"  Slowest: {slowest.IndexName} ({slowest.LatencyMs}ms)");
        Console.WriteLine();

        if (verbose)
        {
            Console.WriteLine("  DETAILED RESULTS:");
            Console.WriteLine();
            foreach (var result in results)
            {
                Console.WriteLine($"  [{result.IndexName}]");
                for (var i = 0; i < result.Results.Count; i++)
                {
                    var doc = result.Results[i];
                    var name = doc.Contains("HotelName") ? doc["HotelName"].AsString : "Unknown";
                    var score = doc.Contains("score") ? doc["score"].ToDouble() : 0.0;
                    Console.WriteLine($"    {i + 1}. {name} (score: {score:F4})");
                }
                Console.WriteLine();
            }
        }
    }
}
