"""
Compare All Algorithms — Unified comparison runner.

Executes all 9 combinations (3 algorithms × 3 similarity metrics) in a single
invocation and prints a formatted comparison table.

Algorithms: IVF, HNSW, DiskANN
Metrics: COS, L2, IP
"""
import os
import time
from typing import Dict, List, Any

from tabulate import tabulate
from utils import (
    get_clients_passwordless, get_config, read_file_return_json,
    insert_data
)

# Index definitions: (algo_label, kind, extra_params)
ALGORITHMS = [
    ("IVF", "vector-ivf", {"numLists": 1}),
    ("HNSW", "vector-hnsw", {"m": 16, "efConstruction": 64}),
    ("DiskANN", "vector-diskann", {"maxDegree": 32, "lBuild": 50}),
]

METRICS = ["COS", "L2", "IP"]


def get_compare_config() -> Dict[str, Any]:
    """Load comparison-specific configuration from environment variables."""
    config = get_config()
    config["query_text"] = os.getenv("QUERY_TEXT", "luxury hotel near the beach")
    config["top_k"] = int(os.getenv("TOP_K", "5"))
    return config


def index_name(algo: str, metric: str) -> str:
    """Generate canonical index name: vector_{algo}_{metric}."""
    return f"vector_{algo.lower()}_{metric.lower()}"


def get_existing_index_names(collection) -> List[str]:
    """Return names of existing indexes on the collection."""
    return [idx["name"] for idx in collection.list_indexes()]


def drop_vector_indexes(collection, vector_field: str) -> None:
    """Drop all existing vector indexes on *vector_field*."""
    for idx in collection.list_indexes():
        name = idx.get("name", "")
        key = idx.get("key", {})
        if vector_field in key and key[vector_field] == "cosmosSearch":
            collection.drop_index(name)


def create_vector_index(collection, name: str, kind: str, vector_field: str,
                        dimensions: int, similarity: str,
                        extra_params: Dict[str, Any]) -> None:
    """Create a single vector index."""
    cosmos_options = {
        "kind": kind,
        "dimensions": dimensions,
        "similarity": similarity,
        **extra_params,
    }

    index_command = {
        "createIndexes": collection.name,
        "indexes": [
            {
                "name": name,
                "key": {vector_field: "cosmosSearch"},
                "cosmosSearchOptions": cosmos_options,
            }
        ],
    }
    collection.database.command(index_command)


def generate_embedding(azure_openai_client, query_text: str,
                       model_name: str) -> List[float]:
    """Generate a single embedding for the query text."""
    response = azure_openai_client.embeddings.create(
        input=[query_text],
        model=model_name
    )
    return response.data[0].embedding


def vector_search_with_index(collection, query_embedding: List[float],
                             vector_field: str,
                             top_k: int) -> List[Dict[str, Any]]:
    """Run vector search using the single active index and return results."""
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

    results = list(collection.aggregate(pipeline))

    return results


def vector_search_with_retry(collection, query_embedding: List[float],
                             vector_field: str, top_k: int,
                             index_name_value: str) -> List[Dict[str, Any]]:
    """Retry vector search until results are available or retries are exhausted."""
    max_retries = 5
    retry_delay_seconds = 2

    for attempt in range(max_retries + 1):
        results = vector_search_with_index(
            collection, query_embedding, vector_field, top_k
        )
        if results:
            return results

        if attempt < max_retries:
            print(
                f"  No results for '{index_name_value}' yet. "
                f"Retrying in {retry_delay_seconds} seconds "
                f"({attempt + 1}/{max_retries})..."
            )
            time.sleep(retry_delay_seconds)

    print(
        f"  Search for '{index_name_value}' did not return results "
        f"after {max_retries} retries. Recording as failed."
    )
    return []


def main():
    print("=" * 70)
    print("  Compare All Algorithms — 9 Combinations")
    print("  (3 Algorithms × 3 Similarity Metrics)")
    print("=" * 70)

    config = get_compare_config()
    query_text = config["query_text"]
    top_k = config["top_k"]

    print(f"\n  Query:  \"{query_text}\"")
    print(f"  Top K:  {top_k}\n")

    mongo_client, azure_openai_client = get_clients_passwordless()

    try:
        database = mongo_client[config["database_name"]]

        # Drop collection for a clean comparison
        database.drop_collection("hotels")
        print("Dropped existing 'hotels' collection (if any)")

        # Create fresh collection and load data
        collection = database["hotels"]
        data = read_file_return_json(config["data_file"])
        documents = [doc for doc in data if config["vector_field"] in doc]
        print(f"Loaded {len(documents)} documents with embeddings")
        insert_data(collection, documents, config["batch_size"])

        # Generate ONE embedding for the query
        print("\nGenerating embedding for query...")
        query_embedding = generate_embedding(
            azure_openai_client, query_text, config["model_name"]
        )

        # Run all 9 searches sequentially (create→search→drop for each)
        print("Running 9 vector searches...\n")
        table_rows = []

        for algo_label, kind, extra_params in ALGORITHMS:
            for metric in METRICS:
                name = index_name(algo_label, metric)
                # Drop all vector indexes first
                drop_vector_indexes(collection, config["vector_field"])
                # Create this specific index
                create_vector_index(
                    collection, name, kind, config["vector_field"],
                    config["dimensions"], metric, extra_params
                )
                print(f"  Created index '{name}'")
                results = vector_search_with_retry(
                    collection, query_embedding, config["vector_field"], top_k, name
                )

                if not results:
                    table_rows.append([
                        algo_label,
                        metric,
                        "(failed)",
                        f"{0:.4f}",
                        "(failed)",
                        f"{0:.4f}",
                        f"{0:.4f}",
                    ])
                    continue

                top1_name = results[0].get("document", results[0]).get("HotelName", "Unknown") if len(results) > 0 else "(no results)"
                top1_score = results[0].get("score", 0) if len(results) > 0 else 0
                top2_name = results[1].get("document", results[1]).get("HotelName", "Unknown") if len(results) > 1 else "(no results)"
                top2_score = results[1].get("score", 0) if len(results) > 1 else 0

                table_rows.append([
                    algo_label,
                    metric,
                    top1_name,
                    f"{top1_score:.4f}",
                    top2_name,
                    f"{top2_score:.4f}",
                    f"{abs(top1_score - top2_score):.4f}",
                ])

        # Print comparison table
        headers = ["Algorithm", "Metric", "Top 1 Result", "Score",
                   "Top 2 Result", "Score", "Diff"]
        print(tabulate(table_rows, headers=headers, tablefmt="grid"))

    finally:
        # Cleanup: drop the comparison collection
        try:
            database = mongo_client[config["database_name"]]
            database.drop_collection("hotels")
            print("\nCleanup: dropped collection 'hotels'")
        except Exception as e:
            print(f"Cleanup warning: {e}")
        mongo_client.close()


if __name__ == "__main__":
    main()
