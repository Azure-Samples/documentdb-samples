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

interface MongoSearchResult {
    document: { name: string; [key: string]: unknown };
    score: number;
}

interface SearchResult {
    query: string;
    algorithm: string;
    similarity: string;
    topScore: number;
    topResult: string;
    results: Array<{ name: string; score: number }>;
}

const ALGORITHMS: AlgorithmConfig[] = [
    { name: 'IVF', kind: 'vector-ivf', options: { numLists: 1 } },
    { name: 'HNSW', kind: 'vector-hnsw', options: { m: 16, efConstruction: 64 } },
    { name: 'DiskANN', kind: 'vector-diskann', options: { maxDegree: 32, lBuild: 50 } },
];

// Only COS and L2 — Inner Product (IP) is omitted because text-embedding-3-small
// produces unit-normalized vectors (magnitude = 1). For normalized vectors,
// cosine similarity = dot(a,b)/(||a||·||b||) = dot(a,b) = inner product.
// COS and IP always return identical results, so comparing both adds no insight.
const SIMILARITIES = ['COS', 'L2'];

// Diverse queries designed to stress-test ranking differences:
// Each combines attributes that no single hotel perfectly satisfies,
// forcing similarity metrics to disagree on partial matches.
const DEFAULT_QUERIES = [
    'outdoor adventure with family activities',
    'quiet romantic getaway with ocean view',
    'budget-friendly downtown hotel with free WiFi',
    'historic building with fine dining and spa',
    'ski resort with yoga and winter sports',
];

// DocumentDB allows only ONE vector index per field per collection,
// so we use a separate collection for each algorithm×metric combination.
function collectionNameFor(algo: AlgorithmConfig, sim: string): string {
    return `compare_${algo.kind.replace('vector-', '')}_${sim.toLowerCase()}`;
}

