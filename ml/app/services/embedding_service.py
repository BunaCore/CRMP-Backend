"""
Singleton Embedding Service — CRMP RAG Pipeline
================================================

Provides a centralized, reusable embedding interface for all RAG components.

Architecture Decision: Singleton Pattern
-----------------------------------------
Transformer models consume 200-500MB of GPU/CPU memory. Loading multiple instances
(one per service) would waste memory and slow startup. A singleton ensures exactly
one model instance is shared across the chunker, vector store, and retrieval pipeline.

Model Selection: BAAI/bge-small-en-v1.5
-----------------------------------------
- Specifically trained for **retrieval** tasks (not just semantic similarity)
- Uses instruction-based encoding: queries get a prefix to distinguish them from documents
- 384 dimensions — same as MiniLM, so no memory penalty vs. the fallback model
- Scores 3-5% higher on MTEB retrieval benchmarks (nDCG@10) than all-MiniLM-L6-v2
- Falls back to all-MiniLM-L6-v2 if BGE fails to download (e.g., air-gapped environments)

Why Not Larger Models?
-----------------------
- bge-base (768-dim) and bge-large (1024-dim) offer diminishing returns (+1-2% accuracy)
  at 2-4x memory cost and 3-5x slower encoding. For a research management platform
  with <100K chunks, bge-small is the optimal accuracy-per-FLOP choice.
"""

import logging
import threading
from typing import List, Union

import numpy as np

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Thread-safe singleton embedding service using SentenceTransformers.
    
    Implements the bi-encoder paradigm: queries and documents are encoded
    independently into the same vector space. This enables pre-computation
    of document embeddings and sub-millisecond retrieval via approximate
    nearest neighbor search (FAISS).
    
    Usage:
        service = EmbeddingService.get_instance()
        doc_vectors = service.embed_documents(["chunk 1", "chunk 2"])
        query_vector = service.embed_query("What is CRISPR?")
    """

    _instance = None
    _lock = threading.Lock()

    # BGE models use an instruction prefix for queries to improve retrieval quality.
    # Documents are encoded without prefix. This asymmetry is by design —
    # queries are short and intent-driven, documents are long and informational.
    QUERY_PREFIX = "Represent this sentence: "
    PRIMARY_MODEL = "BAAI/bge-small-en-v1.5"
    FALLBACK_MODEL = "all-MiniLM-L6-v2"

    def __init__(self):
        """Private constructor — use get_instance() instead."""
        from sentence_transformers import SentenceTransformer

        try:
            logger.info(f"Loading primary embedding model: {self.PRIMARY_MODEL}")
            self.model = SentenceTransformer(self.PRIMARY_MODEL)
            self.model_name = self.PRIMARY_MODEL
            self._uses_query_prefix = True
            logger.info(f"✅ Loaded {self.PRIMARY_MODEL} (dim={self.dimension})")
        except Exception as e:
            logger.warning(
                f"Failed to load {self.PRIMARY_MODEL}: {e}. "
                f"Falling back to {self.FALLBACK_MODEL}"
            )
            self.model = SentenceTransformer(self.FALLBACK_MODEL)
            self.model_name = self.FALLBACK_MODEL
            self._uses_query_prefix = False
            logger.info(f"✅ Loaded fallback {self.FALLBACK_MODEL} (dim={self.dimension})")

    @classmethod
    def get_instance(cls) -> "EmbeddingService":
        """
        Returns the singleton instance, creating it on first call.
        
        Thread-safe via double-checked locking pattern — prevents
        multiple threads from racing to create separate model instances
        during concurrent FastAPI request handling.
        """
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def dimension(self) -> int:
        """Returns the embedding dimensionality (384 for both BGE-small and MiniLM)."""
        return self.model.get_sentence_embedding_dimension()

    def embed_documents(
        self,
        texts: List[str],
        batch_size: int = 64,
        normalize: bool = True,
    ) -> np.ndarray:
        """
        Encodes document chunks into dense vectors.
        
        Documents are encoded WITHOUT the query prefix because they represent
        static informational content, not user intent.
        
        Args:
            texts: List of document chunk strings.
            batch_size: Number of texts to encode per forward pass.
                        64 is optimal for CPU inference — balances throughput
                        with memory. GPU users can increase to 256-512.
            normalize: If True, L2-normalize vectors for cosine similarity.
                       Required when using FAISS IndexFlatIP (inner product = cosine
                       when vectors are unit-length).
        
        Returns:
            np.ndarray of shape (len(texts), dimension), dtype float32.
        """
        if not texts:
            return np.array([], dtype=np.float32).reshape(0, self.dimension)

        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=len(texts) > 100,
            convert_to_numpy=True,
            normalize_embeddings=normalize,
        )
        return embeddings.astype(np.float32)

    def embed_query(self, query: str, normalize: bool = True) -> np.ndarray:
        """
        Encodes a single user query into a dense vector.
        
        For BGE models, prepends the instruction prefix to distinguish
        query intent from document content. This asymmetric encoding is
        a key innovation of instruction-tuned retrievers — it allows the
        model to map "What causes cancer?" close to "Oncogenesis is the
        process by which..." in vector space, even though the surface
        forms are very different.
        
        Args:
            query: The user's natural language question.
            normalize: If True, L2-normalize for cosine similarity.
        
        Returns:
            np.ndarray of shape (1, dimension), dtype float32.
        """
        text = f"{self.QUERY_PREFIX}{query}" if self._uses_query_prefix else query

        embedding = self.model.encode(
            [text],
            convert_to_numpy=True,
            normalize_embeddings=normalize,
        )
        return embedding.astype(np.float32)

    def embed_queries(
        self,
        queries: List[str],
        batch_size: int = 32,
        normalize: bool = True,
    ) -> np.ndarray:
        """Batch-encodes multiple queries. Used for evaluation/benchmarking."""
        if not queries:
            return np.array([], dtype=np.float32).reshape(0, self.dimension)

        texts = [
            f"{self.QUERY_PREFIX}{q}" if self._uses_query_prefix else q
            for q in queries
        ]
        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            convert_to_numpy=True,
            normalize_embeddings=normalize,
        )
        return embeddings.astype(np.float32)
