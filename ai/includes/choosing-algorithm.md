### Choosing the right algorithm

> [!IMPORTANT]
> For production workloads, start with **DiskANN** on an M30+ cluster. DiskANN supports higher embedding dimensions, uses less cluster memory, and is less likely to require an index redesign as your models evolve.

Use this quick-reference table to select the right algorithm for your workload:

| Scenario | Algorithm | Cluster tier | Max dimensions |
|----------|-----------|--------------|----------------|
| Dev/test, demos, small datasets | **IVF** | Any (free tier OK) | 2,000 |
| Production (default) | **DiskANN** | M30+ | 16,000 |
| Production (max recall priority) | **HNSW** | M30+ | 8,000 |

**IVF** (inverted file index):
- Best for: Test environments, demos, and small clusters
- Pros: Fast to build, low resource requirements, works on any cluster tier
- Cons: Lower recall compared to graph-based algorithms at scale
- Tune: Increase `numLists` for larger datasets, increase `nProbes` for better recall

**DiskANN** (disk-based approximate nearest neighbor) — *recommended for production*:
- Best for: Production workloads on M30+ clusters
- Pros: Supports embeddings up to 16,000 dimensions, keeps most index data on disk freeing cluster memory for reads and writes, lighter index updates, easier backups, faster recovery
- Cons: Requires M30+ cluster tier
- Tune: Increase `maxDegree` and `lBuild` for better accuracy, increase `lSearch` for better recall
- Why default: As embedding models evolve (some already exceed 8,000 dimensions), DiskANN avoids costly index redesigns. Its disk-based architecture also means your cluster memory stays available for operational workloads rather than index storage.

**HNSW** (hierarchical navigable small world):
- Best for: Production workloads on M30+ clusters where maximum recall is the top priority
- Pros: Excellent recall, fast queries
- Cons: Requires M30+ cluster tier, supports embeddings up to 8,000 dimensions (vs 16,000 for DiskANN), higher memory usage since the full graph lives in RAM
- Tune: Increase `m` and `efConstruction` for better index quality, increase `efSearch` for better recall

### Choosing the right similarity function

| Function | Score meaning | Best for |
|----------|-------------|----------|
| **COS (Cosine)** | Higher = more similar (0–1) | Text embeddings (normalized vectors) |
| **L2 (Euclidean)** | Lower = more similar (distance) | When magnitude matters |
| **IP (Inner Product)** | Higher = more similar | Equivalent to COS for normalized vectors |

For the `text-embedding-3-small` model used in this quickstart, **COS (cosine similarity) is recommended** because OpenAI embeddings are normalized and optimized for cosine similarity.
