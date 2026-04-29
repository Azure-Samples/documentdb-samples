/// HNSW (Hierarchical Navigable Small World) vector index for Azure DocumentDB.
/// Best for: Datasets between 10,000 and 50,000 documents.
/// Cluster tier: M30 or higher.
/// Key parameters: m (graph connectivity), efConstruction (build quality).

namespace SelectAlgorithm;

using MongoDB.Driver;
using MongoDB.Bson;

public static class HnswDemo
{
    public static void CreateHnswIndex(IMongoCollection<BsonDocument> collection, string vectorField, int dimensions, string similarity, int m = 16, int efConstruction = 64)
    {
        Console.WriteLine($"Creating HNSW vector index on field '{vectorField}'...");

        Utils.DropVectorIndexes(collection, vectorField);

        var command = new BsonDocument
        {
            { "createIndexes", collection.CollectionNamespace.CollectionName },
            { "indexes", new BsonArray
                {
                    new BsonDocument
                    {
                        { "name", $"hnsw_index_{vectorField}" },
                        { "key", new BsonDocument(vectorField, "cosmosSearch") },
                        { "cosmosSearchOptions", new BsonDocument
                            {
                                { "kind", "vector-hnsw" },
                                { "dimensions", dimensions },
                                { "similarity", similarity },
                                { "m", m },
                                { "efConstruction", efConstruction }
                            }
                        }
                    }
                }
            }
        };

        collection.Database.RunCommand<BsonDocument>(command);
        Console.WriteLine("HNSW vector index created successfully");
    }

    public static void Run()
    {
        Console.WriteLine(new string('=', 60));
        Console.WriteLine("  HNSW Vector Index - Select Algorithm Demo");
        Console.WriteLine("  Best for: 10,000 - 50,000 documents");
        Console.WriteLine(new string('=', 60));

        var databaseName = Environment.GetEnvironmentVariable("AZURE_DOCUMENTDB_DATABASENAME") ?? "Hotels";
        var dataFile = Environment.GetEnvironmentVariable("DATA_FILE_WITH_VECTORS") ?? "../../data/Hotels_Vector.json";
        var vectorField = Environment.GetEnvironmentVariable("EMBEDDED_FIELD") ?? "DescriptionVector";
        var model = Environment.GetEnvironmentVariable("AZURE_OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small";
        var dimensions = int.Parse(Environment.GetEnvironmentVariable("EMBEDDING_DIMENSIONS") ?? "1536");
        var batchSize = int.Parse(Environment.GetEnvironmentVariable("LOAD_SIZE_BATCH") ?? "100");
        var similarity = Environment.GetEnvironmentVariable("SIMILARITY") ?? "COS";

        var mongoClient = Utils.GetMongoClientPasswordless();
        var embeddingClient = Utils.GetEmbeddingClient();

        try
        {
            var database = mongoClient.GetDatabase(databaseName);
            var collection = database.GetCollection<BsonDocument>("hotels_hnsw");

            var data = Utils.ReadJsonFile(dataFile);
            var documents = data.Where(d => d.Contains(vectorField)).ToList();
            Console.WriteLine($"\nLoaded {documents.Count} documents with embeddings");

            Utils.InsertData(collection, documents, batchSize);

            CreateHnswIndex(collection, vectorField, dimensions, similarity);
            Console.WriteLine("Waiting for index to build...");
            Thread.Sleep(5000);

            var query = "quintessential lodging near running trails, eateries, retail";
            var results = Utils.PerformVectorSearch(collection, embeddingClient, query, vectorField, model);
            Utils.PrintSearchResults(results, "HNSW");
        }
        finally
        {
            mongoClient.Cluster.Dispose();
        }
    }
}
