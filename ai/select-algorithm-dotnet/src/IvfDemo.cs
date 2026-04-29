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

    public static void Run(Models.AppConfiguration config)
    {
        Console.WriteLine(new string('=', 60));
        Console.WriteLine("  IVF Vector Index - Select Algorithm Demo");
        Console.WriteLine("  Best for: < 10,000 documents");
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
