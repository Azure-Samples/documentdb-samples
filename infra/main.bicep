targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the the environment which is used to generate a short unique hash used in all resources.')
param environmentName string

@minLength(1)
@description('Location for the OpenAI resource')
// https://learn.microsoft.com/azure/ai-services/openai/concepts/models?tabs=python-secure%2Cglobal-standard%2Cstandard-chat-completions#models-by-deployment-type
@allowed([
  'eastus2'
  'swedencentral'
])
@metadata({
  azd: {
    type: 'location'
  }
})
param location string

@description('Id of the principal to assign database and application roles.')
param deploymentUserPrincipalId string = ''

@description('Object ID of the current user (for admin access to DocumentDB)')
param currentUserPrincipalId string = ''

@description('Username for DocumentDB admin user')
param documentDbAdminUsername string

@secure()
@description('Password for DocumentDB admin user')
@minLength(8)
@maxLength(128)
param documentDbAdminPassword string

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }
var prefix = '${environmentName}${resourceToken}'

// Organize resources in a resource group
resource resourceGroup 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: '${environmentName}-${resourceToken}-rg'
  location: location
  tags: tags
}

module managedIdentity 'br/public:avm/res/managed-identity/user-assigned-identity:0.4.0' = {
  name: 'user-assigned-identity'
  scope: resourceGroup
  params: {
    name: 'managed-identity-${prefix}'
    location: location
    tags: tags
  }
}

// Azure OpenAI model and configuration variables
var chatModelName = 'gpt-4o-mini'
var chatModelVersion = '2024-07-18'
var chatModelApiVersion = '2025-01-01-preview'

var synthModelName = 'gpt-4o'
var synthModelVersion = '2024-11-20'
var synthModelApiVersion = '2025-01-01-preview'

var embeddingModelName = 'text-embedding-3-small'
var embeddingModelVersion = '1'
var embeddingModelApiVersion = '2023-05-15'

// Data and embedding configuration
var dataFileWithVectors = '../data/Hotels_Vector.json'
var dataFileWithoutVectors = '../data/Hotels.json'
var fieldToEmbed = 'Description'
var embeddedFieldName = 'DescriptionVector'
var embeddingDimensions = '1536'
var embeddingBatchSize = '16'
var loadSizeBatch = '50'

// DocumentDB collection configuration
var collectionName = 'hotel_data'
var indexName = 'vectorIndex'

var openAiServiceName = 'openai-${prefix}'
module openAi 'br/public:avm/res/cognitive-services/account:0.7.1' = {
  name: 'openai'
  scope: resourceGroup
  params: {
    name: openAiServiceName
    location: location
    tags: tags
    kind: 'OpenAI'
    sku: 'S0'
    customSubDomainName: openAiServiceName
    disableLocalAuth: false
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
    deployments: [
      {
        name: chatModelName
        model: {
          format: 'OpenAI'
          name: chatModelName
          version: chatModelVersion
        }
        sku: {
          name: 'GlobalStandard'
          capacity: 50
        }
      }
      {
        name: synthModelName
        model: {
          format: 'OpenAI'
          name: synthModelName
          version: synthModelVersion
        }
        sku: {
          name: 'GlobalStandard'
          capacity: 50
        }
      }
      {
        name: embeddingModelName
        model: {
          format: 'OpenAI'
          name: embeddingModelName
          version: embeddingModelVersion
        }
        sku: {
          name: 'Standard'
          capacity: 10
        }
      }
    ]
    roleAssignments: [
      {
        principalId: deploymentUserPrincipalId
        roleDefinitionIdOrName: 'Cognitive Services OpenAI User'
      }
    ]
  }
}

var databaseName = 'Hotels'

