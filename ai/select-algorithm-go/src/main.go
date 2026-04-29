package main

import (
	"context"
	"fmt"
	"log"
)

func main() {
	fmt.Println("DocumentDB Select Algorithm - Go Sample")
	fmt.Println("========================================")

	ctx := context.Background()

	// Load configuration from environment variables
	config := LoadConfig()

	fmt.Printf("Database:   %s\n", config.DatabaseName)
	fmt.Printf("Dimensions: %d\n", config.Dimensions)

	// Initialize MongoDB and Azure OpenAI clients
	fmt.Println("\nInitializing MongoDB and Azure OpenAI clients...")
	mongoClient, aiClient, err := GetClientsPasswordless(ctx, config)
	if err != nil {
		log.Fatalf("Failed to initialize clients: %v", err)
	}
	defer mongoClient.Disconnect(ctx)

	// Run the comparison runner
	if err := RunCompareAll(ctx, config, mongoClient, aiClient); err != nil {
		log.Fatalf("Compare-all failed: %v", err)
	}

	fmt.Println("\nDone!")
}
