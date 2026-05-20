---
title: Quickstart - Vector index with Python
description: Compare vector index algorithms and similarity functions using the Python SDK in Azure DocumentDB to optimize search performance for your workload.
ms.devlang: python
ms.topic: quickstart-sdk
ms.date: 05/07/2026
ms.custom: sfi-ropc-nochange
ai-usage: ai-generated
author: diberry
ms.author: diberry
ms.service: azure-documentdb
---

# Quickstart: Vector index with Python in Azure DocumentDB

In this quickstart, you compare three vector index algorithms (DiskANN, HNSW, and IVF) and three similarity functions (cosine, L2, and inner product) to find the optimal configuration for your search workload. This quickstart uses a sample hotel dataset with pre-calculated embeddings from the `text-embedding-3-small` model.



Find the [sample code](https://github.com/Azure-Samples/documentdb-samples/tree/main/ai/select-algorithm-python) on GitHub.

## Prerequisites

[!INCLUDE[Prerequisites](includes/prerequisite-quickstart-vector-index.md)]

- [Python](https://www.python.org/downloads/) 3.10 or greater

## Create data file with vectors

1. Create a new data directory and download the hotels data file with vectors:

   ### [Bash](#tab/bash)

   ```bash
   mkdir -p data
   curl -o data/Hotels_Vector.json https://raw.githubusercontent.com/Azure-Samples/documentdb-samples/main/data/Hotels_Vector.json
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Force -Path data
   Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Azure-Samples/documentdb-samples/main/data/Hotels_Vector.json" -OutFile "data/Hotels_Vector.json"
   ```

   ---

   Verify the file was downloaded:

   ### [Bash](#tab/bash)

   ```bash
   ls data/
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   Get-ChildItem data/
   ```

   ---

   You should see `Hotels_Vector.json` in the `data` directory.

## Create a Python project

1. Create a new directory for your project and open it in Visual Studio Code:

   ### [Bash](#tab/bash)

   ```bash
   mkdir -p select-algorithm
   cd select-algorithm
   code .
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Force -Path select-algorithm
   Set-Location select-algorithm
   code .
   ```

   ---

2. In the terminal, create and activate a virtual environment:

   For Windows:

   ```powershell
   python -m venv venv
   venv\Scripts\activate
   ```

   For macOS/Linux:

   ```bash
   python -m venv venv
   source venv/bin/activate
   ```

3. Install the required packages:

   ```bash
   pip install "pymongo>=4.7" openai==1.55.3 azure-identity==1.15.0
   ```

   - `pymongo`: MongoDB driver for Python (≥4.7 required for OIDC authentication)
   - `openai`: OpenAI client library to create vectors
   - `azure-identity`: Azure Identity library for passwordless authentication

   Verify the packages are installed:

   ### [Bash](#tab/bash)

   ```bash
   pip list | grep pymongo
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   pip list | Select-String pymongo
   ```

   ---

   You should see `pymongo` with a version of 4.7 or greater.

4. Create a `.env` file for environment variables in the project root:

   ```bash
   # Azure OpenAI Embedding Settings
   AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   AZURE_OPENAI_EMBEDDING_API_VERSION=2024-10-21
   AZURE_OPENAI_EMBEDDING_ENDPOINT=https://<RESOURCE-NAME>.openai.azure.com
   
   # Data File Paths and Vector Configuration
   DATA_FILE_WITH_VECTORS=../data/Hotels_Vector.json
   EMBEDDED_FIELD=DescriptionVector
   EMBEDDING_DIMENSIONS=1536
   LOAD_SIZE_BATCH=100
   
   # Azure DocumentDB Connection Settings
   DOCUMENTDB_CLUSTER_NAME=<CLUSTER-NAME>
   
   # Azure DocumentDB Database Name
   AZURE_DOCUMENTDB_DATABASENAME=Hotels
   
   # Algorithm Selection (used by compare_all.py)
   # ALGORITHM: "all" | "diskann" | "hnsw" | "ivf"
   ALGORITHM=all
   
   # SIMILARITY: "all" | "COS" | "L2" | "IP"
   SIMILARITY=COS
   ```

   For the passwordless authentication used in this article, replace the placeholder values in the `.env` file with your own information:

   - `AZURE_OPENAI_EMBEDDING_ENDPOINT`: Your Azure OpenAI resource endpoint URL
   - `DOCUMENTDB_CLUSTER_NAME`: Your Azure DocumentDB cluster name

   You should always prefer passwordless authentication, but it requires additional setup. For more information on setting up managed identity and the full range of your authentication options, see [Authenticate Python apps to Azure services by using the Azure SDK for Python](/azure/developer/python/sdk/authentication/overview).

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

   You should see your connection string and Azure OpenAI endpoint values.

## Create code files

Create the following project structure:

```
├── data/
│   └── Hotels_Vector.json       # Hotel data with vector embeddings
└── select-algorithm/
    ├── src/
    │   ├── compare_all.py       # Main comparison script
    │   └── utils.py             # Shared utility functions
    └── .env                     # Environment variables
```

Create the `src` directory:

### [Bash](#tab/bash)

```bash
mkdir -p src
```

### [PowerShell](#tab/powershell)

```powershell
New-Item -ItemType Directory -Force -Path src
```

---

## Create the algorithm comparison code

Create the `src/compare_all.py` file with the following code:

:::code language="python" source="~/../documentdb-samples/ai/select-algorithm-python/src/compare_all.py" :::

This script orchestrates the algorithm comparison by:

- Loading configuration from environment variables
- Initializing MongoDB and Azure OpenAI clients with passwordless authentication
- Loading hotel data with pre-calculated embeddings
- Testing each algorithm/similarity combination by creating a collection, inserting data, creating an index, and executing a search
- Measuring and comparing search performance across all configurations
- Displaying results in a comparison table

## Create utility functions

Create the `src/utils.py` file with the following code:

:::code language="python" source="~/../documentdb-samples/ai/select-algorithm-python/src/utils.py" :::

The utilities provide essential functions for:

- Passwordless authentication to DocumentDB and Azure OpenAI using DefaultAzureCredential
- Reading JSON data files with error handling
- Batch insertion of documents with DocumentDB's 16 MB payload limit in mind
- Formatted display of comparison results showing algorithm performance

## Run the code

Execute the comparison script to test all algorithms with cosine similarity:

```bash
python src/compare_all.py
```

The output shows the comparison across all three algorithms:

```
Vector Algorithm Comparison
   Database: Hotels
   Algorithms: all
   Similarity: COS
   Collections to query: hotels_diskann_cos, hotels_hnsw_cos, hotels_ivf_cos
   Search query: "quintessential lodging near running trails, eateries, retail"

Initializing MongoDB and Azure OpenAI clients...

Loading data from ../data/Hotels_Vector.json...
Loaded 50 documents
Generating query embedding...
Query embedding: 1536 dimensions

--- DiskANN / COS ---
Collection: hotels_diskann_cos
Created collection: hotels_diskann_cos
Inserting 50 documents in batches of 100...
Batch 1 completed: 50 documents inserted
Inserted: 50/50
Created vector index: vectorIndex_diskann_cos
Executing vector search...
Success: 5 results, 145ms

--- HNSW / COS ---
Collection: hotels_hnsw_cos
Created collection: hotels_hnsw_cos
Inserting 50 documents in batches of 100...
Batch 1 completed: 50 documents inserted
Inserted: 50/50
Created vector index: vectorIndex_hnsw_cos
Executing vector search...
Success: 5 results, 132ms

--- IVF / COS ---
Collection: hotels_ivf_cos
Created collection: hotels_ivf_cos
Inserting 50 documents in batches of 100...
Batch 1 completed: 50 documents inserted
Inserted: 50/50
Created vector index: vectorIndex_ivf_cos
Executing vector search...
Success: 5 results, 128ms

==========================================================================================
                    Vector Algorithm Comparison Results
==========================================================================================
Algorithm    Similarity     Top Result               Score        Latency(ms)   
------------------------------------------------------------------------------------------
DiskANN      COS            Twin Dome Motel          0.8947       145           
HNSW         COS            Twin Dome Motel          0.8947       132           
IVF          COS            Twin Dome Motel          0.8947       128           
==========================================================================================

--- DiskANN / COS (hotels_diskann_cos) ---
  1. Twin Dome Motel, Score: 0.8947
  2. Triple Landscape Hotel, Score: 0.8898
  3. Smile Hotel, Score: 0.8855
  4. Gastronomic Landscape Hotel, Score: 0.8797
  5. Twin Landscape Resort, Score: 0.8772
  Latency: 145ms

--- HNSW / COS (hotels_hnsw_cos) ---
  1. Twin Dome Motel, Score: 0.8947
  2. Triple Landscape Hotel, Score: 0.8898
  3. Smile Hotel, Score: 0.8855
  4. Gastronomic Landscape Hotel, Score: 0.8797
  5. Twin Landscape Resort, Score: 0.8772
  Latency: 132ms

--- IVF / COS (hotels_ivf_cos) ---
  1. Twin Dome Motel, Score: 0.8947
  2. Triple Landscape Hotel, Score: 0.8898
  3. Smile Hotel, Score: 0.8855
  4. Gastronomic Landscape Hotel, Score: 0.8797
  5. Twin Landscape Resort, Score: 0.8772
  Latency: 128ms

Closing database connection...
Database connection closed
```

### Test specific combinations

To override environment variables at the command line:

### [Bash](#tab/bash)

```bash
# Test only DiskANN across all similarity functions
ALGORITHM=diskann SIMILARITY=all python src/compare_all.py
```

```bash
# Test all algorithms with L2 distance
ALGORITHM=all SIMILARITY=L2 python src/compare_all.py
```

```bash
# Test HNSW with inner product
ALGORITHM=hnsw SIMILARITY=IP python src/compare_all.py
```

### [PowerShell](#tab/powershell)

```powershell
# Test only DiskANN across all similarity functions
$env:ALGORITHM="diskann"; $env:SIMILARITY="all"; python src/compare_all.py
```

```powershell
# Test all algorithms with L2 distance
$env:ALGORITHM="all"; $env:SIMILARITY="L2"; python src/compare_all.py
```

```powershell
# Test HNSW with inner product
$env:ALGORITHM="hnsw"; $env:SIMILARITY="IP"; python src/compare_all.py
```

---

> [!NOTE]
> When using `SIMILARITY=all`, the script tests all three similarity functions (COS, L2, IP) for each selected algorithm. Combined with `ALGORITHM=all`, this runs all 9 combinations (3 algorithms × 3 similarity functions). Each combination creates a separate collection, so the full run takes longer.

### Understanding the results

The comparison table helps you choose the best configuration for your workload:

- **Latency**: Query execution time in milliseconds. Lower is better for user-facing search.
- **Score**: Similarity score using the selected function. Higher scores indicate better matches.
- **Top Result**: The highest-scoring hotel for the query. Consistency across algorithms indicates stable results.

[!INCLUDE[Choosing the right algorithm](../includes/choosing-algorithm.md)]

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ServerSelectionTimeoutError` | Verify your connection string in `.env`. Ensure your IP is in the DocumentDB firewall rules. |
| `AuthenticationFailed` | Check that your connection string includes the correct username and password, or that your Microsoft Entra token is valid. |
| `pymongo.errors.OperationFailure` | Ensure the database and collection exist. Check that the vector index was created successfully. |
| `ModuleNotFoundError: No module named 'pymongo'` | Activate your virtual environment and run `pip install "pymongo>=4.7"`. |
| Empty search results | The vector index may not be ready yet. The script includes retry logic, but large datasets may require longer wait times. |

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
