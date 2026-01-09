# Export/Import Data Feature Plan

**Status:** 📋 Planned (Not Started)  
**Priority:** Medium (Data portability & backup)  
**Estimated Effort:** 3-5 days  
**Date Created:** 2026-01-09

---

## 🎯 Objectives

Implement comprehensive data export and import functionality to enable:

1. **Data Backup & Restore:**
   - Export entire database for disaster recovery
   - Import to restore from backup
   - Scheduled automated backups

2. **Reporting & Analysis:**
   - Export inspections for Excel analysis
   - Generate PDF reports for compliance
   - Export venue templates for documentation

3. **Data Migration:**
   - Move data between environments (dev → staging → prod)
   - Migrate from legacy systems
   - Share inspection templates between organizations

4. **Bulk Operations:**
   - Import multiple venues from spreadsheet
   - Bulk update inspection data
   - Mass venue creation from templates

5. **Compliance & Audit:**
   - Export audit logs for regulatory requirements
   - Generate inspection history reports
   - Archive completed inspections

---

## 🔍 Current State Analysis

### What Can Be Exported

**DynamoDB Tables:**
- `InspectionMetadata` - inspection headers + cached summaries
- `InspectionItems` - per-item inspection records
- `InspectionImages` - image metadata (not actual images)
- `VenueRooms` - venue definitions with rooms/items

**S3 Objects:**
- Inspection images (JPG/PNG files)
- Uploaded documents (if any)

**Relationships:**
```
Venue (venueId)
  ↓
Inspection (inspectionId, venueId)
  ↓
InspectionItems (inspectionId, roomId, itemId)
  ↓
InspectionImages (inspectionId, roomId, itemId, imageId)
  ↓
S3 Images (bucket/key)
```

### Current Limitations
- ❌ No export functionality exists
- ❌ No import functionality exists
- ❌ No bulk operations
- ❌ No reporting tools
- ❌ No data portability

---

## 📋 Export Functionality

### Export Formats

#### 1. **JSON (Native Format)**
**Use Case:** Backup, migration, API integration  
**Pros:** Complete data fidelity, includes all metadata  
**Cons:** Not human-readable, requires technical knowledge

**Structure:**
```json
{
  "exportMetadata": {
    "version": "1.0",
    "exportDate": "2026-01-09T12:34:56Z",
    "exportedBy": "dev@facility.com",
    "exportType": "full|inspections|venues",
    "recordCount": {
      "venues": 5,
      "inspections": 23,
      "inspectionItems": 1247,
      "images": 89
    }
  },
  "venues": [
    {
      "venueId": "venue_abc123",
      "name": "Main Building",
      "address": "123 Main St",
      "rooms": [
        {
          "roomId": "room_xyz789",
          "name": "Kitchen",
          "items": [
            {
              "itemId": "item_def456",
              "name": "Fire Extinguisher",
              "description": "Check pressure gauge"
            }
          ]
        }
      ]
    }
  ],
  "inspections": [
    {
      "inspectionId": "inspection_123",
      "venueId": "venue_abc123",
      "venueName": "Main Building",
      "status": "completed",
      "createdAt": "2026-01-08T10:00:00Z",
      "completedAt": "2026-01-08T14:30:00Z",
      "createdBy": "John Anderson",
      "totals": {
        "pass": 45,
        "fail": 2,
        "na": 1,
        "total": 48
      },
      "items": [
        {
          "roomId": "room_xyz789",
          "roomName": "Kitchen",
          "itemId": "item_def456",
          "itemName": "Fire Extinguisher",
          "status": "pass",
          "notes": "Pressure OK",
          "images": [
            {
              "imageId": "img_001",
              "url": "https://cdn.example.com/images/img_001.jpg",
              "thumbnailUrl": "https://cdn.example.com/thumbs/img_001.jpg",
              "uploadedAt": "2026-01-08T12:15:00Z"
            }
          ]
        }
      ]
    }
  ]
}
```

