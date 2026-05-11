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
    top1Name: string;
    top1Score: number;
    top2Name: string;
    top2Score: number;
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
    const topK = parseInt(process.env.TOP_K || '5', 10);
    const collectionName = 'hotels';

    const { aiClient, dbClient } = getClientsPasswordless();

    try {
        if (!aiClient) throw new Error('AI client is not configured.');
        if (!dbClient) throw new Error('Database client is not configured.');

        await dbClient.connect();
        const db = dbClient.db(baseConfig.dbName);

        // Drop collection if it exists for a clean start
        let collections = await db.listCollections({ name: collectionName }).toArray();
        if (collections.length > 0) {
            try {
                const col = db.collection(collectionName);
                const existingIndexes = await col.listIndexes().toArray();
                for (const idx of existingIndexes) {
                    if (idx.name !== '_id_') {
                        try {
                            await col.dropIndex(idx.name);
                        } catch {}
                    }
                }
                await new Promise(r => setTimeout(r, 2000));
                await db.dropCollection(collectionName);
                console.log(`Dropped existing collection: ${collectionName}`);
            } catch (e: any) {
                console.log(`Cleanup note: ${e.message.split('\n')[0]}`);
            }
            await new Promise(r => setTimeout(r, 10000));
        }

        // Load data once for reuse
        const data = await readFileReturnJson(path.join(__dirname, '..', baseConfig.dataFile));
        console.log(`Loaded ${data.length} documents`);

        // Insert data into collection
        const collection = db.collection(collectionName);
        await insertData(baseConfig, collection, data);

        // Generate one embedding for the query
        console.log(`\nQuery: "${queryText}"`);
        const embeddingResponse = await aiClient.embeddings.create({
            model: baseConfig.deployment,
            input: [queryText]
        });
        const queryVector = embeddingResponse.data[0].embedding;
        console.log(`Embedding generated (${queryVector.length} dimensions)`);

        // Sequential create→search→drop for each algorithm+similarity combo
        // DocumentDB does not allow multiple vector indexes of the same kind on the same field
        console.log(`\nRunning searches (top ${topK} results)...\n`);
        const results: SearchResult[] = [];

        for (const algo of ALGORITHMS) {
            for (const sim of SIMILARITIES) {
                const indexName = `vector_${algo.kind.replace('vector-', '')}_${sim.toLowerCase()}`;

                // 1. Drop all existing vector indexes
                const indexes = await collection.listIndexes().toArray();
                let droppedAny = false;
                for (const idx of indexes) {
                    if (idx.key && idx.key[baseConfig.embeddedField] === 'cosmosSearch') {
                        try { await collection.dropIndex(idx.name); droppedAny = true; } catch {}
                    }
                }
                if (droppedAny) {
                    await new Promise(r => setTimeout(r, 2000));
                }

                // 2. Create this specific index
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
                console.log(`  ✓ ${indexName} created`);

                // 3. Wait for index to be ready
                await new Promise(r => setTimeout(r, 5000));

                // 4. Search with retry (index may need more time)
                let searchResults: any[] = [];
                for (let attempt = 0; attempt < 3; attempt++) {
                    if (attempt > 0) {
                        await new Promise(r => setTimeout(r, 5000));
                    }
                    try {
                        searchResults = await collection.aggregate([
                            {
                                $search: {
                                    cosmosSearch: {
                                        vector: queryVector,
                                        path: baseConfig.embeddedField,
                                        k: topK
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
                        if (searchResults.length > 0) break;
                    } catch (e) {
                        if (attempt === 2) throw e;
                    }
                }

                // Record top 2 results
                const top1 = searchResults[0] as any;
                const top2 = searchResults[1] as any;
                results.push({
                    algorithm: algo.name,
                    similarity: sim,
                    top1Name: top1?.document?.HotelName ?? '(none)',
                    top1Score: top1?.score ?? 0,
                    top2Name: top2?.document?.HotelName ?? '(none)',
                    top2Score: top2?.score ?? 0,
                });
            }
        }

        // Print comparison table
        printComparisonTable(results);

    } catch (error) {
        console.error('Compare-all failed:', error);
        process.exitCode = 1;
    } finally {
        // Cleanup: drop the comparison collection
        if (dbClient) {
            try {
                const db = dbClient.db(baseConfig.dbName);
                await db.dropCollection(collectionName);
                console.log(`\nCleanup: dropped collection "${collectionName}"`);
            } catch (cleanupErr) {
                console.error('Cleanup warning:', cleanupErr);
            }
            await dbClient.close();
            console.log('Database connection closed');
        }
    }
}

function printComparisonTable(results: SearchResult[]) {
    const algoW = 10;
    const simW = 8;
    const name1W = 28;
    const score1W = 8;
    const name2W = 28;
    const score2W = 8;
    const diffW = 7;

    const pad = (s: string, w: number) => s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);

    const cols = [algoW, simW, name1W, score1W, name2W, score2W, diffW];
    const topLine    = `┌${cols.map(w => '─'.repeat(w)).join('┬')}┐`;
    const headerSep  = `├${cols.map(w => '─'.repeat(w)).join('┼')}┤`;
    const rowSep     = `├${cols.map(w => '─'.repeat(w)).join('┼')}┤`;
    const bottomLine = `└${cols.map(w => '─'.repeat(w)).join('┴')}┘`;

    console.log(topLine);
    console.log(
        `│${pad(' Algorithm', algoW)}│${pad(' Metric', simW)}│${pad(' Top 1 Result', name1W)}│${pad(' Score', score1W)}│${pad(' Top 2 Result', name2W)}│${pad(' Score', score2W)}│${pad(' Diff', diffW)}│`
    );
    console.log(headerSep);

    results.forEach((r, i) => {
        const diff = Math.abs(r.top1Score - r.top2Score).toFixed(4);
        console.log(
            `│${pad(` ${r.algorithm}`, algoW)}│${pad(` ${r.similarity}`, simW)}│${pad(` ${r.top1Name}`, name1W)}│${pad(` ${r.top1Score.toFixed(4)}`, score1W)}│${pad(` ${r.top2Name}`, name2W)}│${pad(` ${r.top2Score.toFixed(4)}`, score2W)}│${pad(` ${diff}`, diffW)}│`
        );
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
