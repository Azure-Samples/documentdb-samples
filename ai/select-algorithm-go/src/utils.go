package main

import (
	"context"
	"encoding/json"
	"fmt"
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

// Config holds the application configuration
type Config struct {
	ClusterName  string
	DatabaseName string
	DataFile     string
	VectorField  string
	ModelName    string
	Dimensions   int
	BatchSize    int
	Similarity   string
	Algorithm    string
}

// SearchResult represents a search result document
type SearchResult struct {
	Document interface{} `bson:"document"`
	Score    float64     `bson:"score"`
}

// InsertStats holds statistics about data insertion
type InsertStats struct {
	Total    int `json:"total"`
	Inserted int `json:"inserted"`
	Failed   int `json:"failed"`
}

// LoadConfig loads configuration from environment variables
func LoadConfig() (*Config, error) {
	dimensions, err := parsePositiveIntEnv("EMBEDDING_DIMENSIONS", "1536")
	if err != nil {
		return nil, err
	}

	batchSize, err := parsePositiveIntEnv("LOAD_SIZE_BATCH", "100")
	if err != nil {
		return nil, err
	}

	return &Config{
		ClusterName:  getEnvOrDefault("DOCUMENTDB_CLUSTER_NAME", ""),
		DatabaseName: getEnvOrDefault("AZURE_DOCUMENTDB_DATABASENAME", "Hotels"),
		DataFile:     getEnvOrDefault("DATA_FILE_WITH_VECTORS", "data/Hotels_Vector.json"),
		VectorField:  getEnvOrDefault("EMBEDDED_FIELD", "DescriptionVector"),
		ModelName:    getEnvOrDefault("AZURE_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
		Dimensions:   dimensions,
		BatchSize:    batchSize,
		Similarity:   getEnvOrDefault("SIMILARITY", ""),
		Algorithm:    strings.ToLower(getEnvOrDefault("ALGORITHM", "")),
	}, nil
}

func parsePositiveIntEnv(key, defaultValue string) (int, error) {
	value := getEnvOrDefault(key, defaultValue)
	parsedValue, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be a positive integer, got %q", key, value)
	}
	if parsedValue <= 0 {
		return 0, fmt.Errorf("%s must be greater than 0, got %q", key, value)
	}
	return parsedValue, nil
}

// getEnvOrDefault returns environment variable value or default if not set
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// GetClientsPasswordless creates MongoDB and Azure OpenAI clients with passwordless authentication
func GetClientsPasswordless(ctx context.Context, config *Config) (*mongo.Client, openai.Client, error) {
	if config.ClusterName == "" {
		return nil, openai.Client{}, fmt.Errorf("DOCUMENTDB_CLUSTER_NAME environment variable is required")
	}

	// Create Azure credential
	credential, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		return nil, openai.Client{}, fmt.Errorf("failed to create Azure credential: %v", err)
	}

	// Connect to DocumentDB with OIDC authentication
	mongoURI := fmt.Sprintf("mongodb+srv://%s.global.mongocluster.cosmos.azure.com/", config.ClusterName)

	fmt.Println("Attempting OIDC authentication...")
	mongoClient, err := connectWithOIDC(ctx, mongoURI, credential)
	if err != nil {
		return nil, openai.Client{}, fmt.Errorf("OIDC authentication failed: %v", err)
	}
	fmt.Println("OIDC authentication successful!")

	// Get Azure OpenAI endpoint
	azureOpenAIEndpoint := os.Getenv("AZURE_OPENAI_EMBEDDING_ENDPOINT")
	if azureOpenAIEndpoint == "" {
		return nil, openai.Client{}, fmt.Errorf("AZURE_OPENAI_EMBEDDING_ENDPOINT environment variable is required")
	}

	// Create Azure OpenAI client with credential-based authentication
	openAIClient := openai.NewClient(
		option.WithBaseURL(fmt.Sprintf("%s/openai/v1", azureOpenAIEndpoint)),
		azure.WithTokenCredential(credential))

	return mongoClient, openAIClient, nil
}

