# Azure DocumentDB Samples

This repository contains code samples for working with Azure DocumentDB, including AI-powered vector search implementations across multiple programming languages.

## Prerequisites

- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd)
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- An Azure subscription

## Quick Start

### 1. Deploy Infrastructure with Azure Developer CLI

Deploy the Azure DocumentDB cluster, Azure OpenAI, and other required resources:

```bash
azd auth login
azd up
```

This command will:
- Prompt you to create a new Azure environment
- Provision all infrastructure resources in your Azure subscription
- Generate a `.env` file in the root directory with all necessary connection strings and credentials

### 2. Navigate to Your Sample Language

Choose your preferred programming language and navigate to the sample directory:

```bash
# For .NET
cd ai/vector-search-dotnet

# For Python
cd ai/vector-search-python

# For Go
cd ai/vector-search-go

# For TypeScript
cd ai/vector-search-typescript
```

### 3. Configure Environment Variables

Copy the `.env` file from the root directory to your language sample folder:

```bash
cp ../../.env .env
```

Alternatively, you can keep the `.env` in the root and run the samples from there.

### 4. Run Your Sample

Follow the language-specific instructions:

- **[.NET](./ai/vector-search-dotnet/README.md)** - Vector search sample using .NET 8.0
- **[Python](./ai/vector-search-python/README.md)** - Vector search implementation in Python
- **[Go](./ai/vector-search-go/README.md)** - Vector search examples using Go
- **[TypeScript](./ai/vector-search-typescript/README.md)** - Vector search with TypeScript/Node.js

Each sample demonstrates how to generate embeddings, create vector indexes, and perform semantic similarity searches with hotel data.

## Cleanup

To delete all provisioned Azure resources:

```bash
azd down
```

## Resources

- [Azure DocumentDB Documentation](https://learn.microsoft.com/azure/documentdb/)
- [Vector Search in DocumentDB](https://learn.microsoft.com/azure/documentdb/vector-search)
- [Azure OpenAI Service](https://learn.microsoft.com/azure/ai-services/openai/)
- [Azure Developer CLI Documentation](https://learn.microsoft.com/azure/developer/azure-developer-cli/)
