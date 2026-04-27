from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

def calculate_cosine_similarity(matrix) -> np.ndarray:
    """Calculates cosine similarity for a given matrix."""
    return cosine_similarity(matrix, matrix)
