using './main.bicep'

param environmentName = readEnvironmentVariable('AZURE_ENV_NAME', 'development')
param location = readEnvironmentVariable('AZURE_LOCATION', 'eastus2')
param openAiLocation = readEnvironmentVariable('AZURE_OPENAI_LOCATION', readEnvironmentVariable('AZURE_LOCATION', 'eastus2'))
param deploymentUserPrincipalId = readEnvironmentVariable('AZURE_PRINCIPAL_ID', '')
param currentUserPrincipalId = readEnvironmentVariable('CURRENT_USER_OBJECT_ID', readEnvironmentVariable('AZURE_PRINCIPAL_ID', ''))
param documentDbAdminUsername = readEnvironmentVariable('DOCUMENTDB_ADMIN_USERNAME', 'docdbadmin')
param documentDbAdminPassword = 'TempP@ssw0rd123!'

// OpenAI model configuration
param chatModelName = readEnvironmentVariable('AZURE_OPENAI_CHAT_MODEL', 'gpt-4.1-mini')
param chatModelVersion = readEnvironmentVariable('AZURE_OPENAI_CHAT_MODEL_VERSION', '2025-04-14')
param chatModelType = readEnvironmentVariable('AZURE_OPENAI_CHAT_MODEL_TYPE', 'Standard')
param synthModelName = readEnvironmentVariable('AZURE_OPENAI_SYNTH_MODEL', 'gpt-4.1')
param synthModelVersion = readEnvironmentVariable('AZURE_OPENAI_SYNTH_MODEL_VERSION', '2025-04-14')
param synthModelType = readEnvironmentVariable('AZURE_OPENAI_SYNTH_MODEL_TYPE', 'GlobalStandard')
param embeddingModelName = readEnvironmentVariable('AZURE_OPENAI_EMBEDDING_MODEL', 'text-embedding-3-small')
param embeddingModelVersion = readEnvironmentVariable('AZURE_OPENAI_EMBEDDING_MODEL_VERSION', '1')
param embeddingModelType = readEnvironmentVariable('AZURE_OPENAI_EMBEDDING_MODEL_TYPE', 'Standard')
