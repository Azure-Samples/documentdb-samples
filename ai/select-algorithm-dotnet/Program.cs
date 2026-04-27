using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SelectAlgorithm.Services;
using SelectAlgorithm.Utilities;
using System.Reflection;

namespace SelectAlgorithm;

class Program
{
    static async Task Main(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
            .AddEnvironmentVariables()
            .Build();

        var services = new ServiceCollection()
            .AddLogging(builder => builder
                .AddConsole()
                .SetMinimumLevel(LogLevel.Information))
            .AddSingleton<IConfiguration>(configuration);

        var serviceProvider = services.BuildServiceProvider();
        var logger = serviceProvider.GetRequiredService<ILogger<Program>>();

        try
        {
            var openAiEndpoint = configuration["AZURE_OPENAI_EMBEDDING_ENDPOINT"]
                ?? throw new InvalidOperationException("AZURE_OPENAI_EMBEDDING_ENDPOINT not configured. Set as environment variable or in appsettings.json.");
            var openAiModel = configuration["AZURE_OPENAI_EMBEDDING_MODEL"]
                ?? throw new InvalidOperationException("AZURE_OPENAI_EMBEDDING_MODEL not configured. Set as environment variable or in appsettings.json.");
            var mongoClusterName = configuration["MONGO_CLUSTER_NAME"]
                ?? throw new InvalidOperationException("MONGO_CLUSTER_NAME not configured. Set as environment variable or in appsettings.json.");
            var tenantId = configuration["AZURE_TENANT_ID"]
                ?? throw new InvalidOperationException("AZURE_TENANT_ID not configured. Set as environment variable or in appsettings.json.");

            var databaseName = configuration["DatabaseName"] ?? "Hotels";
            var embeddedField = configuration["EmbeddedField"] ?? "DescriptionVector";
            if (!int.TryParse(configuration["EmbeddingDimensions"] ?? "1536", out int embeddingDimensions))
                throw new InvalidOperationException("EmbeddingDimensions must be a valid integer");
            if (!int.TryParse(configuration["LoadBatchSize"] ?? "100", out int loadBatchSize))
                throw new InvalidOperationException("LoadBatchSize must be a valid integer");
            var searchQuery = configuration["SearchQuery"] ?? "quintessential lodging near running trails, eateries, retail";
            if (!int.TryParse(configuration["TopK"] ?? "5", out int topK))
                throw new InvalidOperationException("TopK must be a valid integer");

            var dataFileRelative = Environment.GetEnvironmentVariable("DATA_FILE_WITH_VECTORS") ?? "../../data/Hotels_Vector.json";
            var assemblyDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location) ?? string.Empty;
            var dataFilePath = Path.GetFullPath(Path.Combine(assemblyDir, dataFileRelative));

            var algorithmFilter = (Environment.GetEnvironmentVariable("ALGORITHM") ?? "all").Trim().ToLower();
            var similarityFilter = (Environment.GetEnvironmentVariable("SIMILARITY") ?? "COS").Trim().ToUpper();

            logger.LogInformation("Initializing clients with passwordless authentication...");
            var (aiClient, dbClient) = Utils.GetClientsPasswordless(openAiEndpoint, mongoClusterName, tenantId);

            var comparisonLogger = serviceProvider.GetRequiredService<ILoggerFactory>()
                .CreateLogger<VectorComparisonService>();

            var comparisonService = new VectorComparisonService(
                comparisonLogger,
                aiClient,
                dbClient,
                databaseName,
                embeddedField,
                embeddingDimensions,
                loadBatchSize,
                topK
            );

            var results = await comparisonService.RunComparisonAsync(
                dataFilePath,
                searchQuery,
                openAiModel,
                algorithmFilter,
                similarityFilter
            );

            if (results.Count > 0)
            {
                Utils.PrintComparisonTable(results);
            }

            logger.LogInformation("\nClosing database connection...");
            // MongoClient does not implement IAsyncDisposable; sync disposal is intentional
            dbClient?.Cluster?.Dispose();
            logger.LogInformation("Database connection closed");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Application failed");
            Environment.ExitCode = 1;
        }
    }
}
