import { NextRequest, NextResponse } from 'next/server';

// In-memory store for charity partner applications, consistent with other API routes
interface CharityApplication {
  id: string;
  organizationName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  website?: string;
  registrationNumber: string;
  country: string;
  mission: string;
  campaignSlug?: string;
  logoUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

const applications: CharityApplication[] = [];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateId(): string {
  return `charity_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Request body must be a JSON object' },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;

  const requiredFields = [
    'organizationName',
    'contactName',
    'contactEmail',
    'registrationNumber',
    'country',
    'mission',
  ];

  const missingFields = requiredFields.filter((field) => {
    const value = payload[field];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missingFields.length > 0) {
    return NextResponse.json(
      {
        error: 'Missing required fields',
        missingFields,
      },
      { status: 400 }
    );
  }

  const contactEmail = String(payload.contactEmail).trim();
  if (!isValidEmail(contactEmail)) {
    return NextResponse.json(
      { error: 'Invalid contactEmail format' },
      { status: 400 }
    );
  }

  const application: CharityApplication = {
    id: generateId(),
    organizationName: String(payload.organizationName).trim(),
    contactName: String(payload.contactName).trim(),
    contactEmail,
    contactPhone:
      typeof payload.contactPhone === 'string'
        ? payload.contactPhone.trim()
        : undefined,
    website:
      typeof payload.website === 'string' ? payload.website.trim() : undefined,
    registrationNumber: String(payload.registrationNumber).trim(),
    country: String(payload.country).trim(),
    mission: String(payload.mission).trim(),
    campaignSlug:
      typeof payload.campaignSlug === 'string'
        ? payload.campaignSlug.trim()
        : undefined,
    logoUrl:
      typeof payload.logoUrl === 'string' ? payload.logoUrl.trim() : undefined,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  applications.push(application);

  return NextResponse.json(
    {
      message: 'Charity partnership application received',
      application,
    },
    { status: 201 }
  );
}

export async function GET() {
  return NextResponse.json({
    applications,
    count: applications.length,
  });
}