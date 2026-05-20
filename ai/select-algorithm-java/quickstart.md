---
title: Quickstart - Vector index with Java
description: Test and compare DiskANN, HNSW, and IVF vector indexes in Azure DocumentDB using Java to select the best algorithm for your vector search workload.
ms.devlang: java
ms.topic: quickstart-sdk
ms.date: 05/07/2026
ms.custom: sfi-ropc-nochange
ai-usage: ai-generated
author: diberry
ms.author: diberry
ms.service: azure-documentdb
---

# Quickstart: Vector index with Java in Azure DocumentDB

This quickstart compares vector index algorithms (DiskANN, HNSW, IVF) in Azure DocumentDB using Java to help you select the best configuration for your vector search workload. The sample uses the same hotel dataset with pre-calculated vectors as the other quickstarts to demonstrate performance differences across algorithms and similarity functions.



## Prerequisites

[!INCLUDE[Prerequisites](includes/prerequisite-quickstart-vector-index.md)]

- [Java 17 or higher](/java/openjdk/download)

- [Maven 3.6 or higher](https://maven.apache.org/download.cgi)

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

   Verify: Confirm the file exists and is valid JSON:

   ### [Bash](#tab/bash)

   ```bash
   ls -lh data/Hotels_Vector.json
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   Get-Item data\Hotels_Vector.json
   ```

   ---

## Create a Java project

1. Create a new directory for your project and open it in Visual Studio Code:

   ### [Bash](#tab/bash)

   ```bash
   mkdir select-algorithm-java
   cd select-algorithm-java
   code .
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Name select-algorithm-java
   Set-Location select-algorithm-java
   code .
   ```

   ---

2. Create a standard Maven project structure:

   ### [Bash](#tab/bash)

   ```bash
   mkdir -p src/main/java/com/azure/documentdb/selectalgorithm
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Path "src\main\java\com\azure\documentdb\selectalgorithm" -Force
   ```

   ---

3. Create a `pom.xml` file in the root directory with the following content:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <project xmlns="http://maven.apache.org/POM/4.0.0"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
       <modelVersion>4.0.0</modelVersion>

       <groupId>com.azure.documentdb</groupId>
       <artifactId>select-algorithm-java</artifactId>
       <version>1.0.0</version>
       <packaging>jar</packaging>

       <name>DocumentDB Select Algorithm - Java</name>
       <description>Demonstrates IVF, HNSW, and DiskANN vector search indexes with Azure DocumentDB</description>

       <properties>
           <maven.compiler.source>17</maven.compiler.source>
           <maven.compiler.target>17</maven.compiler.target>
           <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
       </properties>

       <dependencies>
           <dependency>
               <groupId>org.mongodb</groupId>
               <artifactId>mongodb-driver-sync</artifactId>
               <version>5.4.0</version>
           </dependency>
           <dependency>
               <groupId>com.azure</groupId>
               <artifactId>azure-identity</artifactId>
               <version>1.16.0</version>
           </dependency>
           <dependency>
               <groupId>com.azure</groupId>
               <artifactId>azure-ai-openai</artifactId>
               <version>1.0.0-beta.16</version>
           </dependency>
       </dependencies>

       <build>
           <plugins>
               <plugin>
                   <groupId>org.apache.maven.plugins</groupId>
                   <artifactId>maven-compiler-plugin</artifactId>
                   <version>3.13.0</version>
                   <configuration>
                       <source>17</source>
                       <target>17</target>
                   </configuration>
               </plugin>
               <plugin>
                   <groupId>org.codehaus.mojo</groupId>
                   <artifactId>exec-maven-plugin</artifactId>
                   <version>3.4.1</version>
                   <configuration>
                       <mainClass>com.azure.documentdb.selectalgorithm.Main</mainClass>
                   </configuration>
               </plugin>
           </plugins>
       </build>

       <profiles>
           <profile>
               <id>compare</id>
               <build>
                   <plugins>
                       <plugin>
                           <groupId>org.codehaus.mojo</groupId>
                           <artifactId>exec-maven-plugin</artifactId>
                           <version>3.4.1</version>
                           <configuration>
                               <mainClass>com.azure.documentdb.selectalgorithm.CompareAll</mainClass>
                           </configuration>
                       </plugin>
                   </plugins>
               </build>
           </profile>
       </profiles>
   </project>
   ```

   Verify: Run `mvn dependency:resolve` to confirm all dependencies resolve without errors.

4. Set environment variables in your shell before running the sample:

   ### [Bash](#tab/bash)

   ```bash
   export DOCUMENTDB_CLUSTER_NAME=<your-cluster-name>
   export AZURE_OPENAI_EMBEDDING_ENDPOINT=https://<your-openai-resource>.openai.azure.com/
   export AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
   export AZURE_DOCUMENTDB_DATABASENAME=Hotels
   export DATA_FILE_WITH_VECTORS=data/Hotels_Vector.json
   export EMBEDDED_FIELD=DescriptionVector
   export EMBEDDING_DIMENSIONS=1536
   export LOAD_SIZE_BATCH=100
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   $env:DOCUMENTDB_CLUSTER_NAME="<your-cluster-name>"
   $env:AZURE_OPENAI_EMBEDDING_ENDPOINT="https://<your-openai-resource>.openai.azure.com/"
   $env:AZURE_OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
   $env:AZURE_DOCUMENTDB_DATABASENAME="Hotels"
   $env:DATA_FILE_WITH_VECTORS="data/Hotels_Vector.json"
   $env:EMBEDDED_FIELD="DescriptionVector"
   $env:EMBEDDING_DIMENSIONS="1536"
   $env:LOAD_SIZE_BATCH="100"
   ```

   ---

   Replace the placeholder values with your Azure resource information:

   - `DOCUMENTDB_CLUSTER_NAME`: Your Azure DocumentDB cluster name
   - `AZURE_OPENAI_EMBEDDING_ENDPOINT`: Your Azure OpenAI resource endpoint URL
   - `AZURE_OPENAI_EMBEDDING_MODEL`: Your Azure OpenAI embedding deployment name

   The compare-all mode always runs all 9 combinations (3 algorithms × 3 metrics). The `ALGORITHM` and `SIMILARITY` environment variables are used only by the single-algorithm mode.

   This sample uses passwordless authentication with `DefaultAzureCredential`, which requires your identity to have proper RBAC roles assigned. For more information on authentication options, see [Authenticate Java apps to Azure services by using the Azure SDK for Java](/azure/developer/java/sdk/authentication/overview).

## Create code files

When you are done, the project structure should look like this:

```text
select-algorithm-java/
├── data/
│   └── README.md
├── output/
│   └── compare_all.txt
├── src/main/java/com/azure/documentdb/selectalgorithm/
│   ├── CompareAll.java
│   ├── Main.java
│   └── Utils.java
├── .gitignore
├── pom.xml
├── quickstart.md
└── README.md
```

## Create the algorithm comparison code

### Create utility functions

Create `src/main/java/com/azure/documentdb/selectalgorithm/Utils.java` and paste the following code:

:::code language="java" source="~/../documentdb-samples/ai/select-algorithm-java/src/main/java/com/azure/documentdb/selectalgorithm/Utils.java" :::

This utility class provides:

- **Environment variable management**: Reads configuration from environment variables by using `System.getenv()`
- **Passwordless authentication**: Uses `DefaultAzureCredential` for both MongoDB and Azure OpenAI
- **MongoDB client creation**: Configures OIDC authentication for DocumentDB
- **Azure OpenAI client creation**: Sets up the OpenAI client for embedding generation
- **Data loading**: Reads hotel data from JSON file
- **Embedding generation**: Creates vector embeddings for text queries
- **Index configuration**: Generates algorithm-specific vector index options
- **Search configuration**: Generates algorithm-specific search parameters
- **Results formatting**: Prints comparison table of algorithm performance

### Create main comparison logic

Create the following source files in `src/main/java/com/azure/documentdb/selectalgorithm/`:

#### CompareAll.java

:::code language="java" source="~/../documentdb-samples/ai/select-algorithm-java/src/main/java/com/azure/documentdb/selectalgorithm/CompareAll.java" :::

#### Main.java

:::code language="java" source="~/../documentdb-samples/ai/select-algorithm-java/src/main/java/com/azure/documentdb/selectalgorithm/Main.java" :::


This main comparison logic provides:

- **Algorithm comparison logic**: Tests all combinations of algorithms and similarity functions
- **Collection management**: Creates separate collections for each configuration
- **Data loading**: Inserts hotel data in batches
- **Index creation**: Creates both standard and vector indexes
- **Performance measurement**: Measures average query latency
- **Results display**: Outputs comparison table

## Run the code

1. Compile the project:

   ```bash
   mvn clean compile
   ```

   Verify: The build output ends with `BUILD SUCCESS`.

2. Run the comparison entry point. `Main.java` calls `CompareAll.run()` and always executes all 9 algorithm × 3 metric combinations:

   ### [Bash](#tab/bash)

   ```bash
   mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.Main"
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   mvn exec:java "-Dexec.mainClass=com.azure.documentdb.selectalgorithm.Main"
   ```

   ---

   The compare-all mode always runs all 9 combinations (3 algorithms × 3 metrics). The `ALGORITHM` and `SIMILARITY` environment variables are used only by the single-algorithm mode.

The program prints output similar to the following:

```text
==============================================
  Azure DocumentDB - Compare All Algorithms
==============================================
  Query:   "luxury hotel near the beach"
  Top K:   5
  Metrics: COS, L2, IP
  Algos:   IVF, HNSW, DiskANN

  Loading data from: data/Hotels_Vector.json
  Loaded 50 documents
  Collection reset.

  Generating embedding for: "luxury hotel near the beach"
  Embedding generated (1536 dimensions)

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
│ DISKANN  │ COS    │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤
│ DISKANN  │ L2     │ Ocean Water Resort & Spa   │ 0.8736 │ Windy Ocean Motel          │ 0.9943 │ 0.1208│
├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤
│ DISKANN  │ IP     │ Ocean Water Resort & Spa   │ 0.6184 │ Windy Ocean Motel          │ 0.5056 │ 0.1128│
└──────────┴────────┴────────────────────────────┴────────┴────────────────────────────┴────────┴───────┘

Summary: 9 succeeded, 0 failed

  Cleanup: dropping comparison collection...
  Cleanup: dropped collection 'hotels'
==============================================
  Comparison complete.
==============================================
```

The **Diff** column shows the score gap between the top-1 and top-2 results. A smaller diff indicates the algorithm found results with more similar relevance scores.

## Understanding the results

[!INCLUDE[Choosing the right algorithm](../includes/choosing-algorithm.md)]

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `MongoTimeoutException` | Verify the `DOCUMENTDB_CLUSTER_NAME` environment variable, and ensure your IP is in the DocumentDB firewall rules. |
| `MongoSecurityException` | Check credentials in connection string. |
| Maven build failures | Run `mvn dependency:resolve` to check for missing dependencies. Ensure Java 17+ is installed. |
| `No plugin found for prefix 'exec'` | Add `exec-maven-plugin` to your `pom.xml` as shown in this article. |

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