#### 2. **CSV (Excel Compatible)**
**Use Case:** Data analysis, bulk editing, reporting  
**Pros:** Open in Excel/Google Sheets, easy to read  
**Cons:** Loss of nested structure, multiple files needed

**Files Generated:**
- `inspections.csv` - Inspection metadata
- `inspection_items.csv` - All inspection items
- `venues.csv` - Venue metadata
- `venue_rooms.csv` - Room definitions
- `venue_items.csv` - Item definitions

**Example: inspections.csv**
```csv
inspectionId,venueName,venueId,status,createdAt,completedAt,createdBy,updatedBy,totalItems,passCount,failCount,naCount
inspection_123,Main Building,venue_abc123,completed,2026-01-08T10:00:00Z,2026-01-08T14:30:00Z,John Anderson,John Anderson,48,45,2,1
inspection_456,East Wing,venue_def456,in-progress,2026-01-09T08:00:00Z,,Sarah Chen,Sarah Chen,32,10,1,0
```

**Example: inspection_items.csv**
```csv
inspectionId,roomId,roomName,itemId,itemName,status,notes,imageCount,updatedAt
inspection_123,room_xyz789,Kitchen,item_def456,Fire Extinguisher,pass,Pressure OK,1,2026-01-08T12:15:00Z
inspection_123,room_xyz789,Kitchen,item_ghi789,Smoke Detector,fail,Battery dead,2,2026-01-08T12:20:00Z
```

#### 3. **PDF (Reports)**
**Use Case:** Compliance, archival, sharing with non-technical users  
**Pros:** Professional format, immutable, easy to share  
**Cons:** Not editable, larger file size

**Report Types:**
- **Individual Inspection Report:** Single inspection with all details + images
- **Summary Report:** Multiple inspections with totals and charts
- **Venue Report:** Venue definition with item checklist
- **Compliance Report:** All inspections for date range with pass/fail stats

**Layout Example:**
```
┌─────────────────────────────────────────────────────┐
│  Facility Inspection Report                         │
│  Inspection ID: inspection_123                      │
│  Date: 2026-01-08                                   │
├─────────────────────────────────────────────────────┤
│  Venue: Main Building                               │
│  Address: 123 Main St                               │
│  Inspector: John Anderson                           │
│  Status: ✓ Completed                                │
│                                                      │
│  Summary:                                            │
│  ✓ Pass:    45 (93.8%)                              │
│  ✗ Fail:     2 (4.2%)                               │
│  ○ N/A:      1 (2.0%)                               │
│  Total:     48 items                                │
├─────────────────────────────────────────────────────┤
│  Kitchen (6 items)                                  │
│    ✓ Fire Extinguisher - Pressure OK               │
│    ✗ Smoke Detector - Battery dead [2 images]      │
│    ✓ Emergency Exit - Clear                         │
│    ...                                               │
├─────────────────────────────────────────────────────┤
│  Images:                                            │
│  [Thumbnail Grid]                                   │
└─────────────────────────────────────────────────────┘
```

#### 4. **Excel Workbook (.xlsx)**
**Use Case:** Advanced analysis, bulk editing, pivot tables  
**Pros:** Multiple sheets, formulas, charts, preserved structure  
**Cons:** Requires Excel/compatible software

**Sheets:**
- `Summary` - Overview with statistics
- `Inspections` - All inspections metadata
- `Items` - All inspection items (flattened)
- `Venues` - Venue definitions
- `Images` - Image metadata with URLs
- `Charts` - Auto-generated charts (pass/fail rates, trends)

---

### Export Scopes

#### 1. **Full Database Export**
- All venues
- All inspections (ongoing + completed)
- All images metadata
- System metadata (export date, version)

**Use Case:** Disaster recovery, migration, archival

#### 2. **Filtered Inspection Export**
**Filters:**
- Date range (e.g., "Last 30 days", "Q4 2025")
- Status (completed, ongoing, or both)
- Venue (specific venue or all)
- Inspector (created by specific user)

