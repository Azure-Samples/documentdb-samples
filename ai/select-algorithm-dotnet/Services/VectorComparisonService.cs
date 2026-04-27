using Azure.AI.OpenAI;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using MongoDB.Bson;
using SelectAlgorithm.Utilities;

namespace SelectAlgorithm.Services;

public class VectorComparisonService
{
    private readonly ILogger<VectorComparisonService> _logger;
    private readonly AzureOpenAIClient _aiClient;
    private readonly MongoClient _dbClient;
    private readonly string _databaseName;
    private readonly string _embeddedField;
    private readonly int _embeddingDimensions;
    private readonly int _loadBatchSize;
    private readonly int _topK;

    private static readonly string[] Algorithms = ["diskann", "hnsw", "ivf"];
    private static readonly string[] Similarities = ["COS", "L2", "IP"];

    private static readonly Dictionary<string, string> AlgorithmLabels = new()
    {
        ["diskann"] = "DiskANN",
        ["hnsw"] = "HNSW",
        ["ivf"] = "IVF"
    };

    public VectorComparisonService(
        ILogger<VectorComparisonService> logger,
        AzureOpenAIClient aiClient,
        MongoClient dbClient,
        string databaseName,
        string embeddedField,
        int embeddingDimensions,
        int loadBatchSize,
        int topK)
    {
        _logger = logger;
        _aiClient = aiClient;
        _dbClient = dbClient;
        _databaseName = databaseName;
        _embeddedField = embeddedField;
        _embeddingDimensions = embeddingDimensions;
        _loadBatchSize = loadBatchSize;
        _topK = topK;
    }

