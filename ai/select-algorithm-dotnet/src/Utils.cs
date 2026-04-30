using MongoDB.Driver;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using Azure.Identity;
using Azure.AI.OpenAI;
using OpenAI.Embeddings;
using SelectAlgorithm.Models;

namespace SelectAlgorithm;

public static class Utils
{
    public static IMongoClient GetMongoClientPasswordless(AppConfiguration config)
    {
        var clusterName = config.DocumentDB.ClusterName;
        if (string.IsNullOrEmpty(clusterName))
            throw new InvalidOperationException("DocumentDB:ClusterName is required in appsettings.json");

        var credential = new DefaultAzureCredential();

        var connectionString = $"mongodb+srv://{clusterName}.global.mongocluster.cosmos.azure.com/";
        var settings = MongoClientSettings.FromConnectionString(connectionString);
        settings.ConnectTimeout = TimeSpan.FromSeconds(120);
        settings.UseTls = true;
        settings.RetryWrites = true;
        settings.Credential = MongoCredential.CreateOidcCredential("azure", null)
            .WithMechanismProperty("ENVIRONMENT", "azure");

        return new MongoClient(settings);
    }

    public static EmbeddingClient GetEmbeddingClient(AppConfiguration config)
    {
        var endpoint = config.AzureOpenAI.Endpoint;
        if (string.IsNullOrEmpty(endpoint))
            throw new InvalidOperationException("AzureOpenAI:Endpoint is required in appsettings.json");

        var model = config.AzureOpenAI.EmbeddingModel;

        var credential = new DefaultAzureCredential();
        var azureClient = new AzureOpenAIClient(new Uri(endpoint), credential);
        return azureClient.GetEmbeddingClient(model);
    }

    public static List<BsonDocument> ReadJsonFile(string path)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException($"Data file not found: {path}");

        var json = File.ReadAllText(path);
        return BsonSerializer.Deserialize<List<BsonDocument>>(json);
    }

    public static void InsertData(IMongoCollection<BsonDocument> collection, List<BsonDocument> data, int batchSize)
    {
        var totalDocuments = data.Count;
        var existingCount = collection.CountDocuments(new BsonDocument());

        if (existingCount >= totalDocuments)
        {
            Console.WriteLine($"Collection already has {existingCount} documents, skipping insert");
            return;
        }

        if (existingCount > 0)
        {
            collection.DeleteMany(new BsonDocument());
        }

        var insertedCount = 0;
        for (var i = 0; i < totalDocuments; i += batchSize)
        {
            var batch = data.Skip(i).Take(batchSize).ToList();
            try
            {
                collection.InsertMany(batch, new InsertManyOptions { IsOrdered = false });
                insertedCount += batch.Count;
            }
            catch (MongoBulkWriteException)
            {
                // Some documents may have been inserted before the error
                insertedCount += batch.Count;
            }
            Thread.Sleep(100);
        }

        Console.WriteLine($"Inserted {insertedCount}/{totalDocuments} documents");
    }

    public static void DropVectorIndexes(IMongoCollection<BsonDocument> collection, string vectorField)
    {
        try
        {
            using var cursor = collection.Indexes.List();
            var indexes = cursor.ToList();
            foreach (var index in indexes)
            {
                if (index.Contains("key"))
                {
                    var key = index["key"].AsBsonDocument;
                    if (key.Contains(vectorField) && key[vectorField].AsString == "cosmosSearch")
                    {
                        var indexName = index["name"].AsString;
                        collection.Indexes.DropOne(indexName);
                        Console.WriteLine($"Dropped existing vector index: {indexName}");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Warning: Error dropping indexes: {ex.Message}");
        }
    }

    public static List<BsonDocument> PerformVectorSearch(
        IMongoCollection<BsonDocument> collection,
        EmbeddingClient client,
        string query,
        string vectorField,
        string model,
        int topK = 5)
    {
        var embeddingResult = client.GenerateEmbedding(query);
        var queryVector = embeddingResult.Value.ToFloats().ToArray();

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
                { "document", "$$ROOT" },
                { "score", new BsonDocument("$meta", "searchScore") }
            })
        };

        return collection.Aggregate<BsonDocument>(pipeline).ToList();
    }

    public static void PrintSearchResults(List<BsonDocument> results, string algorithm)
    {
        Console.WriteLine();
        Console.WriteLine(new string('=', 60));
        Console.WriteLine($"  {algorithm} Search Results ({results.Count} found)");
        Console.WriteLine(new string('=', 60));

        for (var i = 0; i < results.Count; i++)
        {
            var result = results[i];
            var doc = result.Contains("document") ? result["document"].AsBsonDocument : result;
            var name = doc.Contains("HotelName") ? doc["HotelName"].AsString
                     : doc.Contains("name") ? doc["name"].AsString
                     : "Unknown";
            var score = result.Contains("score") ? result["score"].ToDouble() : 0.0;
            Console.WriteLine($"  {i + 1}. {name} (score: {score:F4})");
        }

        Console.WriteLine();
    }
}
