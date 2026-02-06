import {
  DefaultAzureCredential,
  getBearerTokenProvider,
} from "@azure/identity";
import { AzureChatOpenAI } from "@langchain/openai";

export async function testPlanner() {
  const credentials = new DefaultAzureCredential();
  const azureADTokenProvider = getBearerTokenProvider(
    credentials,
    "https://cognitiveservices.azure.com/.default",
  );

  // Extract subdomain from full endpoint URL (e.g., https://oaiy24tgvnejozgs.openai.azure.com/ -> oaiy24tgvnejozgs)
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const subdomain = new URL(endpoint).hostname?.split('.')[0] || endpoint;

  const llmWithManagedIdentity = new AzureChatOpenAI({
    azureADTokenProvider,
    azureOpenAIApiInstanceName: subdomain,
    azureOpenAIApiDeploymentName:
      process.env.AZURE_OPENAI_PLANNER_DEPLOYMENT!,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_PLANNER_API_VERSION!,
  });

  const response = await llmWithManagedIdentity.invoke("Hi there!");
  console.log(response);
  return response;
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPlanner().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
