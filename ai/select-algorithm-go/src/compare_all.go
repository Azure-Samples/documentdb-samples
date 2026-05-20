package main

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/openai/openai-go/v3"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// CompareResult holds the result of a single algorithm+metric search
type CompareResult struct {
	Algorithm string
	Metric    string
	Results   []SearchResult
	Top1Name  string
	Top1Score float64
	Top2Name  string
	Top2Score float64
	Error     error
}

// indexSpec defines one of the 9 combinations
type indexSpec struct {
	Algorithm string
	Kind      string
	Metric    string
	IndexName string
	Options   bson.D
}

// RunCompareAll executes all 9 algorithm×metric combinations on a single collection
func RunCompareAll(ctx context.Context, config *Config, dbClient *mongo.Client, aiClient openai.Client) error {
	queryText := getEnvOrDefault("QUERY_TEXT", "luxury hotel near the beach")
	topK, _ := strconv.Atoi(getEnvOrDefault("TOP_K", "5"))

	fmt.Println("\n" + strings.Repeat("=", 70))
	fmt.Println("  COMPARE ALL: 3 Algorithms × 3 Similarity Metrics (9 combinations)")
	fmt.Println(strings.Repeat("=", 70))
	fmt.Printf("Query:  %q\n", queryText)
	fmt.Printf("Top-K:  %d\n", topK)

	// 1. Drop collection for clean comparison, then load data
	database := dbClient.Database(config.DatabaseName)
	collection := database.Collection("hotels")

	// Drop existing collection for a clean comparison
	if err := collection.Drop(ctx); err != nil {
		fmt.Printf("Note: could not drop collection (may not exist): %v\n", err)
	} else {
		fmt.Println("Dropped existing 'hotels' collection")
	}

	// Ensure cleanup on exit
	defer func() {
		fmt.Println("\nCleanup: dropping comparison collection...")
		if dropErr := collection.Drop(ctx); dropErr != nil {
			fmt.Printf("Cleanup warning: %v\n", dropErr)
		} else {
			fmt.Println("Cleanup: dropped collection 'hotels'")
		}
	}()

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

	stats, err := PrepareCollection(ctx, collection, documentsWithEmbeddings, config.BatchSize)
	if err != nil {
		return err
	}
	fmt.Printf("Insertion completed: %d inserted, %d failed\n", stats.Inserted, stats.Failed)

	// 2. Generate ONE embedding for the query (reused for all 9 searches)
	fmt.Printf("\nGenerating embedding for query: %q\n", queryText)
	queryEmbedding, err := GenerateEmbedding(ctx, aiClient, queryText, config.ModelName)
	if err != nil {
		return fmt.Errorf("failed to generate query embedding: %v", err)
	}
	fmt.Printf("Embedding generated (%d dimensions)\n", len(queryEmbedding))

	// 3. Define all 9 index specs
	metrics := []string{"COS", "L2", "IP"}
	specs := buildIndexSpecs(config.VectorField, config.Dimensions, metrics)

	// 4. Create→search→drop each index sequentially (DocumentDB only allows one vector index per field)
	fmt.Printf("\nRunning %d vector index comparisons (create→search→drop)...\n", len(specs))
	var results []CompareResult
	successfulComparisons := 0
	failedComparisons := 0

	for _, spec := range specs {
		// Drop all existing vector indexes on this field
		DropVectorIndexes(ctx, collection, config.VectorField)

		// Create this specific index with retry (drop may still be in progress)
		var createErr error
		for attempt := 0; attempt < 3; attempt++ {
			if attempt > 0 {
				time.Sleep(3 * time.Second)
			}
			createErr = createNamedVectorIndex(ctx, collection, config.VectorField, spec)
			if createErr == nil {
				break
			}
		}
		if createErr != nil {
			results = append(results, CompareResult{
				Algorithm: spec.Algorithm,
				Metric:    spec.Metric,
				Error:     createErr,
			})
			failedComparisons++
			fmt.Printf("  ⚠ %s: %v\n", spec.IndexName, createErr)
			continue
		}
		fmt.Printf("  ✓ %s created\n", spec.IndexName)

		// Search using simple cosmosSearch with bounded retry for index readiness.
		searchResults, searchErr := runVectorSearchWithRetry(ctx, collection, queryEmbedding, config.VectorField, topK)

		top1Name, top1Score := extractResult(searchResults, 0)
		top2Name, top2Score := extractResult(searchResults, 1)

		cr := CompareResult{
			Algorithm: spec.Algorithm,
			Metric:    spec.Metric,
			Results:   searchResults,
			Top1Name:  top1Name,
			Top1Score: top1Score,
			Top2Name:  top2Name,
			Top2Score: top2Score,
			Error:     searchErr,
		}
		results = append(results, cr)
		if searchErr != nil {
			failedComparisons++
		} else {
			successfulComparisons++
		}
	}

	// 6. Print comparison table
	fmt.Println()
	printComparisonTable(results)
	fmt.Printf("\nSummary: %d succeeded, %d failed\n", successfulComparisons, failedComparisons)
	if successfulComparisons == 0 {
		return fmt.Errorf("all %d comparisons failed", failedComparisons)
	}

	return nil
}

