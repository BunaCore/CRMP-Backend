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
