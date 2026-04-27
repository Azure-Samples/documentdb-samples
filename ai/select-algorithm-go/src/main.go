package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/azure"
	"github.com/openai/openai-go/v3/option"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Algorithm string
type Similarity string

const (
	DiskANN Algorithm = "diskann"
	HNSW    Algorithm = "hnsw"
	IVF     Algorithm = "ivf"
)

const (
	COS Similarity = "COS"
	L2  Similarity = "L2"
	IP  Similarity = "IP"
)

var (
	AllAlgorithms   = []Algorithm{DiskANN, HNSW, IVF}
	AllSimilarities = []Similarity{COS, L2, IP}
)

var AlgorithmLabels = map[Algorithm]string{
	DiskANN: "DiskANN",
	HNSW:    "HNSW",
	IVF:     "IVF",
}

type CollectionTarget struct {
	CollectionName string
	Algorithm      Algorithm
	Similarity     Similarity
}

type SearchResult struct {
	Document interface{} `bson:"document"`
	Score    float64     `bson:"score"`
}

type ComparisonResult struct {
	CollectionName string
	Algorithm      string
	Similarity     string
	SearchResults  []SearchResult
	LatencyMs      int64
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getTargetCollections(algorithmEnv, similarityEnv string) ([]CollectionTarget, error) {
	algorithmEnv = strings.ToLower(strings.TrimSpace(algorithmEnv))
	similarityEnv = strings.ToUpper(strings.TrimSpace(similarityEnv))

	algorithms := []Algorithm{}
	if algorithmEnv == "all" {
		algorithms = AllAlgorithms
	} else {
		algorithms = []Algorithm{Algorithm(algorithmEnv)}
	}

	similarities := []Similarity{}
	if similarityEnv == "all" {
		similarities = AllSimilarities
	} else {
		similarities = []Similarity{Similarity(similarityEnv)}
	}

	targets := []CollectionTarget{}
	for _, alg := range algorithms {
		validAlg := false
		for _, validAlgorithm := range AllAlgorithms {
			if alg == validAlgorithm {
				validAlg = true
				break
			}
		}
		if !validAlg {
			return nil, fmt.Errorf("invalid ALGORITHM '%s'. Must be one of: all, diskann, hnsw, ivf", alg)
		}

		for _, sim := range similarities {
			validSim := false
			for _, validSimilarity := range AllSimilarities {
				if sim == validSimilarity {
					validSim = true
					break
				}
			}
			if !validSim {
				return nil, fmt.Errorf("invalid SIMILARITY '%s'. Must be one of: all, COS, L2, IP", sim)
			}

			targets = append(targets, CollectionTarget{
				CollectionName: fmt.Sprintf("hotels_%s_%s", alg, strings.ToLower(string(sim))),
				Algorithm:      alg,
				Similarity:     sim,
			})
		}
	}

	return targets, nil
}

func getIndexOptions(collectionName, indexName, embeddedField string, dimensions int, algorithm Algorithm, similarity Similarity) bson.D {
	cosmosSearchOptions := bson.D{
		{"dimensions", dimensions},
		{"similarity", string(similarity)},
	}

	switch algorithm {
	case DiskANN:
		cosmosSearchOptions = append(bson.D{{"kind", "vector-diskann"}}, cosmosSearchOptions...)
		cosmosSearchOptions = append(cosmosSearchOptions, bson.E{"maxDegree", 32})
		cosmosSearchOptions = append(cosmosSearchOptions, bson.E{"lBuild", 50})
	case HNSW:
		cosmosSearchOptions = append(bson.D{{"kind", "vector-hnsw"}}, cosmosSearchOptions...)
		cosmosSearchOptions = append(cosmosSearchOptions, bson.E{"m", 16})
		cosmosSearchOptions = append(cosmosSearchOptions, bson.E{"efConstruction", 64})
	case IVF:
		cosmosSearchOptions = append(bson.D{{"kind", "vector-ivf"}}, cosmosSearchOptions...)
		cosmosSearchOptions = append(cosmosSearchOptions, bson.E{"numLists", 1})
	}

	return bson.D{
		{"createIndexes", collectionName},
		{"indexes", []bson.D{
			{
				{"name", indexName},
				{"key", bson.D{{embeddedField, "cosmosSearch"}}},
				{"cosmosSearchOptions", cosmosSearchOptions},
			},
		}},
	}
}

func getSearchPipeline(queryEmbedding []float64, embeddedField string, k int, algorithm Algorithm) []bson.M {
	cosmosSearch := bson.M{
		"vector": queryEmbedding,
		"path":   embeddedField,
		"k":      k,
	}

	switch algorithm {
	case DiskANN:
		cosmosSearch["lSearch"] = 100
	case HNSW:
		cosmosSearch["efSearch"] = 80
	case IVF:
		cosmosSearch["nProbes"] = 1
	}

	return []bson.M{
		{"$search": bson.M{"cosmosSearch": cosmosSearch}},
		{"$project": bson.M{
			"score":    bson.M{"$meta": "searchScore"},
			"document": "$$ROOT",
		}},
	}
}

func getClientsPasswordless() (*mongo.Client, openai.Client, error) {
	ctx := context.Background()

	clusterName := os.Getenv("MONGO_CLUSTER_NAME")
	if clusterName == "" {
		return nil, openai.Client{}, fmt.Errorf("MONGO_CLUSTER_NAME environment variable is required")
	}

	credential, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		return nil, openai.Client{}, fmt.Errorf("failed to create Azure credential: %w", err)
	}

	mongoURI := fmt.Sprintf("mongodb+srv://%s.mongocluster.cosmos.azure.com/", clusterName)

	oidcCallback := func(ctx context.Context, args *options.OIDCArgs) (*options.OIDCCredential, error) {
		scope := "https://ossrdbms-aad.database.windows.net/.default"
		token, err := credential.GetToken(ctx, policy.TokenRequestOptions{
			Scopes: []string{scope},
		})
		if err != nil {
			return nil, fmt.Errorf("failed to get token with scope %s: %w", scope, err)
		}

		return &options.OIDCCredential{
			AccessToken: token.Token,
		}, nil
	}

	clientOptions := options.Client().
		ApplyURI(mongoURI).
		SetConnectTimeout(120 * time.Second).
		SetServerSelectionTimeout(120 * time.Second).
		SetRetryWrites(false).
		SetAuth(options.Credential{
			AuthMechanism: "MONGODB-OIDC",
			AuthMechanismProperties: map[string]string{
				"TOKEN_RESOURCE": "https://ossrdbms-aad.database.windows.net",
			},
			OIDCMachineCallback: oidcCallback,
		})

	mongoClient, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return nil, openai.Client{}, fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	azureOpenAIEndpoint := os.Getenv("AZURE_OPENAI_EMBEDDING_ENDPOINT")
	if azureOpenAIEndpoint == "" {
		return nil, openai.Client{}, fmt.Errorf("AZURE_OPENAI_EMBEDDING_ENDPOINT environment variable is required")
	}

	openAIClient := openai.NewClient(
		option.WithBaseURL(fmt.Sprintf("%s/openai/v1", azureOpenAIEndpoint)),
		azure.WithTokenCredential(credential))

	return mongoClient, openAIClient, nil
}

