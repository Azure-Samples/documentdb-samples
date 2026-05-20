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
       "start": "node dist/compare-all.js"
     }
   }
   ```

6. Set the required environment variables in your shell before running the sample:

   ### [Bash](#tab/bash)

   ```bash
   export AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
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
   $env:AZURE_OPENAI_EMBEDDING_ENDPOINT = "https://<RESOURCE-NAME>.openai.azure.com"
   $env:DATA_FILE_WITH_VECTORS = "data/Hotels_Vector.json"
   $env:EMBEDDED_FIELD = "DescriptionVector"
   $env:EMBEDDING_DIMENSIONS = "1536"
   $env:LOAD_SIZE_BATCH = "100"
   $env:DOCUMENTDB_CLUSTER_NAME = "<CLUSTER-NAME>"
   $env:AZURE_DOCUMENTDB_DATABASENAME = "Hotels"
   ```

   Replace the placeholder values with your own information:

   - `AZURE_OPENAI_EMBEDDING_ENDPOINT`: Your Azure OpenAI resource endpoint URL
   - `DOCUMENTDB_CLUSTER_NAME`: Your Azure DocumentDB cluster name

   The compare-all mode always runs all 9 combinations (3 algorithms × 3 metrics). The `ALGORITHM` and `SIMILARITY` environment variables are used only by the single-algorithm mode.

   You should always prefer passwordless authentication, but it requires additional setup. For more information on setting up managed identity and the full range of your authentication options, see [Authenticate JavaScript apps to Azure services using the Azure SDK for JavaScript](/azure/developer/javascript/sdk/authentication/overview).

## Create code files

Create the following project structure:

```
select-algorithm-typescript/
├── data/
│   └── README.md
├── output/
│   └── compare_all.txt
├── src/
│   ├── compare-all.ts
│   ├── select-algorithm.ts
│   └── utils.ts
├── .gitignore
├── package.json
├── package-lock.json
├── quickstart.md
├── README.md
└── tsconfig.json
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

Create the `src/compare-all.ts` file with the following code:

:::code language="typescript" source="~/../documentdb-samples/ai/select-algorithm-typescript/src/compare-all.ts" :::

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
Using Azure OpenAI Embedding Deployment/Model: text-embedding-3-small
Reading JSON file from data/Hotels_Vector.json
Loaded 50 documents
Processing in batches of 50...
Batch 1 complete: 50 inserted

Query: "luxury hotel near the beach"
Embedding generated (1536 dimensions)

Running searches (top 5 results)...  ✓ vector_ivf_cos created
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

Cleanup: dropped collection "hotels"
Database connection closed
```

The **Diff** column shows the score gap between the top-1 and top-2 results. A smaller diff indicates the algorithm found results with more similar relevance scores.

> [!NOTE]
> Latency values are approximate and vary by environment. Scores may differ slightly depending on your Azure OpenAI embedding deployment.

### Run all combinations

The compare-all mode always runs all 9 combinations (3 algorithms × 3 metrics). The `ALGORITHM` and `SIMILARITY` environment variables are used only by the single-algorithm mode.

```bash
npm run build
npm start
```

### Understanding the results

The comparison table demonstrates key behaviors of vector search in DocumentDB:

- **All algorithms return identical results on small datasets.** With 50 documents, every algorithm finds the same matches because the dataset fits entirely in memory regardless of index structure. Algorithm selection becomes important at scale (millions of documents) where tradeoffs in latency, memory, and recall diverge.

- **COS and IP produce identical scores** (0.6184 / 0.5056) because the `text-embedding-3-small` model outputs normalized (unit-length) vectors. For normalized vectors, cosine similarity equals inner product mathematically.

- **L2 (Euclidean distance) scores represent distance.** In this output, the top result has the lower L2 score (0.8736) and the second result is farther away (0.9943).

- **Score separation (Diff column)** shows the gap between the top two results. A smaller diff indicates the algorithm found results with more similar relevance scores.

[!INCLUDE[Choosing the right algorithm](../includes/choosing-algorithm.md)]

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `MongoServerSelectionError` | Verify your `DOCUMENTDB_CLUSTER_NAME` environment variable and ensure your IP is in the DocumentDB firewall rules. |
| `MongoServerError: Authentication failed` | Check your authentication setup and verify you've run `az login` for passwordless auth. |
| TypeScript compilation errors | Run `npx tsc --version` to verify TypeScript is installed. Check `tsconfig.json` settings match the values shown in this article. |
| `Cannot find module` errors | Run `npm install` to ensure all dependencies are installed. |
| `Embedding dimension mismatch` | Verify the `AZURE_OPENAI_EMBEDDING_MODEL` environment variable matches the model deployed in your Azure OpenAI resource. |
| Empty search results | The vector index may not be ready yet. The code retries up to 6 total attempts with a 2-second delay between attempts. |

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
