<!--
---
page_type: sample
name: "DocumentDB Vector Search for TypeScript"
description: This sample demonstrates vector search capabilities using Azure DocumentDB with TypeScript/Node.js. It includes implementations of three different vector index types: DiskANN, HNSW, and IVF, along with utilities for embedding generation and data management.
urlFragment: vector-search-typescript
languages:
- typescript
products:
- azure
---
-->
# DocumentDB Vector Samples (TypeScript)

This project demonstrates vector search capabilities using Azure DocumentDB with TypeScript/Node.js. It includes implementations of three different vector index types: DiskANN, HNSW, and IVF, along with utilities for embedding generation and data management.

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
- **Node.js 22 or higher** (tested with Node.js v22.14.0)
- **npm** (comes with Node.js)
- **Git** (for cloning the repository)
- **Visual Studio Code** (recommended) or another code editor

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

Navigate to the root of the repository (two directories up) and run:

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

The `azd provision` command will:
- Create a resource group
- Deploy Azure OpenAI with text-embedding-3-small model
- Deploy Azure DocumentDB (MongoDB vCore) cluster
- Create a managed identity for secure access
- Configure all necessary permissions and networking
- Generate a `.env` file with all connection information at the root


### Install dependencies

```bash
# move to TypeScript vector search project
cd ai/vector-search-typescript

# Install dependencies
npm install
```

### Verify Environment Configuration

After deployment completes, verify that the `.env` file was created in the repository root:

```bash
# View the generated environment variables
cat ../../.env
```

The file should contain all necessary configuration including:
- Azure OpenAI endpoint and model information
- DocumentDB cluster name and database settings
- Embedding and data processing configuration

## Build

Compile the TypeScript code before running:

```bash
npm run build
```

This compiles the TypeScript source files in `src/` to JavaScript in `dist/`.

## Usage

The project includes several scripts that demonstrate different aspects of vector search:

### Sign in to Azure for passwordless connection

```
az login
```

### DiskANN Vector Search
Run DiskANN (Disk-based Approximate Nearest Neighbor) search:

```bash
npm run start:diskann
```

DiskANN is optimized for:
- Large datasets that don't fit in memory
- Efficient disk-based storage
- Good balance of speed and accuracy

### HNSW Vector Search
Run HNSW (Hierarchical Navigable Small World) search:

```bash
npm run start:hnsw
```

HNSW provides:
- Excellent search performance
- High recall rates
- Hierarchical graph structure
- Good for real-time applications

### IVF Vector Search
Run IVF (Inverted File) search:

```bash
npm run start:ivf
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
- [MongoDB Node.js Driver Documentation](https://www.mongodb.com/docs/drivers/node/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Azure resource configurations
3. Verify environment variable settings
4. Check Azure service status and quotas
5. Ensure your Node.js version is compatible (18+)
