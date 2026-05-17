from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import List
from app.api.schemas import RecommendationRequest, RecommendationResponse, RagChatRequest, RagChatResponse, SearchRequest
from app.services.recommender_service import RecommenderService
from app.services.rag_service import RAGService

router = APIRouter()
recommender_service = RecommenderService(mode="db")
rag_service = RAGService()

@router.post("/recommend", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    """
    Standard hybrid recommendation for a researcher's dashboard.
    """
    try:
        recommendations = await recommender_service.get_recommendations(
            request.researcher_id, request.top_k
        )
        return {"recommendations": recommendations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recommend-members", response_model=List[dict])
async def recommend_members(request: dict):
    """
    Advanced member recommendation for the proposal team section.
    Expects: {title, research_area, host_department, query, pi_id}
    """
    try:
        recommendations = recommender_service.recommend_members(request)
        return recommendations
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/search/members", response_model=RecommendationResponse)
async def search_members(request: SearchRequest):
    try:
        results = recommender_service.search_researchers(
            query=request.query,
            top_k=request.top_k
        )
        return {"recommendations": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rag/upload")
async def rag_upload(file: UploadFile = File(...)):
    try:
        print(f"Received file upload request: {file.filename}")
        filename_lower = file.filename.lower()
        contents = await file.read()
        
        if filename_lower.endswith('.pdf'):
             result = rag_service.process_pdf(contents, file.filename)
        elif filename_lower.endswith('.txt'):
             result = rag_service.process_text(contents, file.filename)
        else:
             raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported")
             
        return result
    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rag/chat", response_model=RagChatResponse)
async def rag_chat(request: RagChatRequest):
    try:
        result = rag_service.chat(request.document_ids, request.query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/retrain")
async def retrain_model():
    try:
        recommender_service.train_model()
        return {"message": "Model retrained successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health_check():
    return {"status": "healthy"}