**Use Case:** Monthly reports, specific venue audit

#### 3. **Single Inspection Export**
- One inspection with all details
- All related items
- All images (embedded or linked)

**Use Case:** Sharing single inspection, compliance documentation

#### 4. **Venue Template Export**
- Venue structure (rooms + items)
- No inspection data
- Clean template for reuse

**Use Case:** Creating similar venues, standardization

#### 5. **Image Package Export**
- ZIP file with all images
- Organized by inspection/room/item
- Manifest JSON with metadata

**Use Case:** Evidence collection, archival

---

## 📥 Import Functionality

### Import Formats

#### 1. **JSON Import (Native)**
**Features:**
- Full data restoration from export
- Validation against schema
- Conflict resolution options
- Dry-run mode (preview without importing)

**Conflict Resolution Strategies:**
```typescript
enum ConflictStrategy {
  SKIP = 'skip',           // Skip if ID exists
  OVERWRITE = 'overwrite', // Replace existing data
  MERGE = 'merge',         // Merge fields (keep existing if not in import)
  RENAME = 'rename',       // Generate new IDs, preserve imported data
  FAIL = 'fail'            // Abort import on conflict
}
```

**Import Options:**
```json
{
  "conflictStrategy": "merge",
  "generateNewIds": false,
  "importImages": true,
  "validateReferences": true,
  "dryRun": false
}
```

#### 2. **CSV Import (Bulk Data)**
**Features:**
- Import venues from spreadsheet
- Bulk create inspections
- Update existing records via ID column

**Validation:**
- Required columns check
- Data type validation
- Reference integrity (venue IDs exist)
- Duplicate detection

**Example: Import Venues**
```csv
name,address,createdBy
Main Building,123 Main St,Admin
East Wing,456 Oak Ave,Admin
West Wing,789 Pine Rd,Admin
```

**Processing:**
1. Validate CSV format
2. Check for required columns
3. Generate IDs for new venues
4. Create room/item structure from template (if provided)
5. Import to DynamoDB

#### 3. **Excel Import (.xlsx)**
**Features:**
- Multi-sheet import
- Automatic relationship mapping
- Formula preservation (for totals)
- Validation rules

**Sheet Requirements:**
- First row must be headers
- ID columns for relationships
- Status column must match enum values

---

### Import Validation

#### Pre-Import Checks

1. **Schema Validation:**
   ```typescript
   interface ValidationResult {
     valid: boolean;
     errors: ValidationError[];
     warnings: ValidationWarning[];
     summary: {
       totalRecords: number;
       validRecords: number;
       errorRecords: number;
       warningRecords: number;
     };
   }
   ```

2. **Reference Integrity:**
   - Venues referenced by inspections must exist
   - Room IDs must match venue definition
   - Item IDs must match room definition

3. **Data Completeness:**
   - Required fields present
   - Valid enum values (status, etc.)
   - Date format validation

4. **Duplicate Detection:**
   - Check existing IDs
   - Detect duplicate names/addresses
   - Flag potential conflicts

#### Import Preview

**Show before committing:**
- Number of records to import
- Conflicts detected
- Changes to existing records
- Estimated time
- Data storage impact

**Example Preview:**
```
Import Summary:
✓ 3 new venues will be created
⚠ 2 existing venues will be updated
✗ 1 venue has conflicts (duplicate name)
✓ 15 new inspections will be created
⚠ 5 inspection IDs already exist (using MERGE strategy)
```

---

## 🏗️ Technical Architecture

### Backend Implementation

#### Lambda Functions