func readFileReturnJSON(filePath string) ([]map[string]interface{}, error) {
	file, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("error reading file '%s': %w", filePath, err)
	}

	var data []map[string]interface{}
	err = json.Unmarshal(file, &data)
	if err != nil {
		return nil, fmt.Errorf("error parsing JSON in file '%s': %w", filePath, err)
	}

	return data, nil
}

func insertData(ctx context.Context, collection *mongo.Collection, data []map[string]interface{}, batchSize int) (int, int, error) {
	totalDocuments := len(data)
	insertedCount := 0
	failedCount := 0

	for i := 0; i < totalDocuments; i += batchSize {
		end := i + batchSize
		if end > totalDocuments {
			end = totalDocuments
		}

		batch := data[i:end]

		documents := make([]interface{}, len(batch))
		for j, doc := range batch {
			documents[j] = doc
		}

		result, err := collection.InsertMany(ctx, documents, options.InsertMany().SetOrdered(false))
		if err != nil {
			var bulkErr mongo.BulkWriteException
			if errors.As(err, &bulkErr) {
				inserted := len(batch) - len(bulkErr.WriteErrors)
				insertedCount += inserted
				failedCount += len(bulkErr.WriteErrors)
			} else {
				failedCount += len(batch)
			}
		} else {
			insertedCount += len(result.InsertedIDs)
		}

		if i+batchSize < totalDocuments {
			time.Sleep(100 * time.Millisecond)
		}
	}

	indexColumns := []string{"HotelId", "Category", "Description", "Description_fr"}
	for _, col := range indexColumns {
		indexModel := mongo.IndexModel{
			Keys: bson.D{{Key: col, Value: 1}},
		}
		_, err := collection.Indexes().CreateOne(ctx, indexModel)
		if err != nil {
			fmt.Printf("Warning: Could not create index on %s: %v\n", col, err)
		}
	}

	return insertedCount, failedCount, nil
}

