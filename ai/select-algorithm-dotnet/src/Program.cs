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

        CompareAll.Run();

        Console.WriteLine("Done!");
    }
}
