# Python-Specific Instructions

## Stack

- Python 3.10+
- `pymongo` for DocumentDB access
- `openai` SDK (AzureOpenAI class)
- `azure-identity` for DefaultAzureCredential

## File Structure

```
ai/select-algorithm-python/
├── src/
│   ├── compare_all.py    # Multi-query comparison runner
│   └── utils.py          # Shared utilities
├── requirements.txt
└── README.md

ai/vector-search-python/
├── src/
│   ├── ivf.py
│   ├── hnsw.py
│   ├── diskann.py
│   ├── create_embeddings.py
│   └── utils.py
├── requirements.txt
└── README.md
```

## Naming Conventions

- Files: `snake_case.py`
- Functions: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Classes: `PascalCase`

## Authentication Pattern

```python
from azure.identity import DefaultAzureCredential
from pymongo import MongoClient
from pymongo.auth_oidc import OIDCCallback, OIDCCallbackContext, OIDCCallbackResult

class AzureIdentityCallback(OIDCCallback):
    def fetch(self, context: OIDCCallbackContext) -> OIDCCallbackResult:
        credential = DefaultAzureCredential()
        token = credential.get_token("https://ossrdbms-aad.database.windows.net/.default")
        return OIDCCallbackResult(access_token=token.token, expires_in_seconds=300)
```

## $search Syntax

```python
# CORRECT
pipeline = [
    {"$search": {"cosmosSearch": {"vector": query_vector, "path": field, "k": top_k}}},
    {"$project": {"similarityScore": {"$meta": "searchScore"}, "document": "$$ROOT"}}
]

# WRONG — do NOT use cosmosSearchOptions in $search
# pipeline = [{"$search": {"cosmosSearch": {...}, "cosmosSearchOptions": {...}}}]
```

## Bulk Insert

Use `collection.bulk_write()` with `InsertOne` operations and `ordered=False`:

```python
from pymongo import InsertOne
from pymongo.errors import BulkWriteError

operations = [InsertOne(document) for document in batch]
try:
    result = collection.bulk_write(operations, ordered=False)
    inserted_count += result.inserted_count
except BulkWriteError as e:
    inserted_count += e.details.get('nInserted', 0)
    failed_count += len(batch) - e.details.get('nInserted', 0)
```

- Batch size configurable via `LOAD_SIZE_BATCH` env var (default: 100)
- 200ms delay between batches (`time.sleep(0.2)`)
- Handle `BulkWriteError` for partial failures

## Key Patterns

- Use `os.environ.get("VAR", "default")` for config
- Type hints on all function signatures
- Use `try/finally` for collection cleanup
- Match TypeScript output format exactly (table layout, emoji, section headers)

## Environment Variables

- Use `python-dotenv` to load from `.env` file at startup
- Provide a `.env.example` file in each sample directory
- Access pattern: `os.environ.get("VAR", "default")` for optional, `os.environ["VAR"]` for required
- Call `load_dotenv()` at the top of the entry point before accessing any env vars

```python
from dotenv import load_dotenv
import os

load_dotenv()

endpoint = os.environ["AZURE_OPENAI_EMBEDDING_ENDPOINT"]
model = os.environ["AZURE_OPENAI_EMBEDDING_MODEL"]
cluster_name = os.environ["MONGO_CLUSTER_NAME"]
batch_size = int(os.environ.get("LOAD_SIZE_BATCH", "100"))
```

- Include `python-dotenv` in `requirements.txt`

## Build & Run

```bash
pip install -r requirements.txt
python src/compare_all.py
```
