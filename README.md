# Facility Inspector

A full-stack facility inspection management application built with Next.js and AWS Lambda. Inspectors can conduct safety and compliance inspections across multiple venues and rooms, capture photos, track issues, and generate reports.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running Locally](#running-locally)
- [Usage Guide](#usage-guide)
  - [Authentication](#authentication)
  - [Home Screen](#home-screen)
  - [Creating an Inspection](#creating-an-inspection)
  - [Conducting an Inspection](#conducting-an-inspection)
  - [Photo Upload](#photo-upload)
  - [Viewing History](#viewing-history)
  - [Dashboard & Analytics](#dashboard--analytics)
  - [Venue Management](#venue-management)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Development Notes](#development-notes)

---

## Overview

**Facility Inspector** is a mobile-friendly web application designed for facility inspectors to:

- Create and manage inspection records for various venues (buildings, offices, community centers, etc.)
- Inspect rooms and checklist items with Pass/Fail/NA status tracking
- Capture and attach photos to inspection items as evidence
- Automatically detect inspection completion when all items pass
- View historical inspection data and analytics dashboards
- Manage venues with custom rooms and inspection items

The application uses a **server-authoritative** model where completion status is determined server-side based on venue definitions, ensuring data integrity.

---

## Features

### Core Inspection Workflow
- ✅ **Create Inspections** — Start new inspections by selecting a venue
- ✅ **Room-by-Room Inspection** — Navigate through rooms and mark items
- ✅ **Status Tracking** — Mark items as Pass, Fail, or N/A with notes
- ✅ **Photo Evidence** — Capture and attach photos to any inspection item
- ✅ **Auto-Complete Detection** — Server automatically marks inspections complete when all items pass
- ✅ **Resume Drafts** — Continue in-progress inspections anytime

### Venue Management
- ✅ **Create/Edit Venues** — Define facilities with address and rooms
- ✅ **Room Configuration** — Add rooms with custom inspection items
- ✅ **Delete Venues** — Remove venues (with cascade delete of related inspections)

### Analytics & Reporting
- ✅ **Dashboard** — View metrics: total inspections, completion rates, pass rates
- ✅ **Trend Charts** — Visualize inspection activity over time
- ✅ **Venue Risk Scores** — Identify high-risk venues by failure rate
- ✅ **Inspector Performance** — Track inspector productivity and quality

### User Experience
- ✅ **Mobile-First Design** — Optimized for tablets and phones
- ✅ **Responsive Layout** — Works on desktop and mobile browsers
- ✅ **Toast Notifications** — User feedback for actions
- ✅ **Loading States** — Clear loading indicators throughout
- ✅ **Search & Filter** — Find items quickly within inspections

---

## Tech Stack

### Frontend
- **Framework**: [Next.js 16](https://nextjs.org/) with React 19
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **UI Components**: [Radix UI](https://www.radix-ui.com/) (Tabs, Popovers, Progress, etc.)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Charts**: [Recharts](https://recharts.org/)
- **Animations**: react-fade-in, @number-flow/react

### Backend
- **Runtime**: AWS Lambda (Python 3.x)
- **API Gateway**: AWS API Gateway (REST)
- **Database**: AWS DynamoDB
- **File Storage**: AWS S3 (for inspection photos)
- **CDN**: AWS CloudFront (signed URLs for images)

### Infrastructure
- **Region**: ap-southeast-1 (Singapore)
- **Deployment**: S3 static hosting with `next export`

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+ (for Lambda development/testing)
- AWS CLI configured (for deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd testapp2
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables** (optional)
   ```bash
   # Create .env.local for custom API endpoint
   echo "NEXT_PUBLIC_API_BASE=https://your-api-gateway-url/dev" > .env.local
   ```

### Running Locally

```bash
# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Usage Guide

### Authentication

The app uses mock authentication for demo purposes.

**Demo Credentials:**
| Email | Password | Role |
|-------|----------|------|
| `admin@facility.com` | `password` | Senior Inspector |
| `inspector@facility.com` | `password` | Inspector |
| `dev@facility.com` | `dev` | Developer |

### Home Screen

After logging in, the **Home** screen shows:
- **Active Inspections** — In-progress inspections you can resume
- **Recent Completed** — Latest completed inspections (limited to 6)
- **Quick Actions**:
  - ➕ **New Inspection** — Start a new inspection
  - 📊 **Dashboard** — View analytics
  - 📋 **History** — Browse all completed inspections
  - 🏢 **Venues** — Manage venues
  - 👤 **Profile** — View/edit your profile

### Creating an Inspection

1. Click **New Inspection** from the Home screen
2. Select a **Venue** from the list
3. View the venue's rooms and click **Start Inspection**
4. You'll be taken to the **Room List** showing all rooms to inspect

### Conducting an Inspection

1. From the Room List, select a **Room** to inspect
2. For each checklist item, mark status:
   - ✅ **Pass** — Item meets requirements
   - ❌ **Fail** — Item has issues (add notes!)
   - ➖ **N/A** — Not applicable to this inspection
3. Add **Notes** for any item (required for failures)
4. Attach **Photos** as evidence (optional)
5. Click **Save** to persist your progress
6. Navigate back to inspect other rooms
7. When all items pass, the inspection auto-completes

### Photo Upload

1. Click the **Camera** icon on any inspection item
2. Select or capture a photo
3. The photo uploads to S3 and appears as a thumbnail
4. Click thumbnails to view full-size in lightbox
5. Remove photos with the **X** button

### Viewing History

1. Click **History** from the Home screen
2. Browse all completed inspections
3. Use **Search** to filter by venue, room, or inspector name
4. Use **Date Range** filters for specific time periods
5. Click any inspection to view details

### Dashboard & Analytics

The Dashboard provides:
- **Summary Cards** — Total inspections, ongoing, completed, pass rate
- **Trend Chart** — Daily completion counts over the last 7 days
- **Venue Analytics** — Risk scores based on failure rates
- **Inspector Performance** — Completion counts and quality metrics

### Venue Management

1. Click **Venues** from the Home screen
2. View all registered venues
3. Click **Add Venue** to create a new venue:
   - Enter venue name and address
   - Add rooms with the **+** button
   - Add inspection items to each room
4. Click on an existing venue to edit
5. Use the **Delete** button to remove a venue (cascades to delete related inspections)

---

## Project Structure

```
testapp2/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Entry point (renders App)
│   │   └── globals.css         # Global styles
│   ├── components/             # React components
│   │   ├── Dashboard.tsx       # Analytics dashboard
│   │   ├── InspectionForm.tsx  # Room inspection form
│   │   ├── InspectionHistory.tsx # History browser
│   │   ├── InspectorHome.tsx   # Home screen
│   │   ├── Login.tsx           # Authentication
│   │   ├── RoomList.tsx        # Room selection
│   │   ├── VenueForm.tsx       # Create/edit venue
│   │   ├── VenueList.tsx       # Venue browser
│   │   ├── VenueSelection.tsx  # Venue picker for inspections
│   │   └── ...                 # Other UI components
│   ├── config/
│   │   └── api.ts              # API endpoint configuration
│   ├── contexts/
│   │   └── AuthContext.tsx     # Authentication state
│   ├── types/                  # TypeScript types
│   │   ├── inspection.ts       # Inspection types
│   │   ├── venue.ts            # Venue types
│   │   └── db.ts               # Database types
│   ├── utils/                  # Utility functions
│   │   ├── inspectionApi.ts    # Inspection API helpers
│   │   ├── venueApi.ts         # Venue API helpers
│   │   └── id.ts               # ID generators
│   └── App.tsx                 # Main app component
├── lambda/                     # AWS Lambda functions
│   ├── create_inspection.py    # Create inspection metadata
│   ├── create_venue.py         # Venue CRUD operations
│   ├── dashboard.py            # Analytics metrics
│   ├── delete_inspection.py    # Delete with cascade
│   ├── get_inspections.py      # List/query inspections
│   ├── get_venues.py           # List venues
│   ├── list_images_db.py       # Image metadata queries
│   ├── register_image.py       # Register uploaded images
│   ├── sign_s3_upload.py       # Generate presigned URLs
│   ├── save_inspection/        # Modular inspection save package
│   │   ├── handler.py          # Main save logic
│   │   ├── completeness.py     # Completion checking
│   │   ├── metadata.py         # Metadata helpers
│   │   └── ...
│   └── schemas/                # Validation schemas
├── public/                     # Static assets
├── styles/                     # Additional styles
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── next.config.ts
```

---

## API Reference

All endpoints use the base URL: `https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev`

### Inspections

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/inspections-query` | POST | List all inspections with totals |
| `/inspections-create` | POST | Create new inspection |
| `/inspections` | POST | Save inspection items |
| `/inspections-delete` | POST | Delete inspection (cascade supported) |

### Venues

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/venues-query` | GET/POST | List all venues |
| `/venues-create` | POST | Create/update/delete venue |

### Images

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/sign-upload` | POST | Get presigned S3 upload URL |
| `/register-image` | POST | Register uploaded image metadata |
| `/list-images-db` | POST | List images for inspection |
| `/delete-image-db` | POST | Delete image metadata |
| `/delete-s3-by-db-entry` | POST | Delete S3 object |

### Dashboard

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dashboard` | GET/POST | Get analytics metrics |

---

## Database Schema

### DynamoDB Tables

| Table | Primary Key | Description |
|-------|-------------|-------------|
| `InspectionMetadata` | `inspection_id` | Inspection summary records |
| `InspectionItems` | `inspection_id` (PK), `roomId#itemId` (SK) | Individual inspection items |
| `InspectionImages` | `inspectionId` (PK), `sortKey` (SK) | Image metadata |
| `VenueRooms` | `venueId` | Venue definitions with rooms |

---

## Deployment

### Build for Production

```bash
npm run build
```

### Deploy to S3

```bash
npm run deploy
```

This runs `next build` and syncs the `out/` directory to S3.

### Lambda Deployment

Lambda functions in `/lambda` should be deployed via:
- AWS Console
- AWS SAM/CloudFormation
- Serverless Framework

Each Lambda requires:
- Python 3.9+ runtime
- boto3 (AWS SDK)
- Appropriate IAM permissions for DynamoDB, S3, Secrets Manager

---

## Development Notes

### Key Patterns

1. **Server-Authoritative Completion**: The server determines when an inspection is complete by comparing saved items against venue definitions. Clients cannot mark inspections as complete directly.

2. **Normalized Data**: Both camelCase and snake_case field names are supported across APIs for compatibility. The server normalizes responses to camelCase.

3. **Optimistic UI**: The frontend updates UI immediately on user actions, then syncs with the server. Server responses override local state.

4. **Display Name Centralization**: User display names are provided via `useDisplayName()` hook from AuthContext, ensuring consistent author attribution.

5. **Metadata Handling**: `completedAt` is only present when an inspection is actually completed (not sent as `null` for in-progress inspections).

### Testing

```bash
# Run linting
npm run lint

# Run Python tests (from lambda directory)
cd lambda
pytest
```

### Lighthouse Performance

Performance reports are generated in:
- `lighthouse-report.json` — Development build
- `lighthouse-prod-report.json` — Production build

### Branch Naming Conventions
- We will use lowercase-with-hyphens with a short but informative name.
| Purpose | Prefix |
|-------|----------|------|
| `feature/` | `New functionality` |
| `bugfix/` | `Bug fixes` |
| `hotfix/` | `Urgent production fixes` |
| `refactor/` | `Code cleanup/improvement` |
| `docs/` | `Documentation changes` |
| `chore/` | `Maintenance tasks` |


---

## License

Private project. All rights reserved.
