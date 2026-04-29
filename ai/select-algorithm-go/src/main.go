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

	fmt.Printf("Algorithm:  %s\n", config.Algorithm)
	fmt.Printf("Database:   %s\n", config.DatabaseName)
	fmt.Printf("Similarity: %s\n", config.Similarity)
	fmt.Printf("Dimensions: %d\n", config.Dimensions)

	// Initialize MongoDB and Azure OpenAI clients
	fmt.Println("\nInitializing MongoDB and Azure OpenAI clients...")
	mongoClient, aiClient, err := GetClientsPasswordless(ctx, config)
	if err != nil {
		log.Fatalf("Failed to initialize clients: %v", err)
	}
	defer mongoClient.Disconnect(ctx)

	// Dispatch based on selected algorithm
	switch config.Algorithm {
	case "ivf":
		if err := RunIVF(ctx, config, mongoClient, aiClient); err != nil {
			log.Fatalf("IVF failed: %v", err)
		}

	case "hnsw":
		if err := RunHNSW(ctx, config, mongoClient, aiClient); err != nil {
			log.Fatalf("HNSW failed: %v", err)
		}

	case "diskann":
		if err := RunDiskANN(ctx, config, mongoClient, aiClient); err != nil {
			log.Fatalf("DiskANN failed: %v", err)
		}

	case "all":
		fmt.Println("\nRunning all algorithms...")

		if err := RunIVF(ctx, config, mongoClient, aiClient); err != nil {
			log.Printf("IVF failed: %v", err)
		}

		if err := RunHNSW(ctx, config, mongoClient, aiClient); err != nil {
			log.Printf("HNSW failed: %v", err)
		}

		if err := RunDiskANN(ctx, config, mongoClient, aiClient); err != nil {
			log.Printf("DiskANN failed: %v", err)
		}

	case "compare-all":
		if err := RunCompareAll(ctx, config, mongoClient, aiClient); err != nil {
			log.Fatalf("Compare-all failed: %v", err)
		}

	default:
		log.Fatalf("Unknown algorithm: '%s'. Use 'all', 'ivf', 'hnsw', 'diskann', or 'compare-all'", config.Algorithm)
	}

	fmt.Println("\nDone!")
}
