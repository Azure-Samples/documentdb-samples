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

1. Copy the environment file and fill in your values:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your configuration:

   ```env
   AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   AZURE_OPENAI_EMBEDDING_ENDPOINT=https://<your-resource>.openai.azure.com
   MONGO_CLUSTER_NAME=<your-cluster-name>
   AZURE_DOCUMENTDB_DATABASENAME=Hotels
   ALGORITHM=all
   SIMILARITY=COS
   ```

3. Restore packages:

   ```bash
   cd src
   dotnet restore
   ```

## Usage

Run all algorithms:

```bash
cd src
dotnet run
```

Run a specific algorithm:

```bash
# Set in .env: ALGORITHM=ivf | hnsw | diskann | all
dotnet run
```

## Project Structure

```
select-algorithm-dotnet/
├── .env.example          # Environment variable template
├── README.md             # This file
└── src/
    ├── SelectAlgorithm.csproj  # Project file
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
