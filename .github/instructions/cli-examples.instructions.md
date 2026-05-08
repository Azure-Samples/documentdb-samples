---
applyTo: "ai/**"
---
# Running Samples — CLI Invocation

Environment variables are passed inline with the run command. Do NOT use `.env` files. Each example below shows the required variables for a vector-search quickstart sample.

## Go

**Bash:**
```bash
MONGO_CLUSTER_NAME=myCluster \
AZURE_OPENAI_EMBEDDING_ENDPOINT=https://myendpoint.openai.azure.com/ \
AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-ada-002 \
go run ./src/ivf.go
```

**PowerShell:**
```powershell
$env:MONGO_CLUSTER_NAME="myCluster"
$env:AZURE_OPENAI_EMBEDDING_ENDPOINT="https://myendpoint.openai.azure.com/"
$env:AZURE_OPENAI_EMBEDDING_MODEL="text-embedding-ada-002"
go run ./src/ivf.go
```

## Python

**Bash:**
```bash
MONGO_CLUSTER_NAME=myCluster \
AZURE_OPENAI_EMBEDDING_ENDPOINT=https://myendpoint.openai.azure.com/ \
AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-ada-002 \
python src/ivf.py
```

**PowerShell:**
```powershell
$env:MONGO_CLUSTER_NAME="myCluster"
$env:AZURE_OPENAI_EMBEDDING_ENDPOINT="https://myendpoint.openai.azure.com/"
$env:AZURE_OPENAI_EMBEDDING_MODEL="text-embedding-ada-002"
python src/ivf.py
```

## TypeScript/Node.js

**Bash:**
```bash
MONGO_CLUSTER_NAME=myCluster \
AZURE_OPENAI_EMBEDDING_ENDPOINT=https://myendpoint.openai.azure.com/ \
AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-ada-002 \
npx tsx src/ivf.ts
```

**PowerShell:**
```powershell
$env:MONGO_CLUSTER_NAME="myCluster"
$env:AZURE_OPENAI_EMBEDDING_ENDPOINT="https://myendpoint.openai.azure.com/"
$env:AZURE_OPENAI_EMBEDDING_MODEL="text-embedding-ada-002"
npx tsx src/ivf.ts
```

## Java

**Bash:**
```bash
MONGO_CLUSTER_NAME=myCluster \
AZURE_OPENAI_EMBEDDING_ENDPOINT=https://myendpoint.openai.azure.com/ \
AZURE_OPENAI_EMBEDDING_MODEL=text-embedding-ada-002 \
mvn compile exec:java -Dexec.mainClass="com.azure.documentdb.sample.IVF"
```

**PowerShell:**
```powershell
$env:MONGO_CLUSTER_NAME="myCluster"
$env:AZURE_OPENAI_EMBEDDING_ENDPOINT="https://myendpoint.openai.azure.com/"
$env:AZURE_OPENAI_EMBEDDING_MODEL="text-embedding-ada-002"
mvn compile exec:java -Dexec.mainClass="com.azure.documentdb.sample.IVF"
```

## .NET

.NET uses `appsettings.json` for configuration, but environment variables can override:

**Bash:**
```bash
DocumentDB__ClusterName=myCluster \
AzureOpenAI__Endpoint=https://myendpoint.openai.azure.com/ \
AzureOpenAI__DeploymentName=text-embedding-ada-002 \
dotnet run
```

**PowerShell:**
```powershell
$env:DocumentDB__ClusterName="myCluster"
$env:AzureOpenAI__Endpoint="https://myendpoint.openai.azure.com/"
$env:AzureOpenAI__DeploymentName="text-embedding-ada-002"
dotnet run
```

## Agent Samples (Multi-LLM)

Agent samples require more variables for the planner and synthesizer deployments:

**Bash:**
```bash
AZURE_OPENAI_ENDPOINT=https://myendpoint.openai.azure.com/ \
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-ada-002 \
AZURE_OPENAI_EMBEDDING_API_VERSION=2024-06-01 \
AZURE_OPENAI_PLANNER_DEPLOYMENT=gpt-4o \
AZURE_OPENAI_PLANNER_API_VERSION=2024-06-01 \
AZURE_OPENAI_SYNTH_DEPLOYMENT=gpt-4o \
AZURE_OPENAI_SYNTH_API_VERSION=2024-06-01 \
AZURE_DOCUMENTDB_CLUSTER=myCluster \
AZURE_DOCUMENTDB_DATABASENAME=Hotels \
AZURE_DOCUMENTDB_COLLECTION=hotels \
AZURE_DOCUMENTDB_INDEX_NAME=vectorIndex \
USE_PASSWORDLESS=true \
go run ./cmd/agent/main.go
```

**PowerShell:**
```powershell
$env:AZURE_OPENAI_ENDPOINT="https://myendpoint.openai.azure.com/"
$env:AZURE_OPENAI_EMBEDDING_DEPLOYMENT="text-embedding-ada-002"
$env:AZURE_OPENAI_EMBEDDING_API_VERSION="2024-06-01"
$env:AZURE_OPENAI_PLANNER_DEPLOYMENT="gpt-4o"
$env:AZURE_OPENAI_PLANNER_API_VERSION="2024-06-01"
$env:AZURE_OPENAI_SYNTH_DEPLOYMENT="gpt-4o"
$env:AZURE_OPENAI_SYNTH_API_VERSION="2024-06-01"
$env:AZURE_DOCUMENTDB_CLUSTER="myCluster"
$env:AZURE_DOCUMENTDB_DATABASENAME="Hotels"
$env:AZURE_DOCUMENTDB_COLLECTION="hotels"
$env:AZURE_DOCUMENTDB_INDEX_NAME="vectorIndex"
$env:USE_PASSWORDLESS="true"
go run ./cmd/agent/main.go
```
