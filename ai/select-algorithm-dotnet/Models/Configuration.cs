namespace SelectAlgorithm.Models;

public class AppConfiguration
{
    public AzureOpenAIConfiguration AzureOpenAI { get; set; } = new();
    public MongoDBConfiguration MongoDB { get; set; } = new();
    public EmbeddingConfiguration Embedding { get; set; } = new();
    public VectorSearchConfiguration VectorSearch { get; set; } = new();
    public DataFilesConfiguration DataFiles { get; set; } = new();
}

public class AzureOpenAIConfiguration
{
    public string Endpoint { get; set; } = string.Empty;
    public string EmbeddingModel { get; set; } = "text-embedding-3-small";
}

public class MongoDBConfiguration
{
    public string ClusterName { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = "Hotels";
    public int LoadBatchSize { get; set; } = 100;
}

public class EmbeddingConfiguration
{
    public string EmbeddedField { get; set; } = "DescriptionVector";
    public int Dimensions { get; set; } = 1536;
}

public class VectorSearchConfiguration
{
    public string Query { get; set; } = "luxury hotel near the beach";
    public string Similarity { get; set; } = "";
    public int TopK { get; set; } = 5;
}

public class DataFilesConfiguration
{
    public string WithVectors { get; set; } = "data/Hotels_Vector.json";
}
