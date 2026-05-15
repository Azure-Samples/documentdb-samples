import json
import os
import time
import warnings
from typing import Dict, List, Any, Optional, Tuple

# Suppress the PyMongo CosmosDB cluster detection warning
warnings.filterwarnings(
    "ignore",
    message="You appear to be connected to a CosmosDB cluster.*",
)

from pymongo import MongoClient, InsertOne
from pymongo.collection import Collection
from pymongo.errors import BulkWriteError
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from pymongo.auth_oidc import OIDCCallback, OIDCCallbackContext, OIDCCallbackResult
from openai import AzureOpenAI


class AzureIdentityTokenCallback(OIDCCallback):
    def __init__(self, credential):
        self.credential = credential

    def fetch(self, context: OIDCCallbackContext) -> OIDCCallbackResult:
        token = self.credential.get_token(
            "https://ossrdbms-aad.database.windows.net/.default").token
        return OIDCCallbackResult(access_token=token)


def get_clients_passwordless() -> Tuple[MongoClient, AzureOpenAI]:
    """Create MongoDB and Azure OpenAI clients using passwordless auth."""
    cluster_name = os.getenv("DOCUMENTDB_CLUSTER_NAME")
    if not cluster_name:
        raise ValueError("DOCUMENTDB_CLUSTER_NAME environment variable is required")

    credential = DefaultAzureCredential()

    mongo_client = MongoClient(
        f"mongodb+srv://{cluster_name}.global.mongocluster.cosmos.azure.com/",
        connectTimeoutMS=120000,
        tls=True,
        retryWrites=False,
        authMechanism="MONGODB-OIDC",
        authMechanismProperties={"OIDC_CALLBACK": AzureIdentityTokenCallback(credential)}
    )

    azure_openai_endpoint = os.getenv("AZURE_OPENAI_EMBEDDING_ENDPOINT")
    if not azure_openai_endpoint:
        raise ValueError("AZURE_OPENAI_EMBEDDING_ENDPOINT environment variable is required")

    token_provider = get_bearer_token_provider(credential, "https://cognitiveservices.azure.com/.default")

    azure_openai_client = AzureOpenAI(
        azure_endpoint=azure_openai_endpoint,
        azure_ad_token_provider=token_provider,
        api_version=os.getenv("AZURE_OPENAI_EMBEDDING_API_VERSION", "2023-05-15")
    )

    return mongo_client, azure_openai_client


def get_config() -> Dict[str, Any]:
    """Load configuration from environment variables."""
    return {
        'database_name': os.getenv('AZURE_DOCUMENTDB_DATABASENAME', 'Hotels'),
        'data_file': os.getenv('DATA_FILE_WITH_VECTORS', 'data/Hotels_Vector.json'),
        'vector_field': os.getenv('EMBEDDED_FIELD', 'DescriptionVector'),
        'model_name': os.getenv('AZURE_OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small'),
        'dimensions': int(os.getenv('EMBEDDING_DIMENSIONS', '1536')),
        'batch_size': int(os.getenv('LOAD_SIZE_BATCH', '100')),
        'similarity': os.getenv('SIMILARITY', ''),
    }


def read_file_return_json(file_path: str) -> List[Dict[str, Any]]:
    """Read a JSON file and return the parsed data."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return json.load(file)
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found")
        raise


def insert_data(collection: Collection, data: List[Dict[str, Any]],
                batch_size: int = 100) -> Dict[str, Any]:
    """Insert data into collection in batches, skipping if already populated."""
    total_documents = len(data)

    existing_count = collection.count_documents({})
    if existing_count >= total_documents:
        print(f"Collection already has {existing_count} documents, skipping insert")
        return {'total': total_documents, 'inserted': 0, 'skipped': True}

    if existing_count > 0:
        collection.delete_many({})

    inserted_count = 0
    for i in range(0, total_documents, batch_size):
        batch = data[i:i + batch_size]
        try:
            operations = [InsertOne(doc) for doc in batch]
            result = collection.bulk_write(operations, ordered=False)
            inserted_count += result.inserted_count
        except BulkWriteError as e:
            inserted_count += e.details.get('nInserted', 0)
        time.sleep(0.1)

    print(f"Inserted {inserted_count}/{total_documents} documents")
    return {'total': total_documents, 'inserted': inserted_count, 'skipped': False}


def drop_vector_indexes(collection: Collection, vector_field: str) -> None:
    """Drop any existing vector indexes on the specified field."""
    try:
        indexes = list(collection.list_indexes())
        for index in indexes:
            if 'key' in index and vector_field in index['key']:
                if index['key'][vector_field] == 'cosmosSearch':
                    collection.drop_index(index['name'])
                    print(f"Dropped existing vector index: {index['name']}")
    except Exception as e:
        print(f"Warning: Error dropping indexes: {e}")


def perform_vector_search(collection: Collection,
                          azure_openai_client: AzureOpenAI,
                          query_text: str,
                          vector_field: str,
                          model_name: str,
                          top_k: int = 5) -> List[Dict[str, Any]]:
    """Perform vector search using the $search aggregation stage."""
    embedding_response = azure_openai_client.embeddings.create(
        input=[query_text],
        model=model_name
    )
    query_embedding = embedding_response.data[0].embedding

    pipeline = [
        {
            "$search": {
                "cosmosSearch": {
                    "vector": query_embedding,
                    "path": vector_field,
                    "k": top_k
                }
            }
        },
        {
            "$project": {
                "document": "$$ROOT",
                "score": {"$meta": "searchScore"}
            }
        }
    ]

    return list(collection.aggregate(pipeline))


def print_search_results(results: List[Dict[str, Any]], algorithm: str) -> None:
    """Print formatted search results."""
    print(f"\n{'='*60}")
    print(f"  {algorithm} Search Results ({len(results)} found)")
    print(f"{'='*60}")
    for i, result in enumerate(results, 1):
        doc = result.get('document', result)
        name = doc.get('HotelName', doc.get('name', 'Unknown'))
        score = result.get('score', 0)
        print(f"  {i}. {name} (score: {score:.4f})")
    print()
