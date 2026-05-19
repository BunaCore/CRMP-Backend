"""
BM25 Keyword Retriever — CRMP RAG Pipeline
============================================

Implements Okapi BM25 keyword-based retrieval as the sparse retrieval
component of the hybrid search pipeline.

Why BM25 Over TF-IDF?
-----------------------
Both are bag-of-words retrieval methods, but BM25 has two critical improvements:

1. **Term Frequency Saturation**: TF-IDF scores grow linearly with term frequency —
   a document mentioning "biology" 50 times scores 50x higher than one mentioning
   it twice. BM25 uses a logarithmic saturation curve (controlled by parameter k1),
   so the score plateaus after a few mentions. This prevents bibliography-heavy
   academic papers from dominating results just because they repeat keywords.

2. **Document Length Normalization**: TF-IDF penalizes long documents because term
   frequencies are diluted. BM25's `b` parameter explicitly normalizes by document
   length relative to the corpus average, giving fair treatment to both abstracts
   (short) and full papers (long).

Why Keep Keywords at All?
--------------------------
Dense semantic retrieval (FAISS + BGE) excels at paraphrased queries and conceptual
matching. But it can miss exact terminology:
- Query "CRISPR-Cas9" → semantic model might retrieve "gene editing" papers broadly
- BM25 will precisely find documents containing the exact term "CRISPR-Cas9"

Combining both in a hybrid approach gives maximum recall.

Persistence
------------
The BM25 corpus (tokenized documents) is serialized to JSON for persistence.
On restart, it's rebuilt from the stored tokens rather than re-tokenizing from
raw text — this keeps startup fast and consistent with the FAISS metadata.
"""

import json
import logging
import os
import re
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class BM25Retriever:
    """
    Persistent BM25 keyword retriever with add/search/delete support.

    Uses the rank_bm25 library for scoring but wraps it with persistence,
    metadata tracking, and normalized score output.

    Args:
        persist_dir: Directory for saving the tokenized corpus.
        corpus_filename: Name of the persistence file.
    """

    def __init__(
        self,
        persist_dir: str,
        corpus_filename: str = "bm25_corpus.json",
    ):
        self.persist_dir = persist_dir
        self.corpus_path = os.path.join(persist_dir, corpus_filename)

        self._tokenized_corpus: List[List[str]] = []
        self._metadata: List[dict] = []
        self._bm25 = None

        self._load()

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        """
        Simple whitespace tokenizer with lowercasing and punctuation removal.

        We intentionally keep this simple rather than using NLTK/spaCy because:
        1. BM25 is the secondary retrieval signal (30% weight) — marginal
           tokenization improvements have negligible impact on final hybrid scores.
        2. No external dependencies required for tokenization.
        3. Fast: ~1M tokens/second on commodity hardware.
        """
        text = text.lower()
        text = re.sub(r"[^\w\s]", " ", text)
        return [token for token in text.split() if len(token) > 1]

    def _build_index(self):
        """Rebuilds the BM25 index from the tokenized corpus."""
        if not self._tokenized_corpus:
            self._bm25 = None
            return

        from rank_bm25 import BM25Okapi
        self._bm25 = BM25Okapi(self._tokenized_corpus)
        logger.debug(f"Built BM25 index with {len(self._tokenized_corpus)} documents")

    def _load(self):
        """Loads persisted tokenized corpus from disk."""
        try:
            if os.path.exists(self.corpus_path):
                with open(self.corpus_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._tokenized_corpus = data.get("corpus", [])
                    self._metadata = data.get("metadata", [])

                self._build_index()
                logger.info(f"Loaded BM25 corpus: {len(self._tokenized_corpus)} documents")
            else:
                logger.info("No existing BM25 corpus found — will create on first add()")
        except Exception as e:
            logger.error(f"Failed to load BM25 corpus: {e}")
            self._tokenized_corpus = []
            self._metadata = []
            self._bm25 = None

    def _save(self):
        """Persists the tokenized corpus to disk."""
        try:
            os.makedirs(self.persist_dir, exist_ok=True)
            with open(self.corpus_path, "w", encoding="utf-8") as f:
                json.dump({
                    "corpus": self._tokenized_corpus,
                    "metadata": self._metadata,
                }, f, ensure_ascii=False)
            logger.debug(f"Saved BM25 corpus ({len(self._tokenized_corpus)} documents)")
        except Exception as e:
            logger.error(f"Failed to save BM25 corpus: {e}")

    def add(self, texts: List[str], metadata_list: List[dict]):
        """
        Adds documents to the BM25 corpus.

        Args:
            texts: List of chunk text strings.
            metadata_list: List of metadata dicts (must match texts in length).
        """
        if not texts:
            return

        new_tokens = [self._tokenize(text) for text in texts]
        self._tokenized_corpus.extend(new_tokens)
        self._metadata.extend(metadata_list)
        self._build_index()
        self._save()

        logger.info(f"Added {len(texts)} documents to BM25 → total: {len(self._tokenized_corpus)}")

    def search(
        self,
        query: str,
        top_k: int = 10,
    ) -> List[Tuple[dict, float]]:
        """
        Searches the BM25 index for matching documents.

        Scores are min-max normalized to [0, 1] for compatibility with
        the hybrid retriever's score fusion logic.

        Args:
            query: User's search query.
            top_k: Number of results to return.

        Returns:
            List of (metadata_dict, normalized_score) tuples.
        """
        if self._bm25 is None or not self._tokenized_corpus:
            return []

        tokenized_query = self._tokenize(query)
        if not tokenized_query:
            return []

        raw_scores = self._bm25.get_scores(tokenized_query)

        # Min-max normalize to [0, 1] for fusion compatibility
        max_score = float(max(raw_scores)) if max(raw_scores) > 0 else 1.0
        min_score = float(min(raw_scores))
        score_range = max_score - min_score if max_score > min_score else 1.0

        scored_indices = [
            (i, (float(raw_scores[i]) - min_score) / score_range)
            for i in range(len(raw_scores))
            if raw_scores[i] > 0
        ]

        # Sort by normalized score descending
        scored_indices.sort(key=lambda x: x[1], reverse=True)

        results = []
        for idx, score in scored_indices[:top_k]:
            if 0 <= idx < len(self._metadata):
                results.append((self._metadata[idx], score))

        return results

    def delete_by_doc_id(self, document_id: str) -> int:
        """
        Removes all entries for a document and rebuilds the index.

        Args:
            document_id: UUID of the document to remove.

        Returns:
            Number of entries removed.
        """
        keep_indices = [
            i for i, m in enumerate(self._metadata)
            if m.get("document_id") != document_id
        ]
        removed = len(self._metadata) - len(keep_indices)

        if removed == 0:
            return 0

        self._tokenized_corpus = [self._tokenized_corpus[i] for i in keep_indices]
        self._metadata = [self._metadata[i] for i in keep_indices]
        self._build_index()
        self._save()

        logger.info(f"Removed {removed} BM25 entries for doc {document_id[:8]}...")
        return removed

    @property
    def total_documents(self) -> int:
        return len(self._tokenized_corpus)
