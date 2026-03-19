import path from 'path';
import { readFileReturnJson, getClientsPasswordless, insertData, printComparisonTable } from './utils.js';

// ESM specific features - create __dirname equivalent
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type Algorithm = 'diskann' | 'hnsw' | 'ivf';
type Similarity = 'COS' | 'L2' | 'IP';

const ALGORITHMS: Algorithm[] = ['diskann', 'hnsw', 'ivf'];
const SIMILARITIES: Similarity[] = ['COS', 'L2', 'IP'];

const ALGORITHM_LABELS: Record<Algorithm, string> = {
    diskann: 'DiskANN',
    hnsw: 'HNSW',
    ivf: 'IVF',
};

// Index creation configs per algorithm
function getIndexOptions(
    collectionName: string,
    indexName: string,
    embeddedField: string,
    dimensions: number,
    algorithm: Algorithm,
    similarity: Similarity
) {
    const base = {
        createIndexes: collectionName,
        indexes: [
            {
                name: indexName,
                key: { [embeddedField]: 'cosmosSearch' },
                cosmosSearchOptions: {} as Record<string, any>,
            },
        ],
    };

    switch (algorithm) {
        case 'diskann':
            base.indexes[0].cosmosSearchOptions = {
                kind: 'vector-diskann',
                dimensions,
                similarity,
                maxDegree: 32,
                lBuild: 50,
            };
            break;
        case 'hnsw':
            base.indexes[0].cosmosSearchOptions = {
                kind: 'vector-hnsw',
                dimensions,
                similarity,
                m: 16,
                efConstruction: 64,
            };
            break;
        case 'ivf':
            base.indexes[0].cosmosSearchOptions = {
                kind: 'vector-ivf',
                dimensions,
                similarity,
                numLists: 1,
            };
            break;
    }

    return base;
}

// Algorithm-specific query params
function getSearchPipeline(
    queryEmbedding: number[],
    embeddedField: string,
    k: number,
    algorithm: Algorithm
) {
    const cosmosSearch: Record<string, any> = {
        vector: queryEmbedding,
        path: embeddedField,
        k,
    };

    // Add algorithm-specific search params
    switch (algorithm) {
        case 'diskann':
            cosmosSearch.lSearch = 100;
            break;
        case 'hnsw':
            cosmosSearch.efSearch = 80;
            break;
        case 'ivf':
            cosmosSearch.nProbes = 1;
            break;
    }

    return [
        { $search: { cosmosSearch } },
        { $project: { score: { $meta: "searchScore" }, document: "$$ROOT" } },
    ];
}

/**
 * Determine which collections to create/query based on ALGORITHM and SIMILARITY env vars.
 * Collection naming: hotels_{algorithm}_{similarity}
 */
function getTargetCollections(
    algorithmEnv: string,
    similarityEnv: string
): Array<{ collectionName: string; algorithm: Algorithm; similarity: Similarity }> {
    const algorithms: Algorithm[] =
        algorithmEnv === 'all' ? ALGORITHMS : [algorithmEnv as Algorithm];
    const similarities: Similarity[] =
        similarityEnv === 'all' ? SIMILARITIES : [similarityEnv as Similarity];

    const targets: Array<{ collectionName: string; algorithm: Algorithm; similarity: Similarity }> = [];

    for (const alg of algorithms) {
        if (!ALGORITHMS.includes(alg)) {
            throw new Error(`Invalid ALGORITHM '${alg}'. Must be one of: all, ${ALGORITHMS.join(', ')}`);
        }
        for (const sim of similarities) {
            if (!SIMILARITIES.includes(sim)) {
                throw new Error(`Invalid SIMILARITY '${sim}'. Must be one of: all, ${SIMILARITIES.join(', ')}`);
            }
            targets.push({
                collectionName: `hotels_${alg}_${sim.toLowerCase()}`,
                algorithm: alg,
                similarity: sim,
            });
        }
    }

    return targets;
}

