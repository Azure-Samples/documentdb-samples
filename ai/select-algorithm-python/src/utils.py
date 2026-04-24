import json
import os
import warnings
from typing import Any

warnings.filterwarnings(
    "ignore",
    message="You appear to be connected to a CosmosDB cluster.*",
)

from pymongo import MongoClient, InsertOne
from pymongo.collection import Collection
from pymongo.errors import BulkWriteError
from azure.identity import DefaultAzureCredential
from pymongo.auth_oidc import OIDCCallback, OIDCCallbackContext, OIDCCallbackResult
from openai import AzureOpenAI
from dotenv import load_dotenv

load_dotenv()


class AzureIdentityTokenCallback(OIDCCallback):
    def __init__(self, credential):
        self.credential = credential

    def fetch(self, context: OIDCCallbackContext) -> OIDCCallbackResult:
        token = self.credential.get_token(
            "https://ossrdbms-aad.database.windows.net/.default").token
        return OIDCCallbackResult(access_token=token)


def get_clients_passwordless() -> tuple[MongoClient, AzureOpenAI]:
    cluster_name = os.getenv("MONGO_CLUSTER_NAME")
    if not cluster_name:
        raise ValueError(
            "MONGO_CLUSTER_NAME environment variable is required.\n"
            "Create a .env file based on .env.example or set it in your environment."
        )

    credential = DefaultAzureCredential()

    auth_properties = {"OIDC_CALLBACK": AzureIdentityTokenCallback(credential)}

    mongo_client = MongoClient(
        f"mongodb+srv://{cluster_name}.mongocluster.cosmos.azure.com/",
        # 120s connect timeout accommodates cold-start latency on DocumentDB clusters
        connectTimeoutMS=120000,
        tls=True,
        retryWrites=False,
        authMechanism="MONGODB-OIDC",
        authMechanismProperties=auth_properties
    )

    azure_openai_endpoint = os.getenv("AZURE_OPENAI_EMBEDDING_ENDPOINT")
    if not azure_openai_endpoint:
        raise ValueError(
            "AZURE_OPENAI_EMBEDDING_ENDPOINT environment variable is required.\n"
            "Create a .env file based on .env.example or set it in your environment."
        )

    azure_openai_client = AzureOpenAI(
        azure_endpoint=azure_openai_endpoint,
        azure_ad_token_provider=lambda: credential.get_token("https://cognitiveservices.azure.com/.default").token,
        # See Azure OpenAI API version lifecycle:
        # https://learn.microsoft.com/azure/ai-services/openai/api-version-deprecation
        api_version=os.getenv("AZURE_OPENAI_EMBEDDING_API_VERSION", "2023-05-15"),
        timeout=30.0,
        max_retries=3,
    )

    return mongo_client, azure_openai_client


def read_file_return_json(file_path: str) -> list[dict[str, Any]]:
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return json.load(file)
    except FileNotFoundError:
        print(f"Error: File '{file_path}' not found")
        raise
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in file '{file_path}': {e}")
        raise


def insert_data(collection: Collection, data: list[dict[str, Any]], batch_size: int = 100) -> dict[str, int]:
    """Insert documents using bulk_write in batches.

    batch_size defaults to 100 to stay within the DocumentDB 16 MB command
    payload limit while keeping round-trip overhead reasonable.
    """
    total_documents = len(data)
    inserted_count = 0
    failed_count = 0

    print(f"Inserting {total_documents} documents in batches of {batch_size}...")

    for i in range(0, total_documents, batch_size):
        batch = data[i:i + batch_size]
        batch_num = (i // batch_size) + 1

        try:
            operations = [InsertOne(document) for document in batch]
            result = collection.bulk_write(operations, ordered=False)
            inserted_count += result.inserted_count
            print(f"Batch {batch_num} completed: {result.inserted_count} documents inserted")

        except BulkWriteError as e:
            inserted_count += e.details.get('nInserted', 0)
            failed_count += len(batch) - e.details.get('nInserted', 0)
            print(f"Batch {batch_num} had errors: {e.details.get('nInserted', 0)} inserted, {failed_count} failed")

        except Exception as e:
            failed_count += len(batch)
            print(f"Batch {batch_num} failed completely: {e}")

    return {
        'total': total_documents,
        'inserted': inserted_count,
        'failed': failed_count
    }


def print_comparison_table(results: list[dict[str, Any]]) -> None:
    if not results:
        print("No comparison results to display.")
        return

    print("\n" + "=" * 90)
    print("                    Vector Algorithm Comparison Results")
    print("=" * 90)

    header = (
        f"{'Algorithm':<12} "
        f"{'Similarity':<14} "
        f"{'Top Result':<24} "
        f"{'Score':<12} "
        f"{'Latency(ms)':<14}"
    )
    print(header)
    print("-" * 90)

    for r in results:
        top_result = r['search_results'][0] if r['search_results'] else None
        if top_result:
            doc = top_result.get('document', top_result)
            top_name = doc.get('HotelName', 'N/A')[:22]
            top_score = f"{top_result['score']:.4f}"
        else:
            top_name = 'N/A'
            top_score = 'N/A'

        row = (
            f"{r['algorithm']:<12} "
            f"{r['similarity']:<14} "
            f"{top_name:<24} "
            f"{top_score:<12} "
            f"{r['latency_ms']:<14.0f}"
        )
        print(row)

    print("=" * 90)

    for r in results:
        print(f"\n--- {r['algorithm']} / {r['similarity']} ({r['collection_name']}) ---")
        if not r['search_results']:
            print("  No results.")
            continue

        for i, item in enumerate(r['search_results'], 1):
            doc = item.get('document', item)
            score = item['score']
            print(f"  {i}. {doc.get('HotelName', 'N/A')}, Score: {score:.4f}")

        print(f"  Latency: {r['latency_ms']:.0f}ms")
