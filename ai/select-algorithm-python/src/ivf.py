"""
IVF (Inverted File) vector index for Azure DocumentDB.

Best for: Datasets with fewer than 10,000 documents.
Cluster tier: M10 or higher.
Key parameters: numLists (cluster count).
"""
import os
import time
from utils import (
    get_clients_passwordless, get_config, read_file_return_json,
    insert_data, drop_vector_indexes, perform_vector_search, print_search_results
)


def create_ivf_vector_index(collection, vector_field: str, dimensions: int,
                            similarity: str = "COS", num_lists: int = 10) -> None:
    """Create an IVF vector index on the specified field."""
    print(f"Creating IVF vector index on field '{vector_field}'...")

    drop_vector_indexes(collection, vector_field)

    index_command = {
        "createIndexes": collection.name,
        "indexes": [
            {
                "name": f"ivf_index_{vector_field}",
                "key": {vector_field: "cosmosSearch"},
                "cosmosSearchOptions": {
                    "kind": "vector-ivf",
                    "dimensions": dimensions,
                    "similarity": similarity,
                    "numLists": num_lists
                }
            }
        ]
    }

    result = collection.database.command(index_command)
    print(f"IVF vector index created successfully")
    return result


def main():
    print("=" * 60)
    print("  IVF Vector Index - Select Algorithm Demo")
    print("  Best for: < 10,000 documents")
    print("=" * 60)

    config = get_config()
    mongo_client, azure_openai_client = get_clients_passwordless()

    try:
        database = mongo_client[config['database_name']]
        collection = database["hotels_ivf"]

        # Load and insert data
        data = read_file_return_json(config['data_file'])
        documents = [doc for doc in data if config['vector_field'] in doc]
        print(f"\nLoaded {len(documents)} documents with embeddings")

        stats = insert_data(collection, documents, config['batch_size'])

        # Create IVF index
        if not stats.get('skipped'):
            create_ivf_vector_index(
                collection,
                config['vector_field'],
                config['dimensions'],
                config['similarity']
            )
            print("Waiting for index to build...")
            time.sleep(3)

        # Perform search
        query = "quintessential lodging near running trails, eateries, retail"
        results = perform_vector_search(
            collection, azure_openai_client, query,
            config['vector_field'], config['model_name']
        )
        print_search_results(results, "IVF")

    finally:
        mongo_client.close()


if __name__ == "__main__":
    main()