async function main() {
    const baseConfig = getConfig();
    const topK = parseInt(process.env.TOP_K || '5', 10);
    const verbose = process.env.VERBOSE === 'true';

    // Support single query override via env, otherwise use all default queries
    const queries: string[] = process.env.QUERY_TEXT
        ? [process.env.QUERY_TEXT]
        : DEFAULT_QUERIES;

    const { aiClient, dbClient } = getClientsPasswordless();
    const createdCollections: string[] = [];

    try {
        if (!aiClient) throw new Error('AI client is not configured.');
        if (!dbClient) throw new Error('Database client is not configured.');

        await dbClient.connect();
        const db = dbClient.db(baseConfig.dbName);

        // Load data from file once (held in memory, inserted per collection)
        const data = await readFileReturnJson(path.join(__dirname, '..', baseConfig.dataFile));
        console.log(`Loaded ${data.length} documents from ${baseConfig.dataFile}`);

        // Generate embeddings for all queries upfront
        console.log(`\nGenerating embeddings for ${queries.length} query(ies)...`);
        const embeddingResponse = await aiClient.embeddings.create({
            model: baseConfig.deployment,
            input: queries
        });
        const queryVectors = embeddingResponse.data.map(d => d.embedding);
        console.log(`Embeddings generated (${queryVectors[0].length} dimensions each)`);

        // Create 9 collections, each with its own vector index
        console.log('\nSetting up 9 collections (1 per algorithm×metric)...');
        for (const algo of ALGORITHMS) {
            for (const sim of SIMILARITIES) {
                const colName = collectionNameFor(algo, sim);
                const indexName = `vector_${algo.kind.replace('vector-', '')}_${sim.toLowerCase()}`;

                // Drop if leftover from a prior run
                const existing = await db.listCollections({ name: colName }).toArray();
                if (existing.length > 0) {
                    await db.dropCollection(colName);
                }

                const collection = await db.createCollection(colName);
                createdCollections.push(colName);

                await insertData(baseConfig, collection, data);

                const indexOptions = {
                    createIndexes: colName,
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
                console.log(`  ✓ ${colName} → index ${indexName}`);
            }
        }

        // Brief pause for indexes to become queryable
        console.log('\nWaiting for indexes to be ready...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Run all queries × all 9 combinations
        const allResults: SearchResult[] = [];

        for (let qi = 0; qi < queries.length; qi++) {
            const queryText = queries[qi];
            const queryVector = queryVectors[qi];
            console.log(`\n━━━ Query ${qi + 1}/${queries.length}: "${queryText}" (top ${topK}) ━━━`);

            for (const algo of ALGORITHMS) {
                for (const sim of SIMILARITIES) {
                    const colName = collectionNameFor(algo, sim);
                    const collection = db.collection(colName);

                    const searchResults = await collection.aggregate([
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

                    const typedResults = searchResults as unknown as MongoSearchResult[];
                    const topDoc = typedResults[0];
                    allResults.push({
                        query: queryText,
                        algorithm: algo.name,
                        similarity: sim,
                        topScore: topDoc?.score ?? 0,
                        topResult: (topDoc?.document?.HotelName as string) ?? '(none)',
                        results: typedResults.map((r) => ({
                            name: (r.document?.HotelName as string) ?? '(none)',
                            score: r.score ?? 0
                        }))
                    });
                }
            }
        }

        // Print per-query comparison tables
        for (const queryText of queries) {
            const queryResults = allResults.filter(r => r.query === queryText);
            printComparisonTable(queryText, queryResults, verbose);
        }

        // Print cross-query ranking divergence summary
        if (queries.length > 1) {
            printDivergenceSummary(allResults, queries);
        }

    } catch (error) {
        console.error('Compare-all failed:', error);
        process.exitCode = 1;
    } finally {
        // Cleanup: drop all comparison collections
        if (dbClient) {
            try {
                const db = dbClient.db(baseConfig.dbName);
                console.log(`\nCleanup: dropping ${createdCollections.length} comparison collections...`);
                for (const colName of createdCollections) {
                    try {
                        await db.dropCollection(colName);
                    } catch (dropErr) {
                        console.error(`Cleanup warning (drop ${colName}):`, dropErr);
                    }
                }
                console.log('Cleanup complete');
            } catch (cleanupErr) {
                console.error('Cleanup warning:', cleanupErr);
            }
            try {
                await dbClient.close();
                console.log('Database connection closed');
            } catch (closeErr) {
                console.error('Warning closing connection:', closeErr);
            }
        }
    }
}

function printComparisonTable(queryText: string, results: SearchResult[], _verbose: boolean) {
    const pad = (s: string, w: number) => s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);

    // Group by similarity metric to check if algorithms agree
    const byMetric = new Map<string, SearchResult[]>();
    for (const r of results) {
        const group = byMetric.get(r.similarity) ?? [];
        group.push(r);
        byMetric.set(r.similarity, group);
    }

    // Check if all algorithms agree (same #1 and #2 per metric)
    const allAgree = [...byMetric.values()].every(group => {
        const first = group[0];
        return group.every(r =>
            r.results[0]?.name === first.results[0]?.name &&
            r.results[1]?.name === first.results[1]?.name
        );
    });

    console.log(`\n┌─ Query: "${queryText}"`);

    if (allAgree) {
        // Collapsed view: one row per metric (algorithms all agree)
        const simWidth = 8;
        const nameWidth = 26;
        const scoreWidth = 9;
        const gapWidth = 8;
        const colWidths = [simWidth, nameWidth, scoreWidth, scoreWidth, gapWidth, nameWidth];
        const topLine = `╔${colWidths.map(w => '═'.repeat(w)).join('╤')}╗`;
        const headerSep = `╠${colWidths.map(w => '═'.repeat(w)).join('╪')}╣`;
        const rowSep = `╟${colWidths.map(w => '─'.repeat(w)).join('┼')}╢`;
        const bottomLine = `╚${colWidths.map(w => '═'.repeat(w)).join('╧')}╝`;

        console.log(`│  ✅ All algorithms agree (IVF, HNSW, DiskANN) — showing by metric only`);
        console.log(topLine);
        console.log(
            `║${pad(' Metric', simWidth)}│${pad(' #1 Result', nameWidth)}│${pad(' #1 Score', scoreWidth)}│${pad(' #2 Score', scoreWidth)}│${pad(' Gap', gapWidth)}│${pad(' #2 Result', nameWidth)}║`
        );
        console.log(headerSep);

        const metrics = [...byMetric.entries()];
        metrics.forEach(([metric, group], i) => {
            const r = group[0];
            const score1 = r.results[0]?.score.toFixed(4) ?? '-';
            const name1 = r.results[0]?.name ?? '(none)';
            const score2 = r.results[1]?.score.toFixed(4) ?? '-';
            const name2 = r.results[1]?.name ?? '(none)';
            const gap = (r.results[0] && r.results[1])
                ? Math.abs(r.results[0].score - r.results[1].score).toFixed(4)
                : '-';

            console.log(
                `║${pad(` ${metric}`, simWidth)}│${pad(` ${name1}`, nameWidth)}│${pad(` ${score1}`, scoreWidth)}│${pad(` ${score2}`, scoreWidth)}│${pad(` ${gap}`, gapWidth)}│${pad(` ${name2}`, nameWidth)}║`
            );

            if (i < metrics.length - 1) {
                console.log(rowSep);
            }
        });

        console.log(bottomLine);
    } else {
        // Expanded view: show full algo×metric grid (algorithms disagree)
        const algoWidth = 10;
        const simWidth = 6;
        const scoreWidth = 8;
        const nameWidth = 26;
        const colWidths = [algoWidth, simWidth, nameWidth, scoreWidth, scoreWidth, nameWidth];
        const topLine = `╔${colWidths.map(w => '═'.repeat(w)).join('╤')}╗`;
        const headerSep = `╠${colWidths.map(w => '═'.repeat(w)).join('╪')}╣`;
        const rowSep = `╟${colWidths.map(w => '─'.repeat(w)).join('┼')}╢`;
        const bottomLine = `╚${colWidths.map(w => '═'.repeat(w)).join('╧')}╝`;

        console.log(`│  ⚠️  Algorithms DISAGREE — showing full breakdown`);
        console.log(topLine);
        console.log(
            `║${pad(' Algo', algoWidth)}│${pad(' Sim', simWidth)}│${pad(' #1 Result', nameWidth)}│${pad(' #1 Score', scoreWidth)}│${pad(' #2 Score', scoreWidth)}│${pad(' #2 Result', nameWidth)}║`
        );
        console.log(headerSep);

        results.forEach((r, i) => {
            const score1 = r.results[0]?.score.toFixed(4) ?? '-';
            const name1 = r.results[0]?.name ?? '(none)';
            const score2 = r.results[1]?.score.toFixed(4) ?? '-';
            const name2 = r.results[1]?.name ?? '(none)';

            console.log(
                `║${pad(` ${r.algorithm}`, algoWidth)}│${pad(` ${r.similarity}`, simWidth)}│${pad(` ${name1}`, nameWidth)}│${pad(` ${score1}`, scoreWidth)}│${pad(` ${score2}`, scoreWidth)}│${pad(` ${name2}`, nameWidth)}║`
            );

            if (i < results.length - 1) {
                console.log(rowSep);
            }
        });

        console.log(bottomLine);
    }
}

// Show where algorithms/metrics disagree on rankings across queries
function printDivergenceSummary(allResults: SearchResult[], queries: string[]) {
    console.log('\n\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║            RANKING DIVERGENCE SUMMARY                          ║');
    console.log('╚══════════════════════════════════════════════════════════════════╝');
    console.log('Shows queries where algorithms or metrics produced DIFFERENT #1 results.\n');

    let divergenceCount = 0;

    for (const queryText of queries) {
        const queryResults = allResults.filter(r => r.query === queryText);
        const topResults = new Set(queryResults.map(r => r.topResult));

        if (topResults.size > 1) {
            divergenceCount++;
            console.log(`  ⚡ "${queryText}"`);

            // Group by top result to show which combos picked what
            const groups = new Map<string, string[]>();
            for (const r of queryResults) {
                const key = r.topResult;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(`${r.algorithm}/${r.similarity}`);
            }
            for (const [hotel, combos] of groups) {
                console.log(`     → ${hotel}: ${combos.join(', ')}`);
            }
            console.log('');
        }
    }

    if (divergenceCount === 0) {
        console.log('  All algorithms returned identical #1 results for every query.');
        console.log('  This is expected with small datasets (~50 docs). For meaningful');
        console.log('  differentiation, use 1000+ documents with varied embeddings.\n');
    } else {
        console.log(`  ${divergenceCount}/${queries.length} queries showed ranking divergence.`);
    }

    // Score gap analysis — show how "confident" the top result is
    console.log('\n  Score Gaps (top score − 2nd score):');
    console.log('  ─────────────────────────────────────');
    for (const queryText of queries) {
        const queryResults = allResults.filter(r => r.query === queryText);
        const gaps = queryResults.map(r => {
            if (r.results.length < 2) return 0;
            return r.results[0].score - r.results[1].score;
        });
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const maxGap = Math.max(...gaps);
        const minGap = Math.min(...gaps);
        const shortQuery = queryText.length > 40 ? queryText.slice(0, 37) + '...' : queryText;
        console.log(`  "${shortQuery}"`);
        console.log(`    avg: ${avgGap.toFixed(4)} | min: ${minGap.toFixed(4)} | max: ${maxGap.toFixed(4)}`);
    }
    console.log('');
}

// Validate required environment variables before starting
const REQUIRED_ENV_VARS = [
    'AZURE_OPENAI_EMBEDDING_ENDPOINT',
    'AZURE_OPENAI_EMBEDDING_MODEL',
    'AZURE_OPENAI_EMBEDDING_API_VERSION',
];

const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (!process.env.AZURE_DOCUMENTDB_CONNECTION_STRING && !process.env.MONGO_CLUSTER_NAME) {
    missing.push('AZURE_DOCUMENTDB_CONNECTION_STRING or MONGO_CLUSTER_NAME');
}
if (missing.length > 0) {
    throw new Error(`Missing required environment variables:\n  - ${missing.join('\n  - ')}`);
}

main().catch(error => {
    console.error('Unhandled error:', error);
    process.exitCode = 1;
});
