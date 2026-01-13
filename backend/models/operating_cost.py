"""
Operating Cost Models
"""
from pydantic import BaseModel
from typing import Optional

class OperatingCostCreate(BaseModel):
    name: str
    type: str  # monthly, daily
    amount: float
    category: str
    branch_id: Optional[str] = None