**1. Export Lambda** (`lambda/export_data.py`)
```python
def lambda_handler(event, context):
    """
    Export data based on filters and format.
    
    Actions:
    - export_full: Complete database export
    - export_inspections: Filtered inspections
    - export_venues: Venue templates
    - export_images: Image package
    """
    action = event['action']
    format = event.get('format', 'json')  # json|csv|xlsx|pdf
    filters = event.get('filters', {})
    
    if action == 'export_full':
        data = export_full_database()
    elif action == 'export_inspections':
        data = export_inspections(filters)
    # ...
    
    # Generate file based on format
    file_content = generate_export_file(data, format)
    
    # Upload to S3 temporary storage
    s3_key = upload_to_s3(file_content, format)
    
    # Return presigned URL for download
    download_url = generate_presigned_url(s3_key)
    
    return {
        'statusCode': 200,
        'body': {
            'downloadUrl': download_url,
            'expiresIn': 3600,
            'fileSize': len(file_content),
            'format': format
        }
    }
```

**2. Import Lambda** (`lambda/import_data.py`)
```python
def lambda_handler(event, context):
    """
    Import data with validation and conflict resolution.
    
    Actions:
    - validate_import: Pre-import validation (dry-run)
    - import_data: Execute import
    - import_status: Check import progress (for async imports)
    """
    action = event['action']
    
    if action == 'validate_import':
        # Parse uploaded file from S3
        file_key = event['fileKey']
        data = parse_import_file(file_key)
        
        # Validate without importing
        validation = validate_import_data(data)
        return validation
        
    elif action == 'import_data':
        file_key = event['fileKey']
        options = event.get('options', {})
        
        # Parse and validate
        data = parse_import_file(file_key)
        validation = validate_import_data(data)
        
        if not validation['valid'] and options.get('strictMode'):
            return {'error': 'Validation failed', 'details': validation}
        
        # Execute import
        result = execute_import(data, options)
        return result
```

#### Export Generators

**JSON Generator:**
```python
def generate_json_export(data):
    """Generate complete JSON export with metadata."""
    export_obj = {
        'exportMetadata': {
            'version': '1.0',
            'exportDate': datetime.utcnow().isoformat(),
            'exportedBy': data.get('user_email'),
            'recordCount': calculate_record_counts(data)
        },
        'venues': data.get('venues', []),
        'inspections': data.get('inspections', []),
    }
    
    # Convert Decimals to native types
    export_obj = convert_decimals(export_obj)
    
    return json.dumps(export_obj, indent=2)
```

**CSV Generator:**
```python
def generate_csv_export(data, entity_type='inspections'):
    """Generate CSV for specific entity type."""
    if entity_type == 'inspections':
        return generate_inspections_csv(data['inspections'])
    elif entity_type == 'venues':
        return generate_venues_csv(data['venues'])
    # ...
    
def generate_inspections_csv(inspections):
    """Flatten inspection data to CSV."""
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        'inspectionId', 'venueName', 'venueId', 'status',
        'createdAt', 'completedAt', 'createdBy', 'totalItems',
        'passCount', 'failCount', 'naCount'
    ])
    writer.writeheader()
    
    for inspection in inspections:
        totals = inspection.get('totals', {})
        writer.writerow({
            'inspectionId': inspection['inspectionId'],
            'venueName': inspection.get('venueName'),
            'venueId': inspection.get('venueId'),
            'status': inspection.get('status'),
            'createdAt': inspection.get('createdAt'),
            'completedAt': inspection.get('completedAt'),
            'createdBy': inspection.get('createdBy'),
            'totalItems': totals.get('total', 0),
            'passCount': totals.get('pass', 0),
            'failCount': totals.get('fail', 0),
            'naCount': totals.get('na', 0),
        })
    
    return output.getvalue()
```

