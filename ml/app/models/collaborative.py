import pandas as pd
import numpy as np
from sklearn.decomposition import TruncatedSVD
from typing import Dict

class CollaborativeRecommender:
    """
    Recommender based on past collaborations using Matrix Factorization (SVD).
    Uses scikit-learn's TruncatedSVD for better compatibility.
    """
    
    def __init__(self, n_components: int = 10):
        self.n_components = n_components
        self.model = TruncatedSVD(n_components=self.n_components)
        self.user_item_matrix = None
        self.researcher_ids = None

    def fit(self, collaborations_df: pd.DataFrame):
        """Trains the model on collaboration history."""
        if collaborations_df.empty:
            return

        # Create user-item matrix
        self.user_item_matrix = collaborations_df.pivot_table(
            index='user_id', 
            columns='collaborator_id', 
            values='score', 
            fill_value=0
        )
        
        # Ensure we have enough components
        n_features = self.user_item_matrix.shape[1]
        n_samples = self.user_item_matrix.shape[0]
        actual_components = min(self.n_components, n_features - 1, n_samples - 1)
        
        if actual_components > 0:
            self.model = TruncatedSVD(n_components=actual_components)
            self.model.fit(self.user_item_matrix)
            self.researcher_ids = self.user_item_matrix.columns.tolist()

    def get_recommendations(self, researcher_id: int, all_researcher_ids: list, top_k: int = 5) -> Dict[int, float]:
        """Predicts potential collaborators for a given researcher."""
        if self.user_item_matrix is None or researcher_id not in self.user_item_matrix.index:
            return {}

        # Get the latent representation of the researcher
        user_vector = self.user_item_matrix.loc[[researcher_id]]
        latent_vector = self.model.transform(user_vector)
        
        # Reconstruct the scores
        reconstructed_scores = self.model.inverse_transform(latent_vector)[0]
        
        predictions = []
        for i, rid in enumerate(self.researcher_ids):
            if rid != researcher_id:
                predictions.append((rid, float(reconstructed_scores[i])))

        # Sort and return top_k
        predictions = sorted(predictions, key=lambda x: x[1], reverse=True)
        
        return {rid: score for rid, score in predictions[:top_k]}
