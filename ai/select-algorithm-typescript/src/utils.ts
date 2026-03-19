import { MongoClient, OIDCResponse, OIDCCallbackParams } from 'mongodb';
import { AzureOpenAI } from 'openai/index.js';
import { promises as fs } from "fs";
import { AccessToken, DefaultAzureCredential, TokenCredential, getBearerTokenProvider } from '@azure/identity';

// Define a type for JSON data
export type JsonData = Record<string, any>;

export const AzureIdentityTokenCallback = async (params: OIDCCallbackParams, credential: TokenCredential): Promise<OIDCResponse> => {
    const tokenResponse: AccessToken | null = await credential.getToken(['https://ossrdbms-aad.database.windows.net/.default']);
    return {
        accessToken: tokenResponse?.token || '',
        expiresInSeconds: (tokenResponse?.expiresOnTimestamp || 0) - Math.floor(Date.now() / 1000)
    };
};

export function getClientsPasswordless(): { aiClient: AzureOpenAI | null; dbClient: MongoClient | null } {
    let aiClient: AzureOpenAI | null = null;
    let dbClient: MongoClient | null = null;

    // Validate all required environment variables upfront
    const apiVersion = process.env.AZURE_OPENAI_EMBEDDING_API_VERSION!;
    const endpoint = process.env.AZURE_OPENAI_EMBEDDING_ENDPOINT!;
    const deployment = process.env.AZURE_OPENAI_EMBEDDING_MODEL!;
    const clusterName = process.env.MONGO_CLUSTER_NAME!;

    if (!apiVersion || !endpoint || !deployment || !clusterName) {
        throw new Error('Missing required environment variables: AZURE_OPENAI_EMBEDDING_API_VERSION, AZURE_OPENAI_EMBEDDING_ENDPOINT, AZURE_OPENAI_EMBEDDING_MODEL, MONGO_CLUSTER_NAME');
    }

    console.log(`Using Azure OpenAI Embedding API Version: ${apiVersion}`);
    console.log(`Using Azure OpenAI Embedding Deployment/Model: ${deployment}`);

    const credential = new DefaultAzureCredential();

    // For Azure OpenAI with DefaultAzureCredential
    {
        const scope = "https://cognitiveservices.azure.com/.default";
        const azureADTokenProvider = getBearerTokenProvider(credential, scope);
        aiClient = new AzureOpenAI({
            apiVersion,
            endpoint,
            deployment,
            azureADTokenProvider
        });
    }

    // For DocumentDB with DefaultAzureCredential (uses signed-in user)
    {
        dbClient = new MongoClient(
            `mongodb+srv://${clusterName}.mongocluster.cosmos.azure.com/`, {
            connectTimeoutMS: 120000,
            tls: true,
            retryWrites: false,
            maxIdleTimeMS: 120000,
            authMechanism: 'MONGODB-OIDC',
            authMechanismProperties: {
                OIDC_CALLBACK: (params: OIDCCallbackParams) => AzureIdentityTokenCallback(params, credential),
                ALLOWED_HOSTS: ['*.azure.com']
            }
        }
        );
    }

    return { aiClient, dbClient };
}

export async function readFileReturnJson(filePath: string): Promise<JsonData[]> {

    console.log(`Reading JSON file from ${filePath}`);

    const fileAsString = await fs.readFile(filePath, "utf-8");
    return JSON.parse(fileAsString);
}

export async function insertData(config, collection, data) {
    console.log(`Processing in batches of ${config.batchSize}...`);
    const totalBatches = Math.ceil(data.length / config.batchSize);

    let inserted = 0;
    let failed = 0;

    for (let i = 0; i < totalBatches; i++) {
        const start = i * config.batchSize;
        const end = Math.min(start + config.batchSize, data.length);
        const batch = data.slice(start, end);

        try {
            const result = await collection.insertMany(batch, { ordered: false });
            inserted += result.insertedCount || 0;
            console.log(`Batch ${i + 1} complete: ${result.insertedCount} inserted`);
        } catch (error: any) {
            if (error?.writeErrors) {
                console.error(`Error in batch ${i + 1}: ${error?.writeErrors.length} failures`);
                failed += error?.writeErrors.length;
                inserted += batch.length - error?.writeErrors.length;
            } else {
                console.error(`Error in batch ${i + 1}:`, error);
                failed += batch.length;
            }
        }

        // Small pause between batches to reduce resource contention
        if (i < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // Create standard field indexes
    const indexColumns = ["HotelId", "Category", "Description", "Description_fr"];
    for (const col of indexColumns) {
        const indexSpec = {};
        indexSpec[col] = 1;
        await collection.createIndex(indexSpec);
    }

    return { total: data.length, inserted, failed };
}

export function printSearchResults(searchResults) {
    if (!searchResults || searchResults.length === 0) {
        console.log('No search results found.');
        return;
    }

    searchResults.map((result, index) => {
        const { document, score } = result as any;
        console.log(`${index + 1}. HotelName: ${document.HotelName}, Score: ${score.toFixed(4)}`);
    });
}

/**
 * Print a side-by-side comparison table of vector search results across collections
 */
export function printComparisonTable(
    results: Array<{
        collectionName: string;
        algorithm: string;
        similarity: string;
        searchResults: any[];
        latencyMs: number;
    }>
): void {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                     Vector Algorithm Comparison Results                         ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');

    // Header
    console.log(
        '║ ' +
        'Algorithm'.padEnd(12) +
        'Similarity'.padEnd(14) +
        'Top Result'.padEnd(24) +
        'Score'.padEnd(12) +
        'Latency(ms)'.padEnd(14) +
        '║'
    );
    console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');

    for (const r of results) {
        const topResult = r.searchResults[0];
        const topName = topResult ? (topResult.document.HotelName as string).substring(0, 22) : 'N/A';
        const topScore = topResult ? topResult.score.toFixed(4) : 'N/A';

        console.log(
            '║ ' +
            r.algorithm.padEnd(12) +
            r.similarity.padEnd(14) +
            topName.padEnd(24) +
            topScore.padEnd(12) +
            r.latencyMs.toFixed(0).padEnd(14) +
            '║'
        );
    }

    console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');

    // Detailed results per collection
    for (const r of results) {
        console.log(`\n--- ${r.algorithm} / ${r.similarity} (${r.collectionName}) ---`);
        if (r.searchResults.length === 0) {
            console.log('  No results.');
            continue;
        }
        r.searchResults.forEach((item, i) => {
            console.log(`  ${i + 1}. ${item.document.HotelName}, Score: ${item.score.toFixed(4)}`);
        });
        console.log(`  Latency: ${r.latencyMs.toFixed(0)}ms`);
    }
}
