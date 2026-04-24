import os
import time
from pathlib import Path
from typing import Any, Literal
import openai
import pymongo.errors
from utils import get_clients_passwordless, read_file_return_json, insert_data, print_comparison_table
from dotenv import load_dotenv

load_dotenv()

Algorithm = Literal['diskann', 'hnsw', 'ivf']
Similarity = Literal['COS', 'L2', 'IP']

ALGORITHMS: list[Algorithm] = ['diskann', 'hnsw', 'ivf']
SIMILARITIES: list[Similarity] = ['COS', 'L2', 'IP']

ALGORITHM_LABELS = {
    'diskann': 'DiskANN',
    'hnsw': 'HNSW',
    'ivf': 'IVF'
}


def get_index_options(
    collection_name: str,
    index_name: str,
    embedded_field: str,
    dimensions: int,
    algorithm: Algorithm,
    similarity: Similarity
) -> dict[str, Any]:
    base = {
        "createIndexes": collection_name,
        "indexes": [
            {
                "name": index_name,
                "key": {embedded_field: "cosmosSearch"},
                "cosmosSearchOptions": {}
            }
        ]
    }

    if algorithm == 'diskann':
        base["indexes"][0]["cosmosSearchOptions"] = {
            "kind": "vector-diskann",
            "dimensions": dimensions,
            "similarity": similarity,
            "maxDegree": 32,
            "lBuild": 50
        }
    elif algorithm == 'hnsw':
        base["indexes"][0]["cosmosSearchOptions"] = {
            "kind": "vector-hnsw",
            "dimensions": dimensions,
            "similarity": similarity,
            "m": 16,
            "efConstruction": 64
        }
    elif algorithm == 'ivf':
        base["indexes"][0]["cosmosSearchOptions"] = {
            "kind": "vector-ivf",
            "dimensions": dimensions,
            "similarity": similarity,
            "numLists": 1
        }

    return base


def get_search_pipeline(
    query_embedding: list[float],
    embedded_field: str,
    k: int,
    algorithm: Algorithm
) -> list[dict[str, Any]]:
    cosmos_search = {
        "vector": query_embedding,
        "path": embedded_field,
        "k": k
    }

    if algorithm == 'diskann':
        cosmos_search["lSearch"] = 100
    elif algorithm == 'hnsw':
        cosmos_search["efSearch"] = 80
    elif algorithm == 'ivf':
        cosmos_search["nProbes"] = 1

    return [
        {"$search": {"cosmosSearch": cosmos_search}},
        {"$project": {"score": {"$meta": "searchScore"}, "document": "$$ROOT"}}
    ]


def get_target_collections(
    algorithm_env: str,
    similarity_env: str
) -> list[dict[str, Any]]:
    algorithms = ALGORITHMS if algorithm_env == 'all' else [algorithm_env]
    similarities = SIMILARITIES if similarity_env == 'all' else [similarity_env]

    targets = []

    for alg in algorithms:
        if alg not in ALGORITHMS:
            raise ValueError(f"Invalid ALGORITHM '{alg}'. Must be one of: all, {', '.join(ALGORITHMS)}")

        for sim in similarities:
            if sim not in SIMILARITIES:
                raise ValueError(f"Invalid SIMILARITY '{sim}'. Must be one of: all, {', '.join(SIMILARITIES)}")

            targets.append({
                'collection_name': f"hotels_{alg}_{sim.lower()}",
                'algorithm': alg,
                'similarity': sim
            })

    return targets


def main() -> None:
    db_name = os.getenv('AZURE_DOCUMENTDB_DATABASENAME', 'Hotels')
    embedded_field = os.getenv('EMBEDDED_FIELD', 'DescriptionVector')
    embedding_dimensions = int(os.getenv('EMBEDDING_DIMENSIONS', '1536'))
    data_file = os.getenv('DATA_FILE_WITH_VECTORS', '../../data/Hotels_Vector.json')
    model_name = os.getenv('AZURE_OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small')
    batch_size = int(os.getenv('LOAD_SIZE_BATCH', '100'))
    algorithm_env = os.getenv('ALGORITHM', 'all').strip().lower()
    similarity_env = os.getenv('SIMILARITY', 'COS').strip().upper()
    search_query = 'quintessential lodging near running trails, eateries, retail'

    try:
        targets = get_target_collections(algorithm_env, similarity_env)

        print("\nVector Algorithm Comparison")
        print(f"   Database: {db_name}")
        print(f"   Algorithms: {algorithm_env}")
        print(f"   Similarity: {similarity_env}")
        print(f"   Collections to query: {', '.join([t['collection_name'] for t in targets])}")
        print(f'   Search query: "{search_query}"\n')

        print("\nInitializing MongoDB and Azure OpenAI clients...")
        mongo_client, azure_openai_client = get_clients_passwordless()

        database = mongo_client[db_name]

        script_dir = Path(__file__).parent
        data_path = script_dir / '..' / data_file
        print(f"\nLoading data from {data_path}...")
        data = read_file_return_json(str(data_path))
        print(f"Loaded {len(data)} documents")

        documents_with_embeddings = [doc for doc in data if embedded_field in doc]
        if not documents_with_embeddings:
            raise ValueError(f"No documents found with embeddings in field '{embedded_field}'")

        print('Generating query embedding...')
        embedding_response = azure_openai_client.embeddings.create(
            model=model_name,
            input=[search_query]
        )
        query_embedding = embedding_response.data[0].embedding
        print(f"Query embedding: {len(query_embedding)} dimensions\n")

        comparison_results = []

        for target in targets:
            print(f"\n--- {ALGORITHM_LABELS[target['algorithm']]} / {target['similarity']} ---")
            print(f"Collection: {target['collection_name']}")

            try:
                try:
                    database.drop_collection(target['collection_name'])
                except Exception as e:
                    print(f"  Note: could not drop existing collection: {e}")

                collection = database.create_collection(target['collection_name'])
                print(f"Created collection: {target['collection_name']}")

                insert_summary = insert_data(collection, documents_with_embeddings, batch_size)
                print(f"Inserted: {insert_summary['inserted']}/{insert_summary['total']}")

                index_name = f"vectorIndex_{target['algorithm']}_{target['similarity'].lower()}"
                index_options = get_index_options(
                    target['collection_name'],
                    index_name,
                    embedded_field,
                    embedding_dimensions,
                    target['algorithm'],
                    target['similarity']
                )
                database.command(index_options)
                print(f"Created vector index: {index_name}")

                print('Executing vector search...')
                start_time = time.time()

                pipeline = get_search_pipeline(query_embedding, embedded_field, 5, target['algorithm'])
                # aggregate() returns a cursor (iterator); list() consumes all pages
                search_results = list(collection.aggregate(pipeline))

                latency_ms = (time.time() - start_time) * 1000

                comparison_results.append({
                    'collection_name': target['collection_name'],
                    'algorithm': ALGORITHM_LABELS[target['algorithm']],
                    'similarity': target['similarity'],
                    'search_results': search_results,
                    'latency_ms': latency_ms
                })

                print(f"Success: {len(search_results)} results, {latency_ms:.0f}ms")

            except (pymongo.errors.PyMongoError, openai.APIError) as error:
                print(f"Error with {target['collection_name']}: {error}")

        if comparison_results:
            print_comparison_table(comparison_results)

    except Exception as error:
        print(f"\nApp failed: {error}")
        raise

    finally:
        print('\nClosing database connection...')
        if 'mongo_client' in locals():
            mongo_client.close()
        print('Database connection closed')


if __name__ == "__main__":
    main()
