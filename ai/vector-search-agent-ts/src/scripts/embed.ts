import {
  DefaultAzureCredential,
  getBearerTokenProvider,
} from "@azure/identity";
import { AzureOpenAIEmbeddings } from "@langchain/openai";

export async function testEmbeddings() {
  const credentials = new DefaultAzureCredential();
  const azureADTokenProvider = getBearerTokenProvider(
    credentials,
    "https://cognitiveservices.azure.com/.default",
  );

  // Extract subdomain from full endpoint URL (e.g., https://oaiy24tgvnejozgs.openai.azure.com/ -> oaiy24tgvnejozgs)
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const subdomain = new URL(endpoint).hostname?.split('.')[0] || endpoint;

  if (process.env.DEBUG === "true") {
    console.log("[embed] Environment variables:");
    console.log(`  AZURE_OPENAI_ENDPOINT: ${process.env.AZURE_OPENAI_ENDPOINT}`);
    console.log(`  Extracted subdomain: ${subdomain}`);
    console.log(`  AZURE_OPENAI_EMBEDDING_MODEL: ${process.env.AZURE_OPENAI_EMBEDDING_MODEL}`);
    console.log(`  AZURE_OPENAI_EMBEDDING_API_VERSION: ${process.env.AZURE_OPENAI_EMBEDDING_API_VERSION}`);
    console.log(`  AZURE_OPENAI_API_KEY: ${process.env.AZURE_OPENAI_API_KEY ? '[SET]' : '[NOT SET]'}`);
  }

  const modelWithManagedIdentity = new AzureOpenAIEmbeddings({
    azureADTokenProvider,
    azureOpenAIApiInstanceName: subdomain,
    azureOpenAIApiEmbeddingsDeploymentName:
      process.env.AZURE_OPENAI_EMBEDDING_MODEL!,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_EMBEDDING_API_VERSION!,
  });

  const vectors = await modelWithManagedIdentity.embedDocuments([
    "Hello world",
    "Bonjour le monde",
  ]);
  console.log("Embeddings with Managed Identity:");
  console.log(vectors);
  return vectors;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testEmbeddings().catch((error) => {
    console.error("Error using Managed Identity for embeddings:", error);
    process.exit(1);
  });
}
