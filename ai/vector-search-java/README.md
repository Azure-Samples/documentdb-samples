<!--
---
page_type: sample
name: "DocumentDB Vector Search for Java"
description: "This sample demonstrates vector search capabilities using Azure DocumentDB with Java. It includes implementations of three different vector index types: DiskANN, HNSW, and IVF."
urlFragment: vector-search-java
languages:
- java
products:
- azure
---
-->
# DocumentDB Vector Samples (Java)

This project demonstrates vector search capabilities using Azure DocumentDB with Java. It includes implementations of three different vector index types: DiskANN, HNSW, and IVF.

## Overview

Vector search enables semantic similarity searching by converting text into high-dimensional vector representations (embeddings) and finding the most similar vectors in the database. This project shows how to:

- Generate embeddings using Azure OpenAI
- Store vectors in DocumentDB
- Create and use different types of vector indexes
- Perform similarity searches with various algorithms

## Prerequisites

Before running this project, you need:

### Azure Resources
1. **Azure subscription** with appropriate permissions
2. **[Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/)** installed

### Development Environment
- [Java 21 or higher](https://learn.microsoft.com/java/openjdk/download)
- [Maven 3.6 or higher](https://maven.apache.org/download.cgi)
- [Git](https://git-scm.com/downloads) (for cloning the repository)
- [Visual Studio Code](https://code.visualstudio.com/) (recommended) or another Java IDE

## Setup Instructions

### Clone and Setup Project

```bash
# Clone this repository
git clone https://github.com/Azure-Samples/documentdb-samples
```

### Deploy Azure Resources

This project uses Azure Developer CLI (azd) to deploy all required Azure resources from the existing infrastructure-as-code files.

#### Install Azure Developer CLI

If you haven't already, install the Azure Developer CLI:

**Windows:**
```powershell
winget install microsoft.azd
```

**macOS:**
```bash
brew tap azure/azd && brew install azd
```

**Linux:**
```bash
curl -fsSL https://aka.ms/install-azd.sh | bash
```

#### Deploy Resources

Navigate to the root of the repository and run:

```bash
# Login to Azure
azd auth login

# Provision Azure resources
azd up
```

During provisioning, you'll be prompted for:
- **Environment name**: A unique name for your deployment (e.g., "my-vector-search")
- **Azure subscription**: Select your Azure subscription
- **Location**: Choose from `eastus2` or `swedencentral` (required for OpenAI models)

The `azd up` command will:
- Create a resource group
- Deploy Azure OpenAI with text-embedding-3-small model
- Deploy Azure DocumentDB (MongoDB vCore) cluster
- Create a managed identity for secure access
- Configure all necessary permissions and networking
- Generate a `.env` file with all connection information at the repository root

### Compile the Project

```bash
# Move to Java vector search project
cd ai/vector-search-java

# Compile the project
mvn clean compile
```

### Load Environment Variables

After deployment completes, load the environment variables from the generated `.env` file. The `set -a` command ensures variables are exported to child processes (like the Maven JVM):

```bash
# From the ai/vector-search-java directory
set -a && source ../../.env && set +a
```

You can verify the environment variables are set:

```bash
echo $MONGO_CLUSTER_NAME
```

## Usage

The project includes several Java classes that demonstrate different aspects of vector search.

### Sign in to Azure for passwordless connection

```bash
az login
```

### DiskANN Vector Search

Run DiskANN (Disk-based Approximate Nearest Neighbor) search:

```bash
mvn exec:java -Dexec.mainClass="com.azure.documentdb.samples.DiskAnn"
```

DiskANN is optimized for:
- Large datasets that don't fit in memory
- Efficient disk-based storage
- Good balance of speed and accuracy

### HNSW Vector Search

Run HNSW (Hierarchical Navigable Small World) search:

```bash
mvn exec:java -Dexec.mainClass="com.azure.documentdb.samples.HNSW"
```

HNSW provides:
- Excellent search performance
- High recall rates
- Hierarchical graph structure
- Good for real-time applications

### IVF Vector Search

Run IVF (Inverted File) search:

```bash
mvn exec:java -Dexec.mainClass="com.azure.documentdb.samples.IVF"
```

IVF features:
- Clusters vectors by similarity
- Fast search through cluster centroids
- Configurable accuracy vs speed trade-offs
- Efficient for large vector datasets

## Further Resources

- [Azure Developer CLI Documentation](https://learn.microsoft.com/azure/developer/azure-developer-cli/)
- [Azure DocumentDB Documentation](https://learn.microsoft.com/azure/documentdb/)
- [Azure OpenAI Service Documentation](https://learn.microsoft.com/azure/ai-services/openai/)
- [Vector Search in DocumentDB](https://learn.microsoft.com/azure/documentdb/vector-search)
- [MongoDB Java Driver Documentation](https://mongodb.github.io/mongo-java-driver/)
- [Azure SDK for Java Documentation](https://learn.microsoft.com/java/api/overview/azure/)

## Support

If you encounter issues:
1. Verify Java 21+ is installed: `java -version`
2. Verify Maven is installed: `mvn -version`
3. Ensure Azure CLI is logged in: `az login`
4. Verify environment variables are exported: `echo $MONGO_CLUSTER_NAME`
5. Check Azure service status and quotas
