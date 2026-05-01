from fastapi import APIRouter, HTTPException, UploadFile, File
from app.api.schemas import RecommendationRequest, RecommendationResponse, RagChatRequest, RagChatResponse
from app.services.recommender_service import RecommenderService
from app.services.rag_service import RAGService

router = APIRouter()
recommender_service = RecommenderService(mode="mock")
rag_service = RAGService()

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

@router.post("/rag/upload")
async def rag_upload(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if not file.filename.endswith('.pdf'):
             raise HTTPException(status_code=400, detail="Only PDF files are supported")
             
        result = rag_service.process_pdf(contents, file.filename)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rag/chat", response_model=RagChatResponse)
async def rag_chat(request: RagChatRequest):
    try:
        result = rag_service.chat(request.document_ids, request.query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health_check():
    return {"status": "healthy"}
