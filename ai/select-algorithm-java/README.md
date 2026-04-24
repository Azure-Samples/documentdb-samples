# DocumentDB Vector Index Algorithm Comparison (Java)

This sample compares DocumentDB vector index algorithms (DiskANN, HNSW, IVF) across similarity functions (COS, L2, IP) to help you choose the best configuration for your use case.

## Overview

Vector indexes improve search performance by organizing vectors for efficient similarity searches. This sample:

- Creates collections per algorithm/similarity combination
- Configures algorithm-specific index parameters
- Measures query latency for each configuration
- Displays a comparison table to guide your selection

## Prerequisites

- [Java 21 or higher](https://learn.microsoft.com/java/openjdk/download)
- [Maven 3.6 or higher](https://maven.apache.org/download.cgi)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- Azure subscription with:
  - Azure DocumentDB (MongoDB vCore) cluster
  - Azure OpenAI with text-embedding-3-small model
  - Managed identity configured for passwordless auth

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Azure resource values. The sample uses the
   [dotenv-java](https://github.com/cdimascio/dotenv-java) library to load
   variables from `.env` at startup, falling back to system environment
   variables when the file is absent.

3. Sign in to Azure for passwordless authentication:
   ```bash
   az login
   ```

4. Compile the project:
   ```bash
   mvn clean compile
   ```

> **Note:** This sample does not include a Maven Wrapper (`mvnw`). Install
> Maven 3.6+ from <https://maven.apache.org/download.cgi> and ensure `mvn` is
> on your PATH.

## Usage

Run the comparison for specific or all algorithms and similarity functions:

```bash
# Compare all algorithms with cosine similarity
mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"

# Compare only DiskANN with all similarity functions
ALGORITHM=diskann SIMILARITY=all mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"

# Compare HNSW with L2 (Euclidean) distance
ALGORITHM=hnsw SIMILARITY=L2 mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"

# Compare all algorithms and all similarity functions
ALGORITHM=all SIMILARITY=all mvn exec:java -Dexec.mainClass="com.azure.documentdb.selectalgorithm.SelectAlgorithm"
```

### Environment Variables

- `ALGORITHM`: Which algorithm(s) to test
  - `all` (default): Test DiskANN, HNSW, and IVF
  - `diskann`: Test only DiskANN
  - `hnsw`: Test only HNSW
  - `ivf`: Test only IVF

- `SIMILARITY`: Which similarity function(s) to test
  - `COS` (default): Cosine similarity
  - `L2`: Euclidean distance
  - `IP`: Inner product
  - `all`: Test all similarity functions

## Algorithm Characteristics

### DiskANN
- Disk-based for large datasets
- Good balance of speed and accuracy
- Parameters: maxDegree=32, lBuild=50, lSearch=100

### HNSW
- Memory-based hierarchical graph
- Excellent for real-time applications
- Parameters: m=16, efConstruction=64, efSearch=80

### IVF
- Cluster-based partitioning
- Fast search via centroids
- Parameters: numLists=1, nProbes=1

## Output

The sample prints a comparison table showing latency per query for each algorithm/similarity combination, helping you make an informed choice.

## Further Resources

- [Azure DocumentDB Documentation](https://learn.microsoft.com/azure/documentdb/)
- [Vector Search in DocumentDB](https://learn.microsoft.com/azure/documentdb/vector-search)
- [MongoDB Java Driver Documentation](https://mongodb.github.io/mongo-java-driver/)
