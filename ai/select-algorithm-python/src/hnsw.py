"""
HNSW (Hierarchical Navigable Small World) vector index for Azure DocumentDB.

Best for: Datasets between 10,000 and 50,000 documents.
Cluster tier: M30 or higher.
Key parameters: m (graph connectivity), efConstruction (build quality).
"""
import os
import time
from utils import (
    get_clients_passwordless, get_config, read_file_return_json,
    insert_data, drop_vector_indexes, perform_vector_search, print_search_results
)


def create_hnsw_vector_index(collection, vector_field: str, dimensions: int,
                             similarity: str = "COS", m: int = 16,
                             ef_construction: int = 64) -> None:
    """Create an HNSW vector index on the specified field."""
    print(f"Creating HNSW vector index on field '{vector_field}'...")

    drop_vector_indexes(collection, vector_field)

    index_command = {
        "createIndexes": collection.name,
        "indexes": [
            {
                "name": f"hnsw_index_{vector_field}",
                "key": {vector_field: "cosmosSearch"},
                "cosmosSearchOptions": {
                    "kind": "vector-hnsw",
                    "dimensions": dimensions,
                    "similarity": similarity,
                    "m": m,
                    "efConstruction": ef_construction
                }
            }
        ]
    }

    result = collection.database.command(index_command)
    print(f"HNSW vector index created successfully")
    return result


def main():
    print("=" * 60)
    print("  HNSW Vector Index - Select Algorithm Demo")
    print("  Best for: 10,000 - 50,000 documents")
    print("=" * 60)

    config = get_config()
    mongo_client, azure_openai_client = get_clients_passwordless()

    try:
        database = mongo_client[config['database_name']]
        collection = database["hotels_hnsw"]

        # Load and insert data
        data = read_file_return_json(config['data_file'])
        documents = [doc for doc in data if config['vector_field'] in doc]
        print(f"\nLoaded {len(documents)} documents with embeddings")

        stats = insert_data(collection, documents, config['batch_size'])

        # Create HNSW index
        if not stats.get('skipped'):
            create_hnsw_vector_index(
                collection,
                config['vector_field'],
                config['dimensions'],
                config['similarity']
            )
            print("Waiting for index to build...")
            time.sleep(5)

        # Perform search
        query = "quintessential lodging near running trails, eateries, retail"
        results = perform_vector_search(
            collection, azure_openai_client, query,
            config['vector_field'], config['model_name']
        )
        print_search_results(results, "HNSW")

    finally:
        mongo_client.close()


if __name__ == "__main__":
    main()
