---
title: Quickstart - Vector index with TypeScript
description: Compare vector index algorithms and similarity functions using TypeScript in Azure DocumentDB to optimize search performance for your workload.
ms.devlang: typescript
ms.topic: quickstart-sdk
ms.date: 05/07/2026
ms.custom: sfi-ropc-nochange
ai-usage: ai-generated
author: diberry
ms.author: diberry
ms.service: azure-documentdb
---

# Quickstart: Vector index with TypeScript in Azure DocumentDB

In this quickstart, you compare three vector index algorithms (DiskANN, HNSW, and IVF) and three similarity functions (cosine, L2, and inner product) to find the optimal configuration for your search workload. This quickstart uses a sample hotel dataset with pre-calculated embeddings from the `text-embedding-3-small` model.



Find the [sample code](https://github.com/Azure-Samples/documentdb-samples/tree/main/ai/select-algorithm-typescript) on GitHub.

## Prerequisites

[!INCLUDE[Prerequisites](includes/prerequisite-quickstart-vector-index.md)]

- [Node.js LTS](https://nodejs.org/download/)
- [TypeScript](https://www.typescriptlang.org/download) 5.x or greater

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

2. Download the `Hotels_Vector.json` data file with vectors to your `data` directory:

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

## Create a Node.js project

1. Create a new directory for your project and open it in Visual Studio Code:

   ### [Bash](#tab/bash)

   ```bash
   mkdir select-algorithm-typescript
   cd select-algorithm-typescript
   code .
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Name select-algorithm-typescript
   Set-Location select-algorithm-typescript
   code .
   ```

   ---

2. Initialize a TypeScript Node.js project:

   ```bash
   npm init -y
   ```

   Verify the project was initialized:

   ### [Bash](#tab/bash)

   ```bash
   ls package.json
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   Get-ChildItem package.json
   ```

   ---

3. Install the required packages:

   ```bash
   npm install mongodb openai @azure/identity
   npm install --save-dev typescript @types/node
   ```

   - `mongodb`: MongoDB driver for Node.js
   - `openai`: OpenAI client library to create vectors
   - `@azure/identity`: Azure Identity library for passwordless authentication
   - `typescript`: TypeScript compiler

   Verify: `npm list` shows all installed packages without errors.

4. Create a `tsconfig.json` file in the project root:

   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "Node16",
       "moduleResolution": "Node16",
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "resolveJsonModule": true,
       "strict": true,
       "rootDir": "./src",
       "outDir": "./dist"
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules"]
   }
   ```

5. Update your `package.json` to include:

   ```json
   {
     "type": "module",
     "scripts": {
       "build": "tsc",
       "start": "node --env-file .env dist/select-algorithm.js"
     }
   }
   ```

6. Create a `.env` file for environment variables in the project root:

   ```bash
   # Azure OpenAI Embedding Settings
   AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
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

   # Algorithm Selection (used by select-algorithm.ts)
   # ALGORITHM: "all" | "diskann" | "hnsw" | "ivf"
   ALGORITHM=all

   # SIMILARITY: "all" | "COS" | "L2" | "IP"
   SIMILARITY=all
   ```

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

   You should see your configuration values including the Azure OpenAI endpoint and cluster name.

   For the passwordless authentication used in this article, replace the placeholder values in the `.env` file with your own information:

   - `AZURE_OPENAI_EMBEDDING_ENDPOINT`: Your Azure OpenAI resource endpoint URL
   - `DOCUMENTDB_CLUSTER_NAME`: Your Azure DocumentDB cluster name

   You should always prefer passwordless authentication, but it requires additional setup. For more information on setting up managed identity and the full range of your authentication options, see [Authenticate JavaScript apps to Azure services using the Azure SDK for JavaScript](/azure/developer/javascript/sdk/authentication/overview).

## Create code files

Create the following project structure:

```
├── data/
│   └── Hotels_Vector.json       # Hotel data with vector embeddings
└── select-algorithm-typescript/
    ├── src/
    │   ├── select-algorithm.ts  # Main comparison script
    │   └── utils.ts             # Shared utility functions
    ├── tsconfig.json
    ├── package.json
    └── .env                     # Environment variables
```

Create the `src` directory:

### [Bash](#tab/bash)

```bash
mkdir src
```

### [PowerShell](#tab/powershell)

```powershell
New-Item -ItemType Directory -Name src
```

---

## Create the algorithm comparison code

Create the `src/select-algorithm.ts` file with the following code:

:::code language="typescript" source="~/../documentdb-samples/ai/select-algorithm-typescript/src/select-algorithm.ts" :::

This script orchestrates the algorithm comparison by:

- Loading configuration from environment variables
- Initializing MongoDB and Azure OpenAI clients with passwordless authentication
- Loading hotel data with pre-calculated embeddings
- Testing each algorithm/similarity combination by creating a collection, inserting data, creating an index, and executing a search
- Measuring and comparing search performance across all configurations
- Displaying results in a comparison table

## Create utility functions

Create the `src/utils.ts` file with the following code:

:::code language="typescript" source="~/../documentdb-samples/ai/select-algorithm-typescript/src/utils.ts" :::

The utilities provide essential functions for:

- Passwordless authentication to DocumentDB and Azure OpenAI using DefaultAzureCredential
- Reading JSON data files
- Batch insertion of documents with DocumentDB's 16 MB payload limit in mind
- Formatted display of comparison results showing algorithm performance

## Run the code

Execute the comparison script to test all 9 algorithm × similarity combinations:

```bash
npm run build
npm start
```

The output shows the comparison across all algorithms and similarity metrics:

```
Vector Algorithm Comparison
   Database: Hotels
   Algorithms: all
   Similarity: all
   Collections to query: hotels_diskann_cos, hotels_diskann_l2, hotels_diskann_ip, hotels_hnsw_cos, ...
   Search query: "quintessential lodging near running trails, eateries, retail"

Generating query embedding...
Query embedding: 1536 dimensions

--- DiskANN / COS ---
Collection: hotels_diskann_cos
Created collection: hotels_diskann_cos
Inserted: 50/50
Created vector index: vectorIndex_diskann_cos
Executing vector search...
Success: 5 results, 142ms

...

==========================================================================================
                    Vector Algorithm Comparison Results
==========================================================================================
Algorithm   Similarity    Top Result              Score       Latency(ms)
------------------------------------------------------------------------------------------
DiskANN     COS           Ocean Water Resort &    0.6184      142
DiskANN     L2            Ocean Water Resort &    0.8736      128
DiskANN     IP            Ocean Water Resort &    0.6184      135
HNSW        COS           Ocean Water Resort &    0.6184      119
HNSW        L2            Ocean Water Resort &    0.8736      115
HNSW        IP            Ocean Water Resort &    0.6184      121
IVF         COS           Ocean Water Resort &    0.6184      108
IVF         L2            Ocean Water Resort &    0.8736      105
IVF         IP            Ocean Water Resort &    0.6184      110
==========================================================================================

--- DiskANN / COS (hotels_diskann_cos) ---
  1. Ocean Water Resort & Spa, Score: 0.6184
  2. Windy Ocean Motel, Score: 0.5056
  3. Gastronomic Landscape Hotel, Score: 0.4892
  4. Sublime Palace Hotel, Score: 0.4753
  5. Luxury Lion Resort, Score: 0.4612
  Latency: 142ms
...

Closing database connection...
Database connection closed
```

> [!NOTE]
> Latency values are approximate and vary by environment. Scores may differ slightly depending on your Azure OpenAI embedding deployment.

### Test individual algorithms

To test a specific algorithm, update the `ALGORITHM` and `SIMILARITY` values in your `.env` file:

```bash
# Edit .env to set specific values, for example:
# ALGORITHM=ivf
# SIMILARITY=COS

npm run build
npm start
```

### Understanding the results

The comparison table demonstrates key behaviors of vector search in DocumentDB:

- **All algorithms return identical results on small datasets.** With 50 documents, every algorithm finds the same matches because the dataset fits entirely in memory regardless of index structure. Algorithm selection becomes important at scale (millions of documents) where tradeoffs in latency, memory, and recall diverge.

- **COS and IP produce identical scores** (0.6184 / 0.5056) because the `text-embedding-3-small` model outputs normalized (unit-length) vectors. For normalized vectors, cosine similarity equals inner product mathematically.

- **L2 (Euclidean distance) scores are inverted.** Higher L2 scores mean *more* distance — the #1 result has the *lowest* score (0.8736 = closest to query). This explains the negative Diff value (-0.1208).

- **Score separation (Diff column)** shows confidence. A larger positive diff means the search clearly distinguishes the best match from the second-best. This metric helps evaluate result quality regardless of the absolute score values.

[!INCLUDE[Choosing the right algorithm](../includes/choosing-algorithm.md)]

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `MongoServerSelectionError` | Verify your connection string in `.env`. Ensure your IP is in the DocumentDB firewall rules. |
| `MongoServerError: Authentication failed` | Check credentials in connection string. Verify you've run `az login` for passwordless auth. |
| TypeScript compilation errors | Run `npx tsc --version` to verify TypeScript is installed. Check `tsconfig.json` settings match the values shown in this article. |
| `Cannot find module` errors | Run `npm install` to ensure all dependencies are installed. |
| `Embedding dimension mismatch` | Verify `AZURE_OPENAI_EMBEDDING_MODEL` in `.env` matches the model deployed in your Azure OpenAI resource. |
| Empty search results | The vector index may not be ready yet. The code includes retry logic, but if the dataset is large, increase the wait time. |

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
