# Select Algorithm - .NET (C#)

Demonstrates three vector index algorithms available in Azure DocumentDB:

| Algorithm | Best For | Cluster Tier | Key Parameters |
|-----------|----------|--------------|----------------|
| **IVF** | < 10,000 documents | M10+ | `numLists` |
| **HNSW** | 10,000–50,000 documents | M30+ | `m`, `efConstruction` |
| **DiskANN** | 50,000+ documents | M40+ | `maxDegree`, `lBuild` |

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Azure DocumentDB cluster
- Azure OpenAI resource with an embedding model deployed
- Azure CLI logged in (`az login`) for passwordless authentication

## Setup

1. **Configure environment:**

   The .NET sample uses `appsettings.json` for configuration. After deploying with `azd up`, you can export values:

   ```bash
   azd env get-values
   ```

   Then update `appsettings.json` with your Azure resource values.

2. Edit `appsettings.json` with your configuration:

   ```json
   {
     "AzureOpenAI": {
       "EmbeddingModel": "text-embedding-3-small",
       "Endpoint": "https://<your-resource>.openai.azure.com"
     },
     "MongoDB": {
       "ClusterName": "<your-cluster-name>",
       "DatabaseName": "Hotels",
       "LoadBatchSize": 100
     },
     "Embedding": {
       "EmbeddedField": "DescriptionVector",
       "Dimensions": 1536,
       "EmbeddingSizeBatch": 16
     },
     "DataFiles": {
       "WithVectors": "../data/Hotels_Vector.json"
     }
   }
   ```

3. Copy the shared data file:

   ```bash
   cp ../data/Hotels_Vector.json .
   ```

4. Restore packages:

   ```bash
   dotnet restore
   ```

## Usage

Run all 9 combinations (default):

```bash
dotnet run
```

## Configuration

| Setting (appsettings.json) | Default | Description |
|---------------------------|---------|-------------|
| `MongoDB:ClusterName` | (required) | DocumentDB cluster name |
| `AzureOpenAI:Endpoint` | (required) | Azure OpenAI endpoint |
| `AzureOpenAI:EmbeddingModel` | (required) | Embedding model deployment name |
| `DataFiles:WithVectors` | `../data/Hotels_Vector.json` | Path to vectors JSON file |
| `Embedding:EmbeddedField` | `DescriptionVector` | Field name containing embeddings |
| `Embedding:Dimensions` | `1536` | Vector dimensions |
| `MongoDB:DatabaseName` | `Hotels` | Target database name |
| `MongoDB:LoadBatchSize` | `100` | Batch size for data loading |
| `Embedding:EmbeddingSizeBatch` | `16` | Batch size for embedding requests |

**Additional environment variables for compare mode:**

| Variable | Default | Description |
|----------|---------|-------------|
| `QUERY_TEXT` | `luxury hotel near the beach` | Search query text |
| `TOP_K` | `5` | Number of results per search |
| `VERBOSE` | `false` | Show detailed per-result output |

## How It Works

1. **Connect** to DocumentDB using Microsoft Entra ID (OIDC) passwordless authentication
2. **Load** hotel documents with pre-computed embeddings from `Hotels_Vector.json`
3. For each of 9 algorithm/metric combinations: creates the index → searches → drops the index
4. DocumentDB only allows one vector index per kind per field, so indexes are created sequentially
5. Prints a formatted comparison table with scores, top results, and key insights

## Index Parameters

| Algorithm | Kind | Parameters |
|-----------|------|------------|
| IVF | `vector-ivf` | numLists=1 |
| HNSW | `vector-hnsw` | m=16, efConstruction=64 |
| DiskANN | `vector-diskann` | maxDegree=32, lBuild=50 |

## Authentication

This sample uses `DefaultAzureCredential` for both:
- **DocumentDB**: OIDC-based MongoDB authentication
- **Azure OpenAI**: Token-based authentication with `https://cognitiveservices.azure.com/.default` scope

Ensure you are logged in with `az login` and have appropriate RBAC roles assigned.

## Project Structure

```
select-algorithm-dotnet/
├── .devcontainer/
│   └── devcontainer.json       # Dev container configuration
├── Models/
│   ├── Configuration.cs        # App configuration model
│   └── HotelData.cs            # Hotel document model
├── Utilities/
│   └── AzureIdentityTokenHandler.cs  # OIDC token handler
├── appsettings.json            # Configuration file
├── CompareAll.cs               # Unified 9-combination comparison runner
├── Program.cs                  # Entry point
├── README.md                   # This file
├── SelectAlgorithm.csproj      # Project file
└── Utils.cs                    # Shared helpers (connection, embedding, search)
```
