"""
Sentence-Boundary-Aware Document Chunker — CRMP RAG Pipeline
=============================================================

Splits documents into semantically coherent chunks optimized for retrieval.

Why Not Naive Splitting?
-------------------------
Splitting by character count or paragraph breaks produces chunks that:
1. Cut mid-sentence, destroying meaning ("The protein was found to be" → useless)
2. Vary wildly in length (one-line paragraphs vs. 3-page paragraphs)
3. Lose cross-boundary context (a key finding split across two chunks)

This chunker solves all three problems:

1. **Sentence boundary preservation**: Never cuts mid-sentence. Uses regex-based
   sentence detection that handles abbreviations (Dr., Prof., etc.)

2. **Token-aware sizing**: Targets 500-800 tokens per chunk (not characters).
   Transformer models have fixed context windows, so token count is what matters.
   We use a fast heuristic (words * 1.3) instead of running a real tokenizer,
   which would add ~50ms per chunk for negligible accuracy improvement.

3. **Configurable overlap**: 100-150 tokens of overlap between consecutive chunks
   ensures that information spanning a chunk boundary is captured in at least one
   chunk. This is critical for academic papers where findings often span paragraphs.

Chunk Metadata
--------------
Each chunk carries rich metadata for citation and debugging:
- document_id: UUID linking back to the source document
- filename: Original filename for user-facing citations
- page_number: PDF page (or 1 for text files)
- chunk_index: Sequential index within the document
- char_count: Raw character count
- token_estimate: Approximate token count
"""

import logging
import re
import uuid
from dataclasses import dataclass, field, asdict
from typing import List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ChunkMetadata:
    """Rich metadata attached to every chunk for citation and traceability."""
    document_id: str
    filename: str
    page_number: int
    chunk_index: int
    text: str
    char_count: int = 0
    token_estimate: int = 0

    def __post_init__(self):
        self.char_count = len(self.text)
        self.token_estimate = estimate_tokens(self.text)

    def to_dict(self) -> dict:
        return asdict(self)


def estimate_tokens(text: str) -> int:
    """
    Fast token count heuristic: word_count * 1.3.

    Rationale: English text averages ~1.3 tokens per word due to subword
    tokenization (e.g., "understanding" → ["under", "##standing"]).
    This is 100x faster than running a real tokenizer and accurate to ±10%,
    which is sufficient for chunk sizing decisions.
    """
    return int(len(text.split()) * 1.3)


# Common abbreviations that should NOT trigger sentence splits.
# Using a set for O(1) lookup during splitting.
_ABBREVIATIONS = frozenset({
    "dr", "prof", "mr", "mrs", "ms", "jr", "sr", "fig", "eq",
    "vol", "no", "vs", "etc", "al", "ed", "rev", "gen", "gov",
    "st", "dept", "univ", "approx", "inc", "corp", "ltd",
})


def split_into_sentences(text: str) -> List[str]:
    """
    Splits text into sentences using a robust rule-based approach.

    Handles academic text conventions:
    - Abbreviations (Dr., Prof., Fig., et al.) don't trigger splits
    - Sentence must end with punctuation followed by whitespace + capital letter
    - Falls back to newline splitting if no sentence boundaries found

    Uses a simple scan instead of regex lookbehinds to avoid Python version
    compatibility issues with variable-width lookbehind patterns.
    """
    if not text or not text.strip():
        return []

    sentences: List[str] = []
    current_start = 0

    i = 0
    while i < len(text):
        char = text[i]

        # Check for potential sentence boundary: punctuation followed by space + uppercase
        if char in '.!?' and i + 2 < len(text) and text[i + 1] in ' \t\n' and text[i + 2].isupper():
            # Check if the period is part of an abbreviation
            is_abbreviation = False
            if char == '.':
                # Look back to find the word before the period
                word_start = i - 1
                while word_start >= 0 and text[word_start].isalpha():
                    word_start -= 1
                word_before = text[word_start + 1:i].lower()
                if word_before in _ABBREVIATIONS:
                    is_abbreviation = True
                # Single letter followed by period (e.g., "A.", "U.S.A.")
                if len(word_before) <= 1:
                    is_abbreviation = True

            if not is_abbreviation:
                # Split here: include the punctuation in the current sentence
                sentence = text[current_start:i + 1].strip()
                if sentence:
                    sentences.append(sentence)
                current_start = i + 1
                # Skip whitespace after the split point
                while current_start < len(text) and text[current_start] in ' \t\n':
                    current_start += 1
                i = current_start
                continue

        i += 1

    # Add remaining text as the last sentence
    remaining = text[current_start:].strip()
    if remaining:
        sentences.append(remaining)

    # If we found no splits (e.g., text has no standard punctuation),
    # fall back to splitting on newlines
    if len(sentences) <= 1 and '\n' in text:
        sentences = [s.strip() for s in text.split('\n') if s.strip()]

    return sentences