// connectWithOIDC attempts to connect using OIDC authentication
func connectWithOIDC(ctx context.Context, mongoURI string, credential *azidentity.DefaultAzureCredential) (*mongo.Client, error) {
	oidcCallback := func(ctx context.Context, args *options.OIDCArgs) (*options.OIDCCredential, error) {
		scope := "https://ossrdbms-aad.database.windows.net/.default"
		fmt.Printf("Getting token with scope: %s\n", scope)
		token, err := credential.GetToken(ctx, policy.TokenRequestOptions{
			Scopes: []string{scope},
		})
		if err != nil {
			return nil, fmt.Errorf("failed to get token with scope %s: %v", scope, err)
		}

		fmt.Printf("Successfully obtained token\n")

		return &options.OIDCCredential{
			AccessToken: token.Token,
		}, nil
	}

	clientOptions := options.Client().
		ApplyURI(mongoURI).
		SetConnectTimeout(30 * time.Second).
		SetServerSelectionTimeout(30 * time.Second).
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
		return nil, err
	}

	return mongoClient, nil
}

// ReadFileReturnJSON reads a JSON file and returns the data as a slice of maps
func ReadFileReturnJSON(filePath string) ([]map[string]interface{}, error) {
	file, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("error reading file '%s': %v", filePath, err)
	}

	var data []map[string]interface{}
	err = json.Unmarshal(file, &data)
	if err != nil {
		return nil, fmt.Errorf("error parsing JSON in file '%s': %v", filePath, err)
	}

	return data, nil
}

// InsertData inserts data into a MongoDB collection in batches
func InsertData(ctx context.Context, collection *mongo.Collection, data []map[string]interface{}, batchSize int) (*InsertStats, error) {
	totalDocuments := len(data)
	insertedCount := 0
	failedCount := 0

	fmt.Printf("Starting batch insertion of %d documents...\n", totalDocuments)

	for i := 0; i < totalDocuments; i += batchSize {
		end := i + batchSize
		if end > totalDocuments {
			end = totalDocuments
		}

		batch := data[i:end]
		batchNum := (i / batchSize) + 1

		documents := make([]interface{}, len(batch))
		for j, doc := range batch {
			documents[j] = doc
		}

		result, err := collection.InsertMany(ctx, documents, options.InsertMany().SetOrdered(false))
		if err != nil {
			if bulkErr, ok := err.(mongo.BulkWriteException); ok {
				errorCount := len(bulkErr.WriteErrors)
				insertedCount += len(batch) - errorCount
				failedCount += errorCount
				fmt.Printf("Batch %d had errors: %d inserted, %d failed\n", batchNum, len(batch)-errorCount, errorCount)
				for _, writeErr := range bulkErr.WriteErrors {
					fmt.Printf("  Error: %s\n", writeErr.Message)
				}
			} else {
				failedCount += len(batch)
				fmt.Printf("Batch %d failed completely: %v\n", batchNum, err)
			}
		} else {
			insertedCount += len(result.InsertedIDs)
			fmt.Printf("Batch %d completed: %d documents inserted\n", batchNum, len(result.InsertedIDs))
		}

		time.Sleep(100 * time.Millisecond)
	}

	return &InsertStats{
		Total:    totalDocuments,
		Inserted: insertedCount,
		Failed:   failedCount,
	}, nil
}

// DropVectorIndexes drops existing vector indexes on the specified field
func DropVectorIndexes(ctx context.Context, collection *mongo.Collection, vectorField string) error {
	cursor, err := collection.Indexes().List(ctx)
	if err != nil {
		return fmt.Errorf("could not list indexes: %v", err)
	}
	defer cursor.Close(ctx)

	var vectorIndexes []string
	for cursor.Next(ctx) {
		var index bson.M
		if err := cursor.Decode(&index); err != nil {
			continue
		}

		if key, ok := index["key"].(bson.M); ok {
			if indexType, exists := key[vectorField]; exists && indexType == "cosmosSearch" {
				if name, ok := index["name"].(string); ok {
					vectorIndexes = append(vectorIndexes, name)
				}
			}
		}
	}

	for _, indexName := range vectorIndexes {
		fmt.Printf("Dropping existing vector index: %s\n", indexName)
		_, err := collection.Indexes().DropOne(ctx, indexName)
		if err != nil {
			fmt.Printf("Warning: Could not drop index %s: %v\n", indexName, err)
		}
	}

	if len(vectorIndexes) > 0 {
		fmt.Printf("Dropped %d existing vector index(es)\n", len(vectorIndexes))
	} else {
		fmt.Println("No existing vector indexes found to drop")
	}

	return nil
}

