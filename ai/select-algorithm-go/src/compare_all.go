package main

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/openai/openai-go/v3"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// CompareResult holds the result of a single algorithm+metric search
type CompareResult struct {
	Algorithm  string
	Metric     string
	IndexName  string
	Latency    time.Duration
	Results    []SearchResult
	TopScore   float64
	Error      error
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
	topK, _ := strconv.Atoi(getEnvOrDefault("TOP_K", "3"))
	verbose := strings.ToLower(getEnvOrDefault("VERBOSE", "false")) == "true"

	fmt.Println("\n" + strings.Repeat("=", 70))
	fmt.Println("  COMPARE ALL: 3 Algorithms × 3 Similarity Metrics (9 combinations)")
	fmt.Println(strings.Repeat("=", 70))
	fmt.Printf("Query:  %q\n", queryText)
	fmt.Printf("Top-K:  %d\n", topK)
	fmt.Printf("Verbose: %v\n", verbose)

	// 1. Drop collection if it exists for clean comparison, then load data
	database := dbClient.Database(config.DatabaseName)
	collection := database.Collection("hotels")

	// Drop existing collection if it exists (clean start)
	names, _ := database.ListCollectionNames(ctx, bson.M{"name": "hotels"})
	if len(names) > 0 {
		if err := collection.Drop(ctx); err != nil {
			fmt.Printf("Note: could not drop collection: %v\n", err)
		} else {
			fmt.Println("Dropped existing 'hotels' collection")
		}
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

	// 4. Create all 9 indexes (idempotent)
	fmt.Printf("\nCreating %d vector indexes...\n", len(specs))
	for _, spec := range specs {
		if err := createNamedVectorIndex(ctx, collection, spec); err != nil {
			fmt.Printf("  ⚠ %s: %v\n", spec.IndexName, err)
		} else {
			fmt.Printf("  ✓ %s created\n", spec.IndexName)
		}
	}

	// Allow indexes to become ready
	fmt.Println("\nWaiting for indexes to be ready...")
	time.Sleep(3 * time.Second)

	// 5. Run searches SEQUENTIALLY and collect results
	fmt.Println("\nRunning vector searches...")
	var results []CompareResult

	for _, spec := range specs {
		start := time.Now()
		searchResults, searchErr := vectorSearchWithIndex(ctx, collection, queryEmbedding, config.VectorField, spec.IndexName, topK)
		latency := time.Since(start)

		cr := CompareResult{
			Algorithm: spec.Algorithm,
			Metric:    spec.Metric,
			IndexName: spec.IndexName,
			Latency:   latency,
			Results:   searchResults,
			Error:     searchErr,
		}
		if len(searchResults) > 0 {
			cr.TopScore = searchResults[0].Score
		}
		results = append(results, cr)

		status := "✓"
		if searchErr != nil {
			status = "✗"
		}
		fmt.Printf("  %s %s (%v)\n", status, spec.IndexName, latency.Round(time.Millisecond))
	}

	// 6. Print comparison table
	fmt.Println()
	printComparisonTable(results, verbose)

	return nil
}

// buildIndexSpecs creates the 9 index specifications
func buildIndexSpecs(vectorField string, dimensions int, metrics []string) []indexSpec {
	var specs []indexSpec

	for _, metric := range metrics {
		metricLower := strings.ToLower(metric)

		// IVF
		specs = append(specs, indexSpec{
			Algorithm: "IVF",
			Kind:      "vector-ivf",
			Metric:    metric,
			IndexName: fmt.Sprintf("vector_ivf_%s", metricLower),
			Options: bson.D{
				{"kind", "vector-ivf"},
				{"dimensions", dimensions},
				{"similarity", metric},
				{"numLists", 1},
			},
		})

		// HNSW
		specs = append(specs, indexSpec{
			Algorithm: "HNSW",
			Kind:      "vector-hnsw",
			Metric:    metric,
			IndexName: fmt.Sprintf("vector_hnsw_%s", metricLower),
			Options: bson.D{
				{"kind", "vector-hnsw"},
				{"dimensions", dimensions},
				{"similarity", metric},
				{"m", 16},
				{"efConstruction", 64},
			},
		})

		// DiskANN
		specs = append(specs, indexSpec{
			Algorithm: "DiskANN",
			Kind:      "vector-diskann",
			Metric:    metric,
			IndexName: fmt.Sprintf("vector_diskann_%s", metricLower),
			Options: bson.D{
				{"kind", "vector-diskann"},
				{"dimensions", dimensions},
				{"similarity", metric},
				{"maxDegree", 32},
				{"lBuild", 50},
			},
		})
	}

	return specs
}

// createNamedVectorIndex creates a single named vector index (idempotent)
func createNamedVectorIndex(ctx context.Context, collection *mongo.Collection, spec indexSpec) error {
	indexCommand := bson.D{
		{"createIndexes", collection.Name()},
		{"indexes", []bson.D{
			{
				{"name", spec.IndexName},
				{"key", bson.D{
					{spec.IndexName, "cosmosSearch"},
				}},
				{"cosmosSearchOptions", spec.Options},
			},
		}},
	}

	var result bson.M
	err := collection.Database().RunCommand(ctx, indexCommand).Decode(&result)
	if err != nil {
		// Treat "index already exists" as success (idempotent)
		if strings.Contains(err.Error(), "already exists") || strings.Contains(err.Error(), "IndexAlreadyExists") {
			return nil
		}
		return err
	}
	return nil
}

// vectorSearchWithIndex performs a vector search targeting a specific named index
func vectorSearchWithIndex(ctx context.Context, collection *mongo.Collection, embedding []float64, vectorField, indexName string, topK int) ([]SearchResult, error) {
	pipeline := []bson.M{
		{
			"$search": bson.M{
				"cosmosSearch": bson.M{
					"vector": embedding,
					"path":   vectorField,
					"k":      topK,
				},
				"cosmosSearchOptions": bson.M{
					"indexName": indexName,
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

// printComparisonTable outputs a formatted table of results
func printComparisonTable(results []CompareResult, verbose bool) {
	fmt.Println(strings.Repeat("=", 70))
	fmt.Println("  COMPARISON RESULTS")
	fmt.Println(strings.Repeat("=", 70))

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', tabwriter.AlignRight)
	fmt.Fprintf(w, "ALGORITHM\tMETRIC\tLATENCY\tTOP SCORE\tRESULTS\tSTATUS\t\n")
	fmt.Fprintf(w, "---------\t------\t-------\t---------\t-------\t------\t\n")

	for _, r := range results {
		status := "OK"
		scoreStr := fmt.Sprintf("%.4f", r.TopScore)
		resultCount := fmt.Sprintf("%d", len(r.Results))

		if r.Error != nil {
			status = "ERROR"
			scoreStr = "-"
			resultCount = "-"
		}

		fmt.Fprintf(w, "%s\t%s\t%v\t%s\t%s\t%s\t\n",
			r.Algorithm,
			r.Metric,
			r.Latency.Round(time.Millisecond),
			scoreStr,
			resultCount,
			status,
		)
	}
	w.Flush()

	// Print verbose details if requested
	if verbose {
		fmt.Println()
		for _, r := range results {
			if r.Error != nil {
				fmt.Printf("\n[%s] Error: %v\n", r.IndexName, r.Error)
				continue
			}
			if len(r.Results) > 0 {
				fmt.Printf("\n[%s] Top results:\n", r.IndexName)
				for i, res := range r.Results {
					doc := res.Document.(bson.D)
					var hotelName string
					for _, elem := range doc {
						if elem.Key == "HotelName" {
							hotelName = fmt.Sprintf("%v", elem.Value)
							break
						}
					}
					fmt.Printf("  %d. %s (score: %.4f)\n", i+1, hotelName, res.Score)
				}
			}
		}
	}

	// Summary
	fmt.Println()
	var fastest CompareResult
	for _, r := range results {
		if r.Error == nil && (fastest.Latency == 0 || r.Latency < fastest.Latency) {
			fastest = r
		}
	}
	if fastest.Latency > 0 {
		fmt.Printf("⚡ Fastest: %s/%s (%v)\n", fastest.Algorithm, fastest.Metric, fastest.Latency.Round(time.Millisecond))
	}

	var highestScore CompareResult
	for _, r := range results {
		if r.Error == nil && r.TopScore > highestScore.TopScore {
			highestScore = r
		}
	}
	if highestScore.TopScore > 0 {
		fmt.Printf("🎯 Highest score: %s/%s (%.4f)\n", highestScore.Algorithm, highestScore.Metric, highestScore.TopScore)
	}
}
