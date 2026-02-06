@description('Cluster name')
@minLength(3)
@maxLength(40)
param clusterName string = 'msdocs-${uniqueString(resourceGroup().id)}'

@description('Location for the cluster.')
param location string = resourceGroup().location

@description('Username for admin user')
param adminUsername string

@secure()
@description('Password for admin user')
@minLength(8)
@maxLength(128)
param adminPassword string

@description('Managed identity resource ID for role assignments')
param managedIdentityPrincipalId string = ''

@description('Managed identity principal ID (object ID) for database user registration')
param managedIdentityObjectId string = ''

@description('Current user principal ID (object ID) for database user registration')
param currentUserPrincipalId string = ''

@description('Resource tags.')
param tags object = {}

@description('Server version for the MongoDB cluster')
@allowed([
  '5.0'
  '6.0'
  '7.0'
  '8.0'
])
param serverVersion string = '8.0'

@description('Number of shards to provision')
param shardCount int = 1

@description('Storage size in GB')
param storageSizeGb int = 32

@description('Storage type for the cluster')
@allowed([
  'PremiumSSD'
  'PremiumSSDv2'
])
param storageType string = 'PremiumSSD'

@description('High availability mode')
@allowed([
  'Disabled'
  'SameZone'
  'ZoneRedundantPreferred'
])
param highAvailabilityMode string = 'Disabled'

@description('Compute tier for the cluster')
param computeTier string = 'M10'

@description('Public network access setting')
@allowed([
  'Enabled'
  'Disabled'
])
param publicNetworkAccess string = 'Enabled'

resource cluster 'Microsoft.DocumentDB/mongoClusters@2025-09-01' = {
  name: clusterName
  location: location
  tags: tags
  identity: managedIdentityPrincipalId != '' ? {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityPrincipalId}': {}
    }
  } : {
    type: 'None'
  }
  properties: {
    administrator: {
      userName: adminUsername
      password: adminPassword
    }
    authConfig: {
      allowedModes: [
        'MicrosoftEntraID'
        'NativeAuth'
      ]
    }
    serverVersion: serverVersion
    publicNetworkAccess: publicNetworkAccess
    sharding: {
      shardCount: shardCount
    }
    storage: {
      sizeGb: storageSizeGb
      type: storageType
    }
    highAvailability: {
      targetMode: highAvailabilityMode
    }
    compute: {
      tier: computeTier
    }
  }
}

resource firewallRules 'Microsoft.DocumentDB/mongoClusters/firewallRules@2025-09-01' = {
  parent: cluster
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource firewallRulesAllowAll 'Microsoft.DocumentDB/mongoClusters/firewallRules@2025-09-01' = {
  parent: cluster
  name: 'AllowAllIPs'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '255.255.255.255'
  }
}

// Register managed identity as an administrative user on the cluster (only if provided)
resource managedIdentityUser 'Microsoft.DocumentDB/mongoClusters/users@2025-09-01' = if (!empty(managedIdentityObjectId)) {
  parent: cluster
  name: managedIdentityObjectId
  dependsOn: [
    firewallRules
    firewallRulesAllowAll
  ]
  properties: {
    identityProvider: {
      type: 'MicrosoftEntraID'
      properties: {
        principalType: 'servicePrincipal'
      }
    }
    roles: [
      {
        db: 'admin'
        role: 'root'
      }
    ]
  }
}

// Register current user as an administrative user on the cluster (only if provided)
resource currentUserAdminUser 'Microsoft.DocumentDB/mongoClusters/users@2025-09-01' = if (!empty(currentUserPrincipalId)) {
  parent: cluster
  name: currentUserPrincipalId
  dependsOn: [
    firewallRules
    firewallRulesAllowAll
  ]
  properties: {
    identityProvider: {
      type: 'MicrosoftEntraID'
      properties: {
        principalType: 'user'
      }
    }
    roles: [
      {
        db: 'admin'
        role: 'root'
      }
    ]
  }
}

output clusterName string = cluster.name
output clusterId string = cluster.id
