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

    public static void Run(Models.AppConfiguration config)
    {
        Console.WriteLine(new string('=', 60));
        Console.WriteLine("  HNSW Vector Index - Select Algorithm Demo");
        Console.WriteLine("  Best for: 10,000 - 50,000 documents");
        Console.WriteLine(new string('=', 60));

        var databaseName = config.DocumentDB.DatabaseName;
        var dataFile = config.DataFiles.WithVectors;
        var vectorField = config.Embedding.EmbeddedField;
        var model = config.AzureOpenAI.EmbeddingModel;
        var dimensions = config.Embedding.Dimensions;
        var batchSize = config.DocumentDB.LoadBatchSize;
        var similarity = config.VectorSearch.Similarity;

        var mongoClient = Utils.GetMongoClientPasswordless(config);
        var embeddingClient = Utils.GetEmbeddingClient(config);

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
