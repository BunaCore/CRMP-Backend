import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from app.utils.preprocessing import combine_features
from app.utils.similarity import calculate_cosine_similarity
from typing import Dict

class ContentBasedRecommender:
    """Recommender based on researcher profile content (skills, interests, etc.)."""
    
    def __init__(self):
        self.vectorizer = TfidfVectorizer(stop_words='english')
        self.similarity_matrix = None
        self.researchers_df = None

    def fit(self, researchers_df: pd.DataFrame):
        """Trains the model on the researcher dataset."""
        self.researchers_df = researchers_df.copy()
        
        # Combine features into a single document per researcher
        self.researchers_df['combined_features'] = self.researchers_df.apply(combine_features, axis=1)
        
        # Vectorize
        tfidf_matrix = self.vectorizer.fit_transform(self.researchers_df['combined_features'])
        
        # Compute Similarity
        self.similarity_matrix = calculate_cosine_similarity(tfidf_matrix)

    def get_recommendations(self, researcher_id: int, top_k: int = 5) -> Dict[int, float]:
        """Returns recommendations with scores for a given researcher ID."""
        if self.similarity_matrix is None:
            raise ValueError("Model must be fitted before getting recommendations.")
        
        # Find index of the researcher
        try:
            idx = self.researchers_df[self.researchers_df['id'] == researcher_id].index[0]
        except IndexError:
            return {}

        # Get similarity scores for all researchers
        sim_scores = list(enumerate(self.similarity_matrix[idx]))
        
        # Sort by similarity score
        sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)
        
        # Exclude the researcher themselves and take top_k
        recommendations = {}
        for i, score in sim_scores:
            rid = int(self.researchers_df.iloc[i]['id'])
            if rid != researcher_id:
                recommendations[rid] = float(score)
                if len(recommendations) >= top_k:
                    break
                    
        return recommendations
