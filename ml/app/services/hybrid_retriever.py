"""
Hybrid Retriever with Cross-Encoder Reranking — CRMP RAG Pipeline
===================================================================

Orchestrates the full retrieval pipeline:

    Query → [Semantic Search (FAISS)] → top-N candidates
          → [Keyword Search (BM25)]   → top-N candidates
          → Reciprocal score fusion
          → [Cross-Encoder Reranking]  → top-K final results

Why Hybrid Retrieval?
----------------------
No single retrieval method is universally best:

| Method     | Strengths                          | Weaknesses                         |
|------------|------------------------------------|------------------------------------|
| Semantic   | Paraphrase, conceptual matching    | Misses exact terms (CRISPR-Cas9)   |
| Keyword    | Exact term matching, abbreviations | Misses synonyms, paraphrases       |
| **Hybrid** | **Best of both**                   | Slightly more compute (negligible) |

Empirical evidence (Karpukhin et al., 2020; Ma et al., 2021) consistently shows
hybrid retrieval outperforms either method alone by 5-15% on passage retrieval
benchmarks, especially on domain-specific corpora like academic papers where
both exact terminology and conceptual understanding matter.

Score Fusion Strategy
----------------------
We use weighted linear combination:
    final_score = α * semantic_score + (1 - α) * keyword_score

With α = 0.7 (semantic-heavy) because:
1. Academic queries are often conceptual ("How does X affect Y?")
2. Semantic scores from BGE are well-calibrated on academic text
3. BM25 catches the 20-30% of queries that need exact term matching

Cross-Encoder Reranking
------------------------
Bi-encoders (BGE) encode query and document independently — fast but approximate
because they can't model fine-grained query-document interactions.

Cross-encoders process (query, document) pairs through full Transformer attention,
enabling token-level interaction. This gives dramatically better relevance
estimation but is 100x slower (can't be pre-computed).

The standard architecture is:
1. Bi-encoder retrieves top 20-50 candidates (fast, approximate)
2. Cross-encoder reranks only those candidates (slow, accurate)

This gives us the accuracy of cross-encoders at the speed of bi-encoders.

Model: cross-encoder/ms-marco-MiniLM-L-6-v2 (22M params, ~5ms per pair on CPU)
"""

