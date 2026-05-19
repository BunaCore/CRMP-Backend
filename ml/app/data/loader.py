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

    def load_mock_data(self) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """Generates and returns mock data."""
        researchers = generate_mock_researchers(50)
        collaborations = generate_mock_collaborations(researchers, 200)
        return researchers, pd.DataFrame(), collaborations

    def load_real_data_from_db(self) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        """
        Fetches real users, proposals, and collaborations directly from the PostgreSQL database using SQLAlchemy.
        """
        import pandas as pd
        from app.data.db import fetch_users, fetch_proposals, fetch_proposal_members
        
        try:
            print("Fetching training data directly from PostgreSQL...")
            users = fetch_users()
            proposals = fetch_proposals()
            members = fetch_proposal_members()
            
            # Format researchers/users dataframe (name, department, id) - No skills/interests
            formatted_users = []
            for u in users:
                formatted_users.append({
                    "id": str(u.get("id")),
                    "name": u.get("fullName") or "",
                    "department": u.get("department") or ""
                })
                
            users_df = pd.DataFrame(formatted_users) if formatted_users else pd.DataFrame(columns=["id", "name", "department"])
            
            # Format proposals: Group members by proposal
            # Create a mapping of proposal_id -> list of user_ids (including creator)
            proposal_users_map = {}
            for p in proposals:
                pid = p.get("id")
                creator = p.get("createdBy")
                proposal_users_map[pid] = [creator] if creator else []
                
            for m in members:
                pid = m.get("proposalId")
                uid = m.get("userId")
                if pid in proposal_users_map:
                    if uid not in proposal_users_map[pid]:
                        proposal_users_map[pid].append(uid)
                else:
                    proposal_users_map[pid] = [uid]
                    
            formatted_proposals = []
            for p in proposals:
                pid = p.get("id")
                formatted_proposals.append({
                    "id": pid,
                    "title": p.get("title") or "",
                    "abstract": p.get("abstract") or "",
                    "research_area": p.get("researchArea") or "",
                    "department": p.get("department") or "",
                    "user_ids": proposal_users_map.get(pid, [])
                })
                
            proposals_df = pd.DataFrame(formatted_proposals) if formatted_proposals else pd.DataFrame(columns=["id", "title", "abstract", "research_area", "department", "user_ids"])
            
            # Format collaborations: members who worked on the same proposal
            collaborations = []
            for pid, uids in proposal_users_map.items():
                # Make sure we only pair unique IDs
                unique_uids = list(set(uids))
                for i in range(len(unique_uids)):
                    for j in range(i + 1, len(unique_uids)):
                        collaborations.append({
                            "user_id": unique_uids[i],
                            "collaborator_id": unique_uids[j],
                            "score": 1.0
                        })
                        
            collaborations_df = pd.DataFrame(collaborations) if collaborations else pd.DataFrame(columns=["user_id", "collaborator_id", "score"])
            
            print(f"✅ Loaded {len(users_df)} users, {len(proposals_df)} historical proposals, and {len(collaborations_df)} collaborations.")
            return users_df, proposals_df, collaborations_df
            
        except Exception as e:
            print(f"Failed to load real DB data: {e}. Falling back to empty dataframes.")
            return pd.DataFrame(columns=["id", "name", "department"]), pd.DataFrame(columns=["id", "title", "abstract", "research_area", "department", "user_ids"]), pd.DataFrame(columns=["user_id", "collaborator_id", "score"])

