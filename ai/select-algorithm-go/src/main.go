package main

import (
	"context"
	"fmt"
	"log"
)

func main() {
	fmt.Println("Starting vector algorithm comparison...")

	ctx := context.Background()
	config := LoadConfig()

	fmt.Println("\nInitializing clients with passwordless authentication...")
	mongoClient, azureOpenAIClient, err := GetClientsPasswordless(ctx, config)
	if err != nil {
		log.Fatalf("Failed to initialize clients: %v", err)
	}
	defer mongoClient.Disconnect(ctx)

	err = RunCompareAll(ctx, config, mongoClient, azureOpenAIClient)
	if err != nil {
		log.Fatalf("Compare all failed: %v", err)
	}

	fmt.Println("\nComparison completed successfully!")
}
