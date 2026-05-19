"""
RAG Service — CRMP Semantic Document Intelligence Pipeline
============================================================

This is the top-level orchestrator for the Retrieval-Augmented Generation system.
It coordinates document ingestion, semantic indexing, and hybrid retrieval to
answer natural language questions over uploaded research documents.

Architecture Overview
----------------------
The RAG service connects five sub-components:

1. **DocumentChunker** — Splits PDFs/text into sentence-boundary-aware chunks
2. **EmbeddingService** — Encodes chunks and queries using BGE-small-en-v1.5
3. **VectorStore** — Stores chunk embeddings in a persistent FAISS index
4. **BM25Retriever** — Keyword-based retrieval for exact term matching
5. **HybridRetriever** — Fuses semantic + keyword scores with cross-encoder reranking

Ingestion Pipeline:
    PDF/TXT → Chunker → [EmbeddingService → VectorStore] + [BM25Retriever]

Query Pipeline:
    Question → HybridRetriever → Context Assembly → Structured Response + Citations

Backward Compatibility
-----------------------
This rewrite maintains the exact same public interface as the original RAG service:
- process_pdf(file_bytes, filename) → {"document_id", "filename", "num_chunks"}
- process_text(file_bytes, filename) → {"document_id", "filename", "num_chunks"}
- chat(document_ids, query) → {"answer", "sources"}

All existing API routes and frontend calls continue to work without modification.
"""

import io
import logging
import os
import uuid
from typing import Dict, List, Optional

from PyPDF2 import PdfReader

from app.services.chunker import DocumentChunker
from app.services.embedding_service import EmbeddingService
from app.services.vector_store import VectorStore
from app.services.bm25_retriever import BM25Retriever
from app.services.hybrid_retriever import HybridRetriever

logger = logging.getLogger(__name__)

# Persistence directory — stored at ml/ root to avoid triggering
# uvicorn's file watcher on every index update
_PERSIST_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
    "rag_data"
)