async function main() {
    const { aiClient, dbClient } = getClientsPasswordless();

    try {
        if (!aiClient) {
            throw new Error('Azure OpenAI client is not configured. Please check your environment variables.');
        }
        if (!dbClient) {
            throw new Error('Database client is not configured. Please check your environment variables.');
        }

        const dbName = process.env.AZURE_DOCUMENTDB_DATABASENAME || 'Hotels';
        const embeddedField = process.env.EMBEDDED_FIELD || 'DescriptionVector';
        const embeddingDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10);
        const dataFile = process.env.DATA_FILE_WITH_VECTORS || '../data/Hotels_Vector.json';
        const deployment = process.env.AZURE_OPENAI_EMBEDDING_MODEL!;
        const batchSize = parseInt(process.env.LOAD_SIZE_BATCH || '100', 10);
        const algorithmEnv = (process.env.ALGORITHM || 'all').trim().toLowerCase();
        const similarityEnv = (process.env.SIMILARITY || 'COS').trim().toUpperCase();
        const searchQuery = 'quintessential lodging near running trails, eateries, retail';

        const targets = getTargetCollections(algorithmEnv, similarityEnv);

        console.log(`\n🔬 Vector Algorithm Comparison`);
        console.log(`   Database: ${dbName}`);
        console.log(`   Algorithms: ${algorithmEnv}`);
        console.log(`   Similarity: ${similarityEnv}`);
        console.log(`   Collections to query: ${targets.map(t => t.collectionName).join(', ')}`);
        console.log(`   Search query: "${searchQuery}"\n`);

        await dbClient.connect();
        const db = dbClient.db(dbName);

        // Load data once (shared across collections)
        const data = await readFileReturnJson(path.join(__dirname, '..', dataFile));

        // Generate query embedding once (reuse across collections)
        console.log('Generating query embedding...');
        const embeddingResponse = await aiClient.embeddings.create({
            model: deployment,
            input: [searchQuery],
        });
        const queryEmbedding = embeddingResponse.data[0].embedding;
        console.log(`Query embedding: ${queryEmbedding.length} dimensions\n`);

        const config = { batchSize };

        const comparisonResults: Array<{
            collectionName: string;
            algorithm: string;
            similarity: string;
            searchResults: any[];
            latencyMs: number;
        }> = [];

        for (const target of targets) {
            console.log(`\n━━━ ${ALGORITHM_LABELS[target.algorithm]} / ${target.similarity} ━━━`);
            console.log(`Collection: ${target.collectionName}`);

            try {
                // Create collection (drops existing to ensure clean state)
                try {
                    await db.dropCollection(target.collectionName);
                } catch {
                    // Collection may not exist yet
                }
                const collection = await db.createCollection(target.collectionName);
                console.log('Created collection:', target.collectionName);

                // Insert data
                const insertSummary = await insertData(config, collection, data);
                console.log(`Inserted: ${insertSummary.inserted}/${insertSummary.total}`);

                // Create vector index
                const indexName = `vectorIndex_${target.algorithm}_${target.similarity.toLowerCase()}`;
                const indexOptions = getIndexOptions(
                    target.collectionName,
                    indexName,
                    embeddedField,
                    embeddingDimensions,
                    target.algorithm,
                    target.similarity
                );
                await db.command(indexOptions);
                console.log('Created vector index:', indexName);

                // Run vector search
                console.log('Executing vector search...');
                const startTime = Date.now();

                const pipeline = getSearchPipeline(queryEmbedding, embeddedField, 5, target.algorithm);
                const searchResults = await collection.aggregate(pipeline).toArray();

                const latencyMs = Date.now() - startTime;

                comparisonResults.push({
                    collectionName: target.collectionName,
                    algorithm: ALGORITHM_LABELS[target.algorithm],
                    similarity: target.similarity,
                    searchResults,
                    latencyMs,
                });

                console.log(`✓ ${searchResults.length} results, ${latencyMs}ms`);
            } catch (error) {
                console.error(`✗ Error with ${target.collectionName}:`, (error as Error).message);
            }
        }

        // Print comparison table
        if (comparisonResults.length > 0) {
            printComparisonTable(comparisonResults);
        }
    } catch (error) {
        console.error('App failed:', error);
        process.exitCode = 1;
    } finally {
        console.log('\nClosing database connection...');
        if (dbClient) await dbClient.close();
        console.log('Database connection closed');
    }
}

main().catch(error => {
    console.error('Unhandled error:', error);
    process.exitCode = 1;
});
