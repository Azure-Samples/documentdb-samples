# TypeScript Agent Article - Questions and Issues

This document lists questions and issues encountered while creating the TypeScript agent article for Azure DocumentDB.

## Successfully Resolved

The following items were successfully addressed in the article:

1. **Architecture diagram reference** - Updated the image source to reference `media/quickstart-agent-typescript/agent-architecture-typescript.svg` (needs to be created separately in the docs repo)
2. **Code file links** - All code references point to the correct location: `~/documentdb-samples/ai/vector-search-agent-ts/`
3. **Authentication patterns** - Both passwordless and API key authentication methods documented based on the TypeScript implementation
4. **LangChain framework** - Documented the use of LangChain instead of custom implementation (key difference from Go version)
5. **Environment variables** - Adapted environment variable names to match TypeScript implementation:
   - `AZURE_OPENAI_EMBEDDING_MODEL` for passwordless auth
   - `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` for API key auth
6. **npm scripts** - Updated commands to use npm instead of Go commands (`npm start`, `npm run upload`, `npm run cleanup`)

## Questions and Issues

### 1. Architecture Diagram
**Issue**: The article references `media/quickstart-agent-typescript/agent-architecture-typescript.svg` which doesn't exist yet.

**Resolution needed**: 
- Create a TypeScript-specific architecture diagram in the MicrosoftDocs repo
- OR reuse the Go diagram if the architecture is identical (just with different language)
- The diagram should show: User Query → Planner Agent → Vector Search Tool → Synthesizer Agent → Final Response

### 2. Screenshot for Visual Studio Code
**Issue**: The article references `media/quickstart-agent-typescript/documentdb-view-data.png` which doesn't exist yet.

**Resolution needed**:
- Take a screenshot of VS Code showing the Hotels database with the DocumentDB extension
- OR reuse the Go screenshot if the view is identical
- Ensure it shows the vector index and hotel documents

### 3. Data File Path ✅ RESOLVED
**Previous Issue**: The TypeScript sample uses `DATA_FILE_WITHOUT_VECTORS` environment variable but the article didn't specify where this data file should come from.

**Resolution**: 
- Added `DATA_FILE_WITHOUT_VECTORS=../data/Hotels.json` to both .env examples
- Added "Prepare the data" section explaining the difference between `Hotels.json` and `Hotels_Vector.json`
- Clarified that the upload script generates embeddings automatically from `Hotels.json`

### 4. Vector Index Algorithm Configuration
**Issue**: The TypeScript sample supports multiple vector index algorithms (IVF, HNSW, DiskANN) via `VECTOR_INDEX_ALGORITHM` environment variable.

**Current situation**:
- Article mentions this in the .env examples with `VECTOR_INDEX_ALGORITHM=vector-ivf`
- But doesn't explain the different options or when to use each

**Resolution needed**:
- Consider adding a section explaining the different vector index algorithms
- OR reference the vector search article that explains these options
- The Go article doesn't seem to cover this level of detail

### 5. LangChain Dependencies
**Issue**: The TypeScript version uses specific LangChain packages that have version requirements.

**Current package.json**:
```json
"@langchain/azure-cosmosdb": "^1.0.0",
"@langchain/core": "^1.0.6",
"@langchain/openai": "^1.1.2",
"langchain": "^1.0.6"
```

**Resolution needed**:
- Consider mentioning LangChain version requirements in prerequisites
- OR note that package.json manages dependencies automatically

### 6. Debug Mode
**Issue**: The TypeScript sample has a DEBUG environment variable and debug callbacks, but this isn't documented in the article.

**Current situation**:
- The code shows: `console.log(\`DEBUG mode is \${process.env.DEBUG === 'true' ? 'ON' : 'OFF'}\`);`
- Could be useful for developers troubleshooting

**Resolution needed**:
- Optionally add a troubleshooting section mentioning DEBUG=true
- OR keep it as an undocumented feature

### 7. API Version Differences
**Issue**: The API versions in the TypeScript sample differ from what might be standard.

**Current versions in code**:
- Planner/Synth: `2024-08-01-preview`
- Embedding: `2023-05-15`

**Resolution needed**:
- Verify these are the recommended API versions
- Update if newer stable versions are available

## Differences from Go Version

Key differences that were intentionally adapted for TypeScript:

1. **Framework**: LangChain vs custom implementation
2. **Package manager**: npm vs Go modules
3. **Type system**: TypeScript types vs Go interfaces
4. **Async handling**: async/await vs Go goroutines
5. **Client creation**: LangChain clients vs OpenAI SDK directly
6. **Tool definition**: LangChain's `tool()` function vs custom implementation

## Recommendations

1. **Test the article**: Have someone follow the quickstart from scratch to identify any gaps
2. **Create visual assets**: Generate the architecture diagram and screenshot
3. **Verify code references**: Ensure all code snippets compile and line ranges are correct
4. **Update .env documentation**: Add the missing `DATA_FILE_WITHOUT_VECTORS` variable
5. **Cross-reference**: Link to the vector search TypeScript article for additional context on vector indexes
