# TypeScript-Specific Instructions

> This is the **reference implementation**. Other languages must match its behavior.

## Stack

- Node.js with ESM modules (`"type": "module"` in package.json)
- TypeScript 5+ with strict mode
- `mongodb` driver (native MongoDB client)
- `openai` SDK (AzureOpenAI class)
- `@azure/identity` for DefaultAzureCredential

## File Structure

```
ai/select-algorithm-typescript/
├── src/
│   ├── compare-all.ts    # Multi-query comparison runner
│   ├── utils.ts          # Shared utilities (auth, config, insert, print)
│   └── ...
├── package.json
├── tsconfig.json
└── README.md

ai/vector-search-typescript/
├── src/
│   ├── ivf.ts            # Individual IVF example
│   ├── hnsw.ts           # Individual HNSW example
│   ├── diskann.ts        # Individual DiskANN example
│   ├── create-embeddings.ts
│   ├── utils.ts
│   └── showIndexes.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Authentication Pattern

```typescript
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { MongoClient, OIDCCallbackParams, OIDCResponse } from 'mongodb';

// OIDC callback for passwordless auth
const AzureIdentityTokenCallback = async (
    params: OIDCCallbackParams,
    credential: TokenCredential
): Promise<OIDCResponse> => {
    const tokenResponse = await credential.getToken([
        'https://ossrdbms-aad.database.windows.net/.default'
    ]);
    return {
        accessToken: tokenResponse?.token || '',
        expiresInSeconds: (tokenResponse?.expiresOnTimestamp || 0) - Math.floor(Date.now() / 1000)
    };
};
```

## ESM Considerations

```typescript
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

## Environment Variables

- Loaded via `process.env` directly — **no dotenv library** in production code
- Provide a `.env.example` file in each sample directory showing all required vars with placeholder values
- A `.env` file at the sample root is used for local development (gitignored)
- Access pattern: `process.env.VAR_NAME!` (non-null assertion) for required vars
- For optional vars with defaults: `process.env.VAR_NAME || 'default'`
- Validate all required vars at startup — throw with a clear error listing missing vars

```typescript
const endpoint = process.env.AZURE_OPENAI_EMBEDDING_ENDPOINT!;
const deployment = process.env.AZURE_OPENAI_EMBEDDING_MODEL!;
const clusterName = process.env.MONGO_CLUSTER_NAME!;

if (!endpoint || !deployment || !clusterName) {
    throw new Error('Missing required environment variables: ...');
}
```

## Build & Run

```bash
npm install
npm run build    # tsc
npm start        # node dist/compare-all.js
```

## Bulk Insert

Use `collection.insertMany()` with `ordered: false` for batch inserts:

```typescript
const result = await collection.insertMany(batch, { ordered: false });
inserted += result.insertedCount || 0;
```

- Batch size configurable via `LOAD_SIZE_BATCH` env var (default: 100)
- 200ms delay between batches to avoid rate limiting
- Handle partial failures gracefully (log failed count, continue)

## Key Patterns

- Use `interface` for data shapes (SearchResult, AlgorithmConfig)
- Use `const` arrays for ALGORITHMS and SIMILARITIES definitions
- Clean up collections in `finally` block
- Template literal strings for console output formatting
