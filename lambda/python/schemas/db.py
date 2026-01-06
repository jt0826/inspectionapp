from pydantic import BaseModel, Field, ValidationError
from typing import Optional

# Small helper to normalize snake_case -> camelCase keys (for compatibility)
def to_camel_case_keys(d: dict) -> dict:
    out = {}
    for k, v in d.items():
        parts = k.split('_')
        if len(parts) == 1:
            out[k] = v
        else:
            out[k] = parts[0] + ''.join(p.capitalize() for p in parts[1:])
    return out

class InspectionMetadata(BaseModel):
    inspectionId: str = Field(..., alias='inspection_id')
    venueId: Optional[str] = Field(None, alias='venue_id')
    venueName: Optional[str] = Field(None, alias='venue_name')
    inspectorId: Optional[str] = Field(None, alias='inspector_id')
    inspectorName: Optional[str] = Field(None, alias='inspector_name')
    status: Optional[str]
    createdAt: Optional[str] = Field(None, alias='createdAt')
    updatedAt: Optional[str] = Field(None, alias='updatedAt')

    class Config:
        allow_population_by_field_name = True
        anystr_strip_whitespace = True

class InspectionItem(BaseModel):
    inspectionId: str = Field(..., alias='inspection_id')
    roomId: str = Field(..., alias='room_id')
    itemId: str = Field(..., alias='item_id')
    name: Optional[str]
    status: Optional[str]
    notes: Optional[str]
    comments: Optional[str]
    createdAt: Optional[str] = Field(None, alias='createdAt')
    updatedAt: Optional[str] = Field(None, alias='updatedAt')

    class Config:
        allow_population_by_field_name = True
        anystr_strip_whitespace = True

class InspectionImage(BaseModel):
    inspectionId: str = Field(..., alias='inspection_id')
    roomId: str = Field(..., alias='room_id')
    itemId: str = Field(..., alias='item_id')
    imageId: str = Field(..., alias='image_id')
    s3Key: str = Field(..., alias='s3Key')
    filename: Optional[str]
    contentType: Optional[str]
    filesize: Optional[int]
    uploadedBy: Optional[str]
    uploadedAt: Optional[str]

    class Config:
        allow_population_by_field_name = True
        anystr_strip_whitespace = True

# Small helpers to validate input dictionaries

def validate_inspection_metadata(payload: dict) -> Optional[InspectionMetadata]:
    payload = to_camel_case_keys(payload)
    try:
        return InspectionMetadata.parse_obj(payload)
    except ValidationError as e:
        print('InspectionMetadata validation error:', e)
        return None


def validate_inspection_item(payload: dict) -> Optional[InspectionItem]:
    payload = to_camel_case_keys(payload)
    try:
        return InspectionItem.parse_obj(payload)
    except ValidationError as e:
        print('InspectionItem validation error:', e)
        return None


def validate_inspection_image(payload: dict) -> Optional[InspectionImage]:
    payload = to_camel_case_keys(payload)
    try:
        return InspectionImage.parse_obj(payload)
    except ValidationError as e:
        print('InspectionImage validation error:', e)
        return None