func generateEmbedding(ctx context.Context, client openai.Client, text, modelName string) ([]float64, error) {
	resp, err := client.Embeddings.New(ctx, openai.EmbeddingNewParams{
		Input: openai.EmbeddingNewParamsInputUnion{
			OfString: openai.String(text),
		},
		Model: modelName,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate embedding: %w", err)
	}

	if len(resp.Data) == 0 {
		return nil, fmt.Errorf("no embedding data received")
	}

	embedding := make([]float64, len(resp.Data[0].Embedding))
	for i, v := range resp.Data[0].Embedding {
		embedding[i] = float64(v)
	}

	return embedding, nil
}

func printComparisonTable(results []ComparisonResult) {
	fmt.Println("\n╔══════════════════════════════════════════════════════════════════════════════════╗")
	fmt.Println("║                     Vector Algorithm Comparison Results                         ║")
	fmt.Println("╠══════════════════════════════════════════════════════════════════════════════════╣")

	fmt.Printf("║ %-12s%-14s%-24s%-12s%-14s║\n", "Algorithm", "Similarity", "Top Result", "Score", "Latency(ms)")
	fmt.Println("╠══════════════════════════════════════════════════════════════════════════════════╣")

	for _, r := range results {
		topName := "N/A"
		topScore := "N/A"

		if len(r.SearchResults) > 0 {
			topResult := r.SearchResults[0]
			doc := topResult.Document.(bson.D)
			for _, elem := range doc {
				if elem.Key == "HotelName" {
					hotelName := fmt.Sprintf("%v", elem.Value)
					if len(hotelName) > 22 {
						hotelName = hotelName[:22]
					}
					topName = hotelName
					break
				}
			}
			topScore = fmt.Sprintf("%.4f", topResult.Score)
		}

		fmt.Printf("║ %-12s%-14s%-24s%-12s%-14s║\n",
			r.Algorithm,
			r.Similarity,
			topName,
			topScore,
			fmt.Sprintf("%d", r.LatencyMs))
	}

	fmt.Println("╚══════════════════════════════════════════════════════════════════════════════════╝")

	for _, r := range results {
		fmt.Printf("\n--- %s / %s (%s) ---\n", r.Algorithm, r.Similarity, r.CollectionName)
		if len(r.SearchResults) == 0 {
			fmt.Println("  No results.")
			continue
		}
		for i, item := range r.SearchResults {
			doc := item.Document.(bson.D)
			var hotelName string
			for _, elem := range doc {
				if elem.Key == "HotelName" {
					hotelName = fmt.Sprintf("%v", elem.Value)
					break
				}
			}
			fmt.Printf("  %d. %s, Score: %.4f\n", i+1, hotelName, item.Score)
		}
		fmt.Printf("  Latency: %dms\n", r.LatencyMs)
	}
}

func main() {
	// Set environment variables before running, or source your .env file manually:
	//   export $(grep -v '^#' .env | xargs)  # Linux/macOS
	//   Get-Content .env | ForEach-Object { if ($_ -match '^\s*([^#][^=]+)=(.*)') { [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim()) } }  # PowerShell

	ctx := context.Background()

	dbName := getEnvOrDefault("AZURE_DOCUMENTDB_DATABASENAME", "Hotels")
	embeddedField := getEnvOrDefault("EMBEDDED_FIELD", "DescriptionVector")
	embeddingDimensions, err := strconv.Atoi(getEnvOrDefault("EMBEDDING_DIMENSIONS", "1536"))
	if err != nil {
		log.Fatalf("Invalid value for EMBEDDING_DIMENSIONS: %v", err)
	}
	dataFile := getEnvOrDefault("DATA_FILE_WITH_VECTORS", "../data/Hotels_Vector.json")
	deployment := os.Getenv("AZURE_OPENAI_EMBEDDING_MODEL")
	if deployment == "" {
		log.Fatal("AZURE_OPENAI_EMBEDDING_MODEL environment variable is required")
	}
	batchSize, err := strconv.Atoi(getEnvOrDefault("LOAD_SIZE_BATCH", "100"))
	if err != nil {
		log.Fatalf("Invalid value for LOAD_SIZE_BATCH: %v", err)
	}
	algorithmEnv := getEnvOrDefault("ALGORITHM", "all")
	similarityEnv := getEnvOrDefault("SIMILARITY", "COS")
	searchQuery := "quintessential lodging near running trails, eateries, retail"

	targets, err := getTargetCollections(algorithmEnv, similarityEnv)
	if err != nil {
		log.Fatal(err)
	}

	collectionNames := []string{}
	for _, t := range targets {
		collectionNames = append(collectionNames, t.CollectionName)
	}

	fmt.Println("\nVector Algorithm Comparison")
	fmt.Printf("   Database: %s\n", dbName)
	fmt.Printf("   Algorithms: %s\n", algorithmEnv)
	fmt.Printf("   Similarity: %s\n", similarityEnv)
	fmt.Printf("   Collections to query: %s\n", strings.Join(collectionNames, ", "))
	fmt.Printf("   Search query: \"%s\"\n\n", searchQuery)

	fmt.Println("Initializing MongoDB and Azure OpenAI clients...")
	mongoClient, azureOpenAIClient, err := getClientsPasswordless()
	if err != nil {
		log.Fatalf("Failed to initialize clients: %v", err)
	}
	defer mongoClient.Disconnect(context.Background())

	db := mongoClient.Database(dbName)

	fmt.Printf("Loading data from %s...\n", dataFile)
	data, err := readFileReturnJSON(dataFile)
	if err != nil {
		log.Fatalf("Failed to load data: %v", err)
	}
	fmt.Printf("Loaded %d documents\n", len(data))

	fmt.Println("Generating query embedding...")
	queryEmbedding, err := generateEmbedding(ctx, azureOpenAIClient, searchQuery, deployment)
	if err != nil {
		log.Fatalf("Failed to generate embedding: %v", err)
	}
	if len(queryEmbedding) != embeddingDimensions {
		log.Fatalf("Embedding dimension mismatch: expected %d, got %d. Verify EMBEDDING_DIMENSIONS matches your model.", embeddingDimensions, len(queryEmbedding))
	}
	fmt.Printf("Query embedding: %d dimensions\n\n", len(queryEmbedding))

	comparisonResults := []ComparisonResult{}

	for _, target := range targets {
		fmt.Printf("\n━━━ %s / %s ━━━\n", AlgorithmLabels[target.Algorithm], target.Similarity)
		fmt.Printf("Collection: %s\n", target.CollectionName)

		if err := db.Collection(target.CollectionName).Drop(ctx); err != nil {
			log.Printf("Warning: failed to drop collection %s: %v (may not exist)", target.CollectionName, err)
		}

		collection := db.Collection(target.CollectionName)
		fmt.Printf("Created collection: %s\n", target.CollectionName)

		inserted, failed, err := insertData(ctx, collection, data, batchSize)
		if err != nil {
			fmt.Printf("Error inserting data: %v\n", err)
			continue
		}
		fmt.Printf("Inserted: %d/%d\n", inserted, len(data))
		if failed > 0 {
			fmt.Printf("Failed: %d\n", failed)
		}

		indexName := fmt.Sprintf("vectorIndex_%s_%s", target.Algorithm, strings.ToLower(string(target.Similarity)))
		indexOptions := getIndexOptions(
			target.CollectionName,
			indexName,
			embeddedField,
			embeddingDimensions,
			target.Algorithm,
			target.Similarity,
		)

		var result bson.M
		err = db.RunCommand(ctx, indexOptions).Decode(&result)
		if err != nil {
			fmt.Printf("Error creating vector index: %v\n", err)
			continue
		}
		fmt.Printf("Created vector index: %s\n", indexName)

		fmt.Println("Executing vector search...")
		startTime := time.Now()

		pipeline := getSearchPipeline(queryEmbedding, embeddedField, 5, target.Algorithm)
		cursor, err := collection.Aggregate(ctx, pipeline)
		if err != nil {
			fmt.Printf("Error performing vector search: %v\n", err)
			continue
		}

		var searchResults []SearchResult
		for cursor.Next(ctx) {
			var result SearchResult
			if err := cursor.Decode(&result); err != nil {
				fmt.Printf("Warning: Could not decode result: %v\n", err)
				continue
			}
			searchResults = append(searchResults, result)
		}
		cursor.Close(ctx)

		latencyMs := time.Since(startTime).Milliseconds()

		comparisonResults = append(comparisonResults, ComparisonResult{
			CollectionName: target.CollectionName,
			Algorithm:      AlgorithmLabels[target.Algorithm],
			Similarity:     string(target.Similarity),
			SearchResults:  searchResults,
			LatencyMs:      latencyMs,
		})

		fmt.Printf("[OK] %d results, %dms\n", len(searchResults), latencyMs)
	}

	if len(comparisonResults) > 0 {
		printComparisonTable(comparisonResults)
	}

	fmt.Println("\nDone.")
}
