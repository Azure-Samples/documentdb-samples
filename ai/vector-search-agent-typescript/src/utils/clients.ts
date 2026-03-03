import { AzureOpenAIEmbeddings, AzureChatOpenAI } from "@langchain/openai";
import { MongoClient, OIDCCallbackParams } from 'mongodb';
import { AccessToken, DefaultAzureCredential, TokenCredential, getBearerTokenProvider } from '@azure/identity';

/*
This file contains utility functions to create Azure OpenAI clients for embeddings, planning, and synthesis.

It supports two modes of authentication:
1. API Key based authentication using AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINTenvironment variables.
2. Passwordless authentication using DefaultAzureCredential from Azure Identity library.
*/

// Azure Identity configuration
const OPENAI_SCOPE = 'https://cognitiveservices.azure.com/.default';
const DOCUMENT_DB_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default';

// Azure identity credential (used for passwordless auth)
const CREDENTIAL = new DefaultAzureCredential();

function requireEnvVars(names: string[]) {
  const missing = names.filter((name) => {
    const value = process.env[name];
    return !value || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Token callback for MongoDB OIDC authentication
async function azureIdentityTokenCallback(
  params: OIDCCallbackParams,
  credential: TokenCredential
): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const tokenResponse: AccessToken | null = await credential.getToken([DOCUMENT_DB_SCOPE]);
  return {
    accessToken: tokenResponse?.token || '',
    expiresInSeconds: (tokenResponse?.expiresOnTimestamp || 0) - Math.floor(Date.now() / 1000)
  };
}


// Debug logging
const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
if (DEBUG) {
  const usePasswordless = process.env.USE_PASSWORDLESS === 'true' || process.env.USE_PASSWORDLESS === '1';
  if (usePasswordless) {
    console.log('[clients] Passwordless mode enabled. Passwordless env presence:', {
      HAS_AZURE_CLIENT_ID: !!process.env.AZURE_CLIENT_ID,
      HAS_AZURE_TENANT_ID: !!process.env.AZURE_TENANT_ID,
      HAS_AZURE_CLIENT_SECRET: !!process.env.AZURE_CLIENT_SECRET,
      HAS_AZURE_OPENAI_INSTANCE: !!process.env.AZURE_OPENAI_ENDPOINT,
      HAS_EMBEDDING_DEPLOYMENT: !!process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
      HAS_PLANNER_DEPLOYMENT: !!process.env.AZURE_OPENAI_PLANNER_DEPLOYMENT,
      HAS_SYNTH_DEPLOYMENT: !!process.env.AZURE_OPENAI_SYNTH_DEPLOYMENT
    });
  } else {
    console.log('[clients] Password Env present:', {
      HAS_AZURE_OPENAI_API_KEY: !!process.env.AZURE_OPENAI_API_KEY,
      HAS_AZURE_OPENAI_INSTANCE: !!process.env.AZURE_OPENAI_ENDPOINT,
      HAS_EMBEDDING_DEPLOYMENT: !!process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
      HAS_PLANNER_DEPLOYMENT: !!process.env.AZURE_OPENAI_PLANNER_DEPLOYMENT,
      HAS_SYNTH_DEPLOYMENT: !!process.env.AZURE_OPENAI_SYNTH_DEPLOYMENT,
      HAS_CONNECTION_STRING: !!process.env.AZURE_DOCUMENTDB_CONNECTION_STRING,
    });
  }
}

// Create clients with API key authentication
export function createClients() {
  try {
    requireEnvVars([
      'AZURE_OPENAI_API_KEY',
      'AZURE_OPENAI_ENDPOINT',
      'AZURE_OPENAI_EMBEDDING_DEPLOYMENT',
      'AZURE_OPENAI_EMBEDDING_API_VERSION',
      'AZURE_OPENAI_PLANNER_DEPLOYMENT',
      'AZURE_OPENAI_PLANNER_API_VERSION',
      'AZURE_OPENAI_SYNTH_DEPLOYMENT',
      'AZURE_OPENAI_SYNTH_API_VERSION',
      'AZURE_DOCUMENTDB_CLUSTER',
      'AZURE_DOCUMENTDB_CONNECTION_STRING',
      'AZURE_DOCUMENTDB_DATABASENAME',
      'AZURE_DOCUMENTDB_COLLECTION',
    ]);

    const key = process.env.AZURE_OPENAI_API_KEY!;
    const instance = process.env.AZURE_OPENAI_ENDPOINT!;

    const auth = {
      azureOpenAIApiKey: key,
      azureOpenAIApiInstanceName: instance
    };

    const embeddingClient = new AzureOpenAIEmbeddings({
      ...auth,
      azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_EMBEDDING_API_VERSION,
      maxRetries: 1,
    });

    const plannerClient = new AzureChatOpenAI({
      ...auth,
      model: process.env.AZURE_OPENAI_PLANNER_DEPLOYMENT!,
      temperature: 0, // Deterministic for consistent query refinement
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_PLANNER_DEPLOYMENT,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_PLANNER_API_VERSION,
    });

    const synthClient = new AzureChatOpenAI({
      ...auth,
      model: process.env.AZURE_OPENAI_SYNTH_DEPLOYMENT!,
      temperature: 0.3, // Slightly creative for natural responses
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_SYNTH_DEPLOYMENT,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_SYNTH_API_VERSION,
    });

    const dbConfig = {
      instance: process.env.AZURE_DOCUMENTDB_CLUSTER!,
      connectionString: process.env.AZURE_DOCUMENTDB_CONNECTION_STRING!,
      databaseName: process.env.AZURE_DOCUMENTDB_DATABASENAME!,
      collectionName: process.env.AZURE_DOCUMENTDB_COLLECTION!
    };

    return { embeddingClient, plannerClient, synthClient, dbConfig };
  } catch (err: any) {
    console.error('[clients] Failed to construct OpenAI clients:', err?.message ?? err);
    console.error('[clients] Confirm AZURE_OPENAI_* env vars are set correctly (or configure passwordless token provider).');
    throw err;
  }
}


// Create clients with passwordless authentication
export function createClientsPasswordless() {
  try {
    requireEnvVars([
      'AZURE_OPENAI_ENDPOINT',
      'AZURE_OPENAI_EMBEDDING_MODEL',
      'AZURE_OPENAI_EMBEDDING_API_VERSION',
      'AZURE_OPENAI_PLANNER_DEPLOYMENT',
      'AZURE_OPENAI_PLANNER_API_VERSION',
      'AZURE_OPENAI_SYNTH_DEPLOYMENT',
      'AZURE_OPENAI_SYNTH_API_VERSION',
      'AZURE_DOCUMENTDB_CLUSTER',
      'AZURE_DOCUMENTDB_DATABASENAME',
      'AZURE_DOCUMENTDB_COLLECTION',
    ]);

    // Extract subdomain from full endpoint URL (e.g., https://oaiy24tgvnejozgs.openai.azure.com/ -> oaiy24tgvnejozgs)
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
    const subdomain = new URL(endpoint).hostname?.split('.')[0] || endpoint;

    const embeddingClient = new AzureOpenAIEmbeddings({
      azureADTokenProvider: getBearerTokenProvider(
        CREDENTIAL,
        "https://cognitiveservices.azure.com/.default",
      ),
      azureOpenAIApiInstanceName: subdomain,
      azureOpenAIApiEmbeddingsDeploymentName:
        process.env.AZURE_OPENAI_EMBEDDING_MODEL!,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_EMBEDDING_API_VERSION!,
    });

    const plannerClient = new AzureChatOpenAI({
      azureADTokenProvider: getBearerTokenProvider(
        CREDENTIAL,
        "https://cognitiveservices.azure.com/.default",
      ),
      azureOpenAIApiInstanceName: subdomain,
      azureOpenAIApiDeploymentName:
        process.env.AZURE_OPENAI_PLANNER_DEPLOYMENT!,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_PLANNER_API_VERSION!,
    });

    const synthClient = new AzureChatOpenAI({
      azureADTokenProvider: getBearerTokenProvider(
        CREDENTIAL,
        "https://cognitiveservices.azure.com/.default",
      ),
      azureOpenAIApiInstanceName: subdomain,
      azureOpenAIApiDeploymentName:
        process.env.AZURE_OPENAI_SYNTH_DEPLOYMENT!,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_SYNTH_API_VERSION!,
    });

    const mongoClient = new MongoClient(
      `mongodb+srv://${process.env.AZURE_DOCUMENTDB_CLUSTER!}.global.mongocluster.cosmos.azure.com/`,
      {
        connectTimeoutMS: 30000,
        tls: true,
        retryWrites: true,
        authMechanism: 'MONGODB-OIDC',
        authMechanismProperties: {
          OIDC_CALLBACK: (params: OIDCCallbackParams) => azureIdentityTokenCallback(params, CREDENTIAL),
          ALLOWED_HOSTS: ['*.azure.com']
        }
      }
    );

    const dbConfig = {
      instance: process.env.AZURE_DOCUMENTDB_CLUSTER!,
      client: mongoClient,
      databaseName: process.env.AZURE_DOCUMENTDB_DATABASENAME!,
      collectionName: process.env.AZURE_DOCUMENTDB_COLLECTION!,
    };

    return { embeddingClient, plannerClient, synthClient, dbConfig };
  } catch (err: any) {
    console.error('[clients] Failed to construct passwordless OpenAI clients:', err?.message ?? err);
    throw err;
  }
}