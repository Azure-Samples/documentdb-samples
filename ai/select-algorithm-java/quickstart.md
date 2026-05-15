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

- [Java 21 or higher](/java/openjdk/download)

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
   mkdir select-algorithm-quickstart
   cd select-algorithm-quickstart
   code .
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   New-Item -ItemType Directory -Name select-algorithm-quickstart
   Set-Location select-algorithm-quickstart
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
   <project xmlns="http://maven.apache.org/POM/4.0.0"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
            xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
       <modelVersion>4.0.0</modelVersion>

       <groupId>com.azure.documentdb.samples</groupId>
       <artifactId>select-algorithm-java</artifactId>
       <version>1.0-SNAPSHOT</version>
       <name>Azure DocumentDB Vector Algorithm Comparison</name>

       <properties>
           <maven.compiler.source>21</maven.compiler.source>
           <maven.compiler.target>21</maven.compiler.target>
           <maven.compiler.release>21</maven.compiler.release>
           <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
       </properties>

       <dependencyManagement>
           <dependencies>
               <dependency>
                   <groupId>com.azure</groupId>
                   <artifactId>azure-sdk-bom</artifactId>
                   <version>1.2.29</version>
                   <type>pom</type>
                   <scope>import</scope>
               </dependency>
           </dependencies>
       </dependencyManagement>

       <dependencies>
           <dependency>
               <groupId>org.mongodb</groupId>
               <artifactId>mongodb-driver-sync</artifactId>
               <version>5.6.2</version>
           </dependency>
           <dependency>
               <groupId>com.azure</groupId>
               <artifactId>azure-identity</artifactId>
           </dependency>
           <dependency>
               <groupId>com.azure</groupId>
               <artifactId>azure-ai-openai</artifactId>
           </dependency>
           <dependency>
               <groupId>com.fasterxml.jackson.core</groupId>
               <artifactId>jackson-databind</artifactId>
               <version>2.18.2</version>
           </dependency>
           <dependency>
               <groupId>io.github.cdimascio</groupId>
               <artifactId>dotenv-java</artifactId>
               <version>3.0.2</version>
           </dependency>
           <dependency>
               <groupId>org.slf4j</groupId>
               <artifactId>slf4j-simple</artifactId>
               <version>2.0.17</version>
               <scope>runtime</scope>
           </dependency>
       </dependencies>

       <build>
           <plugins>
               <plugin>
                   <groupId>org.apache.maven.plugins</groupId>
                   <artifactId>maven-compiler-plugin</artifactId>
                   <version>3.13.0</version>
                   <configuration>
                       <release>21</release>
                   </configuration>
               </plugin>
               <plugin>
                   <groupId>org.codehaus.mojo</groupId>
                   <artifactId>exec-maven-plugin</artifactId>
                   <version>3.1.0</version>
                   <configuration>
                       <mainClass>com.azure.documentdb.selectalgorithm.SelectAlgorithm</mainClass>
                   </configuration>
               </plugin>
           </plugins>
       </build>
   </project>
   ```

   Verify: Run `mvn dependency:resolve` to confirm all dependencies resolve without errors.

4. Create a `.env` filein the project root for environment variables:

   ```bash
   # Azure DocumentDB cluster name for passwordless authentication
   DOCUMENTDB_CLUSTER_NAME=

   # Azure managed identity principal ID for authentication
   AZURE_MANAGED_IDENTITY_PRINCIPAL_ID=

   # Azure OpenAI endpoint and model configuration
   AZURE_OPENAI_EMBEDDING_ENDPOINT=https://your-openai-resource.openai.azure.com/
   AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small

   # Data file path (relative to project root)
   DATA_FILE_WITH_VECTORS=../data/Hotels_Vector.json

   # Vector configuration
   EMBEDDED_FIELD=DescriptionVector
   EMBEDDING_DIMENSIONS=1536
   LOAD_SIZE_BATCH=100

   # Algorithm selection: all, diskann, hnsw, ivf
   ALGORITHM=all

   # Similarity function: COS, L2, IP, all
   SIMILARITY=COS
   ```

   Replace the placeholder values with your Azure resource information:

   - `DOCUMENTDB_CLUSTER_NAME`: Your Azure DocumentDB cluster name
   - `AZURE_MANAGED_IDENTITY_PRINCIPAL_ID`: Your managed identity principal ID
   - `AZURE_OPENAI_EMBEDDING_ENDPOINT`: Your Azure OpenAI resource endpoint URL

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

   This sample uses passwordless authenticationwith `DefaultAzureCredential`, which requires your identity to have proper RBAC roles assigned. For more information on authentication options, see [Authenticate Java apps to Azure services by using the Azure SDK for Java](/azure/developer/java/sdk/authentication/overview).

## Create code files

When you are done, the project structure should look like this:

```text
select-algorithm-quickstart/
├── data/
│   └── Hotels_Vector.json           # Hotel data with vector embeddings
├── src/
│   └── main/
│       └── java/
│           └── com/
│               └── azure/
│                   └── documentdb/
│                       └── selectalgorithm/
│                           ├── SelectAlgorithm.java  # Main comparison logic
│                           └── Utils.java            # Shared utility functions
├── pom.xml                          # Maven dependencies
└── .env                             # Environment variables
```

## Create the algorithm comparison code

### Create utility functions

Create `src/main/java/com/azure/documentdb/selectalgorithm/Utils.java` and paste the following code:

:::code language="java" source="~/../documentdb-samples/ai/select-algorithm-java/src/main/java/com/azure/documentdb/selectalgorithm/Utils.java" :::

This utility class provides:

- **Environment variable management**: Loads configuration from `.env` file or system environment
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

2. Run the comparison for all algorithms with cosine similarity (default):

   ```bash
   mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"
   ```

3. Run the comparison for a specific algorithm:

   ### [Bash](#tab/bash)

   ```bash
   # Test only DiskANN
   ALGORITHM=diskann mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"

   # Test only HNSW
   ALGORITHM=hnsw mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"

   # Test only IVF
   ALGORITHM=ivf mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   # Test only DiskANN
   $env:ALGORITHM="diskann"
   mvn exec:java "-Dexec.mainClass=com.azure.documentdb.selectalgorithm.SelectAlgorithm"

   # Test only HNSW
   $env:ALGORITHM="hnsw"
   mvn exec:java "-Dexec.mainClass=com.azure.documentdb.selectalgorithm.SelectAlgorithm"

   # Test only IVF
   $env:ALGORITHM="ivf"
   mvn exec:java "-Dexec.mainClass=com.azure.documentdb.selectalgorithm.SelectAlgorithm"
   ```

   ---

4. Run the comparison for all similarity functions:

   ### [Bash](#tab/bash)

   ```bash
   # Test all algorithms with all similarity functions
   ALGORITHM=all SIMILARITY=all mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"

   # Test DiskANN with all similarity functions
   ALGORITHM=diskann SIMILARITY=all mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   # Test all algorithms with all similarity functions
   $env:ALGORITHM="all"
   $env:SIMILARITY="all"
   mvn exec:java "-Dexec.mainClass=com.azure.documentdb.selectalgorithm.SelectAlgorithm"

   # Test DiskANN with all similarity functions
   $env:ALGORITHM="diskann"
   $env:SIMILARITY="all"
   mvn exec:java "-Dexec.mainClass=com.azure.documentdb.selectalgorithm.SelectAlgorithm"
   ```

   ---

5. Run the comparison for a specific similarity function:

   ### [Bash](#tab/bash)

   ```bash
   # Test all algorithms with L2 (Euclidean) distance
   SIMILARITY=L2 mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"

   # Test all algorithms with IP (inner product)
   SIMILARITY=IP mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"
   ```

   ### [PowerShell](#tab/powershell)

   ```powershell
   # Test all algorithms with L2 (Euclidean) distance
   $env:SIMILARITY="L2"
   mvn exec:java "-Dexec.mainClass=com.azure.documentdb.selectalgorithm.SelectAlgorithm"

   # Test all algorithms with IP (inner product)
   $env:SIMILARITY="IP"
   mvn exec:java "-Dexec.mainClass=com.azure.documentdb.selectalgorithm.SelectAlgorithm"
   ```

   ---

The program displays a comparison table showing average latency for each algorithm and similarity function combination:

```text
================================================================================
Vector Index Algorithm Comparison Results
================================================================================
Algorithm       Similarity      Avg Latency (ms)    
--------------------------------------------------------------------------------
DISKANN         COS             42.30               
DISKANN         IP              38.70               
DISKANN         L2              45.10               
HNSW            COS             31.50               
HNSW            IP              29.80               
HNSW            L2              34.20               
IVF             COS             55.60               
IVF             IP              52.10               
IVF             L2              58.90               
================================================================================
```

> [!NOTE]
> The latency values shown above are illustrative. Actual results depend on your DocumentDB cluster configuration, region, network latency, and dataset size.

## Understanding the results

### Choosing the right algorithm

Use this comparison to select the best algorithm for your workload:

**IVF** (inverted file index):
- Best for: Test environments, demos, and small clusters
- Pros: Fast to build, low resource requirements, works on any cluster tier
- Cons: Lower recall compared to graph-based algorithms at scale
- Tune: Increase `numLists` for larger datasets, increase `nProbes` for better recall

**DiskANN** (disk-based approximate nearest neighbor) — *recommended for enterprise production*:
- Best for: Enterprise production workloads on M30+ clusters
- Pros: Supports embeddings up to 16,000 dimensions, keeps most index data on disk leaving cluster memory available for regular reads and writes, uses lighter updates that help the system stay smoother and easier to back up and recover
- Cons: Requires M30+ cluster tier
- Tune: Increase `maxDegree` and `lBuild` for better accuracy, increase `lSearch` for better recall

**HNSW** (hierarchical navigable small world):
- Best for: Enterprise production workloads on M30+ clusters requiring highest recall
- Pros: Excellent recall, fast queries
- Cons: Requires M30+ cluster tier, supports embeddings up to 8,000 dimensions (vs 16,000 for DiskANN), higher memory usage
- Tune: Increase `m` and `efConstruction` for better index quality, increase `efSearch` for better recall

> [!TIP]
> For enterprise production workloads, start with **DiskANN** unless you have a specific reason to prefer HNSW. DiskANN supports higher dimensions (16,000 vs 8,000), uses less cluster memory, and requires fewer index maintenance operations — making it the safer long-term default that's less likely to need an index redesign as your embedding models evolve.

### Choosing the right similarity function

The similarity function should match your embedding model and use case:

- **COS (Cosine similarity)**: Best for text embeddings and most OpenAI models. Measures angle between vectors (range: -1 to 1, higher is more similar)
- **L2 (Euclidean distance)**: Measures straight-line distance between vectors (lower is more similar). Good for spatial data
- **IP (Inner product)**: Measures alignment between vectors. Good when vector magnitudes are meaningful

For the `text-embedding-3-small` model used in this quickstart, **COS (cosine similarity) is recommended** because OpenAI embeddings are normalized and optimized for cosine similarity.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `MongoTimeoutException` | Verify your connection string in `.env`. Ensure your IP is in the DocumentDB firewall rules. |
| `MongoSecurityException` | Check credentials in connection string. |
| Maven build failures | Run `mvn dependency:resolve` to check for missing dependencies. Ensure Java 17+ is installed. |
| `No plugin found for prefix 'exec'` | Add `exec-maven-plugin` to your `pom.xml` as shown in this article. |

## Clean up resources

When you're done, you can remove the database using mongosh or the Azure DocumentDB extension for Visual Studio Code.

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

1. Install the [Azure Databases extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-cosmosdb) for Visual Studio Code.
2. Connect to your Azure DocumentDB cluster.
3. Expand the cluster, right-click the **Hotels** database, and select **Drop Database**.

---

If you created an Azure DocumentDB cluster specifically for this quickstart, you can also delete the entire resource group in the Azure portal to remove all associated resources.

## Related content

- [Vector search overview](./vector-search.md)
- [ENN vector search](./enn-vector-search.md)
- [Product quantization](./product-quantization.md)
