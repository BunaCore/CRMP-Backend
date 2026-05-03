from pydantic import BaseModel
from typing import List

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

class RagChatResponse(BaseModel):
    answer: str
    sources: List[RagSource]
