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
   curl -o data/Hotels_Vector.json https://raw.githubusercontent.com/Azure-Samples/documentdb-samples/refs/heads/main/ai/data/Hotels_Vector.json
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Force -Path data
   Invoke-WebRequest -Uri "https://raw.githubusercontent.com/Azure-Samples/documentdb-samples/refs/heads/main/ai/data/Hotels_Vector.json" -OutFile "data/Hotels_Vector.json"
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

4. Set the required environment variables in your current shell session before you run the sample:

   ### [Bash](#tab/bash)

   ```bash
   export AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   export AZURE_OPENAI_EMBEDDING_API_VERSION=2024-10-21
   export AZURE_OPENAI_EMBEDDING_ENDPOINT=https://<RESOURCE-NAME>.openai.azure.com
   export DATA_FILE_WITH_VECTORS=data/Hotels_Vector.json
   export EMBEDDED_FIELD=DescriptionVector
   export EMBEDDING_DIMENSIONS=1536
   export LOAD_SIZE_BATCH=100
   export DOCUMENTDB_CLUSTER_NAME=<CLUSTER-NAME>
   export AZURE_DOCUMENTDB_DATABASENAME=Hotels
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   $env:AZURE_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
   $env:AZURE_OPENAI_EMBEDDING_API_VERSION = "2024-10-21"
   $env:AZURE_OPENAI_EMBEDDING_ENDPOINT = "https://<RESOURCE-NAME>.openai.azure.com"
   $env:DATA_FILE_WITH_VECTORS = "data/Hotels_Vector.json"
   $env:EMBEDDED_FIELD = "DescriptionVector"
   $env:EMBEDDING_DIMENSIONS = "1536"
   $env:LOAD_SIZE_BATCH = "100"
   $env:DOCUMENTDB_CLUSTER_NAME = "<CLUSTER-NAME>"
   $env:AZURE_DOCUMENTDB_DATABASENAME = "Hotels"
   ```

   ---

   For the passwordless authentication used in this article, replace the placeholder values with your own information:

   - `AZURE_OPENAI_EMBEDDING_ENDPOINT`: Your Azure OpenAI resource endpoint URL
   - `DOCUMENTDB_CLUSTER_NAME`: Your Azure DocumentDB cluster name

   The compare-all mode always runs all 9 combinations (3 algorithms × 3 metrics). The `ALGORITHM` and `SIMILARITY` environment variables are used only by the single-algorithm mode.

   You should always prefer passwordless authentication, but it requires additional setup. For more information on setting up managed identity and the full range of your authentication options, see [Authenticate Python apps to Azure services by using the Azure SDK for Python](/azure/developer/python/sdk/authentication/overview).

## Create code files

Create the following project structure:

```
select-algorithm-python/
├── data/
│   └── README.md
├── output/
│   └── compare_all.txt
├── src/
│   ├── compare_all.py
│   └── utils.py
├── .gitignore
├── quickstart.md
├── README.md
└── requirements.txt
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

Execute the comparison script to run all 9 combinations:

```bash
python src/compare_all.py
```

The output matches `output/compare_all.txt`:

```
======================================================================
  Compare All Algorithms — 9 Combinations
  (3 Algorithms × 3 Similarity Metrics)
======================================================================

  Query:  "luxury hotel near the beach"
  Top K:  5

Dropped existing 'hotels' collection (if any)
Loaded 50 documents with embeddings
Inserted 50/50 documents

Generating embedding for query...
Running 9 vector searches...

  Created index 'vector_ivf_cos'
  Created index 'vector_ivf_l2'
  Created index 'vector_ivf_ip'
  Created index 'vector_hnsw_cos'
  Created index 'vector_hnsw_l2'
  Created index 'vector_hnsw_ip'
  Created index 'vector_diskann_cos'
  Created index 'vector_diskann_l2'
  Created index 'vector_diskann_ip'
+-------------+----------+--------------------------+---------+-------------------+---------+--------+
| Algorithm   | Metric   | Top 1 Result             |   Score | Top 2 Result      |   Score |   Diff |
+=============+==========+==========================+=========+===================+=========+========+
| IVF         | COS      | Ocean Water Resort & Spa |  0.6184 | Windy Ocean Motel |  0.5057 | 0.1128 |
+-------------+----------+--------------------------+---------+-------------------+---------+--------+
| IVF         | L2       | Ocean Water Resort & Spa |  0.8735 | Windy Ocean Motel |  0.9942 | 0.1207 |
+-------------+----------+--------------------------+---------+-------------------+---------+--------+
| IVF         | IP       | Ocean Water Resort & Spa |  0.6183 | Windy Ocean Motel |  0.5056 | 0.1127 |
+-------------+----------+--------------------------+---------+-------------------+---------+--------+
| HNSW        | COS      | Ocean Water Resort & Spa |  0.6184 | Windy Ocean Motel |  0.5057 | 0.1128 |
+-------------+----------+--------------------------+---------+-------------------+---------+--------+
| HNSW        | L2       | Ocean Water Resort & Spa |  0.8735 | Windy Ocean Motel |  0.9942 | 0.1207 |
+-------------+----------+--------------------------+---------+-------------------+---------+--------+
| HNSW        | IP       | Ocean Water Resort & Spa |  0.6183 | Windy Ocean Motel |  0.5056 | 0.1127 |
+-------------+----------+--------------------------+---------+-------------------+---------+--------+
| DiskANN     | COS      | Ocean Water Resort & Spa |  0.6184 | Windy Ocean Motel |  0.5057 | 0.1128 |
+-------------+----------+--------------------------+---------+-------------------+---------+--------+
| DiskANN     | L2       | Ocean Water Resort & Spa |  0.8735 | Windy Ocean Motel |  0.9942 | 0.1207 |
+-------------+----------+--------------------------+---------+-------------------+---------+--------+
| DiskANN     | IP       | Ocean Water Resort & Spa |  0.6183 | Windy Ocean Motel |  0.5056 | 0.1127 |
+-------------+----------+--------------------------+---------+-------------------+---------+--------+

Summary: 9 succeeded, 0 failed

Cleanup: dropped collection 'hotels'
```

The **Diff** column shows the score gap between the top-1 and top-2 results. A smaller diff indicates the algorithm found results with more similar relevance scores.

### Run all combinations

The compare-all mode always runs all 9 combinations (3 algorithms × 3 metrics). The `ALGORITHM` and `SIMILARITY` environment variables are used only by the single-algorithm mode.

### [Bash](#tab/bash)

```bash
python src/compare_all.py
```

### [PowerShell](#tab/powershell)

```powershell
python src/compare_all.py
```

---

### Understanding the results

The comparison table helps you choose the best configuration for your workload:

- **Latency**: Query execution time in milliseconds. Lower is better for user-facing search.
- **Score**: Similarity score using the selected function. Higher scores indicate better matches.
- **Top Result**: The highest-scoring hotel for the query. Consistency across algorithms indicates stable results.

[!INCLUDE[Choosing the right algorithm](../includes/choosing-algorithm.md)]

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ServerSelectionTimeoutError` | Verify that your environment variables are set in the current shell. Ensure your IP is in the DocumentDB firewall rules. |
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