// PerformVectorSearch performs a vector search using the cosmosSearch aggregation pipeline
func PerformVectorSearch(ctx context.Context, collection *mongo.Collection, client openai.Client, query, vectorField, model string, topK int) ([]SearchResult, error) {
	fmt.Printf("Performing vector search for: '%s'\n", query)

	queryEmbedding, err := GenerateEmbedding(ctx, client, query, model)
	if err != nil {
		return nil, fmt.Errorf("error generating embedding: %v", err)
	}

	pipeline := []bson.M{
		{
			"$search": bson.M{
				"cosmosSearch": bson.M{
					"vector": queryEmbedding,
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
		return nil, fmt.Errorf("error performing vector search: %v", err)
	}
	defer cursor.Close(ctx)

	var results []SearchResult
	for cursor.Next(ctx) {
		var result SearchResult
		if err := cursor.Decode(&result); err != nil {
			fmt.Printf("Warning: Could not decode result: %v\n", err)
			continue
		}
		results = append(results, result)
	}

	if err := cursor.Err(); err != nil {
		return nil, fmt.Errorf("cursor error: %v", err)
	}

	return results, nil
}

// GenerateEmbedding generates an embedding for the given text using Azure OpenAI
func GenerateEmbedding(ctx context.Context, client openai.Client, text, modelName string) ([]float64, error) {
	resp, err := client.Embeddings.New(ctx, openai.EmbeddingNewParams{
		Input: openai.EmbeddingNewParamsInputUnion{
			OfString: openai.String(text),
		},
		Model: modelName,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate embedding: %v", err)
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

// PrintSearchResults prints search results in a formatted way
func PrintSearchResults(results []SearchResult, algorithm string) {
	if len(results) == 0 {
		fmt.Println("No search results found.")
		return
	}

	fmt.Printf("\n%s Search Results (top %d):\n", strings.ToUpper(algorithm), len(results))
	fmt.Println(strings.Repeat("=", 80))

	for i, result := range results {
		doc := result.Document.(bson.D)
		var hotelName string
		for _, elem := range doc {
			if elem.Key == "HotelName" {
				hotelName = fmt.Sprintf("%v", elem.Value)
				break
			}
		}

		fmt.Printf("%d. HotelName: %s, Score: %.4f\n", i+1, hotelName, result.Score)
	}
}

// FilterDocumentsWithEmbeddings returns only documents that contain the vector field
func FilterDocumentsWithEmbeddings(data []map[string]interface{}, vectorField string) []map[string]interface{} {
	var filtered []map[string]interface{}
	for _, doc := range data {
		if _, exists := doc[vectorField]; exists {
			filtered = append(filtered, doc)
		}
	}
	return filtered
}

// PrepareCollection clears existing data and inserts new documents
func PrepareCollection(ctx context.Context, collection *mongo.Collection, data []map[string]interface{}, batchSize int) (*InsertStats, error) {
	fmt.Printf("Preparing collection '%s'...\n", collection.Name())

	deleteResult, err := collection.DeleteMany(ctx, bson.M{})
	if err != nil {
		return nil, fmt.Errorf("failed to clear existing data: %v", err)
	}
	if deleteResult.DeletedCount > 0 {
		fmt.Printf("Cleared %d existing documents from collection\n", deleteResult.DeletedCount)
	}

	stats, err := InsertData(ctx, collection, data, batchSize)
	if err != nil {
		return nil, fmt.Errorf("failed to insert data: %v", err)
	}

	return stats, nil
}