**PDF Generator (using ReportLab):**
```python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table

def generate_pdf_report(inspection):
    """Generate professional PDF report for inspection."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    story = []
    
    # Title
    title = Paragraph(f"Inspection Report - {inspection['inspectionId']}", title_style)
    story.append(title)
    
    # Metadata table
    meta_data = [
        ['Venue:', inspection['venueName']],
        ['Date:', inspection['createdAt']],
        ['Inspector:', inspection['createdBy']],
        ['Status:', inspection['status']],
    ]
    meta_table = Table(meta_data)
    story.append(meta_table)
    
    # Summary
    totals = inspection['totals']
    summary = Paragraph(
        f"Pass: {totals['pass']} | Fail: {totals['fail']} | N/A: {totals['na']}", 
        normal_style
    )
    story.append(summary)
    
    # Items by room
    for room_id, room_items in group_by_room(inspection['items']).items():
        room_heading = Paragraph(f"Room: {room_items[0]['roomName']}", heading_style)
        story.append(room_heading)
        
        # Items table
        items_data = [['Item', 'Status', 'Notes']]
        for item in room_items:
            items_data.append([
                item['itemName'],
                item['status'],
                item.get('notes', '')
            ])
        items_table = Table(items_data)
        story.append(items_table)
    
    doc.build(story)
    return buffer.getvalue()
```

---

### Frontend Implementation

#### Export UI

**Location:** `src/components/ExportDialog.tsx`

