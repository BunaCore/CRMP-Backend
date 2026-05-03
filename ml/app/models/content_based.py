import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
import faiss
from app.utils.preprocessing import combine_features
from typing import Dict

class ContentBasedRecommender:
    """Recommender based on researcher profile content using embeddings and FAISS."""
    
    def __init__(self):
        # We use a lightweight open-source embedding model
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.index = None
        self.researchers_df = None
        self.id_mapping = {}
        self.reverse_id_mapping = {}

    def fit(self, researchers_df: pd.DataFrame):
        """Trains the model on the researcher dataset and builds FAISS index."""
        self.researchers_df = researchers_df.copy()
        
        # Combine features into a single document per researcher
        self.researchers_df['combined_features'] = self.researchers_df.apply(combine_features, axis=1)
        
        # Encode documents to embeddings
        embeddings = self.model.encode(self.researchers_df['combined_features'].tolist(), convert_to_numpy=True)
        embeddings = np.array(embeddings).astype('float32')
        
        # Build FAISS index
        dimension = embeddings.shape[1]
        self.index = faiss.IndexFlatL2(dimension)
        self.index.add(embeddings)
        
        # Store ID mappings
        for idx, row in self.researchers_df.iterrows():
            str_id = str(row['id'])
            self.id_mapping[idx] = str_id
            self.reverse_id_mapping[str_id] = idx

    def search_by_query(self, query: str, top_k: int = 5) -> Dict[str, float]:
        """Finds researchers semantically related to a text query using FAISS."""
        if self.index is None:
            raise ValueError("Model must be fitted before searching.")
        
        # Encode the query
        query_vec = self.model.encode([query], convert_to_numpy=True).astype('float32')
        
        # Search the index
        distances, indices = self.index.search(query_vec, min(top_k * 2, len(self.researchers_df)))
        
        recommendations = {}
        # Convert L2 distance to similarity score (e.g. 1 / (1 + distance))
        for dist, idx in zip(distances[0], indices[0]):
            if idx == -1:
                continue
                
            sim_score = 1.0 / (1.0 + dist)
            rid = self.id_mapping[idx]
            
            # Simple threshold check
            if sim_score > 0.05:
                recommendations[rid] = float(sim_score)
            if len(recommendations) >= top_k:
                break
                
        return recommendations

    def get_recommendations(self, researcher_id: str, top_k: int = 5) -> Dict[str, float]:
        """Returns recommendations with scores for a given researcher ID based on profile embeddings."""
        if self.index is None:
            raise ValueError("Model must be fitted before getting recommendations.")
        
        # Ensure researcher exists
        if researcher_id not in self.reverse_id_mapping:
            return {}
            
        idx = self.reverse_id_mapping[researcher_id]
        
        # Re-compute embedding or retrieve it
        query_text = self.researchers_df.iloc[idx]['combined_features']
        query_vec = self.model.encode([query_text], convert_to_numpy=True).astype('float32')
        
        distances, indices = self.index.search(query_vec, min(top_k * 2 + 1, len(self.researchers_df)))
        
        recommendations = {}
        for dist, res_idx in zip(distances[0], indices[0]):
            if res_idx == -1:
                continue
                
            rid = self.id_mapping[res_idx]
            if rid != researcher_id:
                sim_score = 1.0 / (1.0 + dist)
                recommendations[rid] = float(sim_score)
                if len(recommendations) >= top_k:
                    break
                    
        return recommendations
