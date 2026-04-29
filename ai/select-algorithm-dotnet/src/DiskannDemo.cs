/// DiskANN vector index for Azure DocumentDB.
/// Best for: Datasets with 50,000+ documents.
/// Cluster tier: M30 or higher.
/// Key parameters: maxDegree (graph edges), lBuild (construction quality).

namespace SelectAlgorithm;

using MongoDB.Driver;
using MongoDB.Bson;

public static class DiskannDemo
{
    public static void CreateDiskannIndex(IMongoCollection<BsonDocument> collection, string vectorField, int dimensions, string similarity, int maxDegree = 20, int lBuild = 10)
    {
        Console.WriteLine($"Creating DiskANN vector index on field '{vectorField}'...");

        Utils.DropVectorIndexes(collection, vectorField);

        var command = new BsonDocument
        {
            { "createIndexes", collection.CollectionNamespace.CollectionName },
            { "indexes", new BsonArray
                {
                    new BsonDocument
                    {
                        { "name", $"diskann_index_{vectorField}" },
                        { "key", new BsonDocument(vectorField, "cosmosSearch") },
                        { "cosmosSearchOptions", new BsonDocument
                            {
                                { "kind", "vector-diskann" },
                                { "dimensions", dimensions },
                                { "similarity", similarity },
                                { "maxDegree", maxDegree },
                                { "lBuild", lBuild }
                            }
                        }
                    }
                }
            }
        };

        collection.Database.RunCommand<BsonDocument>(command);
        Console.WriteLine("DiskANN vector index created successfully");
    }

    public static void Run()
    {
        Console.WriteLine(new string('=', 60));
        Console.WriteLine("  DiskANN Vector Index - Select Algorithm Demo");
        Console.WriteLine("  Best for: 50,000+ documents");
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
            var collection = database.GetCollection<BsonDocument>("hotels_diskann");

            var data = Utils.ReadJsonFile(dataFile);
            var documents = data.Where(d => d.Contains(vectorField)).ToList();
            Console.WriteLine($"\nLoaded {documents.Count} documents with embeddings");

            Utils.InsertData(collection, documents, batchSize);

            CreateDiskannIndex(collection, vectorField, dimensions, similarity);
            Console.WriteLine("Waiting for index to build...");
            Thread.Sleep(5000);

            var query = "quintessential lodging near running trails, eateries, retail";
            var results = Utils.PerformVectorSearch(collection, embeddingClient, query, vectorField, model);
            Utils.PrintSearchResults(results, "DiskANN");
        }
        finally
        {
            mongoClient.Cluster.Dispose();
        }
    }
}
