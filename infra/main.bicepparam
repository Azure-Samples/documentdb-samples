using './main.bicep'

param environmentName = readEnvironmentVariable('AZURE_ENV_NAME', 'development')
param location = readEnvironmentVariable('AZURE_LOCATION', 'eastus2')
param deploymentUserPrincipalId = readEnvironmentVariable('AZURE_PRINCIPAL_ID', '')
param currentUserPrincipalId = readEnvironmentVariable('CURRENT_USER_OBJECT_ID', readEnvironmentVariable('AZURE_PRINCIPAL_ID', ''))
param documentDbAdminUsername = readEnvironmentVariable('DOCUMENTDB_ADMIN_USERNAME', 'docdbadmin')
param documentDbAdminPassword = readEnvironmentVariable('DOCUMENTDB_ADMIN_PASSWORD', '')