class RAGService:
    """
    Production-grade RAG service with semantic retrieval, hybrid search,
    and cross-encoder reranking.

    This service is instantiated once at FastAPI startup and shared across
    all request handlers. All sub-components maintain persistent state on disk.
    """

    def __init__(self):
        logger.info("Initializing RAG Service with semantic pipeline...")

        # ── Sub-component initialization ──
        # Each component is independently persistent and recoverable

        self.chunker = DocumentChunker(
            chunk_size_tokens=600,    # Sweet spot for academic text
            overlap_tokens=120,       # ~20% overlap for cross-boundary context
            min_chunk_tokens=50,      # Merge runts to avoid low-information fragments
        )

        self.embedding_service = EmbeddingService.get_instance()

        self.vector_store = VectorStore(persist_dir=_PERSIST_DIR)

        self.bm25_retriever = BM25Retriever(persist_dir=_PERSIST_DIR)

        self.hybrid_retriever = HybridRetriever(
            vector_store=self.vector_store,
            bm25_retriever=self.bm25_retriever,
            embedding_service=self.embedding_service,
            semantic_weight=0.7,
            keyword_weight=0.3,
            use_reranker=True,
        )

        # Track document names for backward compatibility with old rag_store.json
        self._doc_names: Dict[str, str] = {}
        self._load_doc_names()

        logger.info(
            f"✅ RAG Service ready — "
            f"{self.vector_store.total_vectors} vectors across "
            f"{self.vector_store.total_documents} documents"
        )

    def _load_doc_names(self):
        """Reconstructs doc_names mapping from vector store metadata."""
        for meta in self.vector_store.metadata:
            doc_id = meta.get("document_id", "")
            filename = meta.get("filename", "")
            if doc_id and filename:
                self._doc_names[doc_id] = filename

    # ═══════════════════════════════════════════════════════════════════
    # DOCUMENT INGESTION
    # ═══════════════════════════════════════════════════════════════════

    def process_pdf(self, file_bytes: bytes, filename: str) -> dict:
        """
        Ingests a PDF document into the semantic index.

        Pipeline:
        1. Extract text page-by-page using PyPDF2
        2. Chunk with sentence-boundary-aware splitter
        3. Generate BGE embeddings for all chunks
        4. Index in FAISS (semantic) and BM25 (keyword) stores

        Args:
            file_bytes: Raw PDF file content.
            filename: Original filename for citations.

        Returns:
            {"document_id": str, "filename": str, "num_chunks": int}
        """
        logger.info(f"Processing PDF: {filename} ({len(file_bytes)} bytes)")

        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            pages = []

            for i, page in enumerate(reader.pages):
                text = page.extract_text()
                if text and text.strip():
                    pages.append({"text": text, "page": i + 1})

            if not pages:
                raise ValueError("No readable text found in the PDF")

            doc_id = str(uuid.uuid4())
            return self._ingest_chunks(pages, doc_id, filename)

        except Exception as e:
            logger.error(f"Failed to process PDF '{filename}': {e}", exc_info=True)
            raise Exception(f"Failed to process PDF: {str(e)}")

    def process_text(self, file_bytes: bytes, filename: str) -> dict:
        """
        Ingests a plain text document into the semantic index.

        Args:
            file_bytes: Raw text file content (UTF-8).
            filename: Original filename for citations.

        Returns:
            {"document_id": str, "filename": str, "num_chunks": int}
        """
        logger.info(f"Processing Text: {filename} ({len(file_bytes)} bytes)")

        try:
            text = file_bytes.decode("utf-8", errors="ignore")
            if not text.strip():
                raise ValueError("No readable text found in the file")

            doc_id = str(uuid.uuid4())
            pages = [{"text": text, "page": 1}]
            return self._ingest_chunks(pages, doc_id, filename)

        except Exception as e:
            logger.error(f"Failed to process text '{filename}': {e}", exc_info=True)
            raise Exception(f"Failed to process TXT: {str(e)}")

    def _ingest_chunks(self, pages: List[dict], doc_id: str, filename: str) -> dict:
        """
        Core ingestion pipeline shared by PDF and text processing.

        Steps:
        1. Chunk the pages using sentence-boundary-aware splitter
        2. Generate dense embeddings (BGE-small-en-v1.5)
        3. Add to FAISS vector store (semantic retrieval)
        4. Add to BM25 corpus (keyword retrieval)

        This dual-indexing ensures both retrieval methods have access to
        every chunk, enabling the hybrid retriever to fuse their signals.
        """
        # Step 1: Chunk
        chunks = self.chunker.chunk_pages(pages, doc_id, filename)

        if not chunks:
            raise ValueError("Chunking produced zero chunks")

        # Step 2: Embed
        texts = [c.text for c in chunks]
        embeddings = self.embedding_service.embed_documents(texts)

        # Step 3: Build metadata for both stores
        metadata_list = [
            {
                "document_id": c.document_id,
                "filename": c.filename,
                "page_number": c.page_number,
                "chunk_index": c.chunk_index,
                "text": c.text,
                "char_count": c.char_count,
                "token_estimate": c.token_estimate,
            }
            for c in chunks
        ]

        # Step 4: Index in both stores
        self.vector_store.add(embeddings, metadata_list)
        self.bm25_retriever.add(texts, metadata_list)

        # Track document name
        self._doc_names[doc_id] = filename

        logger.info(
            f"✅ Ingested '{filename}' → {len(chunks)} chunks, "
            f"{embeddings.shape[0]} vectors (dim={embeddings.shape[1]})"
        )

        return {
            "document_id": doc_id,
            "filename": filename,
            "num_chunks": len(chunks),
        }

    # ═══════════════════════════════════════════════════════════════════
    # RETRIEVAL & RESPONSE GENERATION
    # ═══════════════════════════════════════════════════════════════════

    def chat(self, document_ids: List[str], query: str) -> dict:
        """
        Answers a question using hybrid retrieval over indexed documents.

        Pipeline:
        1. Hybrid retrieval: FAISS (semantic) + BM25 (keyword) → score fusion
        2. Optional cross-encoder reranking of top candidates
        3. Context assembly with citation markers
        4. Structured response generation

        Args:
            document_ids: List of document UUIDs to search within.
            query: User's natural language question.

        Returns:
            {
                "answer": str,       # Formatted answer with citations
                "sources": [         # Citation details
                    {"id", "fileId", "fileName", "page", "excerpt", "score"}
                ]
            }
        """
        if not document_ids:
            return {
                "answer": "No documents specified. Please upload a document first.",
                "sources": [],
            }

        # Run hybrid retrieval
        results = self.hybrid_retriever.retrieve(
            query=query,
            top_k=5,
            initial_candidates=20,
            doc_ids=document_ids,
        )

        if not results:
            return {
                "answer": (
                    "I couldn't find relevant information in the uploaded documents. "
                    "Try rephrasing your question or uploading additional documents."
                ),
                "sources": [],
            }

        # ── Context assembly with citations ──
        answer = self._build_answer(query, results)
        sources = self._build_sources(results)

        return {"answer": answer, "sources": sources}

    def _build_answer(self, query: str, results: List[Dict]) -> str:
        """
        Assembles a natural language answer from retrieved chunks.

        Uses citation markers [1], [2], etc. to reference specific sources.
        This format is LLM-ready — when an LLM is integrated in the future,
        the same context window and citation format can be used directly.

        Current implementation: extractive (returns best matching text).
        Future: abstractive (LLM generates a synthesis of the context).
        """
        top = results[0]
        filename = top.get("filename", "Unknown")
        page = top.get("page_number", "?")
        text = top.get("text", "")
        score = top.get("final_score", 0)

        # Format primary answer with citation
        answer_parts = [
            f"Based on **{filename}** (page {page}) [1]:\n\n{text}"
        ]

        # Add supporting context from additional chunks
        if len(results) > 1:
            supporting = results[1]
            sup_text = supporting.get("text", "")[:200]
            sup_file = supporting.get("filename", "")
            sup_page = supporting.get("page_number", "?")
            answer_parts.append(
                f"\n\nAdditional context from **{sup_file}** (page {sup_page}) [2]:\n"
                f"{sup_text}..."
            )

        return "".join(answer_parts)

    def _build_sources(self, results: List[Dict]) -> List[dict]:
        """
        Formats retrieval results as citation sources for the frontend.

        Each source includes:
        - Unique ID for frontend reference
        - File and page information for user-facing citations
        - Excerpt (truncated to 300 chars) for preview
        - Retrieval score for transparency (helps debug relevance issues)
        """
        sources = []
        for i, result in enumerate(results):
            text = result.get("text", "")
            excerpt = text[:300] + "..." if len(text) > 300 else text

            sources.append({
                "id": f"src_{i}_{uuid.uuid4().hex[:6]}",
                "fileId": result.get("document_id", ""),
                "fileName": result.get("filename", ""),
                "page": result.get("page_number", 1),
                "excerpt": excerpt,
                "score": round(result.get("final_score", 0), 4),
            })

        return sources

    # ═══════════════════════════════════════════════════════════════════
    # LLM-READY PROMPT TEMPLATE (for future integration)
    # ═══════════════════════════════════════════════════════════════════

    def build_llm_prompt(self, query: str, results: List[Dict]) -> str:
        """
        Generates a structured prompt for LLM-based answer generation.

        This method is NOT called in the current pipeline — it's provided
        as a ready-to-use template for when an LLM (GPT-4, Claude, Llama)
        is integrated. The prompt includes:

        1. System instruction with anti-hallucination guardrails
        2. Retrieved context with numbered citations
        3. The user's question

        Anti-hallucination strategy:
        - Explicit instruction to only use provided context
        - Citation requirement forces the model to ground answers
        - "I don't know" fallback prevents confabulation
        """
        context_blocks = []
        for i, result in enumerate(results, 1):
            filename = result.get("filename", "Unknown")
            page = result.get("page_number", "?")
            text = result.get("text", "")
            context_blocks.append(
                f"[{i}] Source: {filename}, Page {page}\n{text}\n"
            )

        context_str = "\n".join(context_blocks)

        return f"""You are a research assistant analyzing academic documents.
Answer the question based ONLY on the provided context. If the context
does not contain sufficient information to answer, say "I don't have
enough information in the uploaded documents to answer this question."

Always cite your sources using [1], [2], etc.

=== CONTEXT ===
{context_str}

=== QUESTION ===
{query}

=== ANSWER ===
"""

    # ═══════════════════════════════════════════════════════════════════
    # DOCUMENT MANAGEMENT
    # ═══════════════════════════════════════════════════════════════════

    def delete_document(self, document_id: str) -> dict:
        """
        Removes a document from all indexes.

        Deletes from both FAISS and BM25 stores to maintain consistency.

        Args:
            document_id: UUID of the document to remove.

        Returns:
            {"deleted_chunks": int, "document_id": str}
        """
        faiss_deleted = self.vector_store.delete_by_doc_id(document_id)
        bm25_deleted = self.bm25_retriever.delete_by_doc_id(document_id)
        self._doc_names.pop(document_id, None)

        logger.info(
            f"Deleted document {document_id[:8]}... "
            f"({faiss_deleted} FAISS + {bm25_deleted} BM25 entries)"
        )

        return {
            "deleted_chunks": max(faiss_deleted, bm25_deleted),
            "document_id": document_id,
        }

    def get_stats(self) -> dict:
        """
        Returns comprehensive index statistics.

        Used by the /rag/stats endpoint for monitoring and debugging.
        """
        faiss_stats = self.vector_store.get_stats()
        return {
            **faiss_stats,
            "bm25_documents": self.bm25_retriever.total_documents,
            "embedding_model": self.embedding_service.model_name,
            "embedding_dimension": self.embedding_service.dimension,
            "chunker_config": {
                "chunk_size_tokens": self.chunker.chunk_size_tokens,
                "overlap_tokens": self.chunker.overlap_tokens,
                "min_chunk_tokens": self.chunker.min_chunk_tokens,
            },
            "retrieval_config": {
                "semantic_weight": self.hybrid_retriever.semantic_weight,
                "keyword_weight": self.hybrid_retriever.keyword_weight,
                "reranker_enabled": self.hybrid_retriever.use_reranker,
                "reranker_model": self.hybrid_retriever.reranker_model_name,
            },
            "document_names": self._doc_names,
        }
