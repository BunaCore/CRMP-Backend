from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class RecommendationRequest(BaseModel):
    researcher_id: str
    top_k: int = 5

class SearchRequest(BaseModel):
    query: str
    top_k: int = 10

class Recommendation(BaseModel):
    id: str
    name: str
    score: float

class RecommendationResponse(BaseModel):
    recommendations: List[Recommendation]

class RagChatRequest(BaseModel):
    document_ids: List[str]
    query: str

class RagSource(BaseModel):
    id: str
    fileId: str
    fileName: str
    page: int
    excerpt: str
    score: Optional[float] = None

class RagChatResponse(BaseModel):
    answer: str
    sources: List[RagSource]

class RagStatsResponse(BaseModel):
    """Response schema for the /rag/stats health-check endpoint."""
    total_vectors: int
    total_documents: int
    dimension: int
    index_type: str
    bm25_documents: int
    embedding_model: str
    embedding_dimension: int
    chunker_config: Dict[str, Any]
    retrieval_config: Dict[str, Any]
    document_names: Dict[str, str]
    document_ids: List[str]

class RagDeleteResponse(BaseModel):
    """Response schema for document deletion."""
    deleted_chunks: int
    document_id: str
