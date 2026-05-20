using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace SelectAlgorithm.Models;

public class HotelData
{
    [BsonId]
    [BsonRepresentation(BsonType.ObjectId)]
    public string? Id { get; set; }
    
    public string HotelId { get; set; } = string.Empty;
    public string HotelName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    
    [BsonExtraElements]
    public BsonDocument? ExtraElements { get; set; }
}