    public async Task<List<ComparisonResult>> RunComparisonAsync(
        string dataFilePath,
        string searchQuery,
        string embeddingModel,
        string algorithmFilter,
        string similarityFilter)
    {
        var targets = GetTargetCollections(algorithmFilter, similarityFilter);

        _logger.LogInformation("\nVector Algorithm Comparison");
        _logger.LogInformation("   Database: {DatabaseName}", _databaseName);
        _logger.LogInformation("   Algorithms: {AlgorithmFilter}", algorithmFilter);
        _logger.LogInformation("   Similarity: {SimilarityFilter}", similarityFilter);
        _logger.LogInformation("   Collections to query: {Collections}", string.Join(", ", targets.Select(t => t.CollectionName)));
        _logger.LogInformation("   Search query: \"{SearchQuery}\"", searchQuery);

        var db = _dbClient.GetDatabase(_databaseName);
        var data = await Utils.ReadJsonFileAsync<BsonDocument>(dataFilePath);

        _logger.LogInformation("Generating query embedding...");
        var embeddingClient = _aiClient.GetEmbeddingClient(embeddingModel);
        var embeddingResponse = await embeddingClient.GenerateEmbeddingAsync(searchQuery);
        var queryEmbedding = embeddingResponse.Value.ToFloats().ToArray();
        if (queryEmbedding.Length != _embeddingDimensions)
        {
            throw new InvalidOperationException(
                $"Embedding dimension mismatch: expected {_embeddingDimensions}, got {queryEmbedding.Length}. " +
                $"Verify the model matches the configured EmbeddingDimensions in appsettings.json.");
        }
        _logger.LogInformation("Query embedding: {Dimensions} dimensions", queryEmbedding.Length);

        var comparisonResults = new List<ComparisonResult>();

        foreach (var target in targets)
        {
            _logger.LogInformation("--- {Algorithm} / {Similarity} ---", AlgorithmLabels[target.Algorithm], target.Similarity);
            _logger.LogInformation("Collection: {CollectionName}", target.CollectionName);

            try
            {
                try
                {
                    await db.DropCollectionAsync(target.CollectionName);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug("Could not drop collection {Name}: {Message}", target.CollectionName, ex.Message);
                }

                await db.CreateCollectionAsync(target.CollectionName);
                _logger.LogInformation("Created collection: {CollectionName}", target.CollectionName);

                var collection = db.GetCollection<BsonDocument>(target.CollectionName);

                var (inserted, failed) = await Utils.InsertDataAsync(collection, data, _loadBatchSize);
                _logger.LogInformation("Inserted: {Inserted}/{Total}", inserted, data.Count);

                var indexName = $"vectorIndex_{target.Algorithm}_{target.Similarity.ToLower()}";
                var indexOptions = GetIndexOptions(
                    target.CollectionName,
                    indexName,
                    _embeddedField,
                    _embeddingDimensions,
                    target.Algorithm,
                    target.Similarity
                );
                await db.RunCommandAsync<BsonDocument>(indexOptions);
                _logger.LogInformation("Created vector index: {IndexName}", indexName);

                _logger.LogInformation("Executing vector search...");
                var startTime = DateTime.UtcNow;

                var pipeline = GetSearchPipeline(queryEmbedding, _embeddedField, _topK, target.Algorithm);
                var searchResults = await collection.Aggregate<BsonDocument>(pipeline).ToListAsync();

                var latencyMs = (DateTime.UtcNow - startTime).TotalMilliseconds;

                var results = searchResults.Select(doc => new SearchResult
                {
                    Document = new HotelData
                    {
                        HotelName = doc["document"].AsBsonDocument.GetValue("HotelName", "Unknown").AsString
                    },
                    Score = doc["score"].ToDouble()
                }).ToList();

                comparisonResults.Add(new ComparisonResult
                {
                    CollectionName = target.CollectionName,
                    Algorithm = AlgorithmLabels[target.Algorithm],
                    Similarity = target.Similarity,
                    SearchResults = results,
                    LatencyMs = latencyMs
                });

                _logger.LogInformation("[OK] {ResultCount} results, {LatencyMs}ms", results.Count, latencyMs.ToString("F0"));
            }
            catch (Azure.RequestFailedException ex)
            {
                _logger.LogError("Azure service error (HTTP {Status}): {Message}", ex.Status, ex.Message);
            }
            catch (MongoException ex)
            {
                _logger.LogError("MongoDB error: {Message}", ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError("Unexpected error comparing algorithms: {Message}", ex.Message);
            }
        }

        return comparisonResults;
    }

    private List<(string CollectionName, string Algorithm, string Similarity)> GetTargetCollections(
        string algorithmEnv,
        string similarityEnv)
    {
        var algorithms = algorithmEnv.ToLower() == "all"
            ? Algorithms
            : new[] { algorithmEnv.ToLower() };

        var similarities = similarityEnv.ToUpper() == "ALL"
            ? Similarities
            : new[] { similarityEnv.ToUpper() };

        var targets = new List<(string, string, string)>();

        foreach (var alg in algorithms)
        {
            if (!Algorithms.Contains(alg))
            {
                throw new ArgumentException($"Invalid ALGORITHM '{alg}'. Must be one of: all, {string.Join(", ", Algorithms)}");
            }

            foreach (var sim in similarities)
            {
                if (!Similarities.Contains(sim))
                {
                    throw new ArgumentException($"Invalid SIMILARITY '{sim}'. Must be one of: all, {string.Join(", ", Similarities)}");
                }

                targets.Add(($"hotels_{alg}_{sim.ToLower()}", alg, sim));
            }
        }

        return targets;
    }

    private BsonDocument GetIndexOptions(
        string collectionName,
        string indexName,
        string embeddedField,
        int dimensions,
        string algorithm,
        string similarity)
    {
        var cosmosSearchOptions = new BsonDocument
        {
            ["kind"] = $"vector-{algorithm}",
            ["dimensions"] = dimensions,
            ["similarity"] = similarity
        };

        switch (algorithm)
        {
            case "diskann":
                cosmosSearchOptions["maxDegree"] = 32;
                cosmosSearchOptions["lBuild"] = 50;
                break;
            case "hnsw":
                cosmosSearchOptions["m"] = 16;
                cosmosSearchOptions["efConstruction"] = 64;
                break;
            case "ivf":
                cosmosSearchOptions["numLists"] = 1;
                break;
        }

        return new BsonDocument
        {
            ["createIndexes"] = collectionName,
            ["indexes"] = new BsonArray
            {
                new BsonDocument
                {
                    ["name"] = indexName,
                    ["key"] = new BsonDocument { [embeddedField] = "cosmosSearch" },
                    ["cosmosSearchOptions"] = cosmosSearchOptions
                }
            }
        };
    }

    private PipelineDefinition<BsonDocument, BsonDocument> GetSearchPipeline(
        float[] queryEmbedding,
        string embeddedField,
        int k,
        string algorithm)
    {
        var cosmosSearch = new BsonDocument
        {
            ["vector"] = new BsonArray(queryEmbedding.Select(f => new BsonDouble(f))),
            ["path"] = embeddedField,
            ["k"] = k
        };

        switch (algorithm)
        {
            case "diskann":
                cosmosSearch["lSearch"] = 100;
                break;
            case "hnsw":
                cosmosSearch["efSearch"] = 80;
                break;
            case "ivf":
                cosmosSearch["nProbes"] = 1;
                break;
        }

        return new BsonDocument[]
        {
            new BsonDocument("$search", new BsonDocument { ["cosmosSearch"] = cosmosSearch }),
            new BsonDocument("$project", new BsonDocument
            {
                ["score"] = new BsonDocument("$meta", "searchScore"),
                ["document"] = "$$ROOT"
            })
        };
    }
}