class DocumentChunker:
    """
    Production-grade document chunker with sentence boundary preservation.

    Args:
        chunk_size_tokens: Target chunk size in tokens (default: 600).
                           Range 500-800 is optimal for retrieval —
                           too small loses context, too large dilutes relevance.
        overlap_tokens: Overlap between consecutive chunks (default: 120).
                        Ensures cross-boundary information is captured.
                        10-20% of chunk_size is the sweet spot.
        min_chunk_tokens: Minimum chunk size. Chunks below this threshold
                          are merged with the previous chunk to avoid
                          creating tiny, low-information fragments.
    """

    def __init__(
        self,
        chunk_size_tokens: int = 600,
        overlap_tokens: int = 120,
        min_chunk_tokens: int = 50,
    ):
        self.chunk_size_tokens = chunk_size_tokens
        self.overlap_tokens = overlap_tokens
        self.min_chunk_tokens = min_chunk_tokens

    def chunk_text(
        self,
        text: str,
        document_id: str,
        filename: str,
        page_number: int = 1,
        start_chunk_index: int = 0,
    ) -> List[ChunkMetadata]:
        """
        Chunks a single page/section of text into semantically coherent pieces.

        Algorithm:
        1. Split text into sentences
        2. Greedily accumulate sentences until chunk_size_tokens is reached
        3. Emit chunk and start new one with overlap_tokens of trailing context
        4. Merge any trailing runt chunk (< min_chunk_tokens) with previous

        Args:
            text: Raw text to chunk.
            document_id: UUID of the parent document.
            filename: Original filename for citation.
            page_number: Page number (1-indexed) for citation.
            start_chunk_index: Starting index for chunk numbering (for multi-page docs).

        Returns:
            List of ChunkMetadata objects.
        """
        if not text or not text.strip():
            return []

        sentences = split_into_sentences(text)
        if not sentences:
            return []

        chunks: List[ChunkMetadata] = []
        current_sentences: List[str] = []
        current_tokens = 0
        chunk_idx = start_chunk_index

        for sentence in sentences:
            sentence_tokens = estimate_tokens(sentence)

            # If adding this sentence would exceed the target, emit current chunk
            if current_tokens + sentence_tokens > self.chunk_size_tokens and current_sentences:
                chunk_text = " ".join(current_sentences)
                chunks.append(ChunkMetadata(
                    document_id=document_id,
                    filename=filename,
                    page_number=page_number,
                    chunk_index=chunk_idx,
                    text=chunk_text,
                ))
                chunk_idx += 1

                # Build overlap: take trailing sentences that fit within overlap_tokens
                overlap_sentences: List[str] = []
                overlap_tokens = 0
                for s in reversed(current_sentences):
                    s_tokens = estimate_tokens(s)
                    if overlap_tokens + s_tokens > self.overlap_tokens:
                        break
                    overlap_sentences.insert(0, s)
                    overlap_tokens += s_tokens

                current_sentences = overlap_sentences
                current_tokens = overlap_tokens

            current_sentences.append(sentence)
            current_tokens += sentence_tokens

        # Emit remaining sentences as final chunk
        if current_sentences:
            chunk_text = " ".join(current_sentences)
            if chunks and estimate_tokens(chunk_text) < self.min_chunk_tokens:
                # Merge runt chunk with previous to avoid tiny fragments
                prev = chunks[-1]
                merged_text = prev.text + " " + chunk_text
                chunks[-1] = ChunkMetadata(
                    document_id=prev.document_id,
                    filename=prev.filename,
                    page_number=prev.page_number,
                    chunk_index=prev.chunk_index,
                    text=merged_text,
                )
            else:
                chunks.append(ChunkMetadata(
                    document_id=document_id,
                    filename=filename,
                    page_number=page_number,
                    chunk_index=chunk_idx,
                    text=chunk_text,
                ))

        return chunks

    def chunk_pages(
        self,
        pages: List[dict],
        document_id: str,
        filename: str,
    ) -> List[ChunkMetadata]:
        """
        Chunks multiple pages from a PDF, maintaining global chunk indexing.

        Args:
            pages: List of {"text": str, "page": int} dictionaries.
            document_id: UUID of the parent document.
            filename: Original filename.

        Returns:
            List of ChunkMetadata objects across all pages.
        """
        all_chunks: List[ChunkMetadata] = []
        chunk_index = 0

        for page_data in pages:
            text = page_data.get("text", "")
            page_num = page_data.get("page", 1)

            page_chunks = self.chunk_text(
                text=text,
                document_id=document_id,
                filename=filename,
                page_number=page_num,
                start_chunk_index=chunk_index,
            )
            all_chunks.extend(page_chunks)
            chunk_index += len(page_chunks)

        logger.info(
            f"Chunked '{filename}' ({len(pages)} pages) → "
            f"{len(all_chunks)} chunks "
            f"(avg {sum(c.token_estimate for c in all_chunks) // max(len(all_chunks), 1)} tokens/chunk)"
        )
        return all_chunks
