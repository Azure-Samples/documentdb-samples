using Microsoft.Extensions.Configuration;
using SelectAlgorithm.Models;

namespace SelectAlgorithm;

class Program
{
    static void Main(string[] args)
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
            .AddEnvironmentVariables()
            .Build();

        var appConfig = new AppConfiguration();
        configuration.Bind(appConfig);

        // ALGORITHM env var override for selecting which demo to run
        var algorithm = (Environment.GetEnvironmentVariable("ALGORITHM") ?? "all").ToLowerInvariant();

        Console.WriteLine();
        Console.WriteLine("Select Algorithm Demo - Azure DocumentDB Vector Search (.NET)");
        Console.WriteLine(new string('-', 60));
        Console.WriteLine($"Algorithm: {algorithm}");
        Console.WriteLine();

        switch (algorithm)
        {
            case "ivf":
                IvfDemo.Run(appConfig);
                break;
            case "hnsw":
                HnswDemo.Run(appConfig);
                break;
            case "diskann":
                DiskannDemo.Run(appConfig);
                break;
            case "compare":
                CompareAll.Run();
                break;
            case "all":
                IvfDemo.Run(appConfig);
                HnswDemo.Run(appConfig);
                DiskannDemo.Run(appConfig);
                break;
            default:
                Console.WriteLine($"Unknown algorithm: {algorithm}");
                Console.WriteLine("Valid options: ivf, hnsw, diskann, compare, all");
                Environment.Exit(1);
                break;
        }

        Console.WriteLine("Done!");
    }
}

