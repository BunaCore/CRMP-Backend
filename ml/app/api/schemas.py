from pydantic import BaseModel
from typing import List

class RecommendationRequest(BaseModel):
    researcher_id: int
    top_k: int = 5

class Recommendation(BaseModel):
    id: int
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
