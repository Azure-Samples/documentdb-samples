import { getClientsPasswordless } from '../utils.js';

async function getAllDatabases(dbClient): Promise<string[]> {
    try {
        const dbList = await dbClient.db().admin().listDatabases({ nameOnly: true });
        return dbList.databases
            .map((db: any) => db.name)
            .filter((name: string) => !['admin', 'config', 'local'].includes(name));
    } catch (error) {
        console.error('Error listing databases:', error);
        return [];
    }
}

async function getAllCollections(db): Promise<string[]> {
    try {
        const collections = await db.listCollections().toArray();
        return collections.map((coll: any) => coll.name);
    } catch (error) {
        console.error(`Error listing collections for database ${db.databaseName}:`, error);
        return [];
    }
}

async function getAllIndexes(db, collectionName: string): Promise<void> {
    try {
        const collection = db.collection(collectionName);
        const indexes = await collection.indexes();
        console.log(`\n  🗃️ COLLECTION: ${collectionName} (${indexes.length} indexes)`);
        console.log(JSON.stringify(indexes, null, 2));
    } catch (error) {
        console.error(`Error listing indexes for collection ${collectionName}:`, error);
    }
}

async function main() {

    const { dbClient } = getClientsPasswordless();

    if (!dbClient) {
        throw new Error('Database client is not configured. Please check your environment variables.');
    }

    try {
        await dbClient.connect();
        const dbNames = await getAllDatabases(dbClient);

        if (dbNames.length === 0) {
            console.log('No databases found or access denied');
            return;
        }

        for (const dbName of dbNames) {
            const db = dbClient.db(dbName);
            const collections = await getAllCollections(db);

            if (collections.length === 0) {
                console.log(`Database '${dbName}': No collections found`);
                continue;
            }

            console.log(`\n📂 DATABASE: ${dbName} (${collections.length} collections)`);

            for (const collName of collections) {
                await getAllIndexes(db, collName);
            }
        }
    } catch (error) {
        console.error('Index retrieval failed:', error);
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
