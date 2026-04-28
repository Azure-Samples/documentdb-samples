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
azd env set DOCUMENTDB_ADMIN_PASSWORD '<your-secure-password>'
azd up
```

> [!IMPORTANT]
> You must set `DOCUMENTDB_ADMIN_PASSWORD` before running `azd up`. The password must be 8–128 characters.

This command will:
- Prompt you to create a new Azure environment
- Provision all infrastructure resources in your Azure subscription

After provisioning, export all environment variables to a `.env` file:

```bash
azd env get-values > .env
```

#### Configure OpenAI Settings (Optional)

Before running `azd up`, you can customize the OpenAI deployment by setting environment variables. If not set, defaults are used.

```bash
# Set OpenAI location (can differ from resource group location)
azd env set AZURE_OPENAI_LOCATION eastus2

# Chat model configuration
azd env set AZURE_OPENAI_CHAT_MODEL gpt-4.1-mini
azd env set AZURE_OPENAI_CHAT_MODEL_VERSION 2025-04-14
azd env set AZURE_OPENAI_CHAT_MODEL_TYPE Standard

# Synthesis model configuration
azd env set AZURE_OPENAI_SYNTH_MODEL gpt-4.1
azd env set AZURE_OPENAI_SYNTH_MODEL_VERSION 2025-04-14
azd env set AZURE_OPENAI_SYNTH_MODEL_TYPE Standard

# Embedding model configuration
azd env set AZURE_OPENAI_EMBEDDING_MODEL text-embedding-3-small
azd env set AZURE_OPENAI_EMBEDDING_MODEL_VERSION 1
azd env set AZURE_OPENAI_EMBEDDING_MODEL_TYPE Standard
```

| Variable | Default | Description |
|----------|---------|-------------|
| `AZURE_OPENAI_LOCATION` | Same as `AZURE_LOCATION` | Region for OpenAI resources |
| `AZURE_OPENAI_CHAT_MODEL` | `gpt-4.1-mini` | Chat completion model |
| `AZURE_OPENAI_CHAT_MODEL_VERSION` | `2025-04-14` | Chat model version |
| `AZURE_OPENAI_CHAT_MODEL_TYPE` | `Standard` | Deployment SKU (`Standard` or `GlobalStandard`) |
| `AZURE_OPENAI_SYNTH_MODEL` | `gpt-4.1` | Data synthesis model |
| `AZURE_OPENAI_SYNTH_MODEL_VERSION` | `2025-04-14` | Synthesis model version |
| `AZURE_OPENAI_SYNTH_MODEL_TYPE` | `Standard` | Deployment SKU |
| `AZURE_OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `AZURE_OPENAI_EMBEDDING_MODEL_VERSION` | `1` | Embedding model version |
| `AZURE_OPENAI_EMBEDDING_MODEL_TYPE` | `Standard` | Deployment SKU |


> [!NOTE]
> **Vector indexes can be created or dropped on existing collections at any time** — no special configuration is needed at resource creation.
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

## Troubleshooting

### Azure OpenAI provisioning fails

If `azd up` fails when creating the Azure OpenAI resource or model deployments, the issue is typically one of:

- **Region availability**: The selected model isn't available in your chosen region. Try a different `AZURE_OPENAI_LOCATION` (e.g., `eastus2`, `swedencentral`).
- **SKU/tier mismatch**: The model doesn't support the selected deployment type. Switch between `Standard` and `GlobalStandard` using `azd env set AZURE_OPENAI_CHAT_MODEL_TYPE GlobalStandard`.
- **Quota limits**: Your subscription has reached its quota for the selected model/region/tier combination. Check your quota in the Azure portal under **Azure OpenAI → Quotas**. You can request a quota increase or try a different region with available capacity.
- **Model retired or unavailable**: Azure OpenAI periodically retires older model versions. If deployment fails because a model version is no longer available, update to a supported version (e.g., `azd env set AZURE_OPENAI_CHAT_MODEL_VERSION <new-version>`). See [Azure OpenAI model retirements](https://learn.microsoft.com/azure/ai-services/openai/concepts/model-retirements) for lifecycle status.

All OpenAI model parameters — region, model name, version, and deployment type (Standard/GlobalStandard) — are configurable via `azd env set` before running `azd up`. See [Configure OpenAI Settings](#configure-openai-settings-optional) above for the full list.

> [!TIP]
> Run `azd env set AZURE_OPENAI_LOCATION <region>` to deploy OpenAI to a different region than your other resources. Check [model availability by region](https://learn.microsoft.com/azure/ai-services/openai/concepts/models#model-summary-table-and-region-availability) to find supported region/model/tier combinations.

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
