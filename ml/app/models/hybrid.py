from typing import Dict, List
from app.models.content_based import ContentBasedRecommender
from app.models.collaborative import CollaborativeRecommender

class HybridRecommender:
    """Combines Content-Based and Collaborative Filtering results."""
    
    def __init__(self, content_weight: float = 0.7, collaborative_weight: float = 0.3):
        self.content_weight = content_weight
        self.collaborative_weight = collaborative_weight
        self.content_model = ContentBasedRecommender()
        self.collaborative_model = CollaborativeRecommender()
        self.researchers_df = None

    def fit(self, researchers_df, collaborations_df):
        """Fits both models."""
        self.researchers_df = researchers_df
        self.content_model.fit(researchers_df)
        self.collaborative_model.fit(collaborations_df)

    def get_recommendations(self, researcher_id: int, top_k: int = 5) -> List[Dict]:
        """Gets combined recommendations."""
        all_ids = self.researchers_df['id'].tolist()
        
        # Get scores from both models (use larger k to ensure we have enough overlap for sorting)
        # Here we get scores for ALL researchers to combine them accurately
        content_scores = self.content_model.get_recommendations(researcher_id, top_k=len(all_ids))
        collaborative_scores = self.collaborative_model.get_recommendations(researcher_id, all_ids, top_k=len(all_ids))
        
        hybrid_scores = []
        
        for rid in all_ids:
            if rid == researcher_id:
                continue
                
            c_score = content_scores.get(rid, 0.0)
            coll_score = collaborative_scores.get(rid, 0.0)
            
            # Weighted average
            final_score = (self.content_weight * c_score) + (self.collaborative_weight * coll_score)
            
            researcher_name = self.researchers_df[self.researchers_df['id'] == rid]['name'].iloc[0]
            
            hybrid_scores.append({
                "id": int(rid),
                "name": researcher_name,
                "score": round(float(final_score), 4)
            })
            
        # Sort by final score
        hybrid_scores = sorted(hybrid_scores, key=lambda x: x['score'], reverse=True)
        
        return hybrid_scores[:top_k]