```typescript
interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

function ExportDialog({ open, onClose }: ExportDialogProps) {
  const [exportType, setExportType] = useState<'full' | 'filtered' | 'single'>('filtered');
  const [format, setFormat] = useState<'json' | 'csv' | 'xlsx' | 'pdf'>('json');
  const [filters, setFilters] = useState({
    dateRange: 'last30days',
    status: 'all',
    venueId: null
  });
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const response = await exportData({
        action: exportType === 'full' ? 'export_full' : 'export_inspections',
        format,
        filters: exportType === 'filtered' ? filters : undefined
      });
      
      // Download file
      window.location.href = response.downloadUrl;
      
      toast.success(`Export complete! File will download shortly.`);
      onClose();
    } catch (error) {
      toast.error('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Export Data</DialogTitle>
      <DialogContent>
        {/* Export Type Selection */}
        <RadioGroup value={exportType} onChange={setExportType}>
          <Radio value="full">Full Database</Radio>
          <Radio value="filtered">Filtered Inspections</Radio>
          <Radio value="single">Single Inspection</Radio>
        </RadioGroup>

        {/* Format Selection */}
        <Select value={format} onChange={setFormat}>
          <Option value="json">JSON (Complete Data)</Option>
          <Option value="csv">CSV (Excel Compatible)</Option>
          <Option value="xlsx">Excel Workbook</Option>
          <Option value="pdf">PDF Report</Option>
        </Select>

        {/* Filters (if filtered export) */}
        {exportType === 'filtered' && (
          <FilterPanel filters={filters} onChange={setFilters} />
        )}

        {/* Preview */}
        <PreviewSection exportType={exportType} filters={filters} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleExport} loading={loading}>
          Export
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

#### Import UI

**Location:** `src/components/ImportDialog.tsx`

```typescript
function ImportDialog({ open, onClose }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [options, setOptions] = useState({
    conflictStrategy: 'merge',
    generateNewIds: false,
    importImages: true,
    dryRun: true
  });
  const [step, setStep] = useState<'upload' | 'validate' | 'confirm' | 'importing'>('upload');

  const handleFileUpload = async (file: File) => {
    setFile(file);
    setStep('validate');
    
    // Upload to S3 for processing
    const fileKey = await uploadFileToS3(file);
    
    // Validate
    const result = await validateImport({ fileKey, options });
    setValidation(result);
    setStep('confirm');
  };

  const handleImport = async () => {
    if (!file || !validation?.valid) return;
    
    setStep('importing');
    try {
      const fileKey = await uploadFileToS3(file);
      const result = await importData({
        fileKey,
        options: { ...options, dryRun: false }
      });
      
      toast.success(`Import complete! ${result.recordsImported} records imported.`);
      onClose();
      
      // Refresh data
      window.dispatchEvent(new Event('dataImported'));
    } catch (error) {
      toast.error('Import failed. Please check the file and try again.');
      setStep('confirm');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg">
      <DialogTitle>Import Data</DialogTitle>
      <DialogContent>
        {step === 'upload' && (
          <FileUploadZone
            accept=".json,.csv,.xlsx"
            onUpload={handleFileUpload}
            helpText="Upload JSON, CSV, or Excel file"
          />
        )}

        {step === 'validate' && (
          <LoadingSpinner message="Validating import file..." />
        )}

        {step === 'confirm' && validation && (
          <>
            <ValidationSummary validation={validation} />
            
            {validation.errors.length > 0 && (
              <ErrorsList errors={validation.errors} />
            )}
            
            {validation.warnings.length > 0 && (
              <WarningsList warnings={validation.warnings} />
            )}

            <ImportOptions options={options} onChange={setOptions} />
          </>
        )}

        {step === 'importing' && (
          <ImportProgress />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={step === 'importing'}>
          Cancel
        </Button>
        {step === 'confirm' && (
          <Button 
            onClick={handleImport} 
            disabled={!validation?.valid && options.strictMode}
            variant="primary"
          >
            Import {validation?.summary.validRecords} Records
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
```

---

## 🔐 Security Considerations

### Export Security

1. **Access Control:**
   - Only authenticated users can export
   - Developers can export everything
   - Inspectors can only export their own data
   - Filter by user automatically for non-admin roles

2. **Data Sanitization:**
   - Remove sensitive fields (internal IDs, system metadata)
   - Optionally exclude user emails
   - Redact PII if required

3. **Rate Limiting:**
   - Max 10 exports per hour per user
   - Large exports (>1000 records) require approval
   - Throttle to prevent abuse

4. **Temporary Storage:**
   - Export files stored in S3 with 1-hour expiration
   - Presigned URLs expire after download
   - Auto-delete after download

### Import Security

1. **Validation:**
   - Strict schema validation
   - File size limits (max 50MB)
   - Malware scanning for uploaded files
   - Content-Type verification

2. **Sandboxing:**
   - Import runs in isolated Lambda
   - Rollback on failure
   - Transaction-like behavior

3. **Audit Logging:**
   - Log all imports (who, when, what)
   - Track changes made by import
   - Store import file hash for audit trail

---

## 📊 Use Cases & Workflows

### Use Case 1: Monthly Compliance Report

**User:** Senior Inspector  
**Goal:** Generate PDF report of all completed inspections for last month

**Workflow:**
1. Open "Export" dialog from Dashboard
2. Select "Filtered Inspections"
3. Set filters:
   - Date range: "Last month"
   - Status: "Completed"
4. Select format: "PDF Report"
5. Click "Export"
6. Download PDF with all inspections
7. Submit to compliance officer

**Expected Output:** Single PDF with summary stats + individual inspection details

---

### Use Case 2: Backup Before Database Migration

**User:** Developer  
**Goal:** Create complete backup before upgrading DynamoDB schema

**Workflow:**
1. Open "Export" dialog
2. Select "Full Database"
3. Select format: "JSON"
4. Click "Export"
5. Download JSON file
6. Store in secure backup location
7. Proceed with migration
8. If needed, restore using "Import"

**Expected Output:** Complete JSON with all venues, inspections, images metadata

---

### Use Case 3: Bulk Venue Creation

**User:** Admin  
**Goal:** Create 50 venues from Excel spreadsheet

**Workflow:**
1. Download venue template (CSV/Excel)
2. Fill in venue data in Excel
3. Open "Import" dialog
4. Upload Excel file
5. Review validation results
6. Fix any errors in Excel
7. Re-upload and confirm
8. Import executes
9. 50 venues created

**Expected Output:** 50 new venue records in DynamoDB

---

### Use Case 4: Data Analysis in Excel

**User:** Manager  
**Goal:** Analyze inspection trends in Excel pivot table

**Workflow:**
1. Open "Export" dialog
2. Select "Filtered Inspections"
3. Set date range: "Last 6 months"
4. Select format: "Excel Workbook"
5. Download Excel file
6. Open in Excel
7. Create pivot tables and charts
8. Analyze pass/fail trends by venue

**Expected Output:** Excel workbook with multiple sheets ready for analysis

---

### Use Case 5: Evidence Package for Legal Team

**User:** Senior Inspector  
**Goal:** Export failed inspection with all images for legal review

**Workflow:**
1. Open specific inspection
2. Click "Export" → "Complete Package"
3. Select format: "ZIP with PDF + Images"
4. Download package
5. Package contains:
   - PDF report
   - All inspection images
   - Metadata JSON
6. Send to legal team

**Expected Output:** ZIP file with organized folders and professional PDF

---

## 🧪 Testing Strategy

### Export Testing

**Unit Tests:**
```typescript
describe('Export Functionality', () => {
  it('exports inspections to JSON format', async () => {
    const result = await exportInspections({ format: 'json', filters: {} });
    expect(result.format).toBe('json');
    expect(JSON.parse(result.content)).toHaveProperty('exportMetadata');
  });

  it('filters inspections by date range', async () => {
    const result = await exportInspections({
      format: 'json',
      filters: { dateRange: 'last30days' }
    });
    const data = JSON.parse(result.content);
    const oldestDate = new Date(data.inspections[0].createdAt);
    expect(Date.now() - oldestDate.getTime()).toBeLessThan(30 * 24 * 60 * 60 * 1000);
  });

  it('generates valid CSV with proper headers', async () => {
    const result = await exportInspections({ format: 'csv' });
    const lines = result.content.split('\n');
    expect(lines[0]).toContain('inspectionId,venueName,status');
  });
});
```

### Import Testing

**Unit Tests:**
```typescript
describe('Import Functionality', () => {
  it('validates JSON schema', async () => {
    const invalidData = { venues: [{ name: 'Test' }] }; // Missing required fields
    const result = await validateImport(invalidData);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects duplicate IDs', async () => {
    const data = {
      venues: [
        { venueId: 'venue_1', name: 'Building A' },
        { venueId: 'venue_1', name: 'Building B' } // Duplicate ID
      ]
    };
    const result = await validateImport(data);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ type: 'DUPLICATE_ID' })
    );
  });

  it('merges existing records when conflict strategy is merge', async () => {
    const existingVenue = { venueId: 'venue_1', name: 'Old Name', address: '123 St' };
    const importVenue = { venueId: 'venue_1', name: 'New Name' }; // No address
    
    const result = await importVenues([importVenue], { conflictStrategy: 'merge' });
    
    expect(result.imported[0]).toEqual({
      venueId: 'venue_1',
      name: 'New Name',
      address: '123 St' // Preserved from existing
    });
  });
});
```

### Integration Tests

```python
def test_full_export_import_cycle():
    """Test complete export-import cycle preserves data integrity."""
    # Export all data
    export_result = export_full_database()
    export_data = json.loads(export_result)
    
    # Clear test database
    clear_test_database()
    
    # Import exported data
    import_result = import_data(export_data, {'conflictStrategy': 'skip'})
    
    # Verify record counts match
    assert import_result['recordsImported'] == export_data['exportMetadata']['recordCount']['total']
    
    # Verify data integrity
    original_venues = get_all_venues()
    imported_venues = get_all_venues_after_import()
    assert len(original_venues) == len(imported_venues)
```

---

## 📅 Implementation Roadmap

### Phase 1: Basic JSON Export/Import (Week 1)
- [ ] Create export Lambda function
- [ ] Implement JSON export for full database
- [ ] Implement JSON export for filtered inspections
- [ ] Create import Lambda function
- [ ] Implement JSON import with validation
- [ ] Add conflict resolution strategies
- [ ] Create basic export UI component
- [ ] Create basic import UI component

### Phase 2: CSV Export/Import (Week 2)
- [ ] Implement CSV export for inspections
- [ ] Implement CSV export for venues
- [ ] Generate multiple CSV files (inspections, items, venues)
- [ ] Implement CSV import with validation
- [ ] Handle multi-file CSV imports
- [ ] Add CSV template download
- [ ] Test Excel compatibility

### Phase 3: PDF Reports (Week 3)
- [ ] Set up ReportLab or similar PDF library
- [ ] Design PDF report template
- [ ] Implement single inspection PDF export
- [ ] Implement summary report PDF
- [ ] Add image embedding in PDF
- [ ] Add charts and statistics to PDF
- [ ] Test PDF generation performance

### Phase 4: Excel Export/Import (Week 4)
- [ ] Set up openpyxl or xlsxwriter
- [ ] Implement Excel workbook export (multiple sheets)
- [ ] Add auto-formatting and data validation
- [ ] Implement Excel import
- [ ] Handle multi-sheet Excel imports
- [ ] Add Excel template with examples

### Phase 5: Image Packaging (Week 5)
- [ ] Implement image download from S3
- [ ] Create ZIP package with images
- [ ] Organize images by inspection/room/item
- [ ] Include manifest file in ZIP
- [ ] Optimize for large image sets
- [ ] Add image import from ZIP

### Phase 6: Advanced Features (Week 6+)
- [ ] Scheduled automated backups
- [ ] Email export delivery
- [ ] Export to cloud storage (Google Drive, Dropbox)
- [ ] Import from external sources (legacy systems)
- [ ] Incremental exports (changes since last export)
- [ ] Real-time export progress tracking
- [ ] Export templates (saved filter configurations)
- [ ] Bulk delete via import (negative import)

---

## 🎯 Success Criteria

**Must Have:**
- ✅ Export inspections to JSON, CSV, PDF
- ✅ Import inspections from JSON, CSV
- ✅ Export venues to JSON, CSV
- ✅ Import venues from JSON, CSV
- ✅ Validation before import
- ✅ Conflict resolution (skip, merge, overwrite)
- ✅ Access control (role-based export/import)
- ✅ Audit logging for imports

**Nice to Have:**
- ✅ Excel export/import
- ✅ Image packaging (ZIP)
- ✅ PDF reports with images
- ✅ Scheduled backups
- ✅ Email delivery
- ✅ Export templates
- ✅ Incremental exports

**Future:**
- 🔄 Real-time sync between environments
- 🔄 Export to BI tools (Tableau, PowerBI)
- 🔄 API webhooks for export notifications
- 🔄 Multi-format batch exports
- 🔄 Import from photos (OCR inspection data)

---

## 📖 Related Documentation

- [Architecture Diagram](../architecture_diagram.md) - Update with export/import flow
- [Refactor Plan](../refactor_plan.md) - Add as Phase 9
- [API Documentation](../lambda/api_info.md) - Document export/import endpoints
- [RBAC Plan](./rbac-implementation-plan.md) - Export/import permissions

---

## ❓ Open Questions

1. **Image Storage Strategy:**
   - Store images inline as base64 in JSON? (bloat)
   - Store as URLs? (expires after download)
   - Separate ZIP package? (complex but clean)

2. **Large Dataset Handling:**
   - Stream exports for >10,000 records?
   - Paginated exports?
   - Background processing with email delivery?

3. **Version Compatibility:**
   - How to handle schema changes between export/import?
   - Version migration scripts?
   - Backward compatibility guarantees?

4. **Import Conflicts:**
   - Should we allow partial imports (some succeed, some fail)?
   - Rollback on first error vs continue with warnings?
   - How to handle circular references (if any)?

5. **Compliance Requirements:**
   - Do exports need to be encrypted?
   - Retention policy for export files?
   - PII redaction requirements?

---

**Next Steps:**
1. Review this plan and prioritize features
2. Decide on export formats to implement first
3. Create feature branch: `feature/export-import`
4. Start with Phase 1 (Basic JSON) when ready
