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

// CreateIVFVectorIndex creates an IVF (Inverted File) vector index on the specified field
func CreateIVFVectorIndex(ctx context.Context, collection *mongo.Collection, vectorField string, dimensions int, similarity string) error {
	fmt.Printf("Creating IVF vector index on field '%s'...\n", vectorField)

	err := DropVectorIndexes(ctx, collection, vectorField)
	if err != nil {
		fmt.Printf("Warning: Could not drop existing indexes: %v\n", err)
	}

	// Must use bson.D for commands to preserve order and avoid "multi-key map" errors
	indexCommand := bson.D{
		{"createIndexes", collection.Name()},
		{"indexes", []bson.D{
			{
				{"name", fmt.Sprintf("ivf_index_%s", vectorField)},
				{"key", bson.D{
					{vectorField, "cosmosSearch"},
				}},
				{"cosmosSearchOptions", bson.D{
					{"kind", "vector-ivf"},
					{"dimensions", dimensions},
					{"similarity", similarity},
					// Number of clusters to partition vectors into
					{"numLists", 10},
				}},
			},
		}},
	}

	var result bson.M
	err = collection.Database().RunCommand(ctx, indexCommand).Decode(&result)
	if err != nil {
		if strings.Contains(err.Error(), "not enabled for this cluster tier") {
			fmt.Println("\nIVF indexes require a higher cluster tier.")
			fmt.Println("Try upgrading your DocumentDB cluster or use a different algorithm.")
		}
		return fmt.Errorf("error creating IVF vector index: %v", err)
	}

	fmt.Println("IVF vector index created successfully")
	return nil
}

// RunIVF executes the full IVF vector search workflow
func RunIVF(ctx context.Context, config *Config, dbClient *mongo.Client, aiClient openai.Client) error {
	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("IVF (Inverted File) Vector Search")
	fmt.Println(strings.Repeat("=", 60))

	collection := dbClient.Database(config.DatabaseName).Collection("hotels_ivf")

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

	// Create IVF vector index
	fmt.Println("\nCreating IVF vector index...")
	err = CreateIVFVectorIndex(ctx, collection, config.VectorField, config.Dimensions, config.Similarity)
	if err != nil {
		return fmt.Errorf("failed to create IVF vector index: %v", err)
	}

	fmt.Println("Waiting for index clustering to complete...")
	time.Sleep(3 * time.Second)

	// Perform vector search
	query := "quintessential lodging near running trails, eateries, retail"
	results, err := PerformVectorSearch(ctx, collection, aiClient, query, config.VectorField, config.ModelName, 5)
	if err != nil {
		return fmt.Errorf("failed to perform IVF vector search: %v", err)
	}

	PrintSearchResults(results, "ivf")

	log.Println("IVF demonstration completed successfully!")
	return nil
}
