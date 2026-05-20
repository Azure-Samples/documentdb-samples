using Microsoft.Extensions.Configuration;
using SelectAlgorithm.Models;

namespace SelectAlgorithm;

class Program
{
    static void Main(string[] args)
    {
        Console.WriteLine();
        Console.WriteLine("Select Algorithm Demo - Azure DocumentDB Vector Search (.NET)");
        Console.WriteLine(new string('-', 60));
        Console.WriteLine();

        var configuration = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
            .AddEnvironmentVariables()
            .Build();

        var appConfig = new AppConfiguration();
        configuration.Bind(appConfig);

        var command = args.Length > 0 ? args[0].ToLower() : "compare-all";

        switch (command)
        {
            case "compare-all":
                CompareAll.Run(appConfig);
                break;
            default:
                Console.WriteLine($"Unknown command: {command}");
                Console.WriteLine("Usage: dotnet run -- compare-all");
                return;
        }

        Console.WriteLine();
        Console.WriteLine("Done!");
    }
}
