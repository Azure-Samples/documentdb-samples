/// IVF (Inverted File) vector index for Azure DocumentDB.
/// Best for: Datasets with fewer than 10,000 documents.
/// Cluster tier: M10 or higher.
/// Key parameters: numLists (cluster count).

namespace SelectAlgorithm;

using MongoDB.Driver;
using MongoDB.Bson;

public static class IvfDemo
{
    public static void CreateIvfIndex(IMongoCollection<BsonDocument> collection, string vectorField, int dimensions, string similarity, int numLists = 10)
    {
        Console.WriteLine($"Creating IVF vector index on field '{vectorField}'...");

        Utils.DropVectorIndexes(collection, vectorField);

        var command = new BsonDocument
        {
            { "createIndexes", collection.CollectionNamespace.CollectionName },
            { "indexes", new BsonArray
                {
                    new BsonDocument
                    {
                        { "name", $"ivf_index_{vectorField}" },
                        { "key", new BsonDocument(vectorField, "cosmosSearch") },
                        { "cosmosSearchOptions", new BsonDocument
                            {
                                { "kind", "vector-ivf" },
                                { "dimensions", dimensions },
                                { "similarity", similarity },
                                { "numLists", numLists }
                            }
                        }
                    }
                }
            }
        };

        collection.Database.RunCommand<BsonDocument>(command);
        Console.WriteLine("IVF vector index created successfully");
    }

    public static void Run()
    {
        Console.WriteLine(new string('=', 60));
        Console.WriteLine("  IVF Vector Index - Select Algorithm Demo");
        Console.WriteLine("  Best for: < 10,000 documents");
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
            var collection = database.GetCollection<BsonDocument>("hotels_ivf");

            var data = Utils.ReadJsonFile(dataFile);
            var documents = data.Where(d => d.Contains(vectorField)).ToList();
            Console.WriteLine($"\nLoaded {documents.Count} documents with embeddings");

            Utils.InsertData(collection, documents, batchSize);

            CreateIvfIndex(collection, vectorField, dimensions, similarity);
            Console.WriteLine("Waiting for index to build...");
            Thread.Sleep(3000);

            var query = "quintessential lodging near running trails, eateries, retail";
            var results = Utils.PerformVectorSearch(collection, embeddingClient, query, vectorField, model);
            Utils.PrintSearchResults(results, "IVF");
        }
        finally
        {
            mongoClient.Cluster.Dispose();
        }
    }
}
