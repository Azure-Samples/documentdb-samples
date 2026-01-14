az resource update \
    --resource-group <Your-Resource-Group> \
    --name <Your-Azure-OpenAI-Resource-Name> \
    --resource-type "Microsoft.CognitiveServices/accounts" \
    --set properties.disableLocalAuth=false