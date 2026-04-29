using DotNetEnv;

namespace SelectAlgorithm;

class Program
{
    static void Main(string[] args)
    {
        // Load .env file from parent directory
        Env.Load("../.env");

        var algorithm = (Environment.GetEnvironmentVariable("ALGORITHM") ?? "all").ToLowerInvariant();

        Console.WriteLine();
        Console.WriteLine("Select Algorithm Demo - Azure DocumentDB Vector Search (.NET)");
        Console.WriteLine(new string('-', 60));
        Console.WriteLine($"Algorithm: {algorithm}");
        Console.WriteLine();

        switch (algorithm)
        {
            case "ivf":
                IvfDemo.Run();
                break;
            case "hnsw":
                HnswDemo.Run();
                break;
            case "diskann":
                DiskannDemo.Run();
                break;
            case "all":
                IvfDemo.Run();
                HnswDemo.Run();
                DiskannDemo.Run();
                break;
            default:
                Console.WriteLine($"Unknown algorithm: {algorithm}");
                Console.WriteLine("Valid options: ivf, hnsw, diskann, all");
                Environment.Exit(1);
                break;
        }

        Console.WriteLine("Done!");
    }
}
