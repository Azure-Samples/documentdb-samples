# Select Algorithm - .NET (C#)

Demonstrates three vector index algorithms available in Azure DocumentDB (vCore):

| Algorithm | Best For | Cluster Tier | Key Parameters |
|-----------|----------|--------------|----------------|
| **IVF** | < 10,000 documents | M10+ | `numLists` |
| **HNSW** | 10,000–50,000 documents | M30+ | `m`, `efConstruction` |
| **DiskANN** | 50,000+ documents | M30+ | `maxDegree`, `lBuild` |

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Azure DocumentDB (vCore) cluster
- Azure OpenAI resource with an embedding model deployed
- Azure CLI logged in (`az login`) for passwordless authentication

## Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/documentdb-samples
   cd ai/select-algorithm-dotnet
   ```

2. Login to Azure:

   ```bash
   az login
   ```

3. Configure environment variables:

   The .NET sample reads configuration from `appsettings.json` and environment variables. After deploying with `azd up`, you can view your provisioned resource values:

   ```bash
   azd env get-values
   ```

   Use these values to update `appsettings.json` or set them as environment variables.

4. Update `appsettings.json` with your Azure service details:

   ```json
   {
     "AzureOpenAI": {
       "Endpoint": "https://your-openai-service-name.openai.azure.com/",
       "EmbeddingModel": "text-embedding-3-small"
     },
     "MongoDB": {
       "ClusterName": "your-documentdb-cluster-name",
       "DatabaseName": "Hotels"
     }
   }
   ```

5. Restore packages and run:

   ```bash
   cd src
   dotnet restore
   dotnet run
   ```

## Usage

Run all algorithms:

```bash
cd src
dotnet run
```

Run a specific algorithm or similarity metric using environment variable overrides:

```bash
ALGORITHM=ivf dotnet run
ALGORITHM=hnsw SIMILARITY=L2 dotnet run
ALGORITHM=diskann dotnet run
```

Valid values:
- `ALGORITHM`: `all` (default) | `ivf` | `hnsw` | `diskann`
- `SIMILARITY`: `COS` (default) | `L2` | `IP`

## Project Structure

```
select-algorithm-dotnet/
├── README.md             # This file
└── src/
    ├── SelectAlgorithm.csproj  # Project file
    ├── appsettings.json        # Configuration file
    ├── Program.cs              # Entry point - dispatches by ALGORITHM env
    ├── Utils.cs                # Shared helpers (connection, embedding, search)
    ├── IvfDemo.cs              # IVF index creation and search
    ├── HnswDemo.cs             # HNSW index creation and search
    └── DiskannDemo.cs          # DiskANN index creation and search
```

## How It Works

1. **Connect** to DocumentDB using Microsoft Entra ID (OIDC) passwordless authentication
2. **Load** hotel documents with pre-computed embeddings from `Hotels_Vector.json`
3. **Create** a vector index using the selected algorithm
4. **Search** using a natural language query converted to an embedding via Azure OpenAI
5. **Display** ranked results with similarity scores

## Authentication

This sample uses `DefaultAzureCredential` for both:
- **DocumentDB**: OIDC-based MongoDB authentication
- **Azure OpenAI**: Token-based authentication with `https://cognitiveservices.azure.com/.default` scope

Ensure you are logged in with `az login` and have appropriate RBAC roles assigned.
