import pandas as pd
from typing import Tuple
from app.data.mock_data import generate_mock_researchers, generate_mock_collaborations

class DataLoader:
    """Handles loading of researcher and collaboration data."""
    
    def __init__(self, mode: str = "mock"):
        self.mode = mode

    def load_data(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Loads data based on the current mode."""
        if self.mode == "mock":
            return self.load_mock_data()
        elif self.mode == "db":
            return self.load_real_data_from_db()
        else:
            raise ValueError(f"Unknown mode: {self.mode}")

    def load_mock_data(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Generates and returns mock data."""
        researchers = generate_mock_researchers(50)
        collaborations = generate_mock_collaborations(researchers, 200)
        return researchers, collaborations

    def load_real_data_from_db(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Placeholder for real database loading logic.
        This can be implemented using SQLAlchemy or any other ORM.
        """
        # TODO: Implement database connection and query
        # For now, fallback to mock to prevent crashes
        print("Real DB loading not implemented yet. Falling back to mock.")
        return self.load_mock_data()
