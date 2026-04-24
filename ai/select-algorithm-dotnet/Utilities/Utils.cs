using Azure.Core;
using Azure.Identity;
using Azure.AI.OpenAI;
using MongoDB.Driver;
using MongoDB.Driver.Authentication.Oidc;
using MongoDB.Bson;
using System.Text.Json;

namespace SelectAlgorithm.Utilities;

internal sealed class AzureIdentityTokenHandler(TokenCredential credential, string tenantId) : IOidcCallback
{
    private readonly string[] scopes = ["https://ossrdbms-aad.database.windows.net/.default"];

    // Note: OIDC tokens expire after approximately 1 hour.
    // MongoDB driver handles token refresh automatically via this callback.
    public OidcAccessToken GetOidcAccessToken(OidcCallbackParameters parameters, CancellationToken cancellationToken)
    {
        AccessToken token = credential.GetToken(
            new TokenRequestContext(scopes, tenantId: tenantId),
            cancellationToken
        );

        return new OidcAccessToken(token.Token, token.ExpiresOn - DateTimeOffset.UtcNow);
    }

    public async Task<OidcAccessToken> GetOidcAccessTokenAsync(OidcCallbackParameters parameters, CancellationToken cancellationToken)
    {
        AccessToken token = await credential.GetTokenAsync(
            new TokenRequestContext(scopes, parentRequestId: null, tenantId: tenantId),
            cancellationToken
        );

        return new OidcAccessToken(token.Token, token.ExpiresOn - DateTimeOffset.UtcNow);
    }
}

public static class Utils
{
    public static (AzureOpenAIClient aiClient, MongoClient dbClient) GetClientsPasswordless(
        string openAiEndpoint,
        string mongoClusterName,
        string tenantId)
    {
        var credential = new DefaultAzureCredential(new DefaultAzureCredentialOptions
        {
            TenantId = tenantId
        });

        var options = new AzureOpenAIClientOptions();
        // Default retry policy (3 retries with exponential backoff) is applied automatically
        var aiClient = new AzureOpenAIClient(new Uri(openAiEndpoint), credential, options);

        var connectionString = $"mongodb+srv://{mongoClusterName}.mongocluster.cosmos.azure.com/?tls=true&authMechanism=MONGODB-OIDC&retrywrites=false&maxIdleTimeMS=120000";
        var settings = MongoClientSettings.FromUrl(MongoUrl.Create(connectionString));
        settings.UseTls = true;
        settings.RetryWrites = false;
        settings.MaxConnectionIdleTime = TimeSpan.FromMinutes(2);
        settings.Credential = MongoCredential.CreateOidcCredential(new AzureIdentityTokenHandler(credential, tenantId));
        settings.Freeze();

        var dbClient = new MongoClient(settings);

        return (aiClient, dbClient);
    }

    // Console.WriteLine is used intentionally in Utils methods for demo output,
    // keeping utility methods simple without requiring ILogger dependency injection.
    public static async Task<List<T>> ReadJsonFileAsync<T>(string filePath)
    {
        Console.WriteLine($"Reading JSON file from {filePath}");
        var jsonContent = await File.ReadAllTextAsync(filePath);
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        return JsonSerializer.Deserialize<List<T>>(jsonContent, options) ?? new List<T>();
    }

    public static async Task<(int inserted, int failed)> InsertDataAsync<T>(
        IMongoCollection<T> collection,
        List<T> data,
        int batchSize) where T : class
    {
        Console.WriteLine($"Processing in batches of {batchSize}...");
        int totalBatches = (int)Math.Ceiling((double)data.Count / batchSize);
        int inserted = 0;
        int failed = 0;

        for (int i = 0; i < totalBatches; i++)
        {
            var batch = data.Skip(i * batchSize).Take(batchSize).ToList();
            try
            {
                await collection.InsertManyAsync(batch, new InsertManyOptions { IsOrdered = false });
                inserted += batch.Count;
                Console.WriteLine($"Batch {i + 1} complete: {batch.Count} inserted");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in batch {i + 1}: {ex.Message}");
                failed += batch.Count;
            }

            if (i < totalBatches - 1)
            {
                await Task.Delay(100);
            }
        }

        var indexColumns = new[] { "HotelId", "Category", "Description", "Description_fr" };
        foreach (var col in indexColumns)
        {
            await collection.Indexes.CreateOneAsync(
                new CreateIndexModel<T>(Builders<T>.IndexKeys.Ascending(col))
            );
        }

        return (inserted, failed);
    }

    public static void PrintComparisonTable(List<ComparisonResult> results)
    {
        Console.WriteLine("\n" + new string('=', 90));
        Console.WriteLine("                     Vector Algorithm Comparison Results");
        Console.WriteLine(new string('=', 90));

        Console.WriteLine(
            "Algorithm".PadRight(14) +
            "Similarity".PadRight(14) +
            "Top Result".PadRight(26) +
            "Score".PadRight(14) +
            "Latency(ms)"
        );
        Console.WriteLine(new string('-', 90));

        foreach (var r in results)
        {
            var topResult = r.SearchResults.FirstOrDefault();
            var topName = topResult != null
                ? (topResult.Document.HotelName?.Length > 24
                    ? topResult.Document.HotelName.Substring(0, 24)
                    : topResult.Document.HotelName ?? "N/A")
                : "N/A";
            var topScore = topResult != null ? topResult.Score.ToString("F4") : "N/A";

            Console.WriteLine(
                r.Algorithm.PadRight(14) +
                r.Similarity.PadRight(14) +
                topName.PadRight(26) +
                topScore.PadRight(14) +
                r.LatencyMs.ToString("F0")
            );
        }

        Console.WriteLine(new string('=', 90));

        foreach (var r in results)
        {
            Console.WriteLine($"\n--- {r.Algorithm} / {r.Similarity} ({r.CollectionName}) ---");
            if (r.SearchResults.Count == 0)
            {
                Console.WriteLine("  No results.");
                continue;
            }
            for (int i = 0; i < r.SearchResults.Count; i++)
            {
                var item = r.SearchResults[i];
                Console.WriteLine($"  {i + 1}. {item.Document.HotelName}, Score: {item.Score:F4}");
            }
            Console.WriteLine($"  Latency: {r.LatencyMs:F0}ms");
        }
    }
}

public class ComparisonResult
{
    public string CollectionName { get; set; } = string.Empty;
    public string Algorithm { get; set; } = string.Empty;
    public string Similarity { get; set; } = string.Empty;
    public List<SearchResult> SearchResults { get; set; } = new();
    public double LatencyMs { get; set; }
}

public class SearchResult
{
    public HotelData Document { get; set; } = new();
    public double Score { get; set; }
}

public class HotelData
{
    public string? HotelName { get; set; }
}
