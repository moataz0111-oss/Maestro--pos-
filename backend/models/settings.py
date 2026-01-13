"""
Settings Models
"""
from pydantic import BaseModel
from typing import Optional

class Currency(BaseModel):
    code: str
    symbol: str
    name: str
    rate: float = 1.0
    is_default: bool = False
