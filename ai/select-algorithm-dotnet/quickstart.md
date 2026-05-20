---
title: Quickstart - Vector index with .NET
description: Compare DiskANN, HNSW, and IVF vector search algorithms in Azure DocumentDB using the .NET client library with passwordless authentication.
ms.devlang: csharp
ms.topic: quickstart-sdk
ms.date: 05/07/2026
ms.custom: sfi-ropc-nochange
ai-usage: ai-generated
author: diberry
ms.author: diberry
ms.service: azure-documentdb
---

# Quickstart: Vector index with .NET in Azure DocumentDB

This article shows you how to compare all three vector search algorithms (DiskANN, HNSW, and IVF) in Azure DocumentDB using the .NET client library. The sample demonstrates how each algorithm performs with different similarity functions (COS, L2, IP) and helps you choose the right configuration for your workload. This quickstart uses a sample hotel dataset in a JSON file with pre-calculated vectors from the `text-embedding-3-small` model.



Find the [sample code](https://github.com/Azure-Samples/documentdb-samples/tree/main/ai/select-algorithm-dotnet) on GitHub.

## Prerequisites

[!INCLUDE[Prerequisites](includes/prerequisite-quickstart-vector-index.md)]

- [.NET 9.0 SDK](https://dotnet.microsoft.com/download/dotnet/9.0) or later. .NET 9.0 is a Standard Term Support (STS) release. Use the latest available .NET SDK for long-term production workloads.

## Create data file with vectors

1. Create a new data directory for the hotels data file:

   ### [Bash](#tab/bash)

   ```bash
   mkdir data
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Name data
   ```

   ---

2. Download the `Hotels_Vector.json` [raw data file with vectors](https://raw.githubusercontent.com/Azure-Samples/documentdb-samples/refs/heads/main/ai/data/Hotels_Vector.json) to your `data` directory:

   ### [Bash](#tab/bash)

   ```bash
   curl -o data/Hotels_Vector.json https://raw.githubusercontent.com/Azure-Samples/documentdb-samples/refs/heads/main/ai/data/Hotels_Vector.json
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Azure-Samples/documentdb-samples/refs/heads/main/ai/data/Hotels_Vector.json" -OutFile "data/Hotels_Vector.json"
   ```

   ---

   Verify the file downloaded successfully:

   ### [Bash](#tab/bash)

   ```bash
   ls data/Hotels_Vector.json
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   Get-ChildItem data\Hotels_Vector.json
   ```

   ---

   You should see `Hotels_Vector.json` in the `data` directory.

## Create a .NET project

1. Create a new directory for your project and initialize the .NET console application:

   ### [Bash](#tab/bash)

   ```bash
   mkdir select-algorithm-dotnet
   cd select-algorithm-dotnet
   dotnet new console --framework net9.0
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Name select-algorithm-dotnet
   Set-Location select-algorithm-dotnet
   dotnet new console --framework net9.0
   ```

   ---

   Verify the project was created:

   ### [Bash](#tab/bash)

   ```bash
   ls *.csproj
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   Get-ChildItem *.csproj
   ```

   ---

2. Install the required NuGet packages:

   ```bash
   dotnet add package Azure.AI.OpenAI --version 2.1.0
   dotnet add package Azure.Identity --version 1.17.1
   dotnet add package MongoDB.Driver --version 3.0.0
   dotnet add package Microsoft.Extensions.Configuration --version 9.0.0
   dotnet add package Microsoft.Extensions.Configuration.Binder --version 9.0.0
   dotnet add package Microsoft.Extensions.Configuration.EnvironmentVariables --version 9.0.0
   dotnet add package Microsoft.Extensions.Configuration.Json --version 9.0.0
   dotnet add package Microsoft.Extensions.DependencyInjection --version 9.0.0
   dotnet add package Microsoft.Extensions.Logging --version 9.0.0
   dotnet add package Microsoft.Extensions.Logging.Console --version 9.0.0
   ```

   These packages provide:
   - `Azure.AI.OpenAI`: Azure OpenAI client library to create vector embeddings
   - `Azure.Identity`: Azure Identity library for passwordless authentication with DefaultAzureCredential
   - `MongoDB.Driver`: MongoDB driver for .NET to interact with DocumentDB
   - `Microsoft.Extensions.*`: Configuration, dependency injection, and logging infrastructure

   Verify installed packages:

   ```bash
   dotnet list package
   ```

3. Create environment variables for authentication. The sample uses DefaultAzureCredential for passwordless authentication:

   ### [Bash](#tab/bash)

   ```bash
   export AZURE_OPENAI_EMBEDDING_ENDPOINT="https://<your-openai-resource>.openai.azure.com"
   export AZURE_OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
   export DOCUMENTDB_CLUSTER_NAME="<your-documentdb-cluster-name>"
   export AZURE_TENANT_ID="<your-tenant-id>"
   export DATA_FILE_WITH_VECTORS="../../data/Hotels_Vector.json"
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   $env:AZURE_OPENAI_EMBEDDING_ENDPOINT="https://<your-openai-resource>.openai.azure.com"
   $env:AZURE_OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
   $env:DOCUMENTDB_CLUSTER_NAME="<your-documentdb-cluster-name>"
   $env:AZURE_TENANT_ID="<your-tenant-id>"
   $env:DATA_FILE_WITH_VECTORS="../../data/Hotels_Vector.json"
   ```

   ---

   Replace the placeholder values with your own information:
   - `<your-openai-resource>`: Your Azure OpenAI resource name
   - `<your-documentdb-cluster-name>`: Your Azure DocumentDB cluster name
   - `<your-tenant-id>`: Your Microsoft Entra tenant ID

   You should always prefer passwordless authentication. For more information on setting up managed identity and the full range of your authentication options, see [Authenticate .NET apps to Azure services by using the Azure SDK for .NET](/dotnet/azure/sdk/authentication).

4. Sign in with Azure CLI for passwordless authentication:

   ```bash
   az login
   ```

5. Create an `appsettings.json` configuration file:

   ### [Bash](#tab/bash)

   ```bash
   touch appsettings.json
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType File -Name appsettings.json
   ```

   ---

   Add this content to `appsettings.json`:

   ```json
   {
     "DatabaseName": "Hotels",
     "EmbeddedField": "DescriptionVector",
     "EmbeddingDimensions": 1536,
     "LoadBatchSize": 100,
     "SearchQuery": "quintessential lodging near running trails, eateries, retail",
     "TopK": 5
   }
   ```

## Create code files

Continue the project by creating code files for vector search comparison. When you are done, the project structure should look like this:

```
├── data/
│   └── Hotels_Vector.json            # Hotel data with vector embeddings
└── select-algorithm-dotnet/
    ├── Services/
    │   └── VectorComparisonService.cs # Service to compare vector algorithms
    ├── Utilities/
    │   └── Utils.cs                   # Shared utility functions
    ├── Program.cs                     # Main application entry point
    ├── appsettings.json               # Configuration settings
    ├── global.json                    # .NET SDK version specification
    └── SelectAlgorithm.csproj         # Project file
```

1. Create the directory structure:

   ### [Bash](#tab/bash)

   ```bash
   mkdir Services
   mkdir Utilities
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Name Services
   New-Item -ItemType Directory -Name Utilities
   ```

   ---

2. Create the code files:

   ### [Bash](#tab/bash)

   ```bash
   touch Services/VectorComparisonService.cs
   touch Utilities/Utils.cs
   touch global.json
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType File -Path Services\VectorComparisonService.cs
   New-Item -ItemType File -Path Utilities\Utils.cs
   New-Item -ItemType File -Name global.json
   ```

   ---

## Create the algorithm comparison code

### Program.cs

Replace the contents of `Program.cs` with this code:

:::code language="csharp" source="~/../documentdb-samples/ai/select-algorithm-dotnet/Program.cs" :::

This main entry point:
- Loads configuration from appsettings.json and environment variables
- Sets up dependency injection with logging infrastructure
- Initializes Azure OpenAI and DocumentDB clients using passwordless authentication
- Creates a VectorComparisonService to test all algorithms
- Runs the comparison and prints results in a table format

### CompareAll.cs

Add this code to `CompareAll.cs`:

:::code language="csharp" source="~/../documentdb-samples/ai/select-algorithm-dotnet/CompareAll.cs" :::

This service:
- Manages the comparison workflow for all algorithms
- Creates collections and indexes for each algorithm/similarity combination
- Inserts data and executes vector searches
- Measures and collects latency metrics
- Configures algorithm-specific parameters for index creation and search

### Supporting files

Create the following supporting files in the project:

#### Utils.cs

:::code language="csharp" source="~/../documentdb-samples/ai/select-algorithm-dotnet/Utils.cs" :::

#### Utilities/AzureIdentityTokenHandler.cs

:::code language="csharp" source="~/../documentdb-samples/ai/select-algorithm-dotnet/Utilities/AzureIdentityTokenHandler.cs" :::

#### Models/Configuration.cs

:::code language="csharp" source="~/../documentdb-samples/ai/select-algorithm-dotnet/Models/Configuration.cs" :::

#### Models/HotelData.cs

:::code language="csharp" source="~/../documentdb-samples/ai/select-algorithm-dotnet/Models/HotelData.cs" :::

These supporting files provide:
- Passwordless authentication setup for Azure OpenAI and DocumentDB
- OIDC token handler for automatic token refresh
- JSON file reading and deserialization
- Batch data insertion with error handling
- Results formatting and display

### global.json

Add this code to `global.json`:

```json
{
  "sdk": {
    "version": "9.0.200",
    "rollForward": "latestFeature"
  }
}
```

This file specifies the .NET SDK version requirements for the project.

## Run the code

1. Build the project:

   ```bash
   dotnet build
   ```

2. Run the application to compare all algorithms with COS similarity (default):

   ```bash
   dotnet run
   ```

   The application creates three collections (`hotels_diskann_cos`, `hotels_hnsw_cos`, `hotels_ivf_cos`), inserts data, creates vector indexes, and performs searches on each.

3. To compare all algorithms with all similarity functions, set environment variables:

   ### [Bash](#tab/bash)

   ```bash
   export ALGORITHM=all
   export SIMILARITY=all
   dotnet run
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   $env:ALGORITHM="all"
   $env:SIMILARITY="all"
   dotnet run
   ```

   ---

   This creates nine collections (3 algorithms x 3 similarity functions) and compares all combinations.

4. To test a specific algorithm with a specific similarity function:

   ### [Bash](#tab/bash)

   ```bash
   export ALGORITHM=diskann
   export SIMILARITY=COS
   dotnet run
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   $env:ALGORITHM="diskann"
   $env:SIMILARITY="COS"
   dotnet run
   ```

   ---

### Expected output

The application displays progress logs and a comparison table. Results vary based on data and server load:

```
Vector Algorithm Comparison
   Database: Hotels
   Algorithms: all
   Similarity: COS
   Collections to query: hotels_diskann_cos, hotels_hnsw_cos, hotels_ivf_cos
   Search query: "quintessential lodging near running trails, eateries, retail"

Generating query embedding...
Query embedding: 1536 dimensions

--- DiskANN / COS ---
Collection: hotels_diskann_cos
Created collection: hotels_diskann_cos
Inserted: 50/50
Created vector index: vectorIndex_diskann_cos
Executing vector search...
[OK] 5 results, 45ms

--- HNSW / COS ---
Collection: hotels_hnsw_cos
Created collection: hotels_hnsw_cos
Inserted: 50/50
Created vector index: vectorIndex_hnsw_cos
Executing vector search...
[OK] 5 results, 38ms

--- IVF / COS ---
Collection: hotels_ivf_cos
Created collection: hotels_ivf_cos
Inserted: 50/50
Created vector index: vectorIndex_ivf_cos
Executing vector search...
[OK] 5 results, 52ms

==========================================================================================
                     Vector Algorithm Comparison Results
==========================================================================================
Algorithm     Similarity    Top Result                Score         Latency(ms)
------------------------------------------------------------------------------------------
DiskANN       COS           Historic Downtown Inn      0.8342        45
HNSW          COS           Historic Downtown Inn      0.8342        38
IVF           COS           Historic Downtown Inn      0.8342        52
==========================================================================================

--- DiskANN / COS (hotels_diskann_cos) ---
  1. Historic Downtown Inn, Score: 0.8342
  2. Mountain Trail Lodge, Score: 0.7891
  3. Riverside Retreat, Score: 0.7654
  4. Urban Fitness Suites, Score: 0.7210
  5. Lakeside Wellness Resort, Score: 0.7045
  Latency: 45ms

--- HNSW / COS (hotels_hnsw_cos) ---
  1. Historic Downtown Inn, Score: 0.8342
  2. Mountain Trail Lodge, Score: 0.7891
  3. Riverside Retreat, Score: 0.7654
  4. Urban Fitness Suites, Score: 0.7210
  5. Lakeside Wellness Resort, Score: 0.7045
  Latency: 38ms

--- IVF / COS (hotels_ivf_cos) ---
  1. Historic Downtown Inn, Score: 0.8342
  2. Mountain Trail Lodge, Score: 0.7891
  3. Riverside Retreat, Score: 0.7654
  4. Urban Fitness Suites, Score: 0.7210
  5. Lakeside Wellness Resort, Score: 0.7045
  Latency: 52ms
```

[!INCLUDE[Choosing the right algorithm](../includes/choosing-algorithm.md)]

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `TimeoutException` during connection | Verify your connection string and environment variables. Ensure your IP is in the DocumentDB firewall rules. |
| `AuthenticationException` | Check that `DefaultAzureCredential` can acquire a token. Run `az login` to refresh your credentials. |
| Build errors with .NET version | Ensure you have .NET 9.0 or later installed. Run `dotnet --version` to check. |
| `BsonSerializationException` | Ensure your model classes match the document structure in the collection. |
| Empty search results | The vector index might not be ready yet. The sample includes retry logic, but if you still see empty results, wait a few seconds and retry. |
| `IndexOptionsConflict` (code 85) | DocumentDB doesn't allow multiple vector indexes of the same kind on the same field. Drop the existing index before creating a new one. |

## Clean up resources

When you're done, you can remove the database using mongosh or the DocumentDB for VS Code extension.

### [mongosh](#tab/mongosh)

Connect to your DocumentDB cluster and drop the database:

```bash
mongosh "mongodb+srv://<your-cluster-name>.global.mongocluster.cosmos.azure.com/" --tls --authenticationMechanism MONGODB-OIDC
```

```javascript
use Hotels
db.dropDatabase()
```

### [VS Code extension](#tab/vscode)

1. Install the [DocumentDB for VS Code](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-documentdb) extension.
2. Connect to your Azure DocumentDB cluster.
3. Expand the cluster, right-click the **Hotels** database, and select **Drop Database**.

---

If you created an Azure DocumentDB cluster specifically for this quickstart, you can also delete the entire resource group in the Azure portal to remove all associated resources.

## Related content

- [Vector search overview](./vector-search.md)
- [ENN vector search](./enn-vector-search.md)
- [Product quantization](./product-quantization.md)
