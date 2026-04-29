import path from 'path';
import { readFileReturnJson, getClientsPasswordless, getConfig, insertData } from './utils.js';
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface AlgorithmConfig {
    name: string;
    kind: string;
    options: Record<string, number>;
}

interface SearchResult {
    algorithm: string;
    similarity: string;
    latencyMs: number;
    topScore: number;
    topResult: string;
    results: Array<{ name: string; score: number }>;
}

const ALGORITHMS: AlgorithmConfig[] = [
    { name: 'IVF', kind: 'vector-ivf', options: { numLists: 1 } },
    { name: 'HNSW', kind: 'vector-hnsw', options: { m: 16, efConstruction: 64 } },
    { name: 'DiskANN', kind: 'vector-diskann', options: { maxDegree: 32, lBuild: 50 } },
];

const SIMILARITIES = ['COS', 'L2', 'IP'];

async function main() {
    const baseConfig = getConfig();
    const queryText = process.env.QUERY_TEXT || 'luxury hotel near the beach';
    const topK = parseInt(process.env.TOP_K || '3', 10);
    const verbose = process.env.VERBOSE === 'true';
    const collectionName = 'hotels';

    const { aiClient, dbClient } = getClientsPasswordless();

    try {
        if (!aiClient) throw new Error('AI client is not configured.');
        if (!dbClient) throw new Error('Database client is not configured.');

        await dbClient.connect();
        const db = dbClient.db(baseConfig.dbName);

        // Create collection and load data once
        let collection;
        const collections = await db.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) {
            collection = await db.createCollection(collectionName);
            console.log(`Created collection: ${collectionName}`);
            const data = await readFileReturnJson(path.join(__dirname, '..', baseConfig.dataFile));
            const insertSummary = await insertData(baseConfig, collection, data);
            console.log(`Inserted ${insertSummary.inserted}/${insertSummary.total} documents`);
        } else {
            collection = db.collection(collectionName);
            console.log(`Collection "${collectionName}" already exists, skipping data load`);
        }

        // Check existing indexes to avoid duplicates
        const existingIndexes = await collection.listIndexes().toArray();
        const existingIndexNames = new Set(existingIndexes.map(idx => idx.name));

        // Create all 9 indexes
        console.log('\nCreating vector indexes...');
        for (const algo of ALGORITHMS) {
            for (const sim of SIMILARITIES) {
                const indexName = `vector_${algo.kind.replace('vector-', '')}_${sim.toLowerCase()}`;
                if (existingIndexNames.has(indexName)) {
                    console.log(`  ✓ ${indexName} (already exists)`);
                    continue;
                }
                const indexOptions = {
                    createIndexes: collectionName,
                    indexes: [{
                        name: indexName,
                        key: { [baseConfig.embeddedField]: 'cosmosSearch' },
                        cosmosSearchOptions: {
                            kind: algo.kind,
                            ...algo.options,
                            similarity: sim,
                            dimensions: baseConfig.embeddingDimensions
                        }
                    }]
                };
                await db.command(indexOptions);
                console.log(`  ✓ ${indexName} (created)`);
            }
        }

        // Generate one embedding for the query
        console.log(`\nQuery: "${queryText}"`);
        const embeddingResponse = await aiClient.embeddings.create({
            model: baseConfig.deployment,
            input: [queryText]
        });
        const queryVector = embeddingResponse.data[0].embedding;
        console.log(`Embedding generated (${queryVector.length} dimensions)`);

        // Run all 9 searches sequentially
        console.log(`\nRunning searches (top ${topK} results)...\n`);
        const results: SearchResult[] = [];

        for (const algo of ALGORITHMS) {
            for (const sim of SIMILARITIES) {
                const indexName = `vector_${algo.kind.replace('vector-', '')}_${sim.toLowerCase()}`;

                const start = performance.now();
                const searchResults = await collection.aggregate([
                    {
                        $search: {
                            cosmosSearch: {
                                vector: queryVector,
                                path: baseConfig.embeddedField,
                                k: topK
                            },
                            cosmosSearchOptions: {
                                indexName: indexName
                            }
                        }
                    },
                    {
                        $project: {
                            score: { $meta: 'searchScore' },
                            document: '$$ROOT'
                        }
                    }
                ]).toArray();
                const latencyMs = performance.now() - start;

                const topDoc = searchResults[0] as any;
                results.push({
                    algorithm: algo.name,
                    similarity: sim,
                    latencyMs,
                    topScore: topDoc?.score ?? 0,
                    topResult: topDoc?.document?.HotelName ?? '(none)',
                    results: searchResults.map((r: any) => ({
                        name: r.document?.HotelName ?? '(none)',
                        score: r.score ?? 0
                    }))
                });
            }
        }

        // Print comparison table
        printComparisonTable(results, verbose);

    } catch (error) {
        console.error('Compare-all failed:', error);
        process.exitCode = 1;
    } finally {
        if (dbClient) await dbClient.close();
        console.log('\nDatabase connection closed');
    }
}

function printComparisonTable(results: SearchResult[], verbose: boolean) {
    const algoWidth = 10;
    const simWidth = 10;
    const latWidth = 8;
    const scoreWidth = 10;
    const nameWidth = 30;

    const pad = (s: string, w: number) => s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);

    const topLine = `╔${'═'.repeat(algoWidth)}╤${'═'.repeat(simWidth)}╤${'═'.repeat(latWidth)}╤${'═'.repeat(scoreWidth)}╤${'═'.repeat(nameWidth)}╗`;
    const headerSep = `╠${'═'.repeat(algoWidth)}╪${'═'.repeat(simWidth)}╪${'═'.repeat(latWidth)}╪${'═'.repeat(scoreWidth)}╪${'═'.repeat(nameWidth)}╣`;
    const rowSep = `╟${'─'.repeat(algoWidth)}┼${'─'.repeat(simWidth)}┼${'─'.repeat(latWidth)}┼${'─'.repeat(scoreWidth)}┼${'─'.repeat(nameWidth)}╢`;
    const bottomLine = `╚${'═'.repeat(algoWidth)}╧${'═'.repeat(simWidth)}╧${'═'.repeat(latWidth)}╧${'═'.repeat(scoreWidth)}╧${'═'.repeat(nameWidth)}╝`;

    console.log(topLine);
    console.log(`║${pad(' Algorithm', algoWidth)}│${pad(' Similarity', simWidth)}│${pad(' Latency', latWidth)}│${pad(' Top Score', scoreWidth)}│${pad(' Top Result', nameWidth)}║`);
    console.log(headerSep);

    results.forEach((r, i) => {
        const latStr = `${Math.round(r.latencyMs)}ms`;
        const scoreStr = r.topScore.toFixed(4);
        console.log(
            `║${pad(` ${r.algorithm}`, algoWidth)}│${pad(` ${r.similarity}`, simWidth)}│${pad(` ${latStr}`, latWidth)}│${pad(` ${scoreStr}`, scoreWidth)}│${pad(` ${r.topResult}`, nameWidth)}║`
        );

        if (verbose && r.results.length > 1) {
            for (let j = 1; j < r.results.length; j++) {
                const sub = r.results[j];
                console.log(
                    `║${pad('', algoWidth)}│${pad('', simWidth)}│${pad('', latWidth)}│${pad(` ${sub.score.toFixed(4)}`, scoreWidth)}│${pad(` ${sub.name}`, nameWidth)}║`
                );
            }
        }

        if (i < results.length - 1) {
            console.log(rowSep);
        }
    });

    console.log(bottomLine);
}

main().catch(error => {
    console.error('Unhandled error:', error);
    process.exitCode = 1;
});