import logging
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class HybridRetriever:
    """
    Hybrid retrieval pipeline combining semantic and keyword search
    with optional cross-encoder reranking.

    Args:
        vector_store: VectorStore instance for semantic search.
        bm25_retriever: BM25Retriever instance for keyword search.
        embedding_service: EmbeddingService instance for query encoding.
        semantic_weight: Weight for semantic scores in fusion (default: 0.7).
        keyword_weight: Weight for keyword scores in fusion (default: 0.3).
        use_reranker: Whether to apply cross-encoder reranking.
        reranker_model: HuggingFace model ID for the cross-encoder.
    """

    def __init__(
        self,
        vector_store,
        bm25_retriever,
        embedding_service,
        semantic_weight: float = 0.7,
        keyword_weight: float = 0.3,
        use_reranker: bool = True,
        reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2",
    ):
        self.vector_store = vector_store
        self.bm25_retriever = bm25_retriever
        self.embedding_service = embedding_service
        self.semantic_weight = semantic_weight
        self.keyword_weight = keyword_weight
        self.use_reranker = use_reranker
        self.reranker_model_name = reranker_model

        # Lazy-loaded cross-encoder (saves ~2s on startup if not used)
        self._reranker = None

    def _get_reranker(self):
        """
        Lazy-loads the cross-encoder model on first use.

        Why lazy loading?
        - The cross-encoder adds ~200MB memory and ~2s load time
        - Not all queries need reranking (simple keyword queries don't benefit)
        - Keeps FastAPI startup fast (<3s)
        """
        if self._reranker is None:
            try:
                from sentence_transformers import CrossEncoder
                logger.info(f"Loading cross-encoder: {self.reranker_model_name}")
                self._reranker = CrossEncoder(self.reranker_model_name)
                logger.info(f"✅ Cross-encoder loaded: {self.reranker_model_name}")
            except Exception as e:
                logger.warning(f"Failed to load cross-encoder: {e}. Reranking disabled.")
                self.use_reranker = False
                self._reranker = None
        return self._reranker

    def retrieve(
        self,
        query: str,
        top_k: int = 5,
        initial_candidates: int = 20,
        doc_ids: Optional[List[str]] = None,
    ) -> List[Dict]:
        """
        Full hybrid retrieval pipeline.

        Pipeline stages:
        1. Semantic search (FAISS) → top initial_candidates
        2. Keyword search (BM25) → top initial_candidates
        3. Score fusion → merged ranked list
        4. Optional cross-encoder reranking → top_k final results

        Args:
            query: User's natural language question.
            top_k: Number of final results to return.
            initial_candidates: Number of candidates from each retrieval method.
                                Higher values improve reranker quality but cost more.
            doc_ids: Optional filter — only return chunks from these documents.

        Returns:
            List of result dicts with keys:
            - text, document_id, filename, page_number, chunk_index
            - semantic_score, keyword_score, fused_score, final_score
        """
        if not query.strip():
            return []

        # ── Stage 1: Semantic retrieval (FAISS) ──
        query_vec = self.embedding_service.embed_query(query)
        semantic_results = self.vector_store.search(query_vec, top_k=initial_candidates)

        # ── Stage 2: Keyword retrieval (BM25) ──
        keyword_results = self.bm25_retriever.search(query, top_k=initial_candidates)

        # ── Stage 3: Score fusion ──
        # Build a unified candidate pool keyed by (document_id, chunk_index)
        candidates: Dict[str, Dict] = {}

        for meta, score in semantic_results:
            key = f"{meta.get('document_id', '')}_{meta.get('chunk_index', 0)}"
            if key not in candidates:
                candidates[key] = {
                    **meta,
                    "semantic_score": 0.0,
                    "keyword_score": 0.0,
                }
            # Cosine similarity from FAISS is in [-1, 1]; normalize to [0, 1]
            candidates[key]["semantic_score"] = max(0.0, (score + 1.0) / 2.0)

        for meta, score in keyword_results:
            key = f"{meta.get('document_id', '')}_{meta.get('chunk_index', 0)}"
            if key not in candidates:
                candidates[key] = {
                    **meta,
                    "semantic_score": 0.0,
                    "keyword_score": 0.0,
                }
            candidates[key]["keyword_score"] = score

        # Compute fused score
        for key, cand in candidates.items():
            cand["fused_score"] = (
                self.semantic_weight * cand["semantic_score"]
                + self.keyword_weight * cand["keyword_score"]
            )

        # Filter by document IDs if specified
        if doc_ids:
            doc_id_set = set(doc_ids)
            candidates = {
                k: v for k, v in candidates.items()
                if v.get("document_id") in doc_id_set
            }

        # Sort by fused score
        ranked = sorted(candidates.values(), key=lambda x: x["fused_score"], reverse=True)

        # ── Stage 4: Cross-encoder reranking (optional) ──
        if self.use_reranker and len(ranked) > 1:
            ranked = self._rerank(query, ranked, top_k)
        else:
            # Without reranking, fused score IS the final score
            for r in ranked:
                r["final_score"] = r["fused_score"]
            ranked = ranked[:top_k]

        return ranked

    def _rerank(self, query: str, candidates: List[Dict], top_k: int) -> List[Dict]:
        """
        Reranks candidates using a cross-encoder model.

        The cross-encoder processes each (query, candidate_text) pair through
        full Transformer attention, producing a relevance score that considers
        fine-grained token interactions between query and document.

        This is fundamentally more accurate than bi-encoder scoring because:
        - Bi-encoders: query and doc encoded separately → no cross-attention
        - Cross-encoders: query and doc encoded together → full cross-attention

        The tradeoff is speed: cross-encoders are ~100x slower per pair,
        which is why we only apply them to the top 20 fused candidates.

        Args:
            query: User's query string.
            candidates: Pre-filtered candidate list from score fusion.
            top_k: Number of results to return after reranking.

        Returns:
            Reranked list of candidate dicts with final_score set.
        """
        reranker = self._get_reranker()
        if reranker is None:
            for c in candidates:
                c["final_score"] = c["fused_score"]
            return candidates[:top_k]

        try:
            # Build (query, document) pairs for the cross-encoder
            pairs = [(query, cand.get("text", "")) for cand in candidates]

            # Score all pairs in a single batch
            rerank_scores = reranker.predict(pairs)

            # Assign reranker scores and sort
            for cand, score in zip(candidates, rerank_scores):
                cand["reranker_score"] = float(score)
                # Final score blends fused retrieval score with reranker score
                # 60% reranker (more accurate) + 40% retrieval (provides diversity)
                cand["final_score"] = 0.6 * float(score) + 0.4 * cand["fused_score"]

            candidates.sort(key=lambda x: x["final_score"], reverse=True)
            logger.debug(f"Reranked {len(candidates)} candidates → returning top {top_k}")

        except Exception as e:
            logger.warning(f"Reranking failed: {e}. Using fused scores.")
            for c in candidates:
                c["final_score"] = c["fused_score"]

        return candidates[:top_k]
