---
title: Quickstart - Vector index with Go
description: Compare DiskANN, HNSW, and IVF vector index algorithms using Go to select and tune the optimal index for your workload
ms.devlang: golang
ms.topic: quickstart-sdk
ms.date: 05/07/2026
ms.custom: sfi-ropc-nochange
ai-usage: ai-generated
author: diberry
ms.author: diberry
ms.service: azure-documentdb
---

# Quickstart: Vector index with Go in Azure DocumentDB

This quickstart walks you through building a Go application that compares all three vector index algorithms (DiskANN, HNSW, and IVF) side by side with different similarity functions to help you choose the best configuration for your workload. The sample uses a hotels dataset with pre-calculated embeddings from the `text-embedding-3-small` model.



Find the [sample code](https://github.com/Azure-Samples/documentdb-samples/tree/main/ai/select-algorithm-go) on GitHub.

## Prerequisites

[!INCLUDE[Prerequisites](includes/prerequisite-quickstart-vector-index.md)]

- [Go](https://go.dev/doc/install) 1.22 or greater

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

   Verify the file was downloaded:

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

## Create a Go project

1. Create a new directory for your project and open it in Visual Studio Code:

   ### [Bash](#tab/bash)

   ```bash
   mkdir select-algorithm-go
   cd select-algorithm-go
   code .
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Name select-algorithm-go
   Set-Location select-algorithm-go
   code .
   ```

   ---

2. Initialize a new Go module:

   ```bash
   go mod init documentdb-vector-samples
   ```

   Verify the module was initialized:

   ### [Bash](#tab/bash)

   ```bash
   cat go.mod
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   Get-Content go.mod
   ```

   ---

3. Install the required packages:

   ```bash
   go get github.com/Azure/azure-sdk-for-go/sdk/azcore@v1.20.0
   go get github.com/Azure/azure-sdk-for-go/sdk/azidentity@v1.13.1
   go get github.com/openai/openai-go/v3@v3.12.0
   go get go.mongodb.org/mongo-driver@v1.17.6
   go mod tidy
   ```

   - `azcore`: Core Azure SDK functionality for Go
   - `azidentity`: Azure Identity library for passwordless authentication with DefaultAzureCredential
   - `openai-go/v3`: OpenAI client library with Azure support to generate embeddings
   - `mongo-driver`: Official MongoDB driver for Go to work with DocumentDB

   Verify the packages are installed:

   ### [Bash](#tab/bash)

   ```bash
   go list -m all | grep mongo
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   go list -m all | Select-String mongo
   ```

   ---

4. Create a `.env` file for environment variables in `select-algorithm-go`:

   ```bash
   # Azure OpenAI Embedding Configuration
   AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   AZURE_OPENAI_EMBEDDING_API_VERSION=2023-05-15
   AZURE_OPENAI_EMBEDDING_ENDPOINT=https://your-openai-resource.openai.azure.com/

   # Data File Configuration
   DATA_FILE_WITH_VECTORS=data/Hotels_Vector.json
   EMBEDDED_FIELD=DescriptionVector
   EMBEDDING_DIMENSIONS=1536
   LOAD_SIZE_BATCH=100

   # DocumentDB Configuration
   DOCUMENTDB_CLUSTER_NAME=your-cluster-name

   # Leave ALGORITHM and SIMILARITY unset to run all combinations

   # Database name
   AZURE_DOCUMENTDB_DATABASENAME=Hotels
   ```

   For the passwordless authentication used in this article, replace the placeholder values in the `.env` file with your own information:

   - `AZURE_OPENAI_EMBEDDING_ENDPOINT`: Your Azure OpenAI resource endpoint URL
   - `DOCUMENTDB_CLUSTER_NAME`: Your Azure DocumentDB cluster name (not the full connection string, just the name)

   Verify the `.env` file was created:

   ### [Bash](#tab/bash)

   ```bash
   cat .env
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   Get-Content .env
   ```

   ---

   You should always prefer passwordless authentication. For more information on setting up managed identity and the full range of your authentication options, see [Authenticate Go apps to Azure services by using the Azure SDK for Go](/azure/developer/go/azure-sdk-authentication).

## Create code files

Create a `src` directory and add the main application file:

### [Bash](#tab/bash)

```bash
mkdir src
touch src/main.go
```

### [PowerShell](#tab/powershell)

```powershell
New-Item -ItemType Directory -Name src
New-Item -ItemType File -Path src/main.go
```

---

When you're done, the project structure should look like this:

```
├── data/
│   ├── Hotels.json              # Source hotel data (without vectors)
│   └── Hotels_Vector.json       # Hotel data with vector embeddings
└── select-algorithm-go/
    ├── src/
    │   └── main.go              # Main application comparing all algorithms
    ├── go.mod                   # Go module dependencies
    ├── go.sum                   # Dependency checksums
    └── .env                     # Environment configuration
```

## Create the algorithm comparison code

Create the following source files in the `src` directory.

### src/main.go

:::code language="go" source="~/../documentdb-samples/ai/select-algorithm-go/src/main.go" :::

### src/compare_all.go

:::code language="go" source="~/../documentdb-samples/ai/select-algorithm-go/src/compare_all.go" :::

### src/utils.go

:::code language="go" source="~/../documentdb-samples/ai/select-algorithm-go/src/utils.go" :::

This code provides a complete vector algorithm comparison application with these key features:

- **Passwordless authentication**: Uses `DefaultAzureCredential` for both Azure OpenAI and DocumentDB via OIDC
- **Three vector algorithms**: Implements DiskANN, HNSW, and IVF with algorithm-specific tuning parameters
- **Three similarity functions**: Supports COS (cosine), L2 (Euclidean), and IP (inner product)
- **Single compare-all entry point**: Runs all 9 algorithm × similarity combinations in one pass
- **Performance measurement**: Tracks query latency for each algorithm/similarity pair
- **Comparison output**: Generates a formatted table showing results side by side
- **Production-ready patterns**: Includes batched insertion, error handling, and connection pooling

## Run the code

Before running the code, source your `.env` file to load environment variables into your shell session.

### [Bash](#tab/bash)

```bash
export $(grep -v '^#' .env | xargs)
```

### [PowerShell](#tab/powershell)

```powershell
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)') {
        [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim())
    }
}
```

---

After sourcing the environment variables, run the application:

```bash
go run ./src/
```

The application will:

1. Connect to Azure DocumentDB and Azure OpenAI using passwordless authentication
2. Create separate collections for each algorithm/similarity combination
3. Insert the hotel data into each collection
4. Create a vector index on each collection with algorithm-specific parameters
5. Generate an embedding for the search query
6. Execute vector searches across all collections
7. Display a comparison table with results and latencies

Expected output:

```
Vector Algorithm Comparison
   Database: Hotels
   Algorithms: all
   Similarity: COS
   Collections to query: hotels_diskann_cos, hotels_hnsw_cos, hotels_ivf_cos
   Search query: "quintessential lodging near running trails, eateries, retail"

Initializing MongoDB and Azure OpenAI clients...
Loading data from data/Hotels_Vector.json...
Loaded 50 documents
Generating query embedding...
Query embedding: 1536 dimensions

━━━ DiskANN / COS ━━━
Collection: hotels_diskann_cos
Created collection: hotels_diskann_cos
Inserted: 50/50
Created vector index: vectorIndex_diskann_cos
Executing vector search...
[OK] 5 results, 42ms

━━━ HNSW / COS ━━━
Collection: hotels_hnsw_cos
Created collection: hotels_hnsw_cos
Inserted: 50/50
Created vector index: vectorIndex_hnsw_cos
Executing vector search...
[OK] 5 results, 38ms

━━━ IVF / COS ━━━
Collection: hotels_ivf_cos
Created collection: hotels_ivf_cos
Inserted: 50/50
Created vector index: vectorIndex_ivf_cos
Executing vector search...
[OK] 5 results, 35ms

╔══════════════════════════════════════════════════════════════════════════════════╗
║                     Vector Algorithm Comparison Results                         ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║ Algorithm   Similarity    Top Result              Score       Latency(ms)      ║
╠══════════════════════════════════════════════════════════════════════════════════╣
║ DiskANN     COS           Secret Point Motel       0.8562      42              ║
║ HNSW        COS           Secret Point Motel       0.8562      38              ║
║ IVF         COS           Secret Point Motel       0.8562      35              ║
╚══════════════════════════════════════════════════════════════════════════════════╝

--- DiskANN / COS (hotels_diskann_cos) ---
  1. Secret Point Motel, Score: 0.8562
  2. Countryside Hotel, Score: 0.8457
  3. Downtown Modern Hotel, Score: 0.8398
  4. Old Century Hotel, Score: 0.8321
  5. Save-the-Light Deluxe Inn, Score: 0.8298
  Latency: 42ms

--- HNSW / COS (hotels_hnsw_cos) ---
  1. Secret Point Motel, Score: 0.8562
  2. Countryside Hotel, Score: 0.8457
  3. Downtown Modern Hotel, Score: 0.8398
  4. Old Century Hotel, Score: 0.8321
  5. Save-the-Light Deluxe Inn, Score: 0.8298
  Latency: 38ms

--- IVF / COS (hotels_ivf_cos) ---
  1. Secret Point Motel, Score: 0.8562
  2. Countryside Hotel, Score: 0.8457
  3. Downtown Modern Hotel, Score: 0.8398
  4. Old Century Hotel, Score: 0.8321
  5. Save-the-Light Deluxe Inn, Score: 0.8298
  Latency: 35ms

Done.
```

## Understanding the results

The comparison table shows how different algorithms perform on the same dataset with the same query:

- **Algorithm**: DiskANN, HNSW, or IVF
- **Similarity**: The distance metric (COS, L2, or IP)
- **Top Result**: The highest-scoring hotel from the search
- **Score**: Similarity score (higher is better for COS and IP, lower is better for L2)
- **Latency**: Query execution time in milliseconds

[!INCLUDE[Choosing the right algorithm](../includes/choosing-algorithm.md)]

## Run all combinations

Leave `ALGORITHM` and `SIMILARITY` unset to run all 9 algorithm × similarity combinations.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `server selection error` | Verify your connection string in `.env`. Ensure your IP is in the DocumentDB firewall rules. |
| `authentication failed` | Check credentials in connection string. Ensure `DefaultAzureCredential` is configured (run `az login`). |
| `go: module not found` | Run `go mod tidy` to resolve dependencies. |
| Build errors | Ensure Go 1.22+ is installed. Run `go version` to check. |
| Empty search results | The vector index may not be ready yet. The code includes retry logic, but larger datasets may need more time. |

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
