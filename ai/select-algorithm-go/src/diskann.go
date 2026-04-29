package main

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/openai/openai-go/v3"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// CreateDiskANNVectorIndex creates a DiskANN vector index on the specified field
func CreateDiskANNVectorIndex(ctx context.Context, collection *mongo.Collection, vectorField string, dimensions int, similarity string) error {
	fmt.Printf("Creating DiskANN vector index on field '%s'...\n", vectorField)

	err := DropVectorIndexes(ctx, collection, vectorField)
	if err != nil {
		fmt.Printf("Warning: Could not drop existing indexes: %v\n", err)
	}

	// Must use bson.D for commands to preserve order and avoid "multi-key map" errors
	indexCommand := bson.D{
		{"createIndexes", collection.Name()},
		{"indexes", []bson.D{
			{
				{"name", fmt.Sprintf("diskann_index_%s", vectorField)},
				{"key", bson.D{
					{vectorField, "cosmosSearch"},
				}},
				{"cosmosSearchOptions", bson.D{
					{"kind", "vector-diskann"},
					{"dimensions", dimensions},
					{"similarity", similarity},
					// Maximum degree: number of edges per node in the graph
					{"maxDegree", 20},
					// Candidates evaluated during index construction
					{"lBuild", 10},
				}},
			},
		}},
	}

	var result bson.M
	err = collection.Database().RunCommand(ctx, indexCommand).Decode(&result)
	if err != nil {
		if strings.Contains(err.Error(), "not enabled for this cluster tier") {
			fmt.Println("\nDiskANN indexes require a higher cluster tier.")
			fmt.Println("Try upgrading your DocumentDB cluster or use a different algorithm.")
		}
		return fmt.Errorf("error creating DiskANN vector index: %v", err)
	}

	fmt.Println("DiskANN vector index created successfully")
	return nil
}

// RunDiskANN executes the full DiskANN vector search workflow
func RunDiskANN(ctx context.Context, config *Config, dbClient *mongo.Client, aiClient openai.Client) error {
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("DiskANN Vector Search")
	fmt.Println(strings.Repeat("=", 60))

	collection := dbClient.Database(config.DatabaseName).Collection("hotels_diskann")

	// Load data
	fmt.Printf("\nLoading data from %s...\n", config.DataFile)
	data, err := ReadFileReturnJSON(config.DataFile)
	if err != nil {
		return fmt.Errorf("failed to load data: %v", err)
	}

	documentsWithEmbeddings := FilterDocumentsWithEmbeddings(data, config.VectorField)
	if len(documentsWithEmbeddings) == 0 {
		return fmt.Errorf("no documents found with embeddings in field '%s'", config.VectorField)
	}
	fmt.Printf("Loaded %d documents with embeddings\n", len(documentsWithEmbeddings))

	// Insert data
	stats, err := PrepareCollection(ctx, collection, documentsWithEmbeddings, config.BatchSize)
	if err != nil {
		return err
	}
	if stats.Inserted == 0 {
		return fmt.Errorf("no documents were inserted successfully")
	}
	fmt.Printf("Insertion completed: %d inserted, %d failed\n", stats.Inserted, stats.Failed)

	// Create DiskANN vector index
	fmt.Println("\nCreating DiskANN vector index...")
	err = CreateDiskANNVectorIndex(ctx, collection, config.VectorField, config.Dimensions, config.Similarity)
	if err != nil {
		return fmt.Errorf("failed to create DiskANN vector index: %v", err)
	}

	fmt.Println("Waiting for index to be ready...")
	time.Sleep(2 * time.Second)

	// Perform vector search
	query := "quintessential lodging near running trails, eateries, retail"
	results, err := PerformVectorSearch(ctx, collection, aiClient, query, config.VectorField, config.ModelName, 5)
	if err != nil {
		return fmt.Errorf("failed to perform DiskANN vector search: %v", err)
	}

	PrintSearchResults(results, "diskann")

	log.Println("DiskANN demonstration completed successfully!")
	return nil
}
