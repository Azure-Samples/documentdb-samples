"""
Compare All Algorithms — Unified comparison runner.

Executes all 9 combinations (3 algorithms × 3 similarity metrics) in a single
invocation and prints a formatted comparison table.

Algorithms: IVF, HNSW, DiskANN
Metrics: COS, L2, IP
"""
import os
import time
from typing import Dict, List, Any, Tuple

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
    config["top_k"] = int(os.getenv("TOP_K", "3"))
    config["verbose"] = os.getenv("VERBOSE", "false").lower() in ("true", "1", "yes")
    return config


def index_name(algo: str, metric: str) -> str:
    """Generate canonical index name: vector_{algo}_{metric}."""
    return f"vector_{algo.lower()}_{metric.lower()}"


def get_existing_index_names(collection) -> List[str]:
    """Return names of existing indexes on the collection."""
    return [idx["name"] for idx in collection.list_indexes()]


def create_vector_index(collection, name: str, kind: str, vector_field: str,
                        dimensions: int, similarity: str,
                        extra_params: Dict[str, Any]) -> None:
    """Create a single vector index if it does not already exist."""
    existing = get_existing_index_names(collection)
    if name in existing:
        return

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


def create_all_indexes(collection, vector_field: str, dimensions: int,
                       verbose: bool = False) -> None:
    """Create all 9 vector indexes idempotently."""
    existing = get_existing_index_names(collection)
    created = 0

    for algo_label, kind, extra_params in ALGORITHMS:
        for metric in METRICS:
            name = index_name(algo_label, metric)
            if name in existing:
                if verbose:
                    print(f"  Index '{name}' already exists, skipping")
                continue
            create_vector_index(
                collection, name, kind, vector_field, dimensions, metric, extra_params
            )
            created += 1
            if verbose:
                print(f"  Created index '{name}'")

    if created > 0:
        print(f"Created {created} new index(es). Waiting for indexes to build...")
        time.sleep(5)
    else:
        print("All 9 indexes already exist.")


def generate_embedding(azure_openai_client, query_text: str,
                       model_name: str) -> List[float]:
    """Generate a single embedding for the query text."""
    response = azure_openai_client.embeddings.create(
        input=[query_text],
        model=model_name
    )
    return response.data[0].embedding


def vector_search_with_index(collection, query_embedding: List[float],
                             vector_field: str, idx_name: str,
                             top_k: int) -> Tuple[List[Dict[str, Any]], float]:
    """Run vector search against a specific index and return results + latency."""
    pipeline = [
        {
            "$search": {
                "cosmosSearch": {
                    "vector": query_embedding,
                    "path": vector_field,
                    "k": top_k
                },
                "cosmosSearchOptions": {
                    "indexName": idx_name
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

    start = time.perf_counter()
    results = list(collection.aggregate(pipeline))
    elapsed_ms = (time.perf_counter() - start) * 1000

    return results, elapsed_ms


def format_top_result(results: List[Dict[str, Any]]) -> str:
    """Extract top result name for display."""
    if not results:
        return "(no results)"
    doc = results[0].get("document", results[0])
    return doc.get("HotelName", doc.get("name", "Unknown"))


def main():
    print("=" * 70)
    print("  Compare All Algorithms — 9 Combinations")
    print("  (3 Algorithms × 3 Similarity Metrics)")
    print("=" * 70)

    config = get_compare_config()
    query_text = config["query_text"]
    top_k = config["top_k"]
    verbose = config["verbose"]

    print(f"\n  Query:  \"{query_text}\"")
    print(f"  Top K:  {top_k}")
    print(f"  Verbose: {verbose}\n")

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

        # Create all 9 indexes idempotently
        print("\nEnsuring all 9 vector indexes exist...")
        create_all_indexes(
            collection, config["vector_field"], config["dimensions"], verbose
        )

        # Generate ONE embedding for the query
        print(f"\nGenerating embedding for query...")
        query_embedding = generate_embedding(
            azure_openai_client, query_text, config["model_name"]
        )

        # Run all 9 searches sequentially
        print("Running 9 vector searches...\n")
        table_rows = []

        for algo_label, _, _ in ALGORITHMS:
            for metric in METRICS:
                idx = index_name(algo_label, metric)
                results, latency_ms = vector_search_with_index(
                    collection, query_embedding, config["vector_field"], idx, top_k
                )

                top_score = results[0].get("score", 0) if results else 0
                top_name = format_top_result(results)

                table_rows.append([
                    algo_label,
                    metric,
                    idx,
                    f"{latency_ms:.1f} ms",
                    len(results),
                    f"{top_score:.4f}",
                    top_name,
                ])

                if verbose:
                    for i, r in enumerate(results, 1):
                        doc = r.get("document", r)
                        name = doc.get("HotelName", doc.get("name", "Unknown"))
                        score = r.get("score", 0)
                        print(f"    {idx} #{i}: {name} (score: {score:.4f})")

        # Print comparison table
        headers = ["Algorithm", "Metric", "Index Name", "Latency",
                   "Results", "Top Score", "Top Result"]
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
