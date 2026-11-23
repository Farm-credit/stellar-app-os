import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bulkCertificatesPdfToBuffer } from '@/lib/corporate-sponsorship/bulkCertificatePdf';
import { getCorporateOrderById } from '@/lib/corporate-sponsorship/store';

const recipientSchema = z.object({
  name: z.string().trim().min(1, 'Recipient name is required').max(120),
  email: z.string().trim().email().optional().or(z.literal('')),
  department: z.string().trim().max(80).optional(),
  treeCount: z.number().int().min(1),
  treeCodes: z.array(z.string()).optional(),
});

const requestSchema = z.object({
  orderId: z.string().min(1),
  recipients: z.array(recipientSchema).min(1, 'At least one recipient is required').max(500),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid certificate request',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const order = getCorporateOrderById(parsed.data.orderId);
    if (!order) {
      return NextResponse.json({ error: 'Corporate order not found' }, { status: 404 });
    }

    const recipients = parsed.data.recipients.map((r) => ({
      name: r.name,
      email: r.email || undefined,
      department: r.department || undefined,
      treeCount: r.treeCount,
      treeCodes: r.treeCodes,
    }));

    const pdfBytes = bulkCertificatesPdfToBuffer(order, recipients);
    const filename = `corporate-certificates-${order.orderNumber}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate bulk PDF certificates',
      },
      { status: 500 }
    );
  }
}
