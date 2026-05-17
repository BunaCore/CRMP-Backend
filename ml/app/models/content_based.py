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

    def fit(self, researchers_df: pd.DataFrame, proposals_df: pd.DataFrame = None, collaborations_df: pd.DataFrame = None):
        """Fits the model using researcher profiles and historical data."""
        self.researchers_df = researchers_df
        self.proposals_df = proposals_df
        self.collaborations_df = collaborations_df
        
        # Build id mapping
        self.id_mapping = {i: row['id'] for i, row in researchers_df.iterrows()}
        self.reverse_id_mapping = {row['id']: i for i, row in researchers_df.iterrows()}
        
        # Build enriched profiles for each researcher
        profiles = []
        for idx, row in researchers_df.iterrows():
            # Base features: Skills, Interests, Department
            skills = " ".join(row.get("skills", []))
            interests = " ".join(row.get("interests", []))
            dept = row.get("department", "")
            
            # Historical features: Past project titles/abstracts
            history = ""
            if proposals_df is not None and not proposals_df.empty:
                # user_ids is a list in the DataFrame
                user_proposals = proposals_df[proposals_df['user_ids'].apply(lambda x: row['id'] in x if isinstance(x, list) else False)]
                history = " ".join(user_proposals['title'].tolist() + user_proposals['abstract'].fillna('').tolist())
            
            # Weighted profile string for indexing
            # Emphasis on skills and interests
            profile_text = f"{row.get('name', '')} {skills} {skills} {interests} {interests} {dept} {history}"
            profiles.append(profile_text)
            
        self.embeddings = self.model.encode(profiles, convert_to_tensor=True).cpu().numpy()
        
        # Initialize FAISS index
        dimension = self.embeddings.shape[1]
        self.index = faiss.IndexFlatIP(dimension)  # Inner Product for cosine similarity with normalized vectors
        
        # Normalize embeddings for cosine similarity
        faiss.normalize_L2(self.embeddings)
        self.index.add(self.embeddings)
        
    def recommend_members(self, proposal_data: dict, top_k: int = 5) -> list:
        """
        Recommends members based on weighted ranking priorities:
        1. Query match against name/skills/interests (Very High)
        2. Previous Project Similarity (High)
        3. Research Area Similarity (Medium)
        4. Department/Collaboration History (Low)
        """
        if self.index is None or self.researchers_df is None or self.researchers_df.empty:
            return []
            
        title = proposal_data.get("title", "")
        area = proposal_data.get("research_area", "")
        dept = proposal_data.get("host_department", "")
        query = proposal_data.get("query", "")
        pi_id = proposal_data.get("pi_id", "")
        
        # 1. Generate search embedding (combining proposal info and user query)
        search_text = f"{query} {query} {area} {title}"
        search_vec = self.model.encode([search_text]).astype('float32')
        faiss.normalize_L2(search_vec)
        
        # 2. Search FAISS index
        scores, indices = self.index.search(search_vec, len(self.researchers_df))
        
        recommendations = []
        for i, idx in enumerate(indices[0]):
            if idx == -1: continue
            researcher = self.researchers_df.iloc[idx]
            base_score = float(scores[0][i])
            
            # 3. Calculate Weighted Sub-scores
            # Name/Skill/Interest match (Direct filtering)
            q_lower = query.lower().strip()
            name_score = 1.0 if q_lower in researcher["name"].lower() else 0.0
            
            # Direct check in skills and interests
            skills_interests = [s.lower() for s in researcher.get("skills", [])] + [s.lower() for s in researcher.get("interests", [])]
            skill_match_score = 1.0 if any(q_lower in si for si in skills_interests) else 0.0
            
            # Research Area Score (against proposal's research area)
            area_score = 1.0 if any(area.lower() in interest.lower() for interest in researcher.get("interests", [])) else 0.0
            
            # History Score: Check if query matches previous project titles/abstracts
            history_score = 0.0
            if self.proposals_df is not None and not self.proposals_df.empty:
                user_proposals = self.proposals_df[self.proposals_df['user_ids'].apply(lambda x: researcher['id'] in x if isinstance(x, list) else False)]
                if not user_proposals.empty:
                    # Give points if previous project matches typed query
                    has_relevant_history = any(
                        (q_lower in p.get('title', '').lower() or q_lower in p.get('abstract', '').lower())
                        for _, p in user_proposals.iterrows()
                    ) if q_lower else False
                    
                    history_score = 1.0 if has_relevant_history else 0.2 # Small base score for having history
            
            # Department Score
            dept_score = 1.0 if researcher.get("department") == dept else 0.0
            
            # Collaboration Score
            collab_score = 0.0
            if self.collaborations_df is not None and not self.collaborations_df.empty and pi_id:
                has_collaborated = not self.collaborations_df[
                    ((self.collaborations_df['user_id'] == pi_id) & (self.collaborations_df['collaborator_id'] == researcher['id'])) |
                    ((self.collaborations_df['user_id'] == researcher['id']) & (self.collaborations_df['collaborator_id'] == pi_id))
                ].empty
                collab_score = 1.0 if has_collaborated else 0.0
            
            # Final Weighted Score
            # Weighting: 30% Semantic, 20% Name Match, 20% Skill Match, 15% History, 10% Area, 5% Dept/Collab
            final_score = (base_score * 0.3) + (name_score * 0.2) + (skill_match_score * 0.2) + (history_score * 0.15) + (area_score * 0.1) + (dept_score * 0.025) + (collab_score * 0.025)
            
            # 4. Filter by threshold
            # If user is searching, we want to be strict. If not, we show top semantic matches.
            threshold = 0.0
            if final_score < threshold:
                continue
                
            # 5. Generate Reason
            reasons = []
            if name_score > 0.8: reasons.append(f"Name match for '{query}'")
            if skill_match_score > 0.8: reasons.append(f"Has skills related to '{query}'")
            if history_score > 0.8: reasons.append(f"Previous projects in '{query}' area")
            elif history_score > 0.1: reasons.append("Experienced researcher")
            if area_score > 0.8: reasons.append(f"Interested in {area}")
            
            reason_str = "; ".join(reasons[:2]) if reasons else f"Recommended for {area}"
            
            recommendations.append({
                "user_id": str(researcher["id"]),
                "name": researcher["name"],
                "department": researcher["department"],
                "skills": researcher.get("skills", []),
                "similarity_score": round(final_score, 2),
                "reason": reason_str
            })
            
        # Sort by final score
        recommendations.sort(key=lambda x: x["similarity_score"], reverse=True)
        return recommendations[:top_k]

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
