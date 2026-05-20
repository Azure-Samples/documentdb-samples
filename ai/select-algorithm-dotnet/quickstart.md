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

- [.NET 8.0 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) or later.

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
   dotnet new console --framework net8.0
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Name select-algorithm-dotnet
   Set-Location select-algorithm-dotnet
   dotnet new console --framework net8.0
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

3. Create environment variables for authentication and configuration overrides. The sample uses `DefaultAzureCredential` for passwordless authentication, and .NET maps environment variables to `appsettings.json` keys by using the `Section__Key` format:

   ### [Bash](#tab/bash)

   ```bash
   export AzureOpenAI__Endpoint="https://<your-resource>.openai.azure.com"
   export AzureOpenAI__EmbeddingModel="text-embedding-3-small"
   export MongoDB__ClusterName="<your-cluster-name>"
   export DataFiles__WithVectors="data/Hotels_Vector.json"
   export AZURE_TENANT_ID="<your-tenant-id>"
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   $env:AzureOpenAI__Endpoint="https://<your-resource>.openai.azure.com"
   $env:AzureOpenAI__EmbeddingModel="text-embedding-3-small"
   $env:MongoDB__ClusterName="<your-cluster-name>"
   $env:DataFiles__WithVectors="data/Hotels_Vector.json"
   $env:AZURE_TENANT_ID="<your-tenant-id>"
   ```

   ---

   Replace the placeholder values with your own information:
   - `<your-resource>`: Your Azure OpenAI resource name
   - `<your-cluster-name>`: Your Azure DocumentDB cluster name
   - `<your-tenant-id>`: Your Microsoft Entra tenant ID

   These environment variables override the matching values in `appsettings.json`. For example, `MongoDB__ClusterName` overrides `MongoDB:ClusterName` and `AzureOpenAI__Endpoint` overrides `AzureOpenAI:Endpoint`.

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
     "AzureOpenAI": {
       "Endpoint": "https://<your-resource>.openai.azure.com",
       "EmbeddingModel": "text-embedding-3-small"
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
     "VectorSearch": {
       "Query": "quintessential lodging near running trails, eateries, retail",
       "Similarity": "",
       "TopK": 5
     },
     "DataFiles": {
       "WithVectors": "data/Hotels_Vector.json"
     }
   }
   ```

   You can keep placeholder values in `appsettings.json` and override them at runtime with environment variables such as `AzureOpenAI__Endpoint` and `MongoDB__ClusterName`.

## Create code files

Continue the project by creating code files for vector search comparison. When you are done, the project structure should look like this:

```
select-algorithm-dotnet/
├── .devcontainer/
│   └── devcontainer.json
├── data/
│   └── README.md
├── Models/
│   ├── Configuration.cs
│   └── HotelData.cs
├── output/
│   └── compare_all.txt
├── Utilities/
│   └── AzureIdentityTokenHandler.cs
├── .gitignore
├── appsettings.json
├── CompareAll.cs
├── Program.cs
├── quickstart.md
├── README.md
├── SelectAlgorithm.csproj
└── Utils.cs
```

1. Create the directory structure:

   ### [Bash](#tab/bash)

   ```bash
   mkdir Models
   mkdir Utilities
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Name Models
   New-Item -ItemType Directory -Name Utilities
   ```

   ---

2. Create the code files:

   ### [Bash](#tab/bash)

   ```bash
   touch CompareAll.cs
   touch Utils.cs
   touch Models/Configuration.cs
   touch Models/HotelData.cs
   touch Utilities/AzureIdentityTokenHandler.cs
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType File -Name CompareAll.cs
   New-Item -ItemType File -Name Utils.cs
   New-Item -ItemType File -Path Models\Configuration.cs
   New-Item -ItemType File -Path Models\HotelData.cs
   New-Item -ItemType File -Path Utilities\AzureIdentityTokenHandler.cs
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
- Calls `CompareAll.Run()` to execute the flat project entry point
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

## Run the code

1. Build the project:

   ```bash
   dotnet build
   ```

2. Run the flat `SelectAlgorithm.csproj` entry point to compare all 9 algorithm × similarity combinations:

   ```bash
   dotnet run
   ```

   The application loads the sample data once, then creates and tests all 9 algorithm × similarity combinations sequentially.

3. The compare-all mode always runs all 9 combinations (3 algorithms × 3 metrics). The `ALGORITHM` and `SIMILARITY` environment variables are used only by the single-algorithm mode.

4. Repeat `dotnet run` whenever you want to rerun the flat `SelectAlgorithm.csproj` entry point:

   ### [Bash](#tab/bash)

   ```bash
   dotnet run
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   dotnet run
   ```

   ---

### Expected output

The application displays progress logs and a comparison table:

```
============================================================
  Compare All Algorithms × Metrics
  9 combinations: IVF, HNSW, DiskANN × COS, L2, IP
============================================================
Dropped existing 'hotels' collection (if any)

Loaded 50 documents with embeddings
Inserted 50/50 documents

Query: "luxury hotel near the beach"
Top K: 5
Embedding generated (reused for all searches)

Running 9 algorithm × metric combinations...
  ✓ vector_ivf_cos created
  ✓ vector_ivf_l2 created
  ✓ vector_ivf_ip created
  ✓ vector_hnsw_cos created
  ✓ vector_hnsw_l2 created
  ✓ vector_hnsw_ip created
  ✓ vector_diskann_cos created
  ✓ vector_diskann_l2 created
  ✓ vector_diskann_ip created

┌──────────┬────────┬────────────────────────────┬────────┬────────────────────────────┬────────┬───────┐
│ Algorithm│ Metric │ Top 1 Result               │ Score  │ Top 2 Result               │ Score  │ Diff  │
├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤
│ IVF      │ COS    │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤
│ IVF      │ L2     │ Ocean Water Resort & Spa   │ 0.8736 │ Windy Ocean Motel          │ 0.9943 │ 0.1208│
├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤
│ IVF      │ IP     │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤
│ HNSW     │ COS    │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤
│ HNSW     │ L2     │ Ocean Water Resort & Spa   │ 0.8736 │ Windy Ocean Motel          │ 0.9943 │ 0.1208│
├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤
│ HNSW     │ IP     │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤
│ DiskANN  │ COS    │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤
│ DiskANN  │ L2     │ Ocean Water Resort & Spa   │ 0.8736 │ Windy Ocean Motel          │ 0.9943 │ 0.1208│
├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤
│ DiskANN  │ IP     │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
└──────────┴────────┴────────────────────────────┴────────┴────────────────────────────┴────────┴───────┘

Summary: 9 succeeded, 0 failed

Cleanup: dropped collection 'hotels'

Done!
```

The **Diff** column shows the score gap between the top-1 and top-2 results. A smaller diff indicates the algorithm found results with more similar relevance scores.

[!INCLUDE[Choosing the right algorithm](../includes/choosing-algorithm.md)]

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `TimeoutException` during connection | Verify your connection string and environment variables. Ensure your IP is in the DocumentDB firewall rules. |
| `AuthenticationException` | Check that `DefaultAzureCredential` can acquire a token. Run `az login` to refresh your credentials. |
| Build errors with .NET version | Ensure you have .NET 8.0 or later installed. Run `dotnet --version` to check. |
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