// Deploy Azure DocumentDB MongoDB Cluster (vCore)
module documentDbCluster './documentdb.bicep' = {
  name: 'documentdb-cluster'
  scope: resourceGroup
  params: {
    clusterName: 'docdb-${resourceToken}'
    location: location
    tags: tags
    adminUsername: documentDbAdminUsername
    adminPassword: documentDbAdminPassword
    managedIdentityPrincipalId: managedIdentity.outputs.resourceId
    managedIdentityObjectId: managedIdentity.outputs.principalId
    currentUserPrincipalId: currentUserPrincipalId
    serverVersion: '8.0'
    shardCount: 1
    storageSizeGb: 32
    storageType: 'PremiumSSD'
    highAvailabilityMode: 'Disabled'
    computeTier: 'M40'
    publicNetworkAccess: 'Enabled'
  }
}



// Azure Subscription and Resource Group outputs
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = resourceGroup.name

// Specific to Azure OpenAI
output AZURE_OPENAI_SERVICE string = openAi.outputs.name
output AZURE_OPENAI_ENDPOINT string = openAi.outputs.endpoint

output AZURE_OPENAI_CHAT_MODEL string = chatModelName
output AZURE_OPENAI_CHAT_DEPLOYMENT string = chatModelName
output AZURE_OPENAI_CHAT_ENDPOINT string = openAi.outputs.endpoint
output AZURE_OPENAI_CHAT_API_VERSION string = chatModelApiVersion

// Planner agent uses the same model as chat (gpt-4o-mini)
output AZURE_OPENAI_PLANNER_MODEL string = chatModelName
output AZURE_OPENAI_PLANNER_DEPLOYMENT string = chatModelName
output AZURE_OPENAI_PLANNER_ENDPOINT string = openAi.outputs.endpoint
output AZURE_OPENAI_PLANNER_API_VERSION string = chatModelApiVersion

output AZURE_OPENAI_SYNTH_MODEL string = synthModelName
output AZURE_OPENAI_SYNTH_DEPLOYMENT string = synthModelName
output AZURE_OPENAI_SYNTH_ENDPOINT string = openAi.outputs.endpoint
output AZURE_OPENAI_SYNTH_API_VERSION string = synthModelApiVersion

output AZURE_OPENAI_EMBEDDING_MODEL string = embeddingModelName
output AZURE_OPENAI_EMBEDDING_DEPLOYMENT string = embeddingModelName
output AZURE_OPENAI_EMBEDDING_ENDPOINT string = openAi.outputs.endpoint
output AZURE_OPENAI_EMBEDDING_API_VERSION string = embeddingModelApiVersion

// Managed Identity outputs
output AZURE_MANAGED_IDENTITY_ID string = managedIdentity.outputs.resourceId
output AZURE_MANAGED_IDENTITY_PRINCIPAL_ID string = managedIdentity.outputs.principalId
output AZURE_MANAGED_IDENTITY_CLIENT_ID string = managedIdentity.outputs.clientId

// DocumentDB outputs
output AZURE_DOCUMENTDB_CLUSTER string = documentDbCluster.outputs.clusterName
output AZURE_DOCUMENTDB_DATABASENAME string = databaseName
output AZURE_DOCUMENTDB_COLLECTION string = collectionName
output AZURE_DOCUMENTDB_INDEX_NAME string = indexName
output MONGO_CLUSTER_NAME string = documentDbCluster.outputs.clusterName
output AZURE_DOCUMENTDB_ADMIN_USERNAME string = documentDbAdminUsername

// Configuration for embedding creation and vector search
output DATA_FILE_WITH_VECTORS string = dataFileWithVectors
output DATA_FILE_WITHOUT_VECTORS string = dataFileWithoutVectors
output FIELD_TO_EMBED string = fieldToEmbed
output EMBEDDED_FIELD string = embeddedFieldName
output EMBEDDING_DIMENSIONS string = embeddingDimensions
output EMBEDDING_BATCH_SIZE string = embeddingBatchSize
output LOAD_SIZE_BATCH string = loadSizeBatch