func runVectorSearchWithRetry(ctx context.Context, collection *mongo.Collection, queryEmbedding []float64, vectorField string, topK int) ([]SearchResult, error) {
	const maxAttempts = 6
	const retryDelay = 2 * time.Second

	var searchResults []SearchResult
	var searchErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		searchResults, searchErr = vectorSearchSimple(ctx, collection, queryEmbedding, vectorField, topK)
		if searchErr == nil {
			if len(searchResults) > 0 {
				return searchResults, nil
			}
			searchErr = fmt.Errorf("search returned no results")
		}

		if attempt < maxAttempts {
			time.Sleep(retryDelay)
		}
	}

	return searchResults, searchErr
}

// buildIndexSpecs creates the 9 index specifications
func buildIndexSpecs(vectorField string, dimensions int, metrics []string) []indexSpec {
	var specs []indexSpec

	type algoConfig struct {
		name    string
		kind    string
		options bson.D
	}

	algos := []algoConfig{
		{"IVF", "vector-ivf", bson.D{{"numLists", 1}}},
		{"HNSW", "vector-hnsw", bson.D{{"m", 16}, {"efConstruction", 64}}},
		{"DiskANN", "vector-diskann", bson.D{{"maxDegree", 32}, {"lBuild", 50}}},
	}

	for _, algo := range algos {
		for _, metric := range metrics {
			metricLower := strings.ToLower(metric)
			opts := bson.D{
				{"kind", algo.kind},
				{"dimensions", dimensions},
				{"similarity", metric},
			}
			for _, o := range algo.options {
				opts = append(opts, o)
			}

			specs = append(specs, indexSpec{
				Algorithm: algo.name,
				Kind:      algo.kind,
				Metric:    metric,
				IndexName: fmt.Sprintf("vector_%s_%s", strings.ToLower(algo.name), metricLower),
				Options:   opts,
			})
		}
	}

	return specs
}

// createNamedVectorIndex creates a single named vector index
func createNamedVectorIndex(ctx context.Context, collection *mongo.Collection, vectorField string, spec indexSpec) error {
	indexCommand := bson.D{
		{"createIndexes", collection.Name()},
		{"indexes", []bson.D{
			{
				{"name", spec.IndexName},
				{"key", bson.D{
					{vectorField, "cosmosSearch"},
				}},
				{"cosmosSearchOptions", spec.Options},
			},
		}},
	}

	var result bson.M
	err := collection.Database().RunCommand(ctx, indexCommand).Decode(&result)
	if err != nil {
		if strings.Contains(err.Error(), "already exists") || strings.Contains(err.Error(), "IndexAlreadyExists") {
			return nil
		}
		return err
	}
	return nil
}

// vectorSearchSimple performs a vector search using the active vector index
func vectorSearchSimple(ctx context.Context, collection *mongo.Collection, embedding []float64, vectorField string, topK int) ([]SearchResult, error) {
	pipeline := []bson.M{
		{
			"$search": bson.M{
				"cosmosSearch": bson.M{
					"vector": embedding,
					"path":   vectorField,
					"k":      topK,
				},
			},
		},
		{
			"$project": bson.M{
				"document": "$$ROOT",
				"score":    bson.M{"$meta": "searchScore"},
			},
		},
	}

	cursor, err := collection.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []SearchResult
	for cursor.Next(ctx) {
		var result SearchResult
		if err := cursor.Decode(&result); err != nil {
			continue
		}
		results = append(results, result)
	}

	if err := cursor.Err(); err != nil {
		return nil, err
	}

	return results, nil
}

// extractResult returns the name and score of the result at the given index
func extractResult(results []SearchResult, idx int) (string, float64) {
	if idx >= len(results) {
		return "(no results)", 0
	}
	doc := results[idx].Document.(bson.D)
	var name string
	for _, elem := range doc {
		if elem.Key == "HotelName" {
			name = fmt.Sprintf("%v", elem.Value)
			break
		}
	}
	if name == "" {
		name = "Unknown"
	}
	return name, results[idx].Score
}

// printComparisonTable outputs a formatted table of results
func printComparisonTable(results []CompareResult) {
	fmt.Println("┌──────────┬────────┬────────────────────────────┬────────┬────────────────────────────┬────────┬───────┐")
	fmt.Printf("│ %-8s │ %-6s │ %-26s │ %-6s │ %-26s │ %-6s │ %-5s │\n",
		"Algorithm", "Metric", "Top 1 Result", "Score", "Top 2 Result", "Score", "Diff")
	fmt.Println("├──────────┼────────┼────────────────────────────┼────────┼────────────────────────────┼────────┼───────┤")

	for _, r := range results {
		if r.Error != nil {
			fmt.Printf("│ %-8s │ %-6s │ %-26s │ %-6s │ %-26s │ %-6s │ %-5s │\n",
				r.Algorithm, r.Metric, "ERROR", "-", "-", "-", "-")
			continue
		}

		top1 := r.Top1Name
		if len(top1) > 26 {
			top1 = top1[:26]
		}
		top2 := r.Top2Name
		if len(top2) > 26 {
			top2 = top2[:26]
		}
		diff := math.Abs(r.Top1Score - r.Top2Score)

		fmt.Printf("│ %-8s │ %-6s │ %-26s │ %6.4f │ %-26s │ %6.4f │%6.4f │\n",
			r.Algorithm, r.Metric, top1, r.Top1Score, top2, r.Top2Score, diff)
	}

	fmt.Println("└──────────┴────────┴────────────────────────────┴────────┴────────────────────────────┴────────┴───────┘")
}
