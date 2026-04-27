from fastapi import APIRouter, HTTPException
from app.api.schemas import RecommendationRequest, RecommendationResponse
from app.services.recommender_service import RecommenderService

router = APIRouter()
recommender_service = RecommenderService(mode="mock")

@router.post("/recommend", response_model=RecommendationResponse)
async def recommend(request: RecommendationRequest):
    try:
        recommendations = recommender_service.get_recommendations(
            researcher_id=request.researcher_id, 
            top_k=request.top_k
        )
        
        if not recommendations:
            raise HTTPException(status_code=404, detail="Researcher not found or no recommendations available.")
            
        return {"recommendations": recommendations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health_check():
    return {"status": "healthy"}
