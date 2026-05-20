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

   # The compare-all mode always runs all 9 combinations (3 algorithms × 3 metrics).
   # The ALGORITHM and SIMILARITY environment variables are used only by the single-algorithm mode.

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

```text
select-algorithm-go/
├── data/
│   └── README.md
├── output/
│   └── compare_all.txt
├── src/
│   ├── compare_all.go
│   ├── main.go
│   └── utils.go
├── .gitignore
├── go.mod
├── quickstart.md
└── README.md
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
- **Single compare-all entry point**: Always runs all 9 algorithm × similarity combinations in one pass
- **Index lifecycle automation**: Creates, queries, and drops each vector index in sequence
- **Comparison output**: Generates a formatted table showing the top two results and score gap for each combination
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
2. Load the hotel data and insert it into the `hotels` collection
3. Generate an embedding for the search query
4. Run all 9 vector index comparisons by creating, querying, and dropping each index in sequence
5. Display a comparison table with the top two results and score gap for each combination
6. Drop the `hotels` collection during cleanup

Expected output:

```text
======================================================================
  COMPARE ALL: 3 Algorithms × 3 Similarity Metrics (9 combinations)
======================================================================
Query:  "luxury hotel near the beach"
Top-K:  5

Loading data from data/Hotels_Vector.json...
Loaded 50 documents with embeddings
Insertion completed: 50 inserted, 0 failed

Generating embedding for query: "luxury hotel near the beach"
Embedding generated (1536 dimensions)

Running 9 vector index comparisons (create→search→drop)...
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
│ IVF      │ L2     │ Ocean Water Resort & Spa   │ 0.8736 │ Windy Ocean Motel          │ 0.9943 │ 0.1208│
│ IVF      │ IP     │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
│ HNSW     │ COS    │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
│ HNSW     │ L2     │ Ocean Water Resort & Spa   │ 0.8736 │ Windy Ocean Motel          │ 0.9943 │ 0.1208│
│ HNSW     │ IP     │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
│ DiskANN  │ COS    │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
│ DiskANN  │ L2     │ Ocean Water Resort & Spa   │ 0.8736 │ Windy Ocean Motel          │ 0.9943 │ 0.1208│
│ DiskANN  │ IP     │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
└──────────┴────────┴────────────────────────────┴────────┴────────────────────────────┴────────┴───────┘

Summary: 9 succeeded, 0 failed

Cleanup: dropped collection 'hotels'
```

The **Diff** column shows the score gap between the top-1 and top-2 results. A smaller diff indicates the algorithm found results with more similar relevance scores.

## Understanding the results

The comparison table shows how different algorithms perform on the same dataset with the same query:

- **Algorithm**: DiskANN, HNSW, or IVF
- **Metric**: The similarity metric (COS, L2, or IP)
- **Top 1 Result**: The highest-ranked hotel for that algorithm and metric
- **Score**: The relevance score for the corresponding result
- **Top 2 Result**: The second-highest-ranked hotel for that algorithm and metric
- **Diff**: The score gap between the top two results

[!INCLUDE[Choosing the right algorithm](../includes/choosing-algorithm.md)]

## Run all combinations

The compare-all mode always runs all 9 combinations (3 algorithms × 3 metrics). The `ALGORITHM` and `SIMILARITY` environment variables are used only by the single-algorithm mode.

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
